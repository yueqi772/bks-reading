// pages/profile/profile.js
var historyUtil = require('../../utils/history');
var cloudUtil = require('../../utils/cloud');

Page({
  data: {
    isVip: false,
    vipExpireDate: '',
    freeCount: 2,
    totalBooks: 0,
    totalWords: '0',
    nickName: '',
    avatarUrl: '',
    phone: '',
    isLoggedIn: false,
    showBindPhone: false,
    phoneLoading: false,
    showAuthModal: false,
  },

  onLoad: function() {
    // 注册到 app，供 _silentRefresh 回调时刷新
    getApp()._profilePage = this;
  },

  onUnload: function() {
    var app = getApp();
    if (app._profilePage === this) app._profilePage = null;
  },

  onShow: function() {
    var app = getApp();
    // 确保 app 持有最新引用（tabBar 页面不触发 onLoad 再次进入）
    app._profilePage = this;
    var isLoggedIn = app.globalData.isLoggedIn || false;
    var userInfo = app.globalData.userInfo || {};

    // 先用本地/全局数据渲染
    var history = historyUtil.getHistory();
    var totalWords = 0;
    for (var i = 0; i < history.length; i++) { totalWords += history[i].wordCount || 0; }
    var wordsText = totalWords >= 10000 ? (totalWords / 10000).toFixed(1) + 'w' : totalWords.toString();

    this.setData({
      isLoggedIn: isLoggedIn,
      isVip: app.globalData.isVip,
      vipExpireDate: app.globalData.vipExpireDate || '',
      freeCount: app.globalData.freeCount,
      totalBooks: history.length,
      totalWords: wordsText,
      nickName: userInfo.nickName || '',
      avatarUrl: userInfo.avatarUrl || '',
      phone: userInfo.phone || '',
    });

    // 已登录时拉云端最新状态
    if (isLoggedIn) {
      this._refreshFromCloud();
    }
  },

  _refreshFromCloud: function() {
    var self = this;
    // 刷新 VIP 状态
    cloudUtil.getVipStatus(function(res) {
      if (!res || res.code !== 0) return;
      var app = getApp();
      app.globalData.isVip = res.isVip;
      app.globalData.vipExpireDate = res.vipExpireDate || '';
      app.globalData.freeCount = res.freeCount;
      self.setData({
        isVip: res.isVip,
        vipExpireDate: res.vipExpireDate || '',
        freeCount: res.freeCount,
      });
    });
    // 刷新解读数量（云端）
    cloudUtil.getReadHistoryList(1, 1, function(res) {
      if (!res || res.code !== 0) return;
      self.setData({ totalBooks: res.total || 0 });
    });
  },

  // ── 展示授权弹窗（点击"未登录"区域触发）──────────────────────
  showAuthModal: function() {
    this.setData({ showAuthModal: true });
  },

  // ── 授权弹窗完成回调 ─────────────────────────────────────────
  onAuthDone: function(e) {
    var user = (e.detail && e.detail.user) || {};
    var app = getApp();
    this.setData({
      showAuthModal: false,
      isLoggedIn: true,
      isVip: user.isVip || false,
      freeCount: user.freeCount !== undefined ? user.freeCount : 2,
      phone: user.phone || '',
    });
    this._refreshFromCloud();
  },

  // ── 绑定手机号 ────────────────────────────────────────────────
  onBindPhone: function(e) {
    if (e.detail.errMsg && e.detail.errMsg.indexOf('fail') !== -1) {
      wx.showToast({ title: '授权失败', icon: 'none' }); return;
    }
    var code = e.detail.code;
    if (!code) { wx.showToast({ title: '获取code失败', icon: 'none' }); return; }

    this.setData({ phoneLoading: true });
    var self = this;
    var app = getApp();
    var userInfo = app.globalData.userInfo || {};

    cloudUtil.callGetPhone(code, userInfo.nickName, userInfo.avatarUrl, function(res) {
      self.setData({ phoneLoading: false });
      if (res && res.code === 0) {
        self.setData({ phone: res.phone });
        if (app.globalData.userInfo) {
          app.globalData.userInfo.phone = res.phone;
          wx.setStorageSync('userInfo', app.globalData.userInfo);
        }
        wx.showToast({ title: '绑定成功', icon: 'success' });
      } else {
        wx.showToast({ title: (res && res.msg) || '绑定失败', icon: 'none' });
      }
    });
  },

  goHistory: function() { wx.switchTab({ url: '/pages/history/history' }); },
  goVip: function() { wx.navigateTo({ url: '/pages/vip/vip' }); },

  onAbout: function() {
    wx.showModal({
      title: '关于书解',
      content: '书解 v1.0.0\n\nAI 驱动的深度读书助手，让你用最少时间获得最深刻的阅读体验。\n\n由「书旅向导」AI 提供解读服务。',
      showCancel: false
    });
  },

  onFeedback: function() {
    wx.showModal({
      title: '意见反馈',
      content: '请将建议发送至：feedback@bookinsight.app\n\n感谢您的支持！',
      showCancel: false
    });
  },

  onClearCache: function() {
    var self = this;
    wx.showModal({
      title: '清理缓存',
      content: '清理缓存不会删除您的解读历史。',
      confirmText: '清理',
      success: function(res) {
        if (res.confirm) {
          wx.clearStorage({ success: function() { wx.showToast({ title: '缓存已清理', icon: 'success' }); } });
        }
      }
    });
  },

  onLogout: function() {
    var self = this;
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新授权才能使用完整功能',
      confirmText: '退出',
      cancelText: '取消',
      success: function(res) {
        if (!res.confirm) return;
        // 清除本地缓存
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('isLoggedIn');
        // 重置全局状态
        var app = getApp();
        app.globalData.userInfo = null;
        app.globalData.isLoggedIn = false;
        app.globalData.isVip = false;
        app.globalData.vipExpireDate = '';
        app.globalData.freeCount = 2;
        app.globalData.openid = '';
        // 刷新页面显示
        self.setData({
          isLoggedIn: false,
          isVip: false,
          freeCount: 2,
          nickName: '',
          avatarUrl: '',
          phone: '',
        });
        wx.showToast({ title: '已退出登录', icon: 'success' });
      }
    });
  },
});
