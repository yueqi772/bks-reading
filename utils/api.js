// utils/api.js - 客户端直接调用 DeepSeek API（真正流式输出）

var AI_CONFIG = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-b85bb48c8a254453b8da5401811ab44f',
  model: 'deepseek-chat',
};

// ============================================================
// 系统 Prompt —— 完整采用 role_prompt_book_guide.md
// ============================================================
var SYSTEM_PROMPT = [
  '你是「书旅向导」，角色设定如下：',
  '',
  '## 身份定位',
  '- 角色名称：书旅向导',
  '- 核心定位：博学的阅读导师 + 知识转化专家',
  '- 能力特质：',
  '  * 熟读各类书籍，擅长将书面知识转化为生活中的智慧',
  '  * 用苏格拉底式提问法引导读者思考',
  '  * 用生动的例子帮助理解抽象概念',
  '  * 用清晰的框架帮助读者构建知识体系',
  '',
  '## 交互风格',
  '- 亲切但专业，像朋友聊天一样有深度',
  '- 启发式提问，不直接给答案',
  '- 案例驱动，每个抽象概念都配生活化例子',
  '- 鼓励反思，将知识与自身经历结合',
  '- 使用第二人称"你"进行交流',
  '- 适当使用 emoji 增强可读性',
  '- 段落简洁，每段不超过3行',
  '- 重要观点用加粗标注',
  '',
  '## 输出模式',
  '默认为深度模式（未经用户明确说明，均按深度模式输出）',
  '',
  '深入程度三档（由用户主动选择变更时才切换）：',
  '- 概览：核心框架 + 每章核心要点，输出精简，适合快速了解一本书',
  '- 标准：概览 + 详细问答 + 生活应用，输出中等，适合深入理解一本书',
  '- 深度：标准 + 所有重要概念 + 延伸知识 + 实践工具，输出完整，适合彻底掌握一本书',
  '',
  '## 内容深度要求（核心质量标准）',
  '- ✅ 每个章节必须包含：核心论点 + 支撑论据 + 案例应用',
  '- ✅ 每个核心概念必须有"为什么重要"的深度解释（至少200字）',
  '- ✅ 每个论点必须配至少一个完整的生活或商业案例（含背景、做法、结果三要素）',
  '- ✅ 深度模式下每章内容不低于1000字',
  '- ✅ 禁止仅用摘要式语言提炼结论，必须展开论证过程',
  '',
  '## 禁止行为',
  '- ❌ 不编造书中不存在的观点',
  '- ❌ 不使用过于学术化的语言',
  '- ❌ 不输出简练摘要：深度模式每章不低于1000字',
  '- ❌ 不在未理解背景的情况下强行联系',
].join('\n');

// ============================================================
// 用户 Prompt
// ============================================================
function buildPrompt(bookTitle, mode) {
  var modeText = mode === 'overview' ? '概览' : mode === 'standard' ? '标准' : '深度';
  var depthNote = mode === 'overview'
    ? '概览模式：精简输出，总字数控制在 1500 字以内。'
    : mode === 'standard'
    ? '标准模式：中等深度，总字数控制在 2500 字以内。'
    : '深度模式：每个模块充分展开，总字数控制在 4000 字以内，每章要点 150-200 字即可。';

  return [
    '请以「书旅向导」的角色，对《' + bookTitle + '》进行' + modeText + '模式精读解析。',
    '',
    '⚠️ 输出要求：' + depthNote,
    '',
    '按以下结构输出（Markdown 格式）：',
    '',
    '# 《' + bookTitle + '》精读指南',
    '',
    '## 一句话推荐',
    '（一句话，不超过40字）',
    '',
    '## 书籍概览',
    '- **作者**：',
    '- **核心主题**：',
    '- **适合人群**：',
    '',
    '## 核心观点',
    '',
    '### 🔴 精华一：[标题]',
    '- **核心观点**：（2-3句话）',
    '- **案例**：（一个具体案例，含背景、做法、结果，100字左右）',
    '- **如何用**：（1-2个可执行步骤）',
    '',
    '### 🔴 精华二：[标题]',
    '（同上格式）',
    '',
    '### 🔴 精华三：[标题]',
    '（同上格式）',
    '',
    '### 🟡 重要概念',
    '（列出3-4个概念，每个概念：名称 + 一句话解释 + 一个应用场景）',
    '',
    '### 🔧 实践工具',
    '（列出1-2个工具，每个：名称 + 用途 + 简要使用步骤）',
    '',
    '## 各章节要点',
    '（每章 1-2 句话概括核心要点，列表形式）',
    '',
    '## 延伸思考',
    '（2-3个思考问题）',
    '',
    '---',
    '*⚠️ 本解读由 AI 生成，仅供参考，请以原著内容为准*',
    '',
    '如果《' + bookTitle + '》不存在或你不了解该书，请礼貌告知。',
  ].join('\n');
}

