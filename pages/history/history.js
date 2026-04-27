// pages/history/history.js
const { getHistory, deleteHistory, clearHistory } = require('../../utils/history');

const MODE_TEXT = { overview: '概览', standard: '标准', deep: '深度' };

Page({
  data: {
    historyList: [],
    filteredHistory: [],
    searchKeyword: '',
    totalCount: 0,
    totalWords: 0,
    storageLimit: '无限制',
    showActionSheet: false,
    selectedItem: null,
  },

  onShow() {
    this._loadHistory();
  },

  _loadHistory() {
    const app = getApp();
    const isVip = app.globalData.isVip;
    const rawList = getHistory();

    // 处理展示数据
    const list = rawList.map(item => ({
      ...item,
      modeText: MODE_TEXT[item.mode] || '深度',
      preview: item.content ? item.content.replace(/[#*`>\-\[\]]/g, '').trim().substring(0, 50) + '...' : '',
    }));

    // 统计
    const totalWords = list.reduce((sum, item) => sum + (item.wordCount || 0), 0);
    const totalWordsText = totalWords > 10000 ? `${(totalWords / 10000).toFixed(1)}万` : `${totalWords}`;

    this.setData({
      historyList: list,
      filteredHistory: list,
      totalCount: list.length,
      totalWords: totalWordsText,
      storageLimit: isVip ? '无限' : `${list.length}/10`,
    });
  },

  onSearchInput(e) {
    const keyword = e.detail.value;
    this.setData({ searchKeyword: keyword });
    this._filter(keyword);
  },

  clearSearch() {
    this.setData({ searchKeyword: '' });
    this._filter('');
  },

  _filter(keyword) {
    const { historyList } = this.data;
    if (!keyword) {
      this.setData({ filteredHistory: historyList });
      return;
    }
    const filtered = historyList.filter(item =>
      item.bookTitle.includes(keyword)
    );
    this.setData({ filteredHistory: filtered });
  },

  onItemTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  onItemLongPress(e) {
    const { item } = e.currentTarget.dataset;
    this.setData({ showActionSheet: true, selectedItem: item });
  },

  closeActionSheet() {
    this.setData({ showActionSheet: false, selectedItem: null });
  },

  onActionView() {
    const { selectedItem } = this.data;
    this.closeActionSheet();
    wx.navigateTo({ url: `/pages/detail/detail?id=${selectedItem.id}` });
  },

  onActionReRead() {
    const { selectedItem } = this.data;
    this.closeActionSheet();
    const app = getApp();
    if (!app.canRead()) {
      wx.navigateTo({ url: '/pages/vip/vip' });
      return;
    }
    wx.navigateTo({
      url: `/pages/reading/reading?title=${encodeURIComponent(selectedItem.bookTitle)}&mode=deep`
    });
  },

  onActionDelete() {
    const { selectedItem } = this.data;
    this.closeActionSheet();
    wx.showModal({
      title: '确认删除',
      content: `删除《${selectedItem.bookTitle}》的解读记录？`,
      confirmColor: '#EF4444',
      success: (res) => {
        if (res.confirm) {
          deleteHistory(selectedItem.id);
          this._loadHistory();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  clearAll() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有解读历史吗？此操作不可恢复。',
      confirmColor: '#EF4444',
      success: (res) => {
        if (res.confirm) {
          clearHistory();
          this._loadHistory();
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
