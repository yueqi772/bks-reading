// pages/detail/detail.js
var historyUtil = require('../../utils/history');
var markdownUtil = require('../../utils/markdown');
var cloudUtil = require('../../utils/cloud');

var MODE_LABELS = { overview: '概览模式', standard: '标准模式', deep: '深度模式' };

Page({
  data: { bookTitle: '', wordCount: 0, createdAtText: '', modeLabel: '深度模式', contentHtml: '', loading: true },

  onLoad: function(options) {
    var id = options.id;
    if (!id) { wx.showToast({ title: '参数错误', icon: 'none' }); wx.navigateBack(); return; }
    this._loadRecord(id);
  },

  _loadRecord: function(id) {
    var self = this;

    // 先尝试本地
    var local = historyUtil.getHistoryById(id);
    if (local) {
      self._renderRecord(local, id);
    }

    // 再从云端拉（云端 id 与本地 id 格式不同，云端是 MongoDB ObjectId）
    var app = getApp();
    if (app.globalData.isLoggedIn) {
      cloudUtil.getReadHistoryDetail(id, function(res, err) {
        if (err || !res || res.code !== 0 || !res.record) return;
        var r = res.record;
        var record = {
          id: r._id,
          bookTitle: r.bookTitle,
          content: r.content,
          mode: r.mode,
          wordCount: r.wordCount,
          createdAt: r.createdAt,
          createdAtText: self._formatDate(r.updatedAt || r.createdAt),
        };
        self._renderRecord(record, id);
      });
    }
  },

  _renderRecord: function(record, id) {
    var contentHtml = markdownUtil.toHtml(record.content);
    wx.setNavigationBarTitle({ title: '《' + record.bookTitle.substring(0, 10) + '》' });
    this.setData({
      loading: false,
      bookTitle: record.bookTitle,
      wordCount: record.wordCount || markdownUtil.countWords(record.content),
      createdAtText: record.createdAtText || historyUtil.formatDate(record.createdAt),
      modeLabel: MODE_LABELS[record.mode] || '深度模式',
      contentHtml: contentHtml,
      _rawContent: record.content,
      _id: id,
    });
  },

  _formatDate: function(dateVal) {
    if (!dateVal) return '';
    var d = new Date(typeof dateVal === 'object' ? dateVal.$date || dateVal : dateVal);
    if (isNaN(d.getTime())) return '';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  },

  onCopy: function() {
    var self = this;
    wx.setClipboardData({
      data: '《' + self.data.bookTitle + '》深度解读\n\n' + self.data._rawContent,
      success: function() { wx.showToast({ title: '已复制到剪贴板', icon: 'success' }); }
    });
  },

  onShare: function() {
    wx.showShareMenu({ withShareTicket: false });
    wx.showToast({ title: '长按小程序分享', icon: 'none', duration: 2000 });
  },

  onDelete: function() {
    var self = this;
    wx.showModal({
      title: '删除解读',
      content: '确认删除《' + self.data.bookTitle + '》的解读记录？',
      confirmText: '删除', confirmColor: '#E74C3C',
      success: function(res) {
        if (!res.confirm) return;
        historyUtil.deleteHistory(self.data._id);
        var app = getApp();
        if (app.globalData.isLoggedIn) {
          cloudUtil.deleteReadHistory(self.data._id, null);
        }
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(function() { wx.navigateBack(); }, 1000);
      }
    });
  },

  // ── 分享给朋友 ─────────────────────────────────────────────────
  onShareAppMessage: function() {
    var title = this.data.bookTitle;
    return {
      title: '📚 我用 AI 深度解读了《' + title + '》，3000字精华一次看懂',
      path: '/pages/index/index',
      imageUrl: '',
    };
  },

  // ── 分享到朋友圈（正式版生效）─────────────────────────────────
  onShareTimeline: function() {
    var title = this.data.bookTitle;
    return {
      title: '📚 AI 深度解读《' + title + '》，3000字精华一次看懂',
      query: '',
      imageUrl: '',
    };
  },
});
