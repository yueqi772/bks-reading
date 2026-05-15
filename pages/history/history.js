// pages/history/history.js
var historyUtil = require('../../utils/history');
var cloudUtil = require('../../utils/cloud');

Page({
  data: { historyList: [], loading: false, isLoggedIn: false, showAuthModal: false },

  onShow: function() {
    var app = getApp();
    var isLoggedIn = app.globalData.isLoggedIn || false;
    // 先显示本地缓存，再异步拉云端
    var local = historyUtil.getHistory() || [];
    this.setData({ historyList: local, loading: isLoggedIn, isLoggedIn: isLoggedIn });

    if (isLoggedIn) {
      this._loadFromCloud();
    }
  },

  _loadFromCloud: function() {
    var self = this;
    cloudUtil.getReadHistoryList(1, 50, function(res, err) {
      self.setData({ loading: false });
      if (err || !res || res.code !== 0) return; // 云端失败时保留本地数据
      if (!res.list || res.list.length === 0) return;

      // 格式化日期显示
      var list = res.list.map(function(item) {
        return {
          id: item._id,
          bookTitle: item.bookTitle,
          wordCount: item.wordCount || 0,
          mode: item.mode || 'deep',
          createdAtText: self._formatDate(item.updatedAt || item.createdAt),
          _isCloud: true,
        };
      });
      self.setData({ historyList: list });
    });
  },

  _formatDate: function(dateVal) {
    if (!dateVal) return '';
    var d = new Date(typeof dateVal === 'object' ? dateVal.$date || dateVal : dateVal);
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    var diffMs = now - d;
    var diffMins = Math.floor(diffMs / 60000);
    var diffHours = Math.floor(diffMs / 3600000);
    var diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return diffMins + '分钟前';
    if (diffHours < 24) return diffHours + '小时前';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return diffDays + '天前';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  },

  onItemTap: function(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  onItemDelete: function(e) {
    var id = e.currentTarget.dataset.id;
    var list = this.data.historyList;
    var record = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { record = list[i]; break; }
    }
    var self = this;
    wx.showModal({
      title: '删除解读',
      content: '确认删除《' + (record ? record.bookTitle : '') + '》？',
      confirmText: '删除', confirmColor: '#E74C3C',
      success: function(res) {
        if (!res.confirm) return;
        // 本地删除
        historyUtil.deleteHistory(id);
        // 云端删除（异步，不阻塞UI）
        var app = getApp();
        if (app.globalData.isLoggedIn) {
          cloudUtil.deleteReadHistory(id, null);
        }
        var newList = self.data.historyList.filter(function(h) { return h.id !== id; });
        self.setData({ historyList: newList });
      }
    });
  },

  onClearAll: function() {
    var self = this;
    wx.showModal({
      title: '清空记录', content: '确认清空所有解读历史？此操作不可恢复。',
      confirmText: '清空', confirmColor: '#E74C3C',
      success: function(res) {
        if (!res.confirm) return;
        historyUtil.clearHistory();
        var app = getApp();
        if (app.globalData.isLoggedIn) {
          cloudUtil.clearReadHistory(null);
        }
        self.setData({ historyList: [] });
      }
    });
  },

  // ── 未登录时点击「登录」──────────────────────────────────────
  onLogin: function() {
    this.setData({ showAuthModal: true });
  },

  // ── 授权弹窗完成回调 ────────────────────────────────────────
  onAuthDone: function(e) {
    console.log('[history] onAuthDone event:', e);
    var user = (e && e.detail && e.detail.user) || {};
    var app = getApp();
    this.setData({
      showAuthModal: false,
      isLoggedIn: app.globalData.isLoggedIn,
      loading: true,
    });
    // 延迟加载云端数据，确保全局登录态已更新
    var self = this;
    setTimeout(function() {
      self._loadFromCloud();
    }, 300);
  },

  goHome: function() { wx.switchTab({ url: '/pages/index/index' }); },
});
