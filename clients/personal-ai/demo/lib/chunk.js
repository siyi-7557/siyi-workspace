/**
 * Markdown 分块器（Demo Mode 自包含，零依赖）
 *
 * 生产实现位于 backend/src/core/obsidian/parser.js（splitByHeadings + splitLongParagraph）
 * 与 backend/src/core/rag/chunker.js（按标题层级分块）。
 * 此处镜像同一逻辑：按标题（#~######）分块，标题路径堆栈，超长段落再拆分。
 */

const path = require('path');

const MAX_LEN = 500; // 与生产 chunker 一致

/**
 * 解析并分块一个 Markdown 文件
 * @param {string} content 文件内容
 * @param {string} filePath 相对文件路径（用于 chunk id 与展示）
 * @returns {Array<Object>} chunks
 */
function chunkFile(content, filePath) {
  const { attributes, body } = require('./frontmatter').parseFrontMatter(content);
  const tags = attributes.tags || [];

  const chunks = splitByHeadings(body)
    .filter(c => c.content.trim().length > 0 || c.heading)
    .flatMap(c => splitLongParagraph(c));

  const result = chunks.filter(c => c.content.trim().length >= 10)
    .map((c, idx) => ({
      id: `${filePath}#${idx}`,
      filePath,
      chunkIndex: idx,
      heading: c.heading || path.basename(filePath, '.md'),
      headingPath: c.headingPath,
      content: c.heading ? `${c.headingPath.join(' > ')}\n${c.content.trim()}` : c.content.trim(),
      tags,
    }));

  // 没有标题的兜底整块
  if (result.length === 0 && body.trim().length > 10) {
    result.push({
      id: `${filePath}#0`,
      filePath,
      chunkIndex: 0,
      heading: path.basename(filePath, '.md'),
      headingPath: [],
      content: body.trim(),
      tags,
    });
  }

  return result;
}

function splitByHeadings(content) {
  const lines = content.split('\n');
  const chunks = [];
  let current = { heading: '', headingPath: [], content: '', level: 0 };
  let stack = [];

  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m) {
      if (current.content.trim() || current.heading) chunks.push({ ...current });
      const level = m[1].length;
      const title = m[2].trim();
      stack = stack.filter(h => h.level < level);
      stack.push({ level, title });
      current = {
        heading: title,
        headingPath: stack.map(h => h.title),
        content: '',
        level,
      };
    } else {
      current.content += line + '\n';
    }
  }
  if (current.content.trim() || current.heading) chunks.push({ ...current });
  return chunks;
}

function splitLongParagraph(chunk) {
  if (chunk.content.length <= MAX_LEN) return [chunk];
  const paragraphs = chunk.content.split(/\n\n+/);
  const result = [];
  let current = { ...chunk, content: '' };
  for (const p of paragraphs) {
    if ((current.content + p).length > MAX_LEN && current.content) {
      result.push({ ...current });
      current = { ...chunk, content: p + '\n\n' };
    } else {
      current.content += p + '\n\n';
    }
  }
  if (current.content.trim()) result.push(current);
  return result;
}

module.exports = { chunkFile };
