// pages/index/index.js
var historyUtil = require('../../utils/history');

Page({
  data: {
    bookInput: '',
    readMode: 'deep',
    isVip: false,
    freeCount: 2,
    isLoggedIn: false,
    nickName: '',
    avatarUrl: '',
    dailyRecommends: [],       // AI 每日推荐书单（5本）
    recommendLoading: false,   // 推荐加载中
    recentHistory: [],
    todayText: '',
    showPaywall: false,
    showAuthModal: false,   // 授权弹窗开关
    hotBooks: [
      { title: '刻意练习', author: '安德斯·艾利克森', cover: 'https://images.unsplash.com/photo-1596522681657-8e9057309a7e?auto=format&fit=crop&w=200&q=80' },
      { title: '认知觉醒', author: '周岭', cover: 'https://images.unsplash.com/photo-1571834870678-24294e1ecf72?auto=format&fit=crop&w=200&q=80' },
      { title: '思考，快与慢', author: '丹尼尔·卡尼曼', cover: 'https://images.unsplash.com/photo-1604967941346-f1b8097cf97e?auto=format&fit=crop&w=200&q=80' },
      { title: '深度工作', author: '卡尔·纽波特', cover: 'https://images.unsplash.com/photo-1650735310293-307be67b3236?auto=format&fit=crop&w=200&q=80' },
      { title: '心流', author: '米哈里·契克森', cover: 'https://images.unsplash.com/photo-1483095348487-53dbf97d8d5b?auto=format&fit=crop&w=200&q=80' },
      { title: '终身成长', author: '卡罗尔·德韦克', cover: 'https://images.unsplash.com/photo-1414124488080-0188dcbb8834?auto=format&fit=crop&w=200&q=80' },
      { title: '原则', author: '瑞·达利欧', cover: 'https://images.unsplash.com/photo-1467951591042-f388365db261?auto=format&fit=crop&w=200&q=80' },
      { title: '纳瓦尔宝典', author: '纳瓦尔·拉维坎特', cover: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=200&q=80' },
    ]
  },

  // 保存登录弹窗完成后要继续执行的书名
  _pendingTitle: '',

  onLoad: function() {
    var app = getApp();
    // 注册自身，供 app.js 回调刷新推荐
    app._indexPage = this;
    this._refresh();
    // 不再自动弹授权弹窗，等用户点击功能时再弹
  },

  onShow: function() { this._refresh(); },

  onUnload: function() {
    var app = getApp();
    if (app._indexPage === this) { app._indexPage = null; }
  },

  _refresh: function() {
    var app = getApp();
    var now = new Date();
    var weekDays = ['日','一','二','三','四','五','六'];
    var userInfo = app.globalData.userInfo || {};
    var recommends = app.globalData.dailyRecommends || [];
    this.setData({
      isLoggedIn: app.globalData.isLoggedIn || false,
      isVip: app.globalData.isVip,
      freeCount: app.globalData.freeCount,
      nickName: userInfo.nickName || '',
      avatarUrl: userInfo.avatarUrl || '',
      dailyRecommends: recommends,
      recommendLoading: recommends.length === 0,
      recentHistory: historyUtil.getRecentHistory(3),
      todayText: (now.getMonth()+1) + '月' + now.getDate() + '日 周' + weekDays[now.getDay()],
    });
  },

  // AI 推荐回调（由 app.js 调用）
  _refreshRecommend: function(books) {
    this.setData({ dailyRecommends: books, recommendLoading: false });
  },

  // ── 授权弹窗完成回调 ──────────────────────────────────────────
  onAuthDone: function(e) {
    var user = (e.detail && e.detail.user) || {};
    this.setData({
      showAuthModal: false,
      isLoggedIn: true,
      isVip: user.isVip || false,
      freeCount: user.freeCount !== undefined ? user.freeCount : 2,
    });
    // 登录成功后，继续执行之前被拦截的操作
    if (this._pendingTitle) {
      var title = this._pendingTitle;
      this._pendingTitle = '';
      this._go(title);
    }
  },

  // ── 搜索与解读 ────────────────────────────────────────────────
  onBookInput: function(e) { this.setData({ bookInput: e.detail.value }); },
  clearInput: function() { this.setData({ bookInput: '' }); },
  setMode: function(e) { this.setData({ readMode: e.currentTarget.dataset.mode }); },

  onStartRead: function() {
    var title = this.data.bookInput.trim();
    if (!title) { wx.showToast({ title: '请输入书名', icon: 'none' }); return; }
    this._go(title);
  },
  onRecommendTap: function(e) {
    var title = e.currentTarget.dataset.title;
    if (title) { this.setData({ bookInput: title }); this._go(title); }
  },
  onHotBookTap: function(e) {
    var t = e.currentTarget.dataset.title;
    this.setData({ bookInput: t }); this._go(t);
  },
  onHistoryTap: function(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },
  goHistory: function() { wx.switchTab({ url: '/pages/history/history' }); },
  goVip: function() { wx.navigateTo({ url: '/pages/vip/vip' }); },

  _go: function(title) {
    var app = getApp();
    console.log('[index] _go called, isLoggedIn:', app.globalData.isLoggedIn, 'title:', title);
    // 未登录：记录待执行操作，再弹授权弹窗
    if (!app.globalData.isLoggedIn) {
      console.log('[index] not logged in, showing auth modal');
      this._pendingTitle = title;
      this.setData({ showAuthModal: true });
      return;
    }
    if (!app.canRead()) {
      console.log('[index] no read permission, showing paywall');
      this.setData({ showPaywall: true });
      return;
    }
    console.log('[index] navigating to reading page');
    wx.navigateTo({
      url: '/pages/reading/reading?title=' + encodeURIComponent(title) + '&mode=' + this.data.readMode
    });
  },

  onPaywallClose: function() { this.setData({ showPaywall: false }); },
  onPaywallGoVip: function() { this.setData({ showPaywall: false }); wx.navigateTo({ url: '/pages/vip/vip' }); },

  // ── 分享给朋友 ─────────────────────────────────────────────────
  onShareAppMessage: function() {
    return {
      title: '📚 AI 深度解读书籍，一键读懂好书精华',
      path: '/pages/index/index',
      imageUrl: '',
    };
  },

  // ── 分享到朋友圈（正式版生效）─────────────────────────────────
  onShareTimeline: function() {
    return {
      title: '📚 AI 深度解读书籍，一键读懂好书精华',
      query: '',
      imageUrl: '',
    };
  },
});
