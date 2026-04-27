// pages/index/index.js
const app = getApp();
const { getRecentHistory } = require('../../utils/history');

Page({
  data: {
    bookInput: '',
    readMode: 'deep',
    isVip: false,
    freeCount: 2,
    dailyRecommend: null,
    recentHistory: [],
    todayText: '',
    showPaywall: false,
    hotBooks: [
      { title: '刻意练习', author: '安德斯·艾利克森', emoji: '🏋️' },
      { title: '认知觉醒', author: '周岭', emoji: '🧠' },
      { title: '思考，快与慢', author: '丹尼尔·卡尼曼', emoji: '💡' },
      { title: '深度工作', author: '卡尔·纽波特', emoji: '🎯' },
      { title: '原则', author: '瑞·达利欧', emoji: '📐' },
      { title: '纳瓦尔宝典', author: '纳瓦尔·拉维坎特', emoji: '💎' },
      { title: '穷查理宝典', author: '查理·芒格', emoji: '🦅' },
      { title: '心流', author: '米哈里·契克森', emoji: '🌊' },
    ]
  },

  onLoad() {
    this._refreshData();
  },

  onShow() {
    this._refreshData();
  },

  _refreshData() {
    const app = getApp();
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekDay = weekDays[now.getDay()];

    this.setData({
      isVip: app.globalData.isVip,
      freeCount: app.globalData.freeCount,
      dailyRecommend: app.globalData.dailyRecommend,
      recentHistory: getRecentHistory(3),
      todayText: `${month}月${day}日 周${weekDay}`,
    });
  },

  onBookInput(e) {
    this.setData({ bookInput: e.detail.value });
  },

  clearInput() {
    this.setData({ bookInput: '' });
  },

  setMode(e) {
    this.setData({ readMode: e.currentTarget.dataset.mode });
  },

  onStartRead() {
    const bookTitle = this.data.bookInput.trim();
    if (!bookTitle) {
      wx.showToast({ title: '请输入书名', icon: 'none' });
      return;
    }
    this._startRead(bookTitle);
  },

  onRecommendTap() {
    const { dailyRecommend } = this.data;
    if (dailyRecommend) {
      this.setData({ bookInput: dailyRecommend.title });
      this._startRead(dailyRecommend.title);
    }
  },

  onHotBookTap(e) {
    const { title } = e.currentTarget.dataset;
    this.setData({ bookInput: title });
    this._startRead(title);
  },

  onHistoryTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  goHistory() {
    wx.switchTab({ url: '/pages/history/history' });
  },

  goVip() {
    wx.navigateTo({ url: '/pages/vip/vip' });
  },

  _startRead(bookTitle) {
    const app = getApp();
    if (!app.canRead()) {
      // 次数用完，显示付费弹窗
      this.setData({ showPaywall: true });
      return;
    }

    wx.navigateTo({
      url: `/pages/reading/reading?title=${encodeURIComponent(bookTitle)}&mode=${this.data.readMode}`
    });
  },

  onPaywallClose() {
    this.setData({ showPaywall: false });
  },

  onPaywallGoVip() {
    this.setData({ showPaywall: false });
    wx.navigateTo({ url: '/pages/vip/vip' });
  },
});
