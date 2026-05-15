// utils/markdown.js - 简易 Markdown 解析器（适配微信小程序，ES5）

function parseInline(text) {
  if (!text) return [];
  var spans = [];
  var remaining = text;
  while (remaining.length > 0) {
    var boldMatch = remaining.match(/^\*\*(.*?)\*\*/);
    if (boldMatch) {
      spans.push({ text: boldMatch[1], bold: true });
      remaining = remaining.substring(boldMatch[0].length);
      continue;
    }
    var codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      spans.push({ text: codeMatch[1], code: true });
      remaining = remaining.substring(codeMatch[0].length);
      continue;
    }
    var italicMatch = remaining.match(/^\*(.*?)\*/);
    if (italicMatch) {
      spans.push({ text: italicMatch[1], italic: true });
      remaining = remaining.substring(italicMatch[0].length);
      continue;
    }
    var nextSpecial = remaining.search(/\*\*|`|\*/);
    if (nextSpecial === -1) {
      spans.push({ text: remaining });
      remaining = '';
    } else if (nextSpecial === 0) {
      spans.push({ text: remaining[0] });
      remaining = remaining.substring(1);
    } else {
      spans.push({ text: remaining.substring(0, nextSpecial) });
      remaining = remaining.substring(nextSpecial);
    }
  }
  return spans;
}

function parseMarkdown(mdText) {
  if (!mdText) return [];
  var lines = mdText.split('\n');
  var nodes = [];
  var i = 0;
  var inCodeBlock = false;
  var codeBlockLang = '';
  var codeBlockLines = [];

  while (i < lines.length) {
    var line = lines[i];
    if (line.indexOf('```') === 0) {
      if (inCodeBlock) {
        nodes.push({ type: 'code', language: codeBlockLang, code: codeBlockLines.join('\n') });
        inCodeBlock = false; codeBlockLang = ''; codeBlockLines = [];
      } else {
        inCodeBlock = true; codeBlockLang = line.substring(3).trim(); codeBlockLines = [];
      }
      i++; continue;
    }
    if (inCodeBlock) { codeBlockLines.push(line); i++; continue; }

    if (line.indexOf('#### ') === 0) {
      nodes.push({ type: 'h4', content: parseInline(line.substring(5)) });
    } else if (line.indexOf('### ') === 0) {
      nodes.push({ type: 'h3', content: parseInline(line.substring(4)) });
    } else if (line.indexOf('## ') === 0) {
      nodes.push({ type: 'h2', content: parseInline(line.substring(3)) });
    } else if (line.indexOf('# ') === 0) {
      nodes.push({ type: 'h1', content: parseInline(line.substring(2)) });
    } else if (/^---+$/.test(line) || /^\*\*\*+$/.test(line)) {
      nodes.push({ type: 'hr' });
    } else if (line.indexOf('> ') === 0) {
      nodes.push({ type: 'blockquote', content: parseInline(line.substring(2)) });
    } else if (/^(\s*)[*\-+] /.test(line)) {
      var liMatch = line.match(/^(\s*)[*\-+] (.*)/);
      var indent = liMatch[1].length;
      var liContent = liMatch[2];
      nodes.push({ type: 'li', indent: indent, content: parseInline(liContent) });
    } else if (/^\d+\. /.test(line)) {
      nodes.push({ type: 'oli', content: parseInline(line.replace(/^\d+\. /, '')) });
    } else if (line.trim() === '') {
      nodes.push({ type: 'br' });
    } else {
      nodes.push({ type: 'p', content: parseInline(line) });
    }
    i++;
  }
  return nodes;
}

function countWords(mdText) {
  if (!mdText) return 0;
  var cleaned = mdText.replace(/```[\s\S]*?```/g, '').replace(/[#*`>\-\[\]]/g, '').trim();
  var chinese = (cleaned.match(/[\u4e00-\u9fa5]/g) || []).length;
  var english = (cleaned.match(/[a-zA-Z]+/g) || []).length;
  return chinese + english;
}

// ── HTML 转义 ──────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── inline 节点 → HTML ─────────────────────────────────────────
function inlineToHtml(spans) {
  if (!spans || !spans.length) return '';
  return spans.map(function(s) {
    var t = escapeHtml(s.text);
    if (s.bold)   return '<strong>' + t + '</strong>';
    if (s.italic) return '<em>' + t + '</em>';
    if (s.code)   return '<code style="background:rgba(200,169,110,0.12);color:#C8A96E;padding:0 6px;border-radius:4px;font-size:0.9em;">' + t + '</code>';
    return t;
  }).join('');
}

// ── Markdown 字符串 → HTML 字符串（供 rich-text 使用） ─────────
function toHtml(mdText) {
  if (!mdText) return '';
  var nodes = parseMarkdown(mdText);
  var html = '';
  var inUl = false;  // 是否在 ul 块内

  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];

    // 列表项：连续的 li 包裹在 ul 里
    if (node.type === 'li' || node.type === 'oli') {
      if (!inUl) { html += '<ul style="margin:8px 0 8px 0;padding-left:20px;">'; inUl = true; }
      var indent = (node.indent || 0) > 0 ? ' style="margin-left:' + (node.indent * 8) + 'px;"' : '';
      html += '<li' + indent + '>' + inlineToHtml(node.content) + '</li>';
      continue;
    }
    // 离开列表
    if (inUl) { html += '</ul>'; inUl = false; }

    switch (node.type) {
      case 'h1':
        html += '<h1 style="font-size:22px;font-weight:800;color:#F0EAD6;margin:24px 0 10px;line-height:1.4;">'
              + inlineToHtml(node.content) + '</h1>';
        break;
      case 'h2':
        html += '<h2 style="font-size:18px;font-weight:700;color:#F0EAD6;margin:20px 0 8px;padding-bottom:6px;border-bottom:1px solid rgba(200,169,110,0.25);line-height:1.4;">'
              + inlineToHtml(node.content) + '</h2>';
        break;
      case 'h3':
        html += '<h3 style="font-size:16px;font-weight:700;color:#C8A96E;margin:16px 0 6px;line-height:1.4;">'
              + inlineToHtml(node.content) + '</h3>';
        break;
      case 'h4':
        html += '<h4 style="font-size:15px;font-weight:600;color:rgba(240,234,214,0.85);margin:12px 0 4px;line-height:1.4;">'
              + inlineToHtml(node.content) + '</h4>';
        break;
      case 'p':
        html += '<p style="margin:6px 0;line-height:1.85;color:rgba(240,234,214,0.82);">'
              + inlineToHtml(node.content) + '</p>';
        break;
      case 'blockquote':
        html += '<blockquote style="border-left:3px solid #C8A96E;margin:10px 0;padding:4px 12px;color:rgba(240,234,214,0.6);font-style:italic;">'
              + inlineToHtml(node.content) + '</blockquote>';
        break;
      case 'code':
        html += '<pre style="background:rgba(255,255,255,0.05);border-radius:8px;padding:12px;margin:10px 0;overflow-x:auto;"><code style="font-size:13px;color:#C8A96E;line-height:1.6;">'
              + escapeHtml(node.code) + '</code></pre>';
        break;
      case 'hr':
        html += '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:16px 0;" />';
        break;
      case 'br':
        html += '<div style="height:8px;"></div>';
        break;
    }
  }
  if (inUl) html += '</ul>';
  return html;
}

module.exports = { parseMarkdown: parseMarkdown, parseInline: parseInline, countWords: countWords, toHtml: toHtml };
