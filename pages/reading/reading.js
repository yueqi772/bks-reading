// pages/reading/reading.js
const app = getApp();
const { mockReadBook, readBook } = require('../../utils/api');
const { saveHistory } = require('../../utils/history');
const { countWords } = require('../../utils/markdown');

// 是否使用 Mock 模式（没有 API Key 时设为 true）
const USE_MOCK = true;

const LOADING_TIPS = [
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

  onLoad(options) {
    const title = decodeURIComponent(options.title || '');
    const mode = options.mode || 'deep';
    this.setData({ bookTitle: title, readMode: mode });
    wx.setNavigationBarTitle({ title: `解读《${title.substring(0, 8)}...》` });
    this._startReading(title, mode);
  },

  onUnload() {
    // 清除所有定时器
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];
  },

  _startReading(bookTitle, mode) {
    // 先消耗免费次数（只有非会员才消耗）
    const app = getApp();
    if (!app.globalData.isVip) {
      app.consumeFreeCount();
    }

    // 模拟进度条
    this._simulateProgress();

    const callbacks = {
      onStart: () => {
        this.setData({ stage: 'loading', isStreaming: true });
      },
      onChunk: (content) => {
        // 切换到流式输出阶段
        if (this.data.stage === 'loading') {
          this.setData({ stage: 'streaming', progress: 100, step: 4 });
        }
        const wc = countWords(content);
        this.setData({
          streamContent: content,
          wordCount: wc,
          scrollTop: 99999, // 自动滚到底部
        });
      },
      onComplete: (fullContent) => {
        const wc = countWords(fullContent);
        // 保存历史
        const record = saveHistory(bookTitle, fullContent, mode);
        this.setData({
          stage: 'done',
          streamContent: fullContent,
          wordCount: wc,
          isStreaming: false,
          savedId: record.id,
        });
      },
      onError: (err) => {
        // 解读失败，退还免费次数
        if (!app.globalData.isVip) {
          app.globalData.freeCount++;
          const { storage } = require('../../utils/storage');
          storage.set('freeCount', app.globalData.freeCount);
        }
        this.setData({
          stage: 'error',
          isStreaming: false,
          errorMsg: err.message || '网络异常，请稍后重试',
        });
      }
    };

    if (USE_MOCK) {
      // 延迟 2 秒模拟加载感
      const t = setTimeout(() => {
        mockReadBook(bookTitle, mode, callbacks);
      }, 2000);
      this._timers.push(t);
    } else {
      readBook(bookTitle, mode, callbacks);
    }
  },

  _simulateProgress() {
    let step = 0;
    let progress = 0;
    const totalSteps = 4;
    const tipIndex = [0, 1, 2, 3];

    const tick = () => {
      if (this.data.stage !== 'loading') return;

      progress = Math.min(progress + Math.random() * 8 + 4, 95);
      const newStep = Math.min(Math.floor(progress / 25), totalSteps);
      
      this.setData({
        progress: Math.floor(progress),
        step: newStep,
        loadingTip: LOADING_TIPS[Math.min(newStep, LOADING_TIPS.length - 1)],
      });

      if (progress < 95) {
        const t = setTimeout(tick, 600 + Math.random() * 400);
        this._timers.push(t);
      }
    };

    const t = setTimeout(tick, 500);
    this._timers.push(t);
  },

  goDetail() {
    if (this.data.savedId) {
      wx.redirectTo({
        url: `/pages/detail/detail?id=${this.data.savedId}`
      });
    }
  },

  retry() {
    this.setData({
      stage: 'loading',
      step: 0,
      progress: 0,
      streamContent: '',
      wordCount: 0,
      errorMsg: '',
    });
    this._startReading(this.data.bookTitle, this.data.readMode);
  },

  goBack() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
