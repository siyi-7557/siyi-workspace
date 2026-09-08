/**
 * 极简 frontmatter 解析器（Demo Mode 自包含，零依赖）
 *
 * 生产实现位于 backend/src/core/obsidian/parser.js（依赖 front-matter 库）。
 * 这里提供同等的「tags 提取 + 正文分离」能力，保证 Demo 开箱即跑、无需 npm install。
 */

/**
 * 解析 Markdown frontmatter
 * @param {string} content
 * @returns {{ attributes: Object, body: string }}
 */
function parseFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { attributes: {}, body: content.trim() };

  const attributes = {};
  const head = match[1];
  const lines = head.split('\n');
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    // 列表形式：[a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    }
    attributes[key] = value;
  }

  // tags 归一化为数组
  if (attributes.tags && !Array.isArray(attributes.tags)) {
    attributes.tags = [String(attributes.tags)];
  }

  return { attributes, body: match[2].trim() };
}

module.exports = { parseFrontMatter };
