// utils/history.js - 解读历史管理

const { storage } = require('./storage');
const { countWords } = require('./markdown');

const HISTORY_KEY = 'readHistory';
const MAX_FREE_HISTORY = 10;

/**
 * 保存解读记录
 */
function saveHistory(bookTitle, content, mode) {
  const history = getHistory();
  const record = {
    id: Date.now().toString(),
    bookTitle,
    content,
    mode: mode || 'deep',
    wordCount: countWords(content),
    createdAt: new Date().toISOString(),
    createdAtText: formatDate(new Date()),
  };

  // 检查是否已有相同书名的记录，有则更新
  const existingIndex = history.findIndex(h => h.bookTitle === bookTitle);
  if (existingIndex >= 0) {
    history[existingIndex] = record;
  } else {
    history.unshift(record); // 最新的放最前面
  }

  storage.set(HISTORY_KEY, history);
  return record;
}

/**
 * 获取所有历史记录
 */
function getHistory() {
  return storage.get(HISTORY_KEY, []);
}

/**
 * 获取最近 N 条历史记录
 */
function getRecentHistory(n = 3) {
  const history = getHistory();
  return history.slice(0, n);
}

/**
 * 根据 id 获取单条记录
 */
function getHistoryById(id) {
  const history = getHistory();
  return history.find(h => h.id === id) || null;
}

/**
 * 删除单条历史记录
 */
function deleteHistory(id) {
  const history = getHistory();
  const newHistory = history.filter(h => h.id !== id);
  storage.set(HISTORY_KEY, newHistory);
}

/**
 * 清空所有历史记录
 */
function clearHistory() {
  storage.set(HISTORY_KEY, []);
}

/**
 * 格式化日期
 */
function formatDate(date) {
  const now = new Date();
  const d = date instanceof Date ? date : new Date(date);
  
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays}天前`;

  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

module.exports = {
  saveHistory,
  getHistory,
  getRecentHistory,
  getHistoryById,
  deleteHistory,
  clearHistory,
  formatDate
};
