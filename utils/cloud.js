// utils/cloud.js — 云函数调用统一封装（ES5）
// 所有云函数调用走这里，统一错误处理

// 初始化云开发（App onLaunch 中调用一次即可）
function initCloud() {
  wx.cloud.init({
    env: 'cloudbase-3g22c9ce5bcf0e55',
    traceUser: true,
  });
}

// ── 通用云函数调用 ─────────────────────────────────────────────
function callFunction(name, data, callback) {
  wx.cloud.callFunction({
    name: name,
    data: data || {},
    success: function(res) {
      if (callback) callback(res.result, null);
    },
    fail: function(err) {
      var errMsg = (err && err.errMsg) || JSON.stringify(err);
      console.error('[cloud] callFunction fail:', name, errMsg);
      if (callback) callback({ code: -1, msg: errMsg }, err);
    }
  });
}

// ── login：微信登录，获取openid，创建/更新用户 ──────────────────
function callLogin(callback) {
  callFunction('login', {}, function(result, err) {
    if (err) { callback(result || { code: -1, msg: result && result.msg || '网络错误' }); return; }
    callback(result);
  });
}

// ── getPhone：获取手机号并写入数据库 ────────────────────────────
function callGetPhone(code, _unused1, _unused2, callback) {
  callFunction('getPhone', { code: code }, function(result, err) {
    if (err) { callback({ code: -1, msg: '网络错误' }); return; }
    callback(result);
  });
}

// ── readHistory：保存解读记录 ──────────────────────────────────
function saveReadHistory(bookTitle, content, mode, callback) {
  callFunction('readHistory', {
    action: 'save',
    bookTitle: bookTitle,
    content: content,
    mode: mode || 'deep',
  }, function(result, err) {
    if (err) { if (callback) callback({ code: -1, msg: '保存失败' }); return; }
    if (callback) callback(result);
  });
}

// ── readHistory：获取历史列表 ──────────────────────────────────
function getReadHistoryList(page, pageSize, callback) {
  callFunction('readHistory', {
    action: 'list',
    page: page || 1,
    pageSize: pageSize || 20,
  }, function(result, err) {
    if (err) { if (callback) callback(null, err); return; }
    if (callback) callback(result, null);
  });
}

// ── readHistory：获取单条详情 ──────────────────────────────────
function getReadHistoryDetail(recordId, callback) {
  callFunction('readHistory', {
    action: 'detail',
    recordId: recordId,
  }, function(result, err) {
    if (err) { if (callback) callback(null, err); return; }
    if (callback) callback(result, null);
  });
}

// ── readHistory：删除单条 ──────────────────────────────────────
function deleteReadHistory(recordId, callback) {
  callFunction('readHistory', {
    action: 'delete',
    recordId: recordId,
  }, function(result, err) {
    if (err) { if (callback) callback({ code: -1, msg: '删除失败' }); return; }
    if (callback) callback(result);
  });
}

// ── readHistory：清空全部 ──────────────────────────────────────
function clearReadHistory(callback) {
  callFunction('readHistory', { action: 'clear' }, function(result, err) {
    if (err) { if (callback) callback({ code: -1, msg: '清空失败' }); return; }
    if (callback) callback(result);
  });
}

// ── vipOrder：激活码激活 ────────────────────────────────────────
function activateVipByCode(code, callback) {
  callFunction('vipOrder', {
    action: 'activateByCode',
    code: code,
  }, function(result, err) {
    if (err) { if (callback) callback({ code: -1, msg: '网络错误' }); return; }
    if (callback) callback(result);
  });
}

// ── vipOrder：查询VIP状态 ──────────────────────────────────────
function getVipStatus(callback) {
  callFunction('vipOrder', { action: 'getStatus' }, function(result, err) {
    if (err) { if (callback) callback({ code: -1, msg: '查询失败' }); return; }
    if (callback) callback(result);
  });
}

// ── saveUser：保存昵称头像，复用 login 云函数 ─────────────────────
function callSaveUser(nickName, avatarUrl, callback) {
  callFunction('login', { nickName: nickName || '', avatarUrl: avatarUrl || '' }, function(result, err) {
    if (err) { callback(result || { code: -1, msg: result && result.msg || '网络错误' }); return; }
    callback(result);
  });
}

