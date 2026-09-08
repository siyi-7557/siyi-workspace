const fs = require('fs');
const path = require('path');
const fm = require('front-matter');
const MarkdownIt = require('markdown-it');
const config = require('../config');

const md = new MarkdownIt();

function getVaultPath() {
  return config.get('vaultPath', '');
}

// 获取所有索引路径（vaultPath + extraPaths）
function getAllIndexPaths() {
  const paths = [];
  const vaultPath = getVaultPath();
  if (vaultPath) paths.push(vaultPath);
  const extraPaths = config.get('extraPaths', []);
  if (Array.isArray(extraPaths)) {
    extraPaths.forEach(p => { if (p && !paths.includes(p)) paths.push(p); });
  }
  return paths;
}

function isMarkdownFile(filePath) {
  return filePath.endsWith('.md');
}

// 列出所有笔记
function listNotes(page = 1, pageSize = 20) {
  const vaultPath = getVaultPath();
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    return { notes: [], total: 0, page, pageSize };
  }
  const allFiles = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(fullPath);
      } else if (entry.isFile() && isMarkdownFile(fullPath)) {
        const relPath = path.relative(vaultPath, fullPath);
        const stat = fs.statSync(fullPath);
        allFiles.push({
          path: relPath,
          fullPath,
          title: path.basename(relPath, '.md'),
          size: stat.size,
          mtime: stat.mtime.toISOString(),
        });
      }
    }
  }
  walk(vaultPath);
  allFiles.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
  const total = allFiles.length;
  const start = (page - 1) * pageSize;
  const notes = allFiles.slice(start, start + pageSize);
  return { notes, total, page, pageSize };
}

// 获取笔记详情（支持绝对路径和相对路径，支持多源路径）
function getNote(notePath) {
  // 情况1：如果是绝对路径且文件存在，直接读取
  if (path.isAbsolute(notePath) && fs.existsSync(notePath)) {
    return readNoteFile(notePath, notePath);
  }

  // 情况2：相对路径，遍历所有索引路径查找
  const allPaths = getAllIndexPaths();
  if (allPaths.length === 0) return null;
  for (const basePath of allPaths) {
    const fullPath = path.join(basePath, notePath);
    if (fs.existsSync(fullPath)) {
      return readNoteFile(fullPath, notePath);
    }
  }
  return null;
}

// 读取笔记文件的公共方法
function readNoteFile(fullPath, notePath) {
  const content = fs.readFileSync(fullPath, 'utf-8');
  const parsed = fm(content);
  const stat = fs.statSync(fullPath);
  return {
    path: notePath,
    fullPath,
    title: path.basename(notePath, '.md'),
    frontmatter: parsed.attributes,
    content: parsed.body,
    html: md.render(parsed.body),
    size: stat.size,
    mtime: stat.mtime.toISOString(),
  };
}

// 读取笔记原始内容
function readNoteContent(fullPath) {
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf-8');
}

// 写入笔记
function writeNote(relPath, content) {
  const vaultPath = getVaultPath();
  if (!vaultPath) throw new Error('未配置vault路径');
  const fullPath = path.join(vaultPath, relPath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  return fullPath;
}

// vault统计
function getStats() {
  const vaultPath = getVaultPath();
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    return { totalFiles: 0, totalWords: 0, tags: [] };
  }
  let totalFiles = 0;
  let totalWords = 0;
  const tagSet = new Set();
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walk(fullPath);
      } else if (entry.isFile() && isMarkdownFile(fullPath)) {
        totalFiles++;
        const content = fs.readFileSync(fullPath, 'utf-8');
        totalWords += content.length;
        try {
          const parsed = fm(content);
          if (parsed.attributes && parsed.attributes.tags) {
            const tags = Array.isArray(parsed.attributes.tags) ? parsed.attributes.tags : [parsed.attributes.tags];
            tags.forEach(t => tagSet.add(String(t)));
          }
        } catch (e) {}
      }
    }
  }
  walk(vaultPath);
  return { totalFiles, totalWords, tags: Array.from(tagSet).sort() };
}

// 归档复盘为Obsidian笔记
async function archiveReview(review) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const folder = '项目复盘';
  const fileName = `${dateStr}-${review.project_name}.md`;
  const relPath = path.join(folder, fileName);

  let pitfallsContent = '';
  try {
    const pitfalls = JSON.parse(review.pitfalls || '[]');
    pitfallsContent = pitfalls.map((p, i) =>
      `### 踩坑${i + 1}\n**问题**：${p.problem || ''}\n**原因**：${p.cause || ''}\n**解决方案**：${p.solution || ''}\n**下次避免**：${p.prevention || ''}\n`
    ).join('\n');
  } catch (e) {}

  const content = `---
title: "${review.project_name} 项目复盘"
date: ${dateStr}
tags: [项目复盘, ${review.tech_stack || ''}]
---

# ${review.project_name} 项目复盘

## 基本信息
- 开始日期：${review.start_date || '-'}
- 结束日期：${review.end_date || '-'}
- 技术栈：${review.tech_stack || '-'}

## 一、AI协作效率
${review.ai_efficiency || '-'}

## 二、Prompt质量
${review.prompt_quality || '-'}

## 三、技术学习
${review.tech_learning || '-'}

## 四、踩坑记录
${pitfallsContent || '-'}

## 五、AI幻觉记录
${review.ai_hallucination || '-'}

## 六、下次改进
${review.improvements || '-'}
`;
  return writeNote(relPath, content);
}

module.exports = {
  getVaultPath,
  getAllIndexPaths,
  listNotes,
  getNote,
  readNoteContent,
  writeNote,
  getStats,
  archiveReview,
};
