// cloudfunctions/aiRead/index.js
// 书籍解读：通过云函数调用 DeepSeek API，前端再做打字机展示
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 优先使用环境变量配置，未配置时使用当前项目默认值
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-b85bb48c8a254453b8da5401811ab44f';

// 系统 Prompt：精简版，降低 token 消耗，减少超时概率
const SYSTEM_PROMPT = [
  '你是「书旅向导」，请用清晰、专业、易懂的中文输出。',
  '风格要求：亲切但有深度，少空话，多可执行建议。',
  '请使用 Markdown 输出，结构清楚，适当使用 emoji，重要观点用加粗。',
  '严禁编造书中不存在的观点；如不确定请明确说明。',
].join('\n');

function buildPrompt(bookTitle, mode) {
  if (mode === 'overview') {
    return [
      '请以「书旅向导」身份，对《' + bookTitle + '》进行【概览模式】解读，总字数600字以内。',
      '',
      '按以下结构输出（Markdown）：',
      '# 《' + bookTitle + '》精读指南',
      '## 📌 一句话推荐',
      '## 📖 书籍概览',
      '（作者、核心主题、适合人群）',
      '## 💡 核心观点（3点，每点含观点+简要应用）',
      '## 🤔 延伸思考（2个问题）',
      '',
      '若此书不存在请直接说明，不要编造。',
    ].join('\n');
  }

  if (mode === 'standard') {
    return [
      '请以「书旅向导」身份，对《' + bookTitle + '》进行【标准模式】解读，总字数1200字左右。',
      '',
      '按以下结构输出（Markdown）：',
      '# 《' + bookTitle + '》精读指南',
      '## 📌 一句话推荐',
      '## 📖 书籍概览',
      '（作者、出版年份、核心主题、适合人群）',
      '## 💡 核心观点深度解析（3个，每个含：为什么重要+详细解释+生活案例+如何应用）',
      '## 📚 各章节精华速览（每章80-120字）',
      '## 🤔 延伸思考（2个问题，每个附思考方向）',
      '',
      '若此书不存在请直接说明，不要编造。',
    ].join('\n');
  }

  // 深度模式（默认）：字数控制在 2000 字，避免超时
  return [
    '请以「书旅向导」身份，对《' + bookTitle + '》进行【深度模式】精读，总字数1800-2200字。',
    '',
    '按以下结构完整输出（Markdown）：',
    '# 《' + bookTitle + '》精读指南',
    '## 📌 一句话推荐',
    '## 📖 书籍概览',
    '（作者、出版年份、核心主题、书籍结构、适合人群）',
    '## 🗺️ 全景知识地图',
    '（用文字描述书籍整体框架，展示核心概念关系）',
    '## 💡 核心观点深度解析',
    '**精华一：[观点标题]**',
    '为什么重要 + 详细解释 + 完整案例（背景+做法+结果）+ 生活中如何运用',
    '',
    '**精华二：[观点标题]**',
    '（同上结构，每个精华200字左右）',
    '',
    '**精华三：[观点标题]**',
    '（同上结构）',
    '',
    '## 📚 各章节精华速览',
    '（按章节顺序，每章100-150字：背景+核心论点+案例）',
    '',
    '## 🔧 实践工具',
    '（1-2个书中最实用的方法/工具，含使用步骤）',
    '',
    '## 🤔 延伸思考',
    '（3个引导性问题，每个附思考方向提示）',
    '',
    '若此书不存在请直接说明，不要编造。',
  ].join('\n');
}

function callDeepSeek(messages) {
  return new Promise(function(resolve, reject) {
    if (!DEEPSEEK_API_KEY) {
      reject(new Error('未配置 DeepSeek API Key'));
      return;
    }

    var body = JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      max_tokens: 2400,
      temperature: 0.7,
      stream: false,
    });

    var options = {
      hostname: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DEEPSEEK_API_KEY,
        'Content-Length': Buffer.byteLength(body),
      },
      // 云函数侧给 50s，前端 callFunction 给 60s，留有余量
      timeout: 50000,
    };

    var responseText = '';
    var req = https.request(options, function(res) {
      res.on('data', function(chunk) {
        responseText += chunk.toString();
      });

      res.on('end', function() {
        var parsed;
        try {
          parsed = JSON.parse(responseText || '{}');
        } catch (e) {
          reject(new Error('AI 返回数据解析失败'));
          return;
        }

        if (res.statusCode >= 400) {
          var apiErr = (parsed && parsed.error && parsed.error.message) || ('接口错误 ' + res.statusCode);
          reject(new Error(apiErr));
          return;
        }

        var content = parsed
          && parsed.choices
          && parsed.choices[0]
          && parsed.choices[0].message
          && parsed.choices[0].message.content;

        if (!content) {
          reject(new Error('AI 未返回内容，请重试'));
          return;
        }

        resolve(content);
      });

      res.on('error', function(e) {
        reject(e);
      });
    });

    req.on('error', function(e) {
      reject(e);
    });

    req.on('timeout', function() {
      req.destroy();
      reject(new Error('AI 请求超时，请稍后重试'));
    });

    req.write(body);
    req.end();
  });
}

exports.main = async (event) => {
  var bookTitle = event.bookTitle;
  var mode = event.mode || 'deep';

  if (!bookTitle) {
    return { code: -1, msg: '缺少书名参数' };
  }

  try {
    var messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt(bookTitle, mode) },
    ];

    var content = await callDeepSeek(messages);

    return {
      code: 0,
      msg: 'ok',
      content: content,
    };
  } catch (e) {
    console.error('[aiRead] error:', e);
    return { code: -1, msg: e.message || 'AI 调用失败，请重试' };
  }
};