// ── aiRead：直接通过 wx.request + enableChunked 调用 DeepSeek SSE 接口，实现真实流式打字效果 ─────────
// onChunk(chunk, fullSoFar)  每收到一段新文本时触发
// onDone(fullContent)        全部输出完毕时触发
// onError(msg)               出错时触发
// 返回 requestTask，可调用 .abort() 中止
var DEEPSEEK_API_KEY = 'sk-b85bb48c8a254453b8da5401811ab44f';

// 「书旅向导」完整角色 Prompt
var SYSTEM_PROMPT = [
  '你是「书旅向导」，博学的阅读导师 + 知识转化专家。',
  '',
  '【能力特质】',
  '- 熟读各类书籍，擅长将书面知识转化为生活中的智慧',
  '- 用苏格拉底式提问法引导读者思考',
  '- 用生动的例子帮助理解抽象概念',
  '- 用清晰的框架帮助读者构建知识体系',
  '',
  '【交互风格】',
  '- 亲切但专业，像朋友聊天一样有深度',
  '- 案例驱动，每个抽象概念都配生活化例子',
  '- 使用第二人称"你"进行交流',
  '- 适当使用 emoji 增强可读性',
  '- 重要观点用加粗标注',
  '',
  '【内容质量准则 - 必须做到】',
  '1. 深度展开：每个论点都要有完整的"为什么"和"怎么做"，不能只给结论',
  '2. 每个观点都必须有生活应用场景',
  '3. 使用具体的例子而非抽象描述',
  '4. 主动指出可能的理解误区',
  '5. 案例必须完整：包含背景、做法、结果三要素',
  '',
  '【禁止行为】',
  '1. 不编造书中不存在的观点',
  '2. 不使用过于学术化的语言',
  '3. 不输出简练摘要：章节内容必须完整展开',
  '4. 深度模式下每章内容不低于1000字',
].join('\n');

function _buildPrompt(bookTitle, mode) {
  if (mode === 'overview') {
    return [
      '请以「书旅向导」身份，对《' + bookTitle + '》进行【概览模式】解读，总字数600字以内。',
      '',
      '按以下结构输出（Markdown）：',
      '# 《' + bookTitle + '》精读指南',
      '## 一句话推荐',
      '## 深入程度',
      '概览',
      '## 书籍概览',
      '- 书籍基本信息（作者、核心主题）',
      '- 适合人群',
      '## 核心观点（3点，每点含观点+简要应用）',
      '## 延伸思考（2个问题）',
      '',
      '若此书不存在请直接说明，不要编造。',
    ].join('\n');
  }

  if (mode === 'standard') {
    return [
      '请以「书旅向导」身份，对《' + bookTitle + '》进行【标准模式】解读，总字数1500字左右。',
      '',
      '按以下结构输出（Markdown）：',
      '# 《' + bookTitle + '》精读指南',
      '## 一句话推荐',
      '## 深入程度',
      '标准',
      '## 书籍概览',
      '- 书籍基本信息（作者、出版年份、核心主题）',
      '- 书籍结构（章节数量、主要部分）',
      '- 适合人群',
      '## 核心观点深度解析（3-4个，每个含：为什么重要+详细解释+生活案例+如何应用）',
      '## 各章节精华速览（每章100-200字）',
      '## 延伸思考（3个问题，每个附思考方向提示）',
      '',
      '若此书不存在请直接说明，不要编造。',
    ].join('\n');
  }

  // 深度模式（默认）
  return [
    '请以「书旅向导」身份，对《' + bookTitle + '》进行【深度模式】完整精读，总字数不低于3000字，越详细越好。',
    '',
    '【深度模式执行标准】',
    '- 每个核心精华至少200字深度展开，包含为什么重要+详细解释+完整案例',
    '- 每个章节速览至少200字，包含：背景+核心论点+案例',
    '- 深度模式每章内容不低于1000字',
    '- 禁止仅用摘要式语言提炼结论，必须展开论证过程',
    '',
    '按以下结构完整输出（Markdown）：',
    '',
    '# 《' + bookTitle + '》精读指南',
    '',
    '## 一句话推荐',
    '',
    '## 深入程度',
    '深度',
    '',
    '## 书籍概览',
    '- 书籍基本信息（作者、出版年份、核心主题）',
    '- 书籍结构（章节数量、主要部分）',
    '- 适合人群',
    '',
    '## 全景知识地图',
    '[用文字描述书籍整体框架，展示所有核心概念及其关系]',
    '',
    '## 核心观点深度解析',
    '',
    '### 🔴 核心精华',
    '',
    '#### 精华一：[观点标题]',
    '**问题**：为什么要关注这个问题？（至少200字，要有深度，不能一句话带过）',
    '**解答**：核心观点的详细解释 + 案例（生活案例或商业案例）',
    '**生活中的运用**：',
    '- 场景：具体生活情境描述',
    '- 方法：3步以内的可执行步骤',
    '- 提醒：常见的误区或注意事项',
    '',
    '#### 精华二：[观点标题]',
    '（完整结构重复，每个精华都要有深度展开，不少于200字）',
    '',
    '#### 精华三：[观点标题]',
    '（完整结构重复）',
    '',
    '### 🟡 重要概念',
    '',
    '#### 概念一：[概念名称]',
    '**这个概念是什么**：（至少150字，含历史背景或学术来源）',
    '**实际案例**：完整案例（背景+做法+结果）',
    '**生活中的运用**：具体场景 + 操作方法',
    '**常见误解**：指出最容易混淆或出错的地方',
    '',
    '#### 概念二：[概念名称]',
    '（完整结构重复）',
    '',
    '### 🟢 延伸知识',
    '简要介绍书中的拓展性内容，帮助拓宽视野（每条含简要说明+与核心观点的关联）',
    '',
    '### 🔧 实践工具',
    '**工具一：[工具名称]**',
    '- 用途：为什么这个工具重要',
    '- 使用方法：分步骤说明',
    '- 注意事项：常见错误和避坑指南',
    '- 练习建议：如何在日常生活中练习',
    '',
    '## 各章节精华速览',
    '（按章节顺序，覆盖所有主要章节，每章至少200字，包含：背景+核心论点+案例）',
    '',
    '## 延伸思考',
    '引导读者进一步思考的问题（3-5个，每个问题都要有思考方向提示）',
    '',
    '## 综合案例应用',
    '给出一个完整的实际应用案例，从头到尾演示如何运用书中原理（背景+做法+结果）',
    '',
    '若此书不存在或你不了解请直接说明，不要编造。',
  ].join('\n');
}

