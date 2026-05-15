// components/auth-modal/auth-modal.js
var cloudUtil = require('../../utils/cloud');

Component({
  properties: {
    show: { type: Boolean, value: false },
  },

  data: {
    loading: false,
    done: false,
    // 用户填写的昵称和头像（新API方式）
    nickName: '',
    avatarUrl: '',
    errorTip: '',
    step: 'info',  // info（填昵称头像）| saving | done
  },

  methods: {
    noop: function() {},

    // 头像选择回调：open-type="chooseAvatar" 触发
    onChooseAvatar: function(e) {
      var avatarUrl = e.detail.avatarUrl || '';
      this.setData({ avatarUrl: avatarUrl, errorTip: '' });
    },

    // 昵称输入回调：type="nickname" 的 input，失焦时拿到真实昵称
    onNicknameInput: function(e) {
      var val = e.detail.value || '';
      this.setData({ nickName: val, errorTip: '' });
    },

    // 点击确认：保存昵称+头像
    onConfirm: function() {
      var nickName = this.data.nickName.trim();
      var avatarUrl = this.data.avatarUrl;

      if (!nickName) {
        this.setData({ errorTip: '请先在上方输入框填写昵称' });
        return;
      }
      this._saveUser(nickName, avatarUrl);
    },

    // 调云函数写入数据库
    _saveUser: function(nickName, avatarUrl) {
      var self = this;
      self.setData({ loading: true, errorTip: '' });

      cloudUtil.callSaveUser(nickName, avatarUrl, function(res) {
        self.setData({ loading: false });

        if (!res || res.code !== 0) {
          self.setData({ errorTip: (res && res.msg) || '保存失败，请重试' });
          return;
        }

        // 写全局状态 + 缓存
        var user = res.user || {};
        var app = getApp();
        app.globalData.userInfo = user;
        app.globalData.isVip = user.isVip || false;
        app.globalData.vipExpireDate = user.vipExpireDate || '';
        app.globalData.freeCount = user.freeCount !== undefined ? user.freeCount : 2;
        app.globalData.isLoggedIn = true;
        app.globalData.needShowAuthModal = false;
        wx.setStorageSync('userInfo', user);
        wx.setStorageSync('isLoggedIn', true);

        // 完成动画
        self.setData({
          done: true,
          nickName: user.nickName || nickName,
          avatarUrl: user.avatarUrl || avatarUrl,
        });
        setTimeout(function() {
          self.triggerEvent('done', { user: user });
        }, 1200);
      });
    },
  }
});
