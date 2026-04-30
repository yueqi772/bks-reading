// pages/reading/reading.js
var historyUtil = require('../../utils/history');
var markdownUtil = require('../../utils/markdown');
var storageUtil = require('../../utils/storage');
var cloudUtil = require('../../utils/cloud');

var LOADING_TIPS = [
  '正在分析书籍结构...',
  '提炼核心观点中...',
  '深度展开每个论点...',
  '整理实践案例...',
  '生成知识地图...',
  '即将完成解读...',
];

Page({
  data: {
    bookTitle: '',
    readMode: 'deep',
    stage: 'loading',   // loading | streaming | done | error
    step: 0,
    progress: 0,
    loadingTip: '正在分析书籍结构...',
    streamContent: '',
    wordCount: 0,
    isStreaming: false,
    scrollTop: 0,
    errorMsg: '',
    savedId: '',
  },

  _timers: [],
  _typeTimer: null,  // 打字机 interval，页面退出时清除

  onLoad: function(options) {
    var title = decodeURIComponent(options.title || '');
    var mode = options.mode || 'deep';
    this.setData({ bookTitle: title, readMode: mode });
    wx.setNavigationBarTitle({
      title: '解读《' + title.substring(0, 8) + (title.length > 8 ? '...' : '') + '》'
    });
    this._startReading(title, mode);
  },

  onUnload: function() {
    this._clearAll();
  },

  _clearAll: function() {
    this._timers.forEach(function(t) { clearTimeout(t); clearInterval(t); });
    this._timers = [];
    if (this._typeTimer) { clearInterval(this._typeTimer); this._typeTimer = null; }
  },

  // ── 核心：调用云函数，收到完整内容后打字机流式展示 ─────────────
  _startReading: function(bookTitle, mode) {
    var self = this;
    var app = getApp();

    // 先扣除免费次数（出错时退还）
    if (!app.globalData.isVip) { app.consumeFreeCount(); }

    // 启动进度条动画（云函数返回内容前展示）
    self._simulateProgress();

    // 节流刷新：避免打字机高频 setData 卡顿
    var pendingText = '';
    var flushTimer = null;
    function flushContent() {
      flushTimer = null;
      self.setData({
        streamContent: pendingText,
        wordCount: markdownUtil.countWords(pendingText),
        scrollTop: 99999,
      });
    }
    function scheduleFlush() {
      if (!flushTimer) {
        flushTimer = setTimeout(flushContent, 80);
      }
    }

    cloudUtil.callAiRead(
      bookTitle,
      mode,
      // onChunk：打字机每推一批字符时触发
      function(chunk, fullSoFar) {
        if (self.data.stage === 'loading') {
          // 第一个字符到来，立刻切到流式输出界面
          self._clearAll();
          flushTimer = null;
          self.setData({ stage: 'streaming', progress: 100, step: 5, isStreaming: true });
        }
        pendingText = fullSoFar;
        scheduleFlush();
      },
      // onDone：打字机播完
      function(fullContent) {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        self._typeTimer = null;
        self.setData({
          streamContent: fullContent,
          wordCount: markdownUtil.countWords(fullContent),
          isStreaming: false,
          scrollTop: 99999,
        });
        self._onReadComplete(fullContent, bookTitle, mode);
      },
      // onError：出错退还次数
      function(errMsg) {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        self._clearAll();
        if (!app.globalData.isVip) {
          app.globalData.freeCount++;
          storageUtil.storage.set('freeCount', app.globalData.freeCount);
        }
        self.setData({
          stage: 'error',
          isStreaming: false,
          errorMsg: errMsg || 'AI 解读失败，请重试',
        });
      }
    );
  },

  // ── 解读完成：保存历史 ──────────────────────────────────────────
  _onReadComplete: function(fullContent, bookTitle, mode) {
    var self = this;

    // 1. 本地立即保存
    var localRecord = historyUtil.saveHistory(bookTitle, fullContent, mode);
    self.setData({
      stage: 'done',
      wordCount: markdownUtil.countWords(fullContent),
      isStreaming: false,
      savedId: localRecord.id,
    });

    // 2. 后台同步到云端（不阻塞 UI）
    cloudUtil.saveReadHistory(bookTitle, fullContent, mode, function(res) {
      if (res && res.code === 0 && res.recordId) {
        self.setData({ savedId: res.recordId });
      }
    });
  },

  // ── 进度条动画（等待云函数响应期间展示） ────────────────────────
  _simulateProgress: function() {
    var self = this;
    var progress = 0;

    var tick = function() {
      if (self.data.stage !== 'loading') return;
      // 前 75% 快速推进，后面极慢等待云函数
      var step = progress < 75
        ? (Math.random() * 6 + 4)
        : (Math.random() * 0.8 + 0.2);
      progress = Math.min(progress + step, 95);

      var newStep = Math.min(Math.floor(progress / 20), LOADING_TIPS.length - 1);
      self.setData({
        progress: Math.floor(progress),
        step: newStep,
        loadingTip: LOADING_TIPS[newStep],
      });

      if (progress < 95) {
        var t = setTimeout(tick, progress < 75 ? 500 : 1500);
        self._timers.push(t);
      }
    };

    var t = setTimeout(tick, 400);
    this._timers.push(t);
  },

  goDetail: function() {
    if (this.data.savedId) {
      wx.redirectTo({ url: '/pages/detail/detail?id=' + this.data.savedId });
    }
  },

  retry: function() {
    this._clearAll();
    this.setData({
      stage: 'loading', step: 0, progress: 0,
      streamContent: '', wordCount: 0, errorMsg: '',
    });
    this._startReading(this.data.bookTitle, this.data.readMode);
  },

  goBack: function() { wx.switchTab({ url: '/pages/index/index' }); },
});