// ============================================================
// 真正的流式调用：使用 wx.request enableChunked 接收 SSE
// onChunk(chunk, fullSoFar) — 每收到一段新文字时触发
// onComplete(fullContent)   — 全部完成时触发
// onError(err)              — 出错时触发
// 返回 requestTask，可调用 .abort() 中断
// ============================================================
function readBook(bookTitle, mode, callbacks) {
  var onChunk    = callbacks.onChunk    || function() {};
  var onComplete = callbacks.onComplete || function() {};
  var onError    = callbacks.onError    || function() {};

  var fullContent = '';
  var buffer = '';  // 处理跨 chunk 的不完整 SSE 行

  var requestTask = wx.request({
    url: AI_CONFIG.baseUrl + '/chat/completions',
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + AI_CONFIG.apiKey,
    },
    data: JSON.stringify({
      model: AI_CONFIG.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildPrompt(bookTitle, mode) },
      ],
      max_tokens: 3000,
      temperature: 0.7,
      stream: true,
    }),
    // 开启分块接收，每到一段 SSE 数据就触发 chunkReceived
    enableChunked: true,
    timeout: 120000,

    // 注意：enableChunked 模式下 success/fail 仍会在最终触发
    success: function(res) {
      // 处理缓冲区里剩余的最后一段数据
      if (buffer.trim()) {
        _parseSSELine(buffer.trim(), function(text) {
          if (text) {
            fullContent += text;
            onChunk(text, fullContent);
          }
        });
      }
      if (res.statusCode >= 400) {
        var errMsg = '接口错误 ' + res.statusCode;
        try { errMsg = res.data.error.message || errMsg; } catch(e) {}
        onError(new Error(errMsg));
      } else {
        onComplete(fullContent);
      }
    },
    fail: function(err) {
      onError(new Error(err.errMsg || '网络请求失败'));
    },
  });

  // 监听分块数据
  requestTask.onChunkReceived(function(res) {
    // res.data 是 ArrayBuffer，转为字符串
    var text = '';
    try {
      text = String.fromCharCode.apply(null, new Uint8Array(res.data));
    } catch(e) {
      // 兜底：直接 toString
      text = res.data ? res.data.toString() : '';
    }

    buffer += text;

    // 按换行符切割，逐行解析 SSE
    var lines = buffer.split('\n');
    buffer = lines.pop(); // 最后一行可能不完整，留到下次

    for (var i = 0; i < lines.length; i++) {
      _parseSSELine(lines[i].trim(), function(delta) {
        if (!delta) return;
        fullContent += delta;
        onChunk(delta, fullContent);
      });
    }
  });

  return requestTask;
}

// ── 解析单行 SSE 数据，提取 delta.content ─────────────────────
function _parseSSELine(line, cb) {
  if (!line || line === 'data: [DONE]') return;
  if (line.indexOf('data: ') !== 0) return;
  var jsonStr = line.slice(6);
  var parsed;
  try { parsed = JSON.parse(jsonStr); } catch(e) { return; }
  var delta = parsed
    && parsed.choices
    && parsed.choices[0]
    && parsed.choices[0].delta;
  if (delta && delta.content) cb(delta.content);
}