// callAiRead: 直接调用 DeepSeek SSE 流式接口，实现真实逐字打字效果
// 利用 wx.request enableChunked: true 接收 SSE 数据流，解析 delta.content 实时推送
// 返回一个带 abort() 方法的对象，供页面退出时取消
function callAiRead(bookTitle, mode, onChunk, onDone, onError) {
  var aborted = false;
  var fullContent = '';
  var sseBuffer = '';   // 跨 chunk 的行缓冲区
  var requestTask = null;
  var doneTriggered = false;

  // 解析一行 SSE 数据，返回新增文本（无则返回空串）
  function parseSseLine(line) {
    // 跳过空行、注释行
    if (!line || line.indexOf('data:') !== 0) return '';
    var json = line.slice(5).trim();
    // [DONE] 标记流结束
    if (json === '[DONE]') return null;  // null 表示流结束
    try {
      var obj = JSON.parse(json);
      var delta = obj && obj.choices && obj.choices[0] && obj.choices[0].delta;
      return (delta && delta.content) ? delta.content : '';
    } catch (e) {
      return '';
    }
  }

  // 处理收到的原始字节数据（可能包含多行）
  function handleRawChunk(rawText) {
    if (aborted) return;
    sseBuffer += rawText;
    var lines = sseBuffer.split('\n');
    // 最后一行可能不完整，保留到下次
    sseBuffer = lines.pop() || '';

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\r$/, '');
      var delta = parseSseLine(line);
      if (delta === null) {
        // 流结束
        if (!doneTriggered) {
          doneTriggered = true;
          if (onDone) onDone(fullContent);
        }
        return;
      }
      if (delta) {
        fullContent += delta;
        if (onChunk) onChunk(delta, fullContent);
      }
    }
  }

  var messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: _buildPrompt(bookTitle, mode || 'deep') },
  ];

  // wx.request 发起 SSE 流式请求
  requestTask = wx.request({
    url: 'https://api.deepseek.com/chat/completions',
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DEEPSEEK_API_KEY,
    },
    data: JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      max_tokens: 4096,
      temperature: 0.7,
      stream: true,
    }),
    enableChunked: true,   // 开启分块接收，实现 SSE 流式读取
    timeout: 120000,
    success: function(res) {
      if (aborted) return;
      console.log('[callAiRead] success statusCode:', res.statusCode,
        'doneTriggered:', doneTriggered,
        'fullContent.length:', fullContent.length,
        'data type:', typeof res.data);

      if (res.statusCode >= 400) {
        if (!doneTriggered) {
          doneTriggered = true;
          if (onError) onError('接口错误 ' + res.statusCode);
        }
        return;
      }

      // success 触发时先 flush sseBuffer 里可能剩余的内容
      if (sseBuffer.trim()) {
        handleRawChunk('\n');
      }

      // 若 onChunkReceived 已经工作，doneTriggered 此时为 true，直接返回
      if (doneTriggered) return;

      // === 兜底路径：onChunkReceived 未触发（开发者工具模拟器不支持 chunked）===
      // res.data 可能是字符串（SSE 文本）或对象（框架解析失败降级），统一转字符串处理
      var rawData = '';
      if (typeof res.data === 'string') {
        rawData = res.data;
      } else if (res.data) {
        try { rawData = JSON.stringify(res.data); } catch (e) { rawData = ''; }
      }
      console.log('[callAiRead] fallback raw len:', rawData.length, 'preview:', rawData.slice(0, 120));

      if (rawData) {
        // 把整个 SSE 文本当作一个大 chunk 处理
        handleRawChunk(rawData);
      }

      if (!doneTriggered) {
        doneTriggered = true;
        if (onDone) onDone(fullContent);
      }
    },
    fail: function(err) {
      if (aborted || doneTriggered) return;
      var msg = (err && err.errMsg) || '网络请求失败';
      console.error('[callAiRead] request fail:', msg);
      if (onError) onError(msg);
    },
  });

  // 监听分块数据（SSE 流式核心）
  requestTask.onChunkReceived(function(response) {
    if (aborted || doneTriggered) return;
    var text = '';
    try {
      // ArrayBuffer → UTF-8 字符串，正确处理中文多字节
      var arr = new Uint8Array(response.data);
      var latin1 = '';
      for (var i = 0; i < arr.length; i++) {
        latin1 += String.fromCharCode(arr[i]);
      }
      text = decodeURIComponent(escape(latin1));
    } catch (e) {
      // 解码失败时降级
      try {
        var arr2 = new Uint8Array(response.data);
        for (var j = 0; j < arr2.length; j++) {
          text += String.fromCharCode(arr2[j]);
        }
      } catch (e2) {
        text = '';
      }
    }
    if (text) {
      console.log('[callAiRead] chunk len:', text.length, 'preview:', text.slice(0, 80));
      handleRawChunk(text);
    }
  });

  // 返回可 abort 的句柄，供 reading.js 页面退出时取消
  return {
    abort: function() {
      aborted = true;
      if (requestTask) {
        try { requestTask.abort(); } catch (e) {}
        requestTask = null;
      }
    },
  };
}

