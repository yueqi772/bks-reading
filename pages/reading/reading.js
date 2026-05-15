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
    streamHtml: '',     // 解析后的 HTML，供 rich-text 渲染
    wordCount: 0,
    isStreaming: false,
    scrollTop: 0,
    errorMsg: '',
    savedId: '',
  },

  _timers: [],
  _requestTask: null,  // wx.request 任务，页面退出时 abort
  _flushTimer: null,   // 节流刷新定时器
  _pendingText: '',    // 节流缓冲区
  _isDone: false,      // 防止重复触发 onDone
  _progressToken: 0,   // 进度条 token，用于作废旧 tick

  onLoad: function(options) {
    var title = decodeURIComponent(options.title || '');
    var mode = options.mode || 'deep';
    var app = getApp();

    console.log('[reading] onLoad, isLoggedIn:', app.globalData.isLoggedIn, 'title:', title, 'canRead:', app.canRead());

    // 检查登录状态
    if (!app.globalData.isLoggedIn) {
      console.log('[reading] not logged in, showing alert');
      wx.showModal({
        title: '请先登录',
        content: '解读书籍需要登录账号',
        showCancel: false,
        success: function() {
          wx.switchTab({ url: '/pages/index/index' });
        }
      });
      return;
    }

    // 检查是否有解读权限（VIP 或有剩余免费次数）
    if (!app.canRead()) {
      console.log('[reading] no read permission');
      wx.showModal({
        title: '免费次数已用尽',
        content: '升级为会员，享受无限解读特权',
        confirmText: '升级会员',
        cancelText: '返回',
        success: function(res) {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/vip/vip' });
          } else {
            wx.switchTab({ url: '/pages/index/index' });
          }
        }
      });
      return;
    }

    console.log('[reading] starting reading...');
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
    // 作废当前进度条 token，旧 tick 回调会自动退出
    this._progressToken = (this._progressToken || 0) + 1;
    // 取消进度条定时器
    if (Array.isArray(this._timers)) {
      this._timers.forEach(function(t) { clearTimeout(t); clearInterval(t); });
    }
    this._timers = [];
    // 中止正在进行的流式请求
    if (this._requestTask) {
      try { this._requestTask.abort(); } catch (e) {}
      this._requestTask = null;
    }
    // 清除节流定时器
    if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
  },

  // ── 核心：云函数拉取内容 + 前端打字机流式渲染（手机/电脑全兼容）───
  _startReading: function(bookTitle, mode) {
    var self = this;
    var app = getApp();

    // 先扣除免费次数（出错时退还）
    if (!app.globalData.isVip) { app.consumeFreeCount(); }

    // 启动进度条动画（等待云函数返回期间展示）
    self._isDone = false;
    self._pendingText = '';
    self._simulateProgress();

    // ── 节流刷新：每 150ms 最多 setData 一次，避免高频卡顿 ──────────
    function scheduleFlush() {
      if (self._flushTimer) return;
      self._flushTimer = setTimeout(function() {
        self._flushTimer = null;
        var text = self._pendingText;
        self.setData({
          streamContent: text,
          streamHtml: markdownUtil.toHtml(text),
          wordCount: markdownUtil.countWords(text),
          scrollTop: 99999,
        });
      }, 150);
    }

    self._requestTask = cloudUtil.callAiRead(
      bookTitle,
      mode,

      // ── onChunk：打字机每推一批字符时触发 ────────────────────────
      function(chunk, fullSoFar) {
        if (self.data.stage === 'loading') {
          // 第一批字符到来，切换到流式输出界面，停止进度条动画
          if (Array.isArray(self._timers)) {
            self._timers.forEach(function(t) { clearTimeout(t); clearInterval(t); });
          }
          self._timers = [];
          self.setData({ stage: 'streaming', progress: 100, step: 5, isStreaming: true });
        }
        self._pendingText = fullSoFar;
        scheduleFlush();
      },

      // ── onDone：所有内容推送完毕 ─────────────────────────────────
      function(fullContent) {
        if (self._isDone) return;
        self._isDone = true;
        self._requestTask = null;

        // 立即刷新最终完整内容
        if (self._flushTimer) { clearTimeout(self._flushTimer); self._flushTimer = null; }
        var finalHtml = markdownUtil.toHtml(fullContent);
        self.setData({
          streamContent: fullContent,
          streamHtml: finalHtml,
          wordCount: markdownUtil.countWords(fullContent),
          isStreaming: false,
          scrollTop: 99999,
        });

        if (!fullContent) {
          self._handleError('AI 未返回内容，请重试', app);
          return;
        }

        self._onReadComplete(fullContent, bookTitle, mode);
      },

      // ── onError：出错退还次数 ────────────────────────────────────
      function(errMsg) {
        if (self._isDone) return;
        self._isDone = true;
        self._requestTask = null;
        if (self._flushTimer) { clearTimeout(self._flushTimer); self._flushTimer = null; }
        self._handleError(errMsg, app);
      }
    );
  },

  // ── 统一错误处理：退还次数，提示后返回首页 ─────────────────────────
  _handleError: function(errMsg, app) {
    var self = this;
    app = app || getApp();
    self._clearAll();

    if (!app.globalData.isVip) {
      app.globalData.freeCount++;
      storageUtil.storage.set('freeCount', app.globalData.freeCount);
    }

    var displayMsg = errMsg || 'AI 解读失败，请重试';
    console.error('[reading] aiRead error:', displayMsg);

    self.setData({
      stage: 'loading',
      isStreaming: false,
      errorMsg: '',
      streamContent: '',
      wordCount: 0,
    });

    wx.showToast({
      title: displayMsg.length > 20 ? displayMsg.slice(0, 20) + '...' : displayMsg,
      icon: 'none',
      duration: 2000,
    });

    setTimeout(function() {
      wx.switchTab({ url: '/pages/index/index' });
    }, 2000);
  },

  // ── 解读完成：保存历史 ──────────────────────────────────────────────
  _onReadComplete: function(fullContent, bookTitle, mode) {
    var self = this;

    // 1. 本地立即保存，标记完成态
    var localRecord = historyUtil.saveHistory(bookTitle, fullContent, mode);
    self.setData({
      stage: 'done',
      savedId: localRecord.id,
    });

    // 2. 后台同步到云端（不阻塞 UI）
    cloudUtil.saveReadHistory(bookTitle, fullContent, mode, function(res) {
      if (res && res.code === 0 && res.recordId) {
        self.setData({ savedId: res.recordId });
      }
    });
  },

  // ── 进度条动画（等待首个 chunk 期间展示） ───────────────────────────
  _simulateProgress: function() {
    var self = this;
    var progress = 0;
    // 记录本次进度条的 token，若 _clearAll 后 token 变了则 tick 自动停止
    var myToken = (this._progressToken || 0);

    var tick = function() {
      // token 变化说明已被 _clearAll，立即退出
      if (self._progressToken !== myToken) return;
      if (self.data.stage !== 'loading') return;

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
        // 防御性检查，确保 _timers 存在
        if (Array.isArray(self._timers)) self._timers.push(t);
      }
    };

    if (!Array.isArray(this._timers)) this._timers = [];
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
    this._isDone = false;
    this._pendingText = '';
    this.setData({
      stage: 'loading', step: 0, progress: 0,
      streamContent: '', streamHtml: '', wordCount: 0, errorMsg: '',
      isStreaming: false,
    });
    this._startReading(this.data.bookTitle, this.data.readMode);
  },

  goBack: function() { wx.switchTab({ url: '/pages/index/index' }); },
});