// ============================================================
// Mock 模式（无网络或调试时使用）
// ============================================================
function mockReadBook(bookTitle, mode, callbacks) {
  var onChunk    = callbacks.onChunk    || function() {};
  var onComplete = callbacks.onComplete || function() {};

  var modeText = mode === 'overview' ? '概览' : mode === 'standard' ? '标准' : '深度';

  var content = [
    '# 《' + bookTitle + '》精读指南',
    '',
    '## 一句话推荐',
    '这是一本能深刻改变你思维方式的书，通过系统的方法论帮你建立高效的认知框架。',
    '',
    '## 深入程度',
    modeText + '模式',
    '',
    '## 书籍概览',
    '- **作者**：待确认',
    '- **核心主题**：思维方式与认知升级',
    '- **适合人群**：希望提升认知效率的职场人士、学生和终身学习者',
    '',
    '## 核心观点',
    '',
    '### 🔴 精华一：认知框架决定你看到的世界',
    '',
    '- **核心观点**：每个人都活在自己构建的认知框架里，这个框架不是天生的，而是由成长经历、教育背景、文化环境共同塑造的。**认知框架的可怕之处在于：它是隐形的。**',
    '',
    '- **案例**：一位销售经理小李，接连三次被客户拒绝后，开始相信"这个季度客户都不好开发"。他的上司却用同样的市场、同样的产品，签了5个大客户。小李的框架是"环境决定结果"，上司的框架是"方法决定结果"。',
    '',
    '- **如何用**：① 当你觉得"不可能"时，先问自己"这个判断来自哪里？" ② 找3个反例打破假设，用"如果可能，需要什么条件？"替换"这不可能"',
    '',
    '### 🔴 精华二：元认知——思考自己如何思考',
    '',
    '- **核心观点**：元认知是"对思考的思考"，是你监控和调节自己认知过程的能力。研究表明，元认知能力强的学生，学习效率比同龄人高出40%以上。',
    '',
    '- **案例**：顶尖棋手能在复盘时清楚地说出"我在第15步犯了错，因为我当时过于关注局部，忽略了全局"。普通棋手只能说"我输了，运气不好"。',
    '',
    '- **如何用**：每天睡前花5分钟：今天有没有哪个时刻我的思维出现了偏差？这个偏差的来源是什么？',
    '',
    '### 🔴 精华三：刻意练习打破框架',
    '',
    '- **核心观点**：认知框架是可以被改变的，但需要刻意练习和系统训练，而不是"想通了就改变了"。',
    '',
    '- **案例**：书中记录了一位长期认为"自己没有创造力"的工程师，通过系统的认知训练，三个月后主导了公司最重要的产品创新项目。',
    '',
    '- **如何用**：① 找出你最常说的"不可能" ② 每天挑战一个小假设 ③ 记录改变的结果',
    '',
    '### 🟡 重要概念',
    '',
    '- **心智模型**：你用来理解世界的思维框架，影响你的每个判断和决策。应用场景：做重大决策前，先问"我在用什么模型思考这个问题？"',
    '- **第一性原理**：回到事物的本质，而非类比推理。应用场景：当感觉"就应该这样做"时，追问"为什么这样做是必须的？"',
    '- **框架效应**：同一信息用不同方式表达，会导致截然不同的决策。应用场景：重要决策前，换一种角度重新描述问题。',
    '',
    '### 🔧 实践工具',
    '',
    '**工具一：认知框架日志**',
    '- **用途**：识别和记录自己的思维模式',
    '- **使用步骤**：① 准备笔记本 ② 遇到重大决策时记录：发生了什么？我的第一反应？这个反应背后的假设？ ③ 每周回顾，找重复出现的思维模式',
    '',
    '## 各章节要点',
    '',
    '- **第一章：认识你的认知框架** — 人类95%的判断由无意识的认知框架驱动，你以为的理性大多是在为本能反应找理由',
    '- **第二章：框架是如何形成的** — 0-7岁是框架建立关键期，但成年后框架仍可重写',
    '- **第三章：识别你的框架** — 通过自我诊断工具找出影响你最深的3个思维定势',
    '- **第四章：重建框架的方法** — 刻意练习+系统训练的具体步骤',
    '',
    '## 延伸思考',
    '',
    '1. 你最根深蒂固的一个认知框架是什么？它在什么情况下帮助了你，又在什么情况下限制了你？',
    '2. 如果你完全相信"方法可以改变结果"，你的日常行为会有什么不同？试着具体描述3个变化。',
    '3. 你生命中有没有一个人，他们对同一件事的看法总是和你不同？他们的框架是什么？',
    '',
    '---',
    '*⚠️ 本解读由 AI 生成，仅供参考，请以原著内容为准*',
  ].join('\n');

  var index = 0;
  var chunkSize = 15;
  var timer = setInterval(function() {
    var end = Math.min(index + chunkSize, content.length);
    var delta = content.substring(index, end);
    var fullSoFar = content.substring(0, end);
    onChunk(delta, fullSoFar);
    index = end;
    if (index >= content.length) {
      clearInterval(timer);
      onComplete(content);
    }
  }, 40);

  // 返回一个可以 abort 的对象，与 readBook 接口保持一致
  return { abort: function() { clearInterval(timer); } };
}

module.exports = {
  readBook: readBook,
  mockReadBook: mockReadBook,
  AI_CONFIG: AI_CONFIG,
};
