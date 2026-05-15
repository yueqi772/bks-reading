// utils/storage.js
var storage = {
  set: function(key, value) {
    try { wx.setStorageSync(key, value); } catch (e) { console.error('storage.set error:', e); }
  },
  get: function(key, defaultValue) {
    if (defaultValue === undefined) { defaultValue = null; }
    try {
      var v = wx.getStorageSync(key);
      return (v !== '' && v !== undefined && v !== null) ? v : defaultValue;
    } catch (e) { return defaultValue; }
  },
  remove: function(key) {
    try { wx.removeStorageSync(key); } catch (e) {}
  },
  clear: function() {
    try { wx.clearStorageSync(); } catch (e) {}
  }
};

module.exports = { storage: storage };
