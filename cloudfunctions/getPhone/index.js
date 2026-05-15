// cloudfunctions/getPhone/index.js
// 获取用户手机号并完整创建/更新用户记录
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const unionid = wxContext.UNIONID || '';
  const appid = wxContext.APPID;

  if (!openid) {
    return { code: -1, msg: '未登录' };
  }

  const { code } = event;

  if (!code) {
    return { code: -1, msg: '缺少 code 参数' };
  }

  try {
    // 1. 用 code 换手机号
    const phoneRes = await cloud.openapi.phonenumber.getPhoneNumber({ code });
    const phoneInfo = phoneRes.phone_info;

    if (!phoneInfo || !phoneInfo.phoneNumber) {
      return { code: -1, msg: '获取手机号失败，请重试' };
    }

    const phone = phoneInfo.phoneNumber;
    const now = db.serverDate();

    // 2. 查询用户是否已存在
    const existRes = await db.collection('users').where({ openid }).get();

    let userId;
    let userData;

    if (existRes.data.length > 0) {
      // 已存在：更新手机号和登录时间
      const user = existRes.data[0];
      userId = user._id;
      await db.collection('users').doc(userId).update({
        data: {
          phone: phone,
          lastLoginAt: now,
          unionid: unionid || user.unionid || '',
        }
      });
      userData = {
        _id: userId,
        openid: user.openid,
        phone: phone,
        isVip: user.isVip || false,
        vipExpireDate: user.vipExpireDate || '',
        freeCount: user.freeCount !== undefined ? user.freeCount : 2,
      };
    } else {
      // 全新用户：直接创建完整记录（带手机号）
      const addRes = await db.collection('users').add({
        data: {
          openid: openid,
          unionid: unionid,
          appid: appid,
          phone: phone,
          isVip: false,
          vipExpireDate: '',
          freeCount: 2,
          totalReadCount: 0,
          createdAt: now,
          lastLoginAt: now,
        }
      });
      userId = addRes._id;
      userData = {
        _id: userId,
        openid: openid,
        phone: phone,
        isVip: false,
        vipExpireDate: '',
        freeCount: 2,
      };
    }

    return {
      code: 0,
      msg: 'ok',
      phone: phone,
      user: userData,
    };

  } catch (e) {
    console.error('[getPhone] error:', JSON.stringify(e));
    // 将真实错误返回前端，便于排查
    return {
      code: -1,
      msg: e.message || '获取手机号失败',
      errDetail: JSON.stringify(e),
    };
  }
};