// ── 每日推荐：调用 DeepSeek 生成5本豆瓣8分以上书单 ──────────────────
// onDone(books)   books = [{title, author, doubanScore, reason, tag, coverUrl}, ...]
// onError(msg)
function callDailyRecommend(dateStr, onDone, onError) {
  var prompt = [
    '今天是' + dateStr + '，请为用户推荐5本书。',
    '',
    '要求：',
    '1. 每本书豆瓣评分必须在8分及以上（真实存在的书，不要编造）',
    '2. 5本书覆盖不同领域（如：认知成长、商业思维、心理学、文学、历史等），不要重复同一领域',
    '3. 每本书给出一句话推荐理由（20字以内，突出核心价值）',
    '4. 每本书给出一个分类标签（2-4个字，如：认知提升、商业思维、心理学、人文历史等）',
    '5. 给出豆瓣评分（保留一位小数）',
    '6. 给出该书的 ISBN-13 号码（13位数字，必须是真实的 ISBN，用于获取封面图片）',
    '',
    '严格按以下 JSON 格式输出，不要有任何多余文字，不要有 Markdown 代码块标记：',
    '[',
    '  {"title":"书名","author":"作者","doubanScore":9.0,"tag":"分类标签","reason":"一句话推荐理由","isbn":"9787111111111"},',
    '  {"title":"书名","author":"作者","doubanScore":8.8,"tag":"分类标签","reason":"一句话推荐理由","isbn":"9787222222222"},',
    '  {"title":"书名","author":"作者","doubanScore":8.5,"tag":"分类标签","reason":"一句话推荐理由","isbn":"9787333333333"},',
    '  {"title":"书名","author":"作者","doubanScore":8.3,"tag":"分类标签","reason":"一句话推荐理由","isbn":"9787444444444"},',
    '  {"title":"书名","author":"作者","doubanScore":8.1,"tag":"分类标签","reason":"一句话推荐理由","isbn":"9787555555555"}',
    ']',
  ].join('\n');

  var body = JSON.stringify({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: '你是一位专业的书单编辑，熟悉所有豆瓣高分书籍，只推荐真实存在且评分在8分以上的书。输出严格按 JSON 格式，不添加任何额外说明。' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 800,
    temperature: 0.8,
    stream: false,
  });

  wx.request({
    url: 'https://api.deepseek.com/chat/completions',
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DEEPSEEK_API_KEY,
    },
    data: body,
    success: function(res) {
      if (res.statusCode >= 400) {
        if (onError) onError('接口错误 ' + res.statusCode);
        return;
      }
      try {
        var content = res.data
          && res.data.choices
          && res.data.choices[0]
          && res.data.choices[0].message
          && res.data.choices[0].message.content;
        if (!content) { if (onError) onError('AI 未返回内容'); return; }

        // 清理可能残留的 markdown 代码块标记
        content = content.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
        var books = JSON.parse(content);
        if (!Array.isArray(books) || books.length === 0) {
          if (onError) onError('书单解析失败'); return;
        }
        // 为每本书生成封面 URL：优先用 Open Library ISBN 封面，无 ISBN 则用备用占位图
        books = books.map(function(book) {
          var coverUrl = '';
          if (book.isbn && /^\d{10,13}$/.test(book.isbn.replace(/-/g, ''))) {
            var cleanIsbn = book.isbn.replace(/-/g, '');
            coverUrl = 'https://covers.openlibrary.org/b/isbn/' + cleanIsbn + '-M.jpg';
          }
          return Object.assign({}, book, { coverUrl: coverUrl });
        });
        if (onDone) onDone(books);
      } catch (e) {
        console.error('[callDailyRecommend] parse error', e);
        if (onError) onError('书单解析失败');
      }
    },
    fail: function(err) {
      var msg = (err && err.errMsg) || '网络错误';
      console.error('[callDailyRecommend] fail:', msg);
      if (onError) onError(msg);
    },
  });
}

