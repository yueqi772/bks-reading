// pages/reading/reading.js
var historyUtil = require('../../utils/history');
var markdownUtil = require('../../utils/markdown');
var storageUtil = require('../../utils/storage');
var cloudUtil = require('../../utils/cloud');
var apiUtil = require('../../utils/api');

// 设为 false 使用真实 DeepSeek API（客户端流式），true 使用 Mock
var USE_MOCK = false;

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
  _requestTask: null,  // 当前 wx.request 任务，用于页面退出时 abort

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
    this._clearTimers();
    // 离开页面时中断请求，避免浪费 token
    if (this._requestTask && this._requestTask.abort) {
      this._requestTask.abort();
      this._requestTask = null;
    }
  },

  _clearTimers: function() {
    this._timers.forEach(function(t) { clearTimeout(t); clearInterval(t); });
    this._timers = [];
  },

  // ── 核心：客户端流式调用 DeepSeek ─────────────────────────────
  _startReading: function(bookTitle, mode) {
    var self = this;
    var app = getApp();

    // 先扣除免费次数（出错时退还）
    if (!app.globalData.isVip) { app.consumeFreeCount(); }

    // 启动进度条动画（第一个 chunk 到来时自动停止）
    self._simulateProgress();

    // 节流刷新：每 120ms setData 一次，避免高频渲染卡顿
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
        flushTimer = setTimeout(flushContent, 120);
        self._timers.push(flushTimer);
      }
    }

    var callbacks = {
      // 每收到新 chunk，切换到 streaming 阶段并刷新内容
      onChunk: function(chunk, fullSoFar) {
        if (self.data.stage === 'loading') {
          self._clearTimers();
          flushTimer = null;
          self.setData({ stage: 'streaming', progress: 100, step: 5, isStreaming: true });
        }
        pendingText = fullSoFar;
        scheduleFlush();
      },
      // 全部完成
      onComplete: function(fullContent) {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        self._requestTask = null;
        self.setData({
          streamContent: fullContent,
          wordCount: markdownUtil.countWords(fullContent),
          isStreaming: false,
          scrollTop: 99999,
        });
        self._onReadComplete(fullContent, bookTitle, mode);
      },
      // 出错，退还次数
      onError: function(err) {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        self._clearTimers();
        self._requestTask = null;
        if (!app.globalData.isVip) {
          app.globalData.freeCount++;
          storageUtil.storage.set('freeCount', app.globalData.freeCount);
        }
        self.setData({
          stage: 'error',
          isStreaming: false,
          errorMsg: (err && err.message) || err || 'AI 解读失败，请重试',
        });
      },
    };

    if (USE_MOCK) {
      self._requestTask = apiUtil.mockReadBook(bookTitle, mode, callbacks);
    } else {
      self._requestTask = apiUtil.readBook(bookTitle, mode, callbacks);
    }
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

  // ── 进度条动画（等待 AI 首字返回前展示） ────────────────────────
  _simulateProgress: function() {
    var self = this;
    var progress = 0;

    var tick = function() {
      if (self.data.stage !== 'loading') return;
      // 前 70% 快速推进，之后极慢等待 AI 首字
      var step = progress < 70
        ? (Math.random() * 6 + 4)
        : (Math.random() * 1 + 0.3);
      progress = Math.min(progress + step, 95);

      var newStep = Math.min(Math.floor(progress / 20), LOADING_TIPS.length - 1);
      self.setData({
        progress: Math.floor(progress),
        step: newStep,
        loadingTip: LOADING_TIPS[newStep],
      });

      if (progress < 95) {
        var t = setTimeout(tick, progress < 70 ? 500 : 1200);
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
    if (this._requestTask && this._requestTask.abort) {
      this._requestTask.abort();
      this._requestTask = null;
    }
    this._clearTimers();
    this.setData({
      stage: 'loading', step: 0, progress: 0,
      streamContent: '', wordCount: 0, errorMsg: '',
    });
    this._startReading(this.data.bookTitle, this.data.readMode);
  },

  goBack: function() { wx.switchTab({ url: '/pages/index/index' }); },
});
