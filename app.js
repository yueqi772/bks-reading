// app.js
const { storage } = require('./utils/storage');

App({
  globalData: {
    userInfo: null,
    openid: '',
    isVip: false,
    vipExpireDate: '',
    freeCount: 2,        // 剩余免费次数
    dailyRecommend: null, // 每日推荐
  },

  onLaunch() {
    // 读取本地缓存的用户数据
    const userInfo = storage.get('userInfo');
    if (userInfo) {
      this.globalData.userInfo = userInfo;
    }

    // 读取会员状态
    const vipInfo = storage.get('vipInfo');
    if (vipInfo) {
      const now = new Date().getTime();
      if (vipInfo.expireDate && new Date(vipInfo.expireDate).getTime() > now) {
        this.globalData.isVip = true;
        this.globalData.vipExpireDate = vipInfo.expireDate;
      } else {
        // VIP 已过期
        this.globalData.isVip = false;
        storage.remove('vipInfo');
      }
    }

    // 读取剩余免费次数
    const freeCount = storage.get('freeCount');
    if (freeCount !== null && freeCount !== undefined) {
      this.globalData.freeCount = freeCount;
    } else {
      // 新用户，初始化 2 次免费次数
      storage.set('freeCount', 2);
    }

    // 加载每日推荐
    this._loadDailyRecommend();

    // 登录获取 openid
    this._login();
  },

  _login() {
    wx.login({
      success: (res) => {
        if (res.code) {
          // 实际项目中需要将 code 发送到自己的服务端换取 openid
          // 这里用 code 模拟 openid（实际开发需替换为真实接口）
          const mockOpenid = 'mock_openid_' + res.code.substring(0, 8);
          this.globalData.openid = mockOpenid;
          storage.set('openid', mockOpenid);
        }
      }
    });
  },

  _loadDailyRecommend() {
    // 检查今日推荐是否已缓存
    const today = new Date().toDateString();
    const cached = storage.get('dailyRecommend');
    if (cached && cached.date === today) {
      this.globalData.dailyRecommend = cached;
      return;
    }

    // 每日推荐书单（实际项目从接口获取）
    const recommends = [
      { title: '刻意练习', author: '安德斯·艾利克森', reason: '揭示天才背后的真相，告诉你刻意练习是成为顶尖高手的唯一路径。', cover: '' },
      { title: '认知觉醒', author: '周岭', reason: '用科学方法解释大脑工作原理，帮你建立高效的学习和成长体系。', cover: '' },
      { title: '思考，快与慢', author: '丹尼尔·卡尼曼', reason: '诺贝尔经济学奖得主力作，揭示人类决策的两套系统，让你更理性地思考。', cover: '' },
      { title: '深度工作', author: '卡尔·纽波特', reason: '在注意力分散的时代，深度工作是你最重要的竞争优势。', cover: '' },
      { title: '原则', author: '瑞·达利欧', reason: '桥水基金创始人的生活与工作原则，打造属于你的决策系统。', cover: '' },
      { title: '纳瓦尔宝典', author: '纳瓦尔·拉维坎特', reason: '硅谷传奇投资人关于财富与幸福的终极智慧。', cover: '' },
      { title: '穷查理宝典', author: '查理·芒格', reason: '巴菲特合伙人查理·芒格的思维模型与人生智慧精华。', cover: '' },
    ];

    // 根据日期选择推荐
    const dayIndex = new Date().getDate() % recommends.length;
    const recommend = { ...recommends[dayIndex], date: today };
    this.globalData.dailyRecommend = recommend;
    storage.set('dailyRecommend', recommend);
  },

  // 消耗一次免费次数
  consumeFreeCount() {
    if (this.globalData.freeCount > 0) {
      this.globalData.freeCount--;
      storage.set('freeCount', this.globalData.freeCount);
      return true;
    }
    return false;
  },

  // 检查是否可以解读
  canRead() {
    return this.globalData.isVip || this.globalData.freeCount > 0;
  },
});
