// pages/profile/profile.js
const app = getApp();
const { getHistory } = require('../../utils/history');
const { storage } = require('../../utils/storage');

const FONT_SIZE_TEXT = { small: '小号', medium: '中号', large: '大号' };

Page({
  data: {
    userInfo: null,
    isVip: false,
    vipExpireText: '',
    freeCount: 2,
    totalRead: 0,
    totalWords: '',
    favoriteCount: 0,
    fontSize: 'medium',
    fontSizeText: '中号',
    showContactQr: false,
    showFontModal: false,
  },

  onShow() {
    this._refreshData();
  },

  _refreshData() {
    const globalData = app.globalData;
    const history = getHistory();
    const favorites = storage.get('favorites', []);
    const fontSize = storage.get('fontSize', 'medium');

    const totalWords = history.reduce((sum, h) => sum + (h.wordCount || 0), 0);
    const totalWordsText = totalWords > 10000
      ? `${(totalWords / 10000).toFixed(1)}万`
      : `${totalWords}`;

    this.setData({
      userInfo: globalData.userInfo,
      isVip: globalData.isVip,
      vipExpireText: globalData.vipExpireDate
        ? this._formatExpireDate(globalData.vipExpireDate)
        : '',
      freeCount: globalData.freeCount,
      totalRead: history.length,
      totalWords: totalWordsText,
      favoriteCount: favorites.length,
      fontSize,
      fontSizeText: FONT_SIZE_TEXT[fontSize] || '中号',
    });
  },

  getUserInfo() {
    wx.getUserProfile({
      desc: '用于显示您的昵称和头像',
      success: (res) => {
        app.globalData.userInfo = res.userInfo;
        storage.set('userInfo', res.userInfo);
        this.setData({ userInfo: res.userInfo });
      },
      fail: () => {
        wx.showToast({ title: '授权失败', icon: 'none' });
      }
    });
  },

  goHistory() {
    wx.switchTab({ url: '/pages/history/history' });
  },

  goFavorites() {
    // 收藏功能：展示收藏的解读列表
    const favorites = storage.get('favorites', []);
    if (favorites.length === 0) {
      wx.showToast({ title: '暂无收藏记录', icon: 'none' });
      return;
    }
    // 跳转历史页（历史页兼容展示收藏）
    wx.navigateTo({ url: '/pages/history/history' });
  },

  goVip() {
    wx.navigateTo({ url: '/pages/vip/vip' });
  },

  contactService() {
    this.setData({ showContactQr: true });
  },

  closeContactQr() {
    this.setData({ showContactQr: false });
  },

  setFontSize() {
    this.setData({ showFontModal: true });
  },

  closeFontModal() {
    this.setData({ showFontModal: false });
  },

  selectFont(e) {
    const { size } = e.currentTarget.dataset;
    storage.set('fontSize', size);
    this.setData({
      fontSize: size,
      fontSizeText: FONT_SIZE_TEXT[size] || '中号',
    });
  },

  goAbout() {
    wx.showModal({
      title: '关于书解',
      content: '书解 v1.0.0\n\n让 AI 帮你深度解读每一本好书，像喝水一样自然地成长。\n\nAppID: wx1a0032fd8bb576bd',
      showCancel: false,
      confirmText: '知道了',
    });
  },

  _formatExpireDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}月${d.getDate()}日到期`;
  },
});