// ── 用户信息：更新昵称/头像（直接写数据库）──────────────────────
function updateUserProfile(nickName, avatarUrl, callback) {
  wx.cloud.callFunction({
    name: 'login',  // 复用 login 云函数做查询返回，更新通过数据库 SDK
    data: {},
    success: function(res) {
      var user = res.result && res.result.user;
      if (!user || !user._id) { if (callback) callback({ code: -1, msg: '用户不存在' }); return; }
      // 通过 wx.cloud.database 直接更新（小程序端权限）
      var db = wx.cloud.database();
      db.collection('users').doc(user._id).update({
        data: {
          nickName: nickName,
          avatarUrl: avatarUrl,
        },
        success: function() { if (callback) callback({ code: 0 }); },
        fail: function(err) { if (callback) callback({ code: -1, msg: err.errMsg }); }
      });
    },
    fail: function(err) { if (callback) callback({ code: -1, msg: '更新失败' }); }
  });
}

module.exports = {
  initCloud: initCloud,
  callLogin: callLogin,
  callGetPhone: callGetPhone,
  callSaveUser: callSaveUser,
  callAiRead: callAiRead,
  callDailyRecommend: callDailyRecommend,
  saveReadHistory: saveReadHistory,
  getReadHistoryList: getReadHistoryList,
  getReadHistoryDetail: getReadHistoryDetail,
  deleteReadHistory: deleteReadHistory,
  clearReadHistory: clearReadHistory,
  activateVipByCode: activateVipByCode,
  getVipStatus: getVipStatus,
  updateUserProfile: updateUserProfile,
};
