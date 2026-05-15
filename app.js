// app.js
var storageUtil = require('./utils/storage');
var cloudUtil = require('./utils/cloud');
var storage = storageUtil.storage;

App({
  globalData: {
    userInfo: null,
    openid: '',
    isVip: false,
    vipExpireDate: '',
    freeCount: 2,
    dailyRecommends: [],
    isLoggedIn: false,
    cloudInited: false,
  },
  _indexPage: null,    // 首页引用，供 _silentRefresh 回调刷新
  _profilePage: null,  // 我的页引用，供 _silentRefresh 回调刷新

  onLaunch: function() {
    // 1. 初始化云开发
    cloudUtil.initCloud();
    this.globalData.cloudInited = true;

    // 2. 从缓存恢复登录态
    var cachedUser = storage.get('userInfo');
    var isLoggedIn = storage.get('isLoggedIn');

    if (cachedUser && isLoggedIn) {
      // 已登录（填写昵称即可，phone 可选），直接恢复登录态
      this.globalData.userInfo = cachedUser;
      this.globalData.isLoggedIn = true;
      this.globalData.isVip = cachedUser.isVip || false;
      this.globalData.vipExpireDate = cachedUser.vipExpireDate || '';
      this.globalData.freeCount = cachedUser.freeCount !== undefined ? cachedUser.freeCount : 2;
      // 后台静默刷新最新状态
      this._silentRefresh();
    }

    // 3. 加载每日推荐
    this._loadDailyRecommend();
  },

  // 后台静默刷新用户状态（不阻塞 UI），完成后通知各页面更新
  _silentRefresh: function() {
    var self = this;
    cloudUtil.callLogin(function(res) {
      if (!res || res.code !== 0) return;
      var user = res.user;
      self.globalData.openid = user.openid;
      self.globalData.isVip = user.isVip || false;
      self.globalData.vipExpireDate = user.vipExpireDate || '';
      // 以云端 freeCount 为准，覆盖本地缓存
      self.globalData.freeCount = user.freeCount !== undefined ? user.freeCount : 2;
      // 合并写回缓存
      if (self.globalData.userInfo) {
        self.globalData.userInfo.isVip = user.isVip;
        self.globalData.userInfo.vipExpireDate = user.vipExpireDate;
        self.globalData.userInfo.freeCount = user.freeCount;
        if (user.phone) self.globalData.userInfo.phone = user.phone;
      }
      storage.set('userInfo', self.globalData.userInfo);

      // 通知首页、我的页面刷新次数和 VIP 状态
      if (self._indexPage && self._indexPage._refresh) {
        self._indexPage._refresh();
      }
      if (self._profilePage && self._profilePage.onShow) {
        self._profilePage.onShow();
      }
    });
  },

  _loadDailyRecommend: function() {
    var self = this;
    var now = new Date();
    var today = now.toDateString();

    // 命中当天缓存则直接用，不重复请求 AI
    var cached = storage.get('dailyRecommends');
    if (cached && cached.date === today && Array.isArray(cached.books) && cached.books.length > 0) {
      self.globalData.dailyRecommends = cached.books;
      return;
    }

    // 兜底数据：AI 请求失败时使用（isbn 用于 Open Library 封面）
    var fallback = [
      { title: '刻意练习', author: '安德斯·艾利克森', doubanScore: 9.0, tag: '认知提升', reason: '揭示天才背后的真相，刻意练习是成为顶尖高手的路径', isbn: '9787111579977', coverUrl: 'https://covers.openlibrary.org/b/isbn/9787111579977-M.jpg' },
      { title: '思考，快与慢', author: '丹尼尔·卡尼曼', doubanScore: 8.8, tag: '心理学', reason: '诺贝尔奖力作，揭示人类决策的两套思维系统', isbn: '9787513300995', coverUrl: 'https://covers.openlibrary.org/b/isbn/9787513300995-M.jpg' },
      { title: '深度工作', author: '卡尔·纽波特', doubanScore: 8.6, tag: '效率管理', reason: '注意力时代最重要的竞争优势', isbn: '9787111545286', coverUrl: 'https://covers.openlibrary.org/b/isbn/9787111545286-M.jpg' },
      { title: '原则', author: '瑞·达利欧', doubanScore: 8.4, tag: '商业思维', reason: '桥水基金创始人的生活与工作决策系统', isbn: '9787508685953', coverUrl: 'https://covers.openlibrary.org/b/isbn/9787508685953-M.jpg' },
      { title: '百年孤独', author: '加西亚·马尔克斯', doubanScore: 9.2, tag: '文学经典', reason: '魔幻现实主义巅峰，诺贝尔文学奖代表作', isbn: '9787544253994', coverUrl: 'https://covers.openlibrary.org/b/isbn/9787544253994-M.jpg' },
    ];

    // 生成日期字符串用于 AI prompt
    var months = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];
    var dateStr = (now.getFullYear()) + '年' + months[now.getMonth()] + '月' + now.getDate() + '日';

    cloudUtil.callDailyRecommend(dateStr, function(books) {
      self.globalData.dailyRecommends = books;
      storage.set('dailyRecommends', { date: today, books: books });
      // 通知首页刷新
      if (self._indexPage) { self._indexPage._refreshRecommend(books); }
    }, function(err) {
      console.warn('[app] dailyRecommend AI failed, use fallback:', err);
      self.globalData.dailyRecommends = fallback;
      storage.set('dailyRecommends', { date: today, books: fallback });
      if (self._indexPage) { self._indexPage._refreshRecommend(fallback); }
    });
  },

  canRead: function() {
    return this.globalData.isVip || this.globalData.freeCount > 0;
  },

  consumeFreeCount: function() {
    if (this.globalData.isVip) return true;
    if (this.globalData.freeCount <= 0) return false;
    this.globalData.freeCount--;
    if (this.globalData.userInfo) this.globalData.userInfo.freeCount = this.globalData.freeCount;
    storage.set('userInfo', this.globalData.userInfo);
    return true;
  },
});
