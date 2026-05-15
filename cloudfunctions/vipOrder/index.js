// cloudfunctions/vipOrder/index.js
// VIP 订单管理：createOrder / activateByCode / adminActivate / getStatus
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 生成随机激活码
function genCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = 'BSK-';
  for (var i = 0; i < 12; i++) {
    if (i === 4 || i === 8) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// 计算 VIP 到期时间（月卡=30天）
function calcExpireDate(months) {
  var d = new Date();
  d.setMonth(d.getMonth() + (months || 1));
  return d.toISOString();
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) return { code: -1, msg: '未登录' };

  const { action } = event;

  try {
    switch (action) {

      // ── 创建待支付订单 ──────────────────────────────────────
      case 'createOrder': {
        const { planType = 'monthly', amount = 30 } = event;
        const now = db.serverDate();

        const addRes = await db.collection('vipOrders').add({
          data: {
            openid,
            planType,
            amount,
            status: 'pending',   // pending / paid / activated / expired
            activationCode: '',
            createdAt: now,
            updatedAt: now,
          }
        });

        return { code: 0, msg: 'ok', orderId: addRes._id };
      }

      // ── 用激活码激活 VIP ────────────────────────────────────
      case 'activateByCode': {
        const { code } = event;
        if (!code) return { code: -1, msg: '请输入激活码' };

        const codeRes = await db.collection('activationCodes')
          .where({ code: code.toUpperCase().trim(), used: false })
          .get();

        if (codeRes.data.length === 0) {
          return { code: -1, msg: '激活码无效或已被使用' };
        }

        const codeDoc = codeRes.data[0];
        const now = new Date();
        const expireDate = calcExpireDate(codeDoc.months || 1);

        // 标记激活码已使用
        await db.collection('activationCodes').doc(codeDoc._id).update({
          data: { used: true, usedBy: openid, usedAt: db.serverDate() }
        });

        // 更新用户 VIP 状态
        await db.collection('users').where({ openid }).update({
          data: {
            isVip: true,
            vipExpireDate: expireDate,
            vipActivatedAt: db.serverDate(),
          }
        });

        // 记录到订单
        await db.collection('vipOrders').add({
          data: {
            openid,
            planType: 'code',
            amount: 0,
            status: 'activated',
            activationCode: code.toUpperCase().trim(),
            expireDate,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate(),
          }
        });

        return { code: 0, msg: '激活成功！', expireDate };
      }

      // ── 管理员手动激活（客服收款后调用） ─────────────────────
      // 调用时需在云控制台配置权限或通过管理端 SDK 调用
      case 'adminActivate': {
        const { targetOpenid, months = 1, adminKey } = event;
        // 简单鉴权：实际生产应改为更安全的方式
        if (adminKey !== 'BSK_ADMIN_2024') {
          return { code: -1, msg: '无权限' };
        }
        if (!targetOpenid) return { code: -1, msg: '缺少目标openid' };

        const expireDate = calcExpireDate(months);
        await db.collection('users').where({ openid: targetOpenid }).update({
          data: {
            isVip: true,
            vipExpireDate: expireDate,
            vipActivatedAt: db.serverDate(),
          }
        });

        await db.collection('vipOrders').add({
          data: {
            openid: targetOpenid,
            planType: 'manual',
            amount: 30,
            status: 'activated',
            activationCode: '',
            expireDate,
            activatedBy: 'admin',
            createdAt: db.serverDate(),
            updatedAt: db.serverDate(),
          }
        });

        return { code: 0, msg: '激活成功', expireDate };
      }

      // ── 查询当前用户 VIP 状态 ────────────────────────────────
      case 'getStatus': {
        const userRes = await db.collection('users').where({ openid }).get();
        if (userRes.data.length === 0) return { code: -1, msg: '用户不存在' };

        const user = userRes.data[0];
        const now = new Date();

        // 检查是否过期
        if (user.isVip && user.vipExpireDate) {
          const expire = new Date(user.vipExpireDate);
          if (expire <= now) {
            // 已过期，更新状态
            await db.collection('users').where({ openid }).update({
              data: { isVip: false }
            });
            return { code: 0, isVip: false, expired: true, freeCount: user.freeCount || 0 };
          }
        }

        return {
          code: 0,
          isVip: user.isVip || false,
          vipExpireDate: user.vipExpireDate || '',
          freeCount: user.freeCount !== undefined ? user.freeCount : 2,
        };
      }

      default:
        return { code: -1, msg: '未知action: ' + action };
    }
  } catch (e) {
    console.error('[vipOrder] error:', e);
    return { code: -1, msg: e.message || '服务器错误' };
  }
};
