// cloudfunctions/login/index.js
// 微信登录 + 保存用户信息（nickName/avatarUrl 可选传入）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const unionid = wxContext.UNIONID || '';
  const appid = wxContext.APPID;

  if (!openid) {
    return { code: -1, msg: '获取openid失败' };
  }

  // 可选：保存昵称头像（授权后调用时传入）
  const nickName = event.nickName || '';
  const avatarUrl = event.avatarUrl || '';

  try {
    const now = db.serverDate();
    const userCol = db.collection('users');
    const existRes = await userCol.where({ openid }).get();

    if (existRes.data.length > 0) {
      const user = existRes.data[0];
      // 更新登录时间，如果传了昵称头像也一并更新
      const updateData = {
        lastLoginAt: now,
        unionid: unionid || user.unionid || '',
      };
      if (nickName) updateData.nickName = nickName;
      if (avatarUrl) updateData.avatarUrl = avatarUrl;

      await userCol.doc(user._id).update({ data: updateData });

      return {
        code: 0, msg: 'ok', isNew: false,
        user: {
          _id: user._id,
          openid: user.openid,
          nickName: nickName || user.nickName || '',
          avatarUrl: avatarUrl || user.avatarUrl || '',
          phone: user.phone || '',
          isVip: user.isVip || false,
          vipExpireDate: user.vipExpireDate || '',
          freeCount: user.freeCount !== undefined ? user.freeCount : 2,
        }
      };
    } else {
      // 新用户：创建记录
      const addRes = await userCol.add({
        data: {
          openid, unionid, appid,
          nickName: nickName || '',
          avatarUrl: avatarUrl || '',
          phone: '',
          isVip: false,
          vipExpireDate: '',
          freeCount: 2,
          totalReadCount: 0,
          createdAt: now,
          lastLoginAt: now,
        }
      });
      return {
        code: 0, msg: 'ok', isNew: true,
        user: {
          _id: addRes._id, openid,
          nickName: nickName || '',
          avatarUrl: avatarUrl || '',
          phone: '',
          isVip: false,
          vipExpireDate: '',
          freeCount: 2,
        }
      };
    }
  } catch (e) {
    console.error('[login] error:', e);
    return { code: -1, msg: e.message || '服务器错误' };
  }
};
