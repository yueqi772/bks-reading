// pages/vip/vip.js
var cloudUtil = require('../../utils/cloud');

var CONTACT_WX = 'selavie_01';

Page({
  data: {
    isVip: false,
    vipExpireDate: '',
    showActivate: false,
    activateCode: '',
    activating: false,
  },

  onShow: function() {
    var app = getApp();
    this.setData({
      isVip: app.globalData.isVip,
      vipExpireDate: app.globalData.vipExpireDate || '',
    });
    // 从云端拉最新状态
    if (app.globalData.isLoggedIn) {
      this._syncVipStatus();
    }
  },

  _syncVipStatus: function() {
    var self = this;
    cloudUtil.getVipStatus(function(res) {
      if (!res || res.code !== 0) return;
      var app = getApp();
      app.globalData.isVip = res.isVip;
      app.globalData.vipExpireDate = res.vipExpireDate || '';
      app.globalData.freeCount = res.freeCount;
      // 格式化日期
      var expireText = '';
      if (res.vipExpireDate) {
        var d = new Date(res.vipExpireDate);
        if (!isNaN(d.getTime())) {
          expireText = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
        }
      }
      self.setData({ isVip: res.isVip, vipExpireDate: expireText });
    });
  },

  toggleActivate: function() { this.setData({ showActivate: !this.data.showActivate }); },
  onActivateInput: function(e) { this.setData({ activateCode: e.detail.value }); },

  onActivate: function() {
    var code = this.data.activateCode.trim();
    if (!code) { wx.showToast({ title: '请输入激活码', icon: 'none' }); return; }
    var app = getApp();
    if (!app.globalData.isLoggedIn) {
      wx.showModal({ title: '请先登录', content: '激活会员需要先登录账号', showCancel: false,
        success: function() { wx.navigateTo({ url: '/pages/login/login' }); }
      });
      return;
    }

    this.setData({ activating: true });
    var self = this;
    cloudUtil.activateVipByCode(code, function(res) {
      self.setData({ activating: false });
      if (res && res.code === 0) {
        var expire = res.expireDate || '';
        var expireText = '';
        if (expire) {
          var d = new Date(expire);
          if (!isNaN(d.getTime())) {
            expireText = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
          }
        }
        app.globalData.isVip = true;
        app.globalData.vipExpireDate = expire;
        if (app.globalData.userInfo) {
          app.globalData.userInfo.isVip = true;
          app.globalData.userInfo.vipExpireDate = expire;
          wx.setStorageSync('userInfo', app.globalData.userInfo);
        }
        self.setData({ isVip: true, vipExpireDate: expireText, showActivate: false, activateCode: '' });
        wx.showToast({ title: '🎉 会员已激活！', icon: 'none', duration: 2500 });
      } else {
        wx.showModal({
          title: '激活失败',
          content: (res && res.msg) || '激活码无效，请检查后重试或联系客服。',
          showCancel: false
        });
      }
    });
  },

  onRenew: function() {
    this.setData({ showActivate: true });
  },

  copyContact: function() {
    wx.setClipboardData({
      data: CONTACT_WX,
      success: function() { wx.showToast({ title: '已复制客服微信号', icon: 'success' }); }
    });
  },

  previewQr: function() {
    wx.previewImage({
      current: '/images/qr_pay.png',
      urls: ['/images/qr_pay.png'],
    });
  },
});
