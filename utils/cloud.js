// utils/cloud.js — 云函数调用统一封装（ES5）
// 所有云函数调用走这里，统一错误处理

// 初始化云开发（App onLaunch 中调用一次即可）
function initCloud() {
  wx.cloud.init({
    env: 'cloudbase-3g22c9ce5bcf0e55',
    traceUser: true,
  });
}

// ── 通用云函数调用 ─────────────────────────────────────────────
function callFunction(name, data, callback) {
  wx.cloud.callFunction({
    name: name,
    data: data || {},
    success: function(res) {
      if (callback) callback(res.result, null);
    },
    fail: function(err) {
      var errMsg = (err && err.errMsg) || JSON.stringify(err);
      console.error('[cloud] callFunction fail:', name, errMsg);
      if (callback) callback({ code: -1, msg: errMsg }, err);
    }
  });
}

// ── login：微信登录，获取openid，创建/更新用户 ──────────────────
function callLogin(callback) {
  callFunction('login', {}, function(result, err) {
    if (err) { callback(result || { code: -1, msg: result && result.msg || '网络错误' }); return; }
    callback(result);
  });
}

// ── getPhone：获取手机号并写入数据库 ────────────────────────────
function callGetPhone(code, _unused1, _unused2, callback) {
  callFunction('getPhone', { code: code }, function(result, err) {
    if (err) { callback({ code: -1, msg: '网络错误' }); return; }
    callback(result);
  });
}

// ── readHistory：保存解读记录 ──────────────────────────────────
function saveReadHistory(bookTitle, content, mode, callback) {
  callFunction('readHistory', {
    action: 'save',
    bookTitle: bookTitle,
    content: content,
    mode: mode || 'deep',
  }, function(result, err) {
    if (err) { if (callback) callback({ code: -1, msg: '保存失败' }); return; }
    if (callback) callback(result);
  });
}

// ── readHistory：获取历史列表 ──────────────────────────────────
function getReadHistoryList(page, pageSize, callback) {
  callFunction('readHistory', {
    action: 'list',
    page: page || 1,
    pageSize: pageSize || 20,
  }, function(result, err) {
    if (err) { if (callback) callback(null, err); return; }
    if (callback) callback(result, null);
  });
}

// ── readHistory：获取单条详情 ──────────────────────────────────
function getReadHistoryDetail(recordId, callback) {
  callFunction('readHistory', {
    action: 'detail',
    recordId: recordId,
  }, function(result, err) {
    if (err) { if (callback) callback(null, err); return; }
    if (callback) callback(result, null);
  });
}

// ── readHistory：删除单条 ──────────────────────────────────────
function deleteReadHistory(recordId, callback) {
  callFunction('readHistory', {
    action: 'delete',
    recordId: recordId,
  }, function(result, err) {
    if (err) { if (callback) callback({ code: -1, msg: '删除失败' }); return; }
    if (callback) callback(result);
  });
}

// ── readHistory：清空全部 ──────────────────────────────────────
function clearReadHistory(callback) {
  callFunction('readHistory', { action: 'clear' }, function(result, err) {
    if (err) { if (callback) callback({ code: -1, msg: '清空失败' }); return; }
    if (callback) callback(result);
  });
}

// ── vipOrder：激活码激活 ────────────────────────────────────────
function activateVipByCode(code, callback) {
  callFunction('vipOrder', {
    action: 'activateByCode',
    code: code,
  }, function(result, err) {
    if (err) { if (callback) callback({ code: -1, msg: '网络错误' }); return; }
    if (callback) callback(result);
  });
}

// ── vipOrder：查询VIP状态 ──────────────────────────────────────
function getVipStatus(callback) {
  callFunction('vipOrder', { action: 'getStatus' }, function(result, err) {
    if (err) { if (callback) callback({ code: -1, msg: '查询失败' }); return; }
    if (callback) callback(result);
  });
}

// ── saveUser：保存昵称头像，复用 login 云函数 ─────────────────────
function callSaveUser(nickName, avatarUrl, callback) {
  callFunction('login', { nickName: nickName || '', avatarUrl: avatarUrl || '' }, function(result, err) {
    if (err) { callback(result || { code: -1, msg: result && result.msg || '网络错误' }); return; }
    callback(result);
  });
}

// ── aiRead：调用云函数获取 AI 解读，模拟流式打字效果推送给前端 ──────
// 微信云函数不支持真正的服务端推流，通过模拟打字效果实现流式体验
// onChunk(chunk, fullSoFar)  每收到一段文本时触发
// onDone(result)             全部输出完毕时触发
// onError(msg)               出错时触发
function callAiRead(bookTitle, mode, onChunk, onDone, onError) {
  wx.cloud.callFunction({
    name: 'aiRead',
    data: { bookTitle: bookTitle, mode: mode || 'deep' },
    success: function(res) {
      var result = res.result || {};
      if (result.code !== 0) {
        if (onError) onError(result.msg || 'AI 解读失败');
        return;
      }
      var fullContent = result.content || '';
      if (!fullContent) {
        if (onError) onError('AI 未返回内容，请重试');
        return;
      }
      // 模拟流式打字：收到完整内容后逐字推送，模拟 AI 实时输出感
      // 总时长约 20-30s（4000字 / 每次20字 * 120ms ≈ 24s）
      var index = 0;
      var chunkSize = 20;
      var interval = 120;
      var timer = setInterval(function() {
        var end = Math.min(index + chunkSize, fullContent.length);
        var fullSoFar = fullContent.substring(0, end);
        if (onChunk) onChunk(fullContent.substring(index, end), fullSoFar);
        index = end;
        if (index >= fullContent.length) {
          clearInterval(timer);
          if (onDone) onDone(fullContent);
        }
      }, interval);
    },
    fail: function(err) {
      var msg = (err && err.errMsg) || '网络错误';
      console.error('[callAiRead] fail:', msg);
      if (onError) onError(msg);
    },
  });
}

// ── 用户信息：更新昵称/头像（直接写数据库）──────────────────────
function updateUserProfile(nickName, avatarUrl, callback) {
  wx.cloud.callFunction({
    name: 'login',  // 复用 login 云函数做查询返回，更新通过数据库 SDK
    data: {},
    success: function(res) {
      var user = res.result && res.result.user;
      if (!user || !user._id) { if (callback) callback({ code: -1, msg: '用户不存在' }); return; }
      // 通过 wx.cloud.database 直接更新（小程序端权限）
      var db = wx.cloud.database();
      db.collection('users').doc(user._id).update({
        data: {
          nickName: nickName,
          avatarUrl: avatarUrl,
        },
        success: function() { if (callback) callback({ code: 0 }); },
        fail: function(err) { if (callback) callback({ code: -1, msg: err.errMsg }); }
      });
    },
    fail: function(err) { if (callback) callback({ code: -1, msg: '更新失败' }); }
  });
}

module.exports = {
  initCloud: initCloud,
  callLogin: callLogin,
  callGetPhone: callGetPhone,
  callSaveUser: callSaveUser,
  callAiRead: callAiRead,
  saveReadHistory: saveReadHistory,
  getReadHistoryList: getReadHistoryList,
  getReadHistoryDetail: getReadHistoryDetail,
  deleteReadHistory: deleteReadHistory,
  clearReadHistory: clearReadHistory,
  activateVipByCode: activateVipByCode,
  getVipStatus: getVipStatus,
  updateUserProfile: updateUserProfile,
};
