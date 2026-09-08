const fm = require('front-matter');

// 解析Markdown文件，提取frontmatter、标题结构、正文分块
function parseMarkdown(content) {
  const parsed = fm(content);
  const body = parsed.body;
  const attributes = parsed.attributes;

  // 按标题分块
  const chunks = splitByHeadings(body);

  // 提取所有标题
  const headings = extractHeadings(body);

  // 提取标签
  const tags = attributes && attributes.tags
    ? (Array.isArray(attributes.tags) ? attributes.tags : [attributes.tags])
    : [];

  return {
    frontmatter: attributes,
    body,
    chunks,
    headings,
    tags: tags.map(String),
    wordCount: body.length,
  };
}

// 按标题层级分块
function splitByHeadings(content) {
  const lines = content.split('\n');
  const chunks = [];
  let currentChunk = { heading: '', headingPath: [], content: '', level: 0 };
  let headingStack = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      // 保存当前块
      if (currentChunk.content.trim() || currentChunk.heading) {
        chunks.push({ ...currentChunk });
      }
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      // 更新标题路径栈
      headingStack = headingStack.filter(h => h.level < level);
      headingStack.push({ level, title });
      currentChunk = {
        heading: title,
        headingPath: headingStack.map(h => h.title),
        content: '',
        level,
      };
    } else {
      currentChunk.content += line + '\n';
    }
  }
  // 最后一块
  if (currentChunk.content.trim() || currentChunk.heading) {
    chunks.push({ ...currentChunk });
  }

  // 过滤空块，过长段落再拆分
  return chunks
    .filter(c => c.content.trim().length > 0 || c.heading)
    .flatMap(c => splitLongParagraph(c));
}

// 过长段落拆分（>500字）
function splitLongParagraph(chunk) {
  const maxLen = 500;
  if (chunk.content.length <= maxLen) return [chunk];
  const paragraphs = chunk.content.split(/\n\n+/);
  const result = [];
  let current = { ...chunk, content: '' };
  for (const p of paragraphs) {
    if ((current.content + p).length > maxLen && current.content) {
      result.push({ ...current });
      current = { ...chunk, content: p + '\n\n' };
    } else {
      current.content += p + '\n\n';
    }
  }
  if (current.content.trim()) result.push(current);
  return result;
}

// 提取所有标题
function extractHeadings(content) {
  const headings = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({ level: match[1].length, text: match[2].trim() });
    }
  }
  return headings;
}

module.exports = { parseMarkdown, splitByHeadings, extractHeadings };
