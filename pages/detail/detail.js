// pages/detail/detail.js
const { getHistoryById, formatDate } = require('../../utils/history');
const { parseMarkdown, countWords } = require('../../utils/markdown');
const { storage } = require('../../utils/storage');

const MODE_TEXT = { overview: '概览模式', standard: '标准模式', deep: '深度模式' };

Page({
  data: {
    bookTitle: '',
    content: '',
    nodes: [],
    wordCount: 0,
    dateText: '',
    modeText: '深度模式',
    fontSize: 'medium', // small | medium | large
    isFavorite: false,
    recordId: '',
  },

  onLoad(options) {
    const { id } = options;
    if (id) {
      this._loadFromHistory(id);
    }
  },

  _loadFromHistory(id) {
    const record = getHistoryById(id);
    if (!record) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      return;
    }

    const nodes = parseMarkdown(record.content);
    const wc = record.wordCount || countWords(record.content);
    const dateText = formatDate(record.createdAt);
    const modeText = MODE_TEXT[record.mode] || '深度模式';

    // 检查是否收藏
    const favorites = storage.get('favorites', []);
    const isFavorite = favorites.some(f => f.id === id);

    // 读取字体大小设置
    const fontSize = storage.get('fontSize', 'medium');

    this.setData({
      bookTitle: record.bookTitle,
      content: record.content,
      nodes,
      wordCount: wc,
      dateText,
      modeText,
      isFavorite,
      recordId: id,
      fontSize,
    });

    wx.setNavigationBarTitle({ title: `《${record.bookTitle}》解读` });
  },

  setFontSize(e) {
    const size = e.currentTarget.dataset.size;
    this.setData({ fontSize: size });
    storage.set('fontSize', size);
  },

  toggleFavorite() {
    const { isFavorite, recordId, bookTitle, content } = this.data;
    let favorites = storage.get('favorites', []);

    if (isFavorite) {
      favorites = favorites.filter(f => f.id !== recordId);
      this.setData({ isFavorite: false });
      wx.showToast({ title: '已取消收藏', icon: 'none', duration: 1500 });
    } else {
      favorites.unshift({ id: recordId, bookTitle, createdAt: new Date().toISOString() });
      this.setData({ isFavorite: true });
      wx.showToast({ title: '已收藏', icon: 'success', duration: 1500 });
    }

    storage.set('favorites', favorites);
  },

  onShare() {
    // 微信原生分享
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  onShareAppMessage() {
    return {
      title: `📖《${this.data.bookTitle}》深度解读 | 书解`,
      path: `/pages/index/index`,
      imageUrl: '',
    };
  },

  copyContent() {
    wx.setClipboardData({
      data: this.data.content,
      success: () => {
        wx.showToast({ title: '已复制全文', icon: 'success', duration: 2000 });
      }
    });
  },

  reRead() {
    const app = getApp();
    if (!app.canRead()) {
      wx.navigateTo({ url: '/pages/vip/vip' });
      return;
    }
    wx.navigateTo({
      url: `/pages/reading/reading?title=${encodeURIComponent(this.data.bookTitle)}&mode=deep`
    });
  },
});
