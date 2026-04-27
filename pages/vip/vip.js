// pages/vip/vip.js
const app = getApp();
const { storage } = require('../../utils/storage');

Page({
  data: {
    isVip: false,
    freeCount: 0,
    showPaySuccess: false,
  },

  onShow() {
    this.setData({
      isVip: app.globalData.isVip,
      freeCount: app.globalData.freeCount,
    });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  onPaySuccess() {
    // 扫码支付后点击"我已支付"
    this.setData({ showPaySuccess: true });
  },

  closePaySuccess() {
    this.setData({ showPaySuccess: false });
  },

  // 复制客服微信
  copyContactWx() {
    wx.setClipboardData({
      data: 'bks_service', // 替换为实际客服微信号
      success: () => {
        wx.showToast({ title: '已复制客服微信', icon: 'success' });
      }
    });
  },
});
