const { parseMarkdown } = require('../obsidian/parser');

// 智能分块：对单个Markdown文件内容进行分块
function chunkFile(content, filePath) {
  const parsed = parseMarkdown(content);
  const chunks = [];

  parsed.chunks.forEach((chunk, idx) => {
    const text = chunk.heading
      ? `${chunk.headingPath.join(' > ')}\n${chunk.content.trim()}`
      : chunk.content.trim();

    if (text.trim().length < 10) return; // 跳过过短的块

    chunks.push({
      id: `${filePath}#${idx}`,
      filePath,
      chunkIndex: idx,
      heading: chunk.heading || path.basename(filePath, '.md'),
      headingPath: chunk.headingPath,
      content: text,
      wordCount: text.length,
      tags: parsed.tags,
    });
  });

  // 如果没有分块（无标题的文件），整个作为一个块
  if (chunks.length === 0 && parsed.body.trim().length > 10) {
    chunks.push({
      id: `${filePath}#0`,
      filePath,
      chunkIndex: 0,
      heading: require('path').basename(filePath, '.md'),
      headingPath: [],
      content: parsed.body.trim(),
      wordCount: parsed.body.length,
      tags: parsed.tags,
    });
  }

  return chunks;
}

module.exports = { chunkFile };
