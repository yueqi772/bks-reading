// cloudfunctions/readHistory/index.js
// 解读历史云函数：save / list / detail / delete / clear
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 统计中文字数
function countWords(text) {
  if (!text) return 0;
  var cleaned = text.replace(/```[\s\S]*?```/g, '').replace(/[#*`>\-\[\]]/g, '');
  var chinese = (cleaned.match(/[\u4e00-\u9fa5]/g) || []).length;
  var english = (cleaned.match(/[a-zA-Z]+/g) || []).length;
  return chinese + english;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) return { code: -1, msg: '未登录' };

  const { action } = event;

  try {
    switch (action) {

      // ── 保存/更新解读记录 ──────────────────────────────────────
      case 'save': {
        const { bookTitle, content, mode } = event;
        if (!bookTitle || !content) return { code: -1, msg: '缺少参数' };

        const now = db.serverDate();
        const wordCount = countWords(content);
        const col = db.collection('readHistory');

        // 同一用户同一书名只保留最新
        const exist = await col.where({ openid, bookTitle }).get();

        let recordId;
        if (exist.data.length > 0) {
          recordId = exist.data[0]._id;
          await col.doc(recordId).update({
            data: { content, mode: mode || 'deep', wordCount, updatedAt: now }
          });
        } else {
          const addRes = await col.add({
            data: {
              openid,
              bookTitle,
              content,
              mode: mode || 'deep',
              wordCount,
              createdAt: now,
              updatedAt: now,
            }
          });
          recordId = addRes._id;

          // 同步更新用户总解读数
          await db.collection('users').where({ openid }).update({
            data: { totalReadCount: _.inc(1) }
          });
        }

        // 消耗免费次数（仅新记录才扣）
        if (exist.data.length === 0) {
          const userRes = await db.collection('users').where({ openid }).get();
          const user = userRes.data[0] || {};
          if (!user.isVip && user.freeCount > 0) {
            await db.collection('users').where({ openid }).update({
              data: { freeCount: _.inc(-1) }
            });
          }
        }

        return { code: 0, msg: 'ok', recordId };
      }

      // ── 查询列表 ─────────────────────────────────────────────
      case 'list': {
        const { page = 1, pageSize = 20 } = event;
        const skip = (page - 1) * pageSize;
        const res = await db.collection('readHistory')
          .where({ openid })
          .orderBy('updatedAt', 'desc')
          .skip(skip)
          .limit(pageSize)
          .field({ content: false }) // 列表不返回正文，减少流量
          .get();

        const total = await db.collection('readHistory').where({ openid }).count();

        return { code: 0, list: res.data, total: total.total };
      }

      // ── 查询单条详情（含正文） ─────────────────────────────────
      case 'detail': {
        const { recordId } = event;
        if (!recordId) return { code: -1, msg: '缺少recordId' };

        const res = await db.collection('readHistory').doc(recordId).get();
        if (res.data.openid !== openid) return { code: -1, msg: '无权限' };

        return { code: 0, record: res.data };
      }

      // ── 删除单条 ─────────────────────────────────────────────
      case 'delete': {
        const { recordId } = event;
        if (!recordId) return { code: -1, msg: '缺少recordId' };

        const res = await db.collection('readHistory').doc(recordId).get();
        if (res.data.openid !== openid) return { code: -1, msg: '无权限' };

        await db.collection('readHistory').doc(recordId).remove();
        return { code: 0, msg: 'ok' };
      }

      // ── 清空全部 ─────────────────────────────────────────────
      case 'clear': {
        await db.collection('readHistory').where({ openid }).remove();
        return { code: 0, msg: 'ok' };
      }

      default:
        return { code: -1, msg: '未知action: ' + action };
    }
  } catch (e) {
    console.error('[readHistory] error:', e);
    return { code: -1, msg: e.message || '服务器错误' };
  }
};
