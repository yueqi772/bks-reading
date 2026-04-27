// utils/storage.js - 本地存储封装

const storage = {
  set(key, value) {
    try {
      wx.setStorageSync(key, value);
    } catch (e) {
      console.error('Storage set error:', e);
    }
  },

  get(key, defaultValue = null) {
    try {
      const value = wx.getStorageSync(key);
      return value !== '' && value !== undefined && value !== null ? value : defaultValue;
    } catch (e) {
      console.error('Storage get error:', e);
      return defaultValue;
    }
  },

  remove(key) {
    try {
      wx.removeStorageSync(key);
    } catch (e) {
      console.error('Storage remove error:', e);
    }
  },

  clear() {
    try {
      wx.clearStorageSync();
    } catch (e) {
      console.error('Storage clear error:', e);
    }
  }
};

module.exports = { storage };
