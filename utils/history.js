// utils/history.js
var storageUtil = require('./storage');
var storage = storageUtil.storage;
var markdownUtil = require('./markdown');

var HISTORY_KEY = 'readHistory';

function formatDate(date) {
  var now = new Date();
  var d = (date instanceof Date) ? date : new Date(date);
  var diffMs = now - d;
  var diffMins = Math.floor(diffMs / 60000);
  var diffHours = Math.floor(diffMs / 3600000);
  var diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return diffMins + '分钟前';
  if (diffHours < 24) return diffHours + '小时前';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return diffDays + '天前';
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

function getHistory() {
  return storage.get(HISTORY_KEY, []);
}

function getRecentHistory(n) {
  return getHistory().slice(0, n || 3);
}

function getHistoryById(id) {
  var list = getHistory();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function saveHistory(bookTitle, content, mode) {
  var history = getHistory();
  var wc = markdownUtil.countWords ? markdownUtil.countWords(content) : content.length;
  var record = {
    id: Date.now().toString(),
    bookTitle: bookTitle,
    content: content,
    mode: mode || 'deep',
    wordCount: wc,
    createdAt: new Date().toISOString(),
    createdAtText: formatDate(new Date()),
  };
  var existingIndex = -1;
  for (var i = 0; i < history.length; i++) {
    if (history[i].bookTitle === bookTitle) { existingIndex = i; break; }
  }
  if (existingIndex >= 0) {
    history[existingIndex] = record;
  } else {
    history.unshift(record);
  }
  storage.set(HISTORY_KEY, history);
  return record;
}

function deleteHistory(id) {
  var history = getHistory().filter(function(h) { return h.id !== id; });
  storage.set(HISTORY_KEY, history);
}

function clearHistory() {
  storage.set(HISTORY_KEY, []);
}

module.exports = {
  saveHistory: saveHistory,
  getHistory: getHistory,
  getRecentHistory: getRecentHistory,
  getHistoryById: getHistoryById,
  deleteHistory: deleteHistory,
  clearHistory: clearHistory,
  formatDate: formatDate,
};
