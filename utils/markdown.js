// utils/markdown.js
// 简易 Markdown 解析器（适配微信小程序 WXML 渲染）
// 将 Markdown 文本转换为可渲染的节点数组

/**
 * 解析 Markdown 文本为节点数组
 * 节点格式：{ type, content, level, items, checked, language, code }
 */
function parseMarkdown(mdText) {
  if (!mdText) return [];
  
  const lines = mdText.split('\n');
  const nodes = [];
  let i = 0;
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines = [];

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        nodes.push({
          type: 'code',
          language: codeBlockLang,
          code: codeBlockLines.join('\n')
        });
        inCodeBlock = false;
        codeBlockLang = '';
        codeBlockLines = [];
      } else {
        inCodeBlock = true;
        codeBlockLang = line.substring(3).trim();
        codeBlockLines = [];
      }
      i++;
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      i++;
      continue;
    }

    // 标题
    if (line.startsWith('# ')) {
      nodes.push({ type: 'h1', content: parseInline(line.substring(2)) });
    } else if (line.startsWith('## ')) {
      nodes.push({ type: 'h2', content: parseInline(line.substring(3)) });
    } else if (line.startsWith('### ')) {
      nodes.push({ type: 'h3', content: parseInline(line.substring(4)) });
    } else if (line.startsWith('#### ')) {
      nodes.push({ type: 'h4', content: parseInline(line.substring(5)) });
    }
    // 分割线
    else if (line.match(/^---+$/) || line.match(/^\*\*\*+$/)) {
      nodes.push({ type: 'hr' });
    }
    // 引用块
    else if (line.startsWith('> ')) {
      nodes.push({ type: 'blockquote', content: parseInline(line.substring(2)) });
    }
    // 无序列表
    else if (line.match(/^(\s*)[*\-+] /)) {
      const match = line.match(/^(\s*)[*\-+] (.*)/);
      const indent = match[1].length;
      const content = match[2];
      // 任务列表
      if (content.startsWith('[ ] ')) {
        nodes.push({ type: 'task', checked: false, indent, content: parseInline(content.substring(4)) });
      } else if (content.startsWith('[x] ') || content.startsWith('[X] ')) {
        nodes.push({ type: 'task', checked: true, indent, content: parseInline(content.substring(4)) });
      } else {
        nodes.push({ type: 'li', indent, content: parseInline(content) });
      }
    }
    // 有序列表
    else if (line.match(/^\d+\. /)) {
      const content = line.replace(/^\d+\. /, '');
      nodes.push({ type: 'oli', content: parseInline(content) });
    }
    // 空行
    else if (line.trim() === '') {
      nodes.push({ type: 'br' });
    }
    // 普通段落
    else {
      nodes.push({ type: 'p', content: parseInline(line) });
    }

    i++;
  }

  return nodes;
}

/**
 * 解析行内元素（加粗、斜体、代码、链接）
 * 返回 spans 数组：[{ text, bold, italic, code, emoji }]
 */
function parseInline(text) {
  if (!text) return [];
  
  const spans = [];
  let remaining = text;

  while (remaining.length > 0) {
    // 加粗
    const boldMatch = remaining.match(/^\*\*(.*?)\*\*/);
    if (boldMatch) {
      spans.push({ text: boldMatch[1], bold: true });
      remaining = remaining.substring(boldMatch[0].length);
      continue;
    }

    // 行内代码
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      spans.push({ text: codeMatch[1], code: true });
      remaining = remaining.substring(codeMatch[0].length);
      continue;
    }

    // 斜体
    const italicMatch = remaining.match(/^\*(.*?)\*/);
    if (italicMatch) {
      spans.push({ text: italicMatch[1], italic: true });
      remaining = remaining.substring(italicMatch[0].length);
      continue;
    }

    // 普通字符（逐字符或到下一个特殊字符前）
    const nextSpecial = remaining.search(/\*\*|`|\*/);
    if (nextSpecial === -1) {
      spans.push({ text: remaining });
      remaining = '';
    } else if (nextSpecial === 0) {
      // 无法匹配，跳过当前字符
      spans.push({ text: remaining[0] });
      remaining = remaining.substring(1);
    } else {
      spans.push({ text: remaining.substring(0, nextSpecial) });
      remaining = remaining.substring(nextSpecial);
    }
  }

  return spans;
}

/**
 * 从 Markdown 文本中提取目录标题
 */
function extractToc(mdText) {
  if (!mdText) return [];
  const toc = [];
  const lines = mdText.split('\n');
  lines.forEach((line, index) => {
    if (line.startsWith('## ')) {
      toc.push({ level: 2, title: line.substring(3).trim(), lineIndex: index });
    } else if (line.startsWith('### ')) {
      toc.push({ level: 3, title: line.substring(4).trim(), lineIndex: index });
    }
  });
  return toc;
}

/**
 * 统计 Markdown 文本字数
 */
function countWords(mdText) {
  if (!mdText) return 0;
  // 去除 Markdown 符号，统计汉字和英文单词
  const cleaned = mdText
    .replace(/```[\s\S]*?```/g, '') // 移除代码块
    .replace(/[#*`>\-\[\]]/g, '')   // 移除 Markdown 符号
    .trim();
  const chinese = (cleaned.match(/[\u4e00-\u9fa5]/g) || []).length;
  const english = (cleaned.match(/[a-zA-Z]+/g) || []).length;
  return chinese + english;
}

module.exports = { parseMarkdown, parseInline, extractToc, countWords };
