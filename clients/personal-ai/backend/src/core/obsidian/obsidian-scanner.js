/**
 * Obsidian AI复盘扫描器
 * 专门扫描Obsidian Vault中的AI复盘文档，解析YAML Front Matter，生成统计和汇总
 */
const fs = require('fs');
const path = require('path');
const fm = require('front-matter');
const config = require('../../core/config');

// ========== 扫描结果缓存 ==========
const scanCache = {
  allReviews: null,
  allReviewsTimestamp: 0,
  qualityScores: null,
  qualityScoresTimestamp: 0,
  radarData: null,
  radarDataTimestamp: 0,
  CACHE_TTL: 30000 // 30秒缓存
};

function isCacheValid(timestamp) {
  return timestamp > 0 && (Date.now() - timestamp) < scanCache.CACHE_TTL;
}

function invalidateCache() {
  scanCache.allReviews = null;
  scanCache.allReviewsTimestamp = 0;
  scanCache.qualityScores = null;
  scanCache.qualityScoresTimestamp = 0;
  scanCache.radarData = null;
  scanCache.radarDataTimestamp = 0;
}

/**
 * 获取所有复盘（带缓存）
 */
function getAllReviewsCached() {
  if (isCacheValid(scanCache.allReviewsTimestamp) && scanCache.allReviews) {
    return scanCache.allReviews;
  }
  const result = scanReviews({ page: 1, pageSize: 1000, sortBy: 'date', sortOrder: 'desc' });
  scanCache.allReviews = result;
  scanCache.allReviewsTimestamp = Date.now();
  return result;
}

/**
 * 获取AI复盘目录路径
 */
function getReviewDir() {
  const vaultPath = config.get('vaultPath', '');
  if (!vaultPath) return null;
  return path.join(vaultPath, 'AI复盘');
}

/**
 * 扫描所有AI复盘文档
 * @param {Object} options - 选项
 * @param {number} options.page - 页码
 * @param {number} options.pageSize - 每页数量
 * @param {string} options.sortBy - 排序字段（date/score/problems）
 * @param {string} options.sortOrder - 排序顺序（asc/desc）
 * @returns {Object} 复盘列表和统计
 */
function scanReviews(options = {}) {
  const { page = 1, pageSize = 20, sortBy = 'date', sortOrder = 'desc' } = options;

  const reviewDir = getReviewDir();
  if (!reviewDir || !fs.existsSync(reviewDir)) {
    return { reviews: [], total: 0, stats: null, page, pageSize };
  }

  // 扫描所有md文件
  const allFiles = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        allFiles.push(fullPath);
      }
    }
  }
  walk(reviewDir);

  // 解析每个文件的YAML Front Matter
  const reviews = allFiles.map(filePath => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = fm(content);
      const stat = fs.statSync(filePath);
      const relPath = path.relative(reviewDir, filePath);

      // YAML日期可能被解析为Date对象，统一转成YYYY-MM-DD字符串
      const rawDate = parsed.attributes.date;
      let dateStr;
      if (rawDate instanceof Date) {
        dateStr = rawDate.toISOString().slice(0, 10);
      } else if (typeof rawDate === 'string' && rawDate) {
        dateStr = rawDate;
      } else {
        dateStr = stat.mtime.toISOString().slice(0, 10);
      }

      return {
        path: relPath,
        fullPath: filePath,
        title: parsed.attributes.title || path.basename(filePath, '.md'),
        date: dateStr,
        tags: parsed.attributes.tags || [],
        source: parsed.attributes.source || 'unknown',
        completion_status: parsed.attributes.completion_status || 'unknown',
        average_score: parsed.attributes.average_score || 0,
        total_problems: parsed.attributes.total_problems || 0,
        total_good_practices: parsed.attributes.total_good_practices || 0,
        total_prompts: parsed.attributes.total_prompts || 0,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        hasContent: parsed.body && parsed.body.length > 100
      };
    } catch (err) {
      console.warn(`[ObsidianScanner] 解析文件失败 ${filePath}:`, err.message);
      return null;
    }
  }).filter(Boolean);

  // 排序
  reviews.sort((a, b) => {
    let valA, valB;
    switch (sortBy) {
      case 'score':
        valA = a.average_score;
        valB = b.average_score;
        break;
      case 'problems':
        valA = a.total_problems;
        valB = b.total_problems;
        break;
      case 'date':
      default:
        valA = new Date(a.date);
        valB = new Date(b.date);
    }
    return sortOrder === 'asc' ? valA - valB : valB - valA;
  });

  // 统计
  const stats = calculateStats(reviews);

  // 分页
  const total = reviews.length;
  const start = (page - 1) * pageSize;
  const paginatedReviews = reviews.slice(start, start + pageSize);

  return {
    reviews: paginatedReviews,
    total,
    stats,
    page,
    pageSize,
    sortBy,
    sortOrder
  };
}

/**
 * 计算复盘统计
 */
function calculateStats(reviews) {
  if (reviews.length === 0) {
    return {
      total: 0,
      avgScore: 0,
      totalProblems: 0,
      totalGoodPractices: 0,
      totalPrompts: 0,
      completionRate: 0,
      bySource: {},
      byMonth: {},
      commonTags: [],
      scoreDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
    };
  }

  const total = reviews.length;
  const avgScore = reviews.reduce((sum, r) => sum + (r.average_score || 0), 0) / total;
  const totalProblems = reviews.reduce((sum, r) => sum + (r.total_problems || 0), 0);
  const totalGoodPractices = reviews.reduce((sum, r) => sum + (r.total_good_practices || 0), 0);
  const totalPrompts = reviews.reduce((sum, r) => sum + (r.total_prompts || 0), 0);
  const completedCount = reviews.filter(r => r.completion_status === '完成').length;
  const completionRate = Math.round((completedCount / total) * 100);

  // 按来源统计
  const bySource = {};
  reviews.forEach(r => {
    const source = r.source || 'unknown';
    if (!bySource[source]) bySource[source] = 0;
    bySource[source]++;
  });

  // 按月份统计
  const byMonth = {};
  reviews.forEach(r => {
    const month = r.date ? r.date.slice(0, 7) : 'unknown';
    if (!byMonth[month]) byMonth[month] = 0;
    byMonth[month]++;
  });

  // 常见标签
  const tagCount = {};
  reviews.forEach(r => {
    (r.tags || []).forEach(tag => {
      if (!tagCount[tag]) tagCount[tag] = 0;
      tagCount[tag]++;
    });
  });
  const commonTags = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  // 评分分布
  const scoreDistribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  reviews.forEach(r => {
    const score = Math.round(r.average_score || 0);
    if (score >= 1 && score <= 5) {
      scoreDistribution[String(score)]++;
    }
  });

  return {
    total,
    avgScore: Math.round(avgScore * 10) / 10,
    totalProblems,
    totalGoodPractices,
    totalPrompts,
    completionRate,
    bySource,
    byMonth,
    commonTags,
    scoreDistribution
  };
}

/**
 * 获取单个复盘详情
 */
function getReviewDetail(relPath) {
  const reviewDir = getReviewDir();
  if (!reviewDir) return null;

  const fullPath = path.join(reviewDir, relPath);
  if (!fs.existsSync(fullPath)) return null;

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const parsed = fm(content);
    const stat = fs.statSync(fullPath);

    // 解析结构化数据
    let problems = [];
    let goodPractices = [];
    let prompts = [];
    let actionItems = [];
    let learnings = [];
    try { problems = extractProblemsFromContent(parsed.body) || []; } catch(e) { console.warn(`[ObsidianScanner] 解析 problems 失败: ${e.message}`); }
    try { goodPractices = extractGoodPracticesFromContent(parsed.body) || []; } catch(e) { console.warn(`[ObsidianScanner] 解析 goodPractices 失败: ${e.message}`); }
    try { prompts = extractPromptsFromContent(parsed.body) || []; } catch(e) { console.warn(`[ObsidianScanner] 解析 prompts 失败: ${e.message}`); }
    try { actionItems = extractActionItemsFromContent(parsed.body) || []; } catch(e) { console.warn(`[ObsidianScanner] 解析 actionItems 失败: ${e.message}`); }
    try { learnings = extractLearningsFromContent(parsed.body) || []; } catch(e) { console.warn(`[ObsidianScanner] 解析 learnings 失败: ${e.message}`); }

    return {
      path: relPath,
      fullPath,
      title: parsed.attributes.title || path.basename(fullPath, '.md'),
      frontmatter: parsed.attributes,
      content: parsed.body,
      problems,
      goodPractices,
      prompts,
      actionItems,
      learnings,
      size: stat.size,
      mtime: stat.mtime.toISOString()
    };
  } catch (err) {
    console.warn(`[ObsidianScanner] 读取文件失败 ${fullPath}:`, err.message);
    return null;
  }
}

/**
 * 生成周/月汇总报告
 * @param {string} period - 周期（week/month/quarter/year）
 * @param {string} startDate - 开始日期
 * @param {string} endDate - 结束日期
 */
function generateSummaryReport(period = 'month', startDate = null, endDate = null) {
  const result = scanReviews({ page: 1, pageSize: 1000, sortBy: 'date', sortOrder: 'desc' });
  let reviews = result.reviews;

  // 日期过滤
  if (startDate) {
    reviews = reviews.filter(r => r.date >= startDate);
  }
  if (endDate) {
    reviews = reviews.filter(r => r.date <= endDate);
  }

  if (reviews.length === 0) {
    return { period, startDate, endDate, total: 0, message: '该周期内没有复盘记录' };
  }

  const stats = calculateStats(reviews);

  // 找出问题最多的复盘
  const mostProblems = [...reviews].sort((a, b) => b.total_problems - a.total_problems)[0];

  // 找出评分最低的复盘（最需要改进）
  const lowestScore = [...reviews].sort((a, b) => a.average_score - b.average_score)[0];

  // 找出评分最高的复盘（做得最好）
  const highestScore = [...reviews].sort((a, b) => b.average_score - a.average_score)[0];

  // 进步趋势（按时间排序，看评分变化）
  const sortedByDate = [...reviews].sort((a, b) => new Date(a.date) - new Date(b.date));
  const trend = {
    firstScore: sortedByDate[0]?.average_score || 0,
    lastScore: sortedByDate[sortedByDate.length - 1]?.average_score || 0,
    improvement: 0
  };
  if (trend.firstScore > 0) {
    trend.improvement = Math.round((trend.lastScore - trend.firstScore) * 10) / 10;
  }

  return {
    period,
    startDate,
    endDate,
    total: reviews.length,
    stats,
    highlights: {
      mostProblems,
      lowestScore,
      highestScore
    },
    trend,
    reviews: reviews.map(r => ({
      date: r.date,
      title: r.title,
      score: r.average_score,
      problems: r.total_problems,
      goodPractices: r.total_good_practices,
      completion: r.completion_status
    }))
  };
}

/**
 * 清理Markdown格式符号
 */
function cleanMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*/g, '')  // 加粗
    .replace(/\*([^*]+)\*/g, '$1')  // 斜体
    .replace(/`([^`]+)`/g, '$1')  // 行内代码
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // 链接
    .trim();
}

/**
 * 从复盘文件正文中提取行动项
 * @param {string} content - 复盘文件正文（Markdown）
 * @returns {Array} 行动项列表
 */
function extractActionItemsFromContent(content) {
  const items = [];
  if (!content) return items;

  // 按行分割
  const lines = content.split('\n');

  // 找到各个板块的起始行
  let section8Start = -1;
  let immediateStart = -1;
  let shortTermStart = -1;
  let noteStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.match(/^##\s*板块8/) || line.match(/^##\s*改进计划/)) {
      section8Start = i;
    }
    if (section8Start >= 0 && line.match(/^###\s*8\.1/)) {
      immediateStart = i;
    }
    if (section8Start >= 0 && line.match(/^###\s*8\.2/)) {
      shortTermStart = i;
    }
    if (section8Start >= 0 && line.match(/^###\s*8\.3/)) {
      noteStart = i;
    }
  }

  // 提取立即行动项（表格格式）
  if (immediateStart >= 0) {
    const endLine = shortTermStart >= 0 ? shortTermStart : (noteStart >= 0 ? noteStart : lines.length);
    for (let i = immediateStart + 1; i < endLine; i++) {
      const line = lines[i].trim();
      // 匹配表格数据行（不是表头和分隔行）
      if (line.startsWith('|') && !line.match(/^\|[-:| ]+\|$/) && !line.includes('优先级')) {
        const cells = line.split('|').map(c => cleanMarkdown(c)).filter(c => c !== '');
        if (cells.length >= 2) {
          const priority = cells[0] || 'P2';
          const action = cells[1] || '';
          const expectedEffect = cells[2] || '';
          const relatedProblem = cells[3] || '';
          if (action && action.length > 2) {
            items.push({
              priority,
              action,
              expectedEffect,
              relatedProblem,
              type: 'immediate'
            });
          }
        }
      }
    }
  }

  // 提取短期提升计划（列表格式）
  if (shortTermStart >= 0) {
    const endLine = noteStart >= 0 ? noteStart : lines.length;
    for (let i = shortTermStart + 1; i < endLine; i++) {
      const line = lines[i].trim();
      // 匹配有序列表或无序列表
      const listMatch = line.match(/^(?:\d+\.\s+|[-*]\s+)(.+)$/);
      if (listMatch) {
        const text = cleanMarkdown(listMatch[1]);
        if (text && text.length > 5) {
          items.push({
            priority: 'P1',
            action: text,
            expectedEffect: '',
            relatedProblem: '',
            type: 'short_term'
          });
        }
      }
    }
  }

  // 提取下次使用AI的注意事项
  if (noteStart >= 0) {
    // 收集注意事项板块的所有非空行（直到下一个板块或文档结束）
    const noteLines = [];
    for (let i = noteStart + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^###\s/) || line.match(/^##\s/) || line === '---') {
        break;
      }
      if (line) {
        noteLines.push(cleanMarkdown(line));
      }
    }
    const note = noteLines.join(' ').trim();
    if (note && note.length > 5) {
      items.push({
        priority: 'P0',
        action: note,
        expectedEffect: '',
        relatedProblem: '',
        type: 'note'
      });
    }
  }

  return items;
}

/**
 * 获取所有复盘的行动项汇总
 * @param {Object} options - 选项
 * @param {string} options.priority - 按优先级筛选（P0/P1/P2）
 * @param {string} options.status - 按状态筛选（pending/done/ignored）
 * @param {string} options.sortBy - 排序字段（priority/date）
 * @returns {Object} 行动项列表和统计
 */
function getAllActionItems(options = {}) {
  const { priority = null, status = null, sortBy = 'priority' } = options;

  const result = scanReviews({ page: 1, pageSize: 1000, sortBy: 'date', sortOrder: 'desc' });
  const reviews = result.reviews;

  // 读取行动项状态存储
  const statusStore = loadActionItemStatus();

  let allItems = [];
  reviews.forEach(review => {
    try {
      const detail = getReviewDetail(review.path);
      if (!detail) return;

      const items = extractActionItemsFromContent(detail.content);
      items.forEach((item, index) => {
        // 生成唯一ID：复盘路径 + 行动项索引
        const id = `${review.path}#${index}`;
        const savedStatus = statusStore[id];

        allItems.push({
          id,
          ...item,
          sourceReview: review.title,
          sourcePath: review.path,
          reviewDate: review.date,
          reviewScore: review.average_score,
          status: savedStatus ? savedStatus.status : 'pending',
          statusUpdatedAt: savedStatus ? savedStatus.updatedAt : null,
          note: savedStatus ? savedStatus.note : '',
          dueDate: savedStatus ? savedStatus.dueDate : null
        });
      });
    } catch (err) {
      console.warn(`[ObsidianScanner] 提取行动项失败 ${review.path}:`, err.message);
    }
  });

  // 按优先级筛选
  if (priority) {
    allItems = allItems.filter(item => item.priority === priority);
  }

  // 按状态筛选
  if (status) {
    allItems = allItems.filter(item => item.status === status);
  }

  // 合并自定义行动项
  const customItems = loadCustomActionItems();
  allItems = allItems.concat(customItems);

  // 排序
  const priorityOrder = { 'P0': 0, 'P1': 1, 'P2': 2 };
  allItems.sort((a, b) => {
    if (sortBy === 'date') {
      return new Date(b.reviewDate) - new Date(a.reviewDate);
    }
    // 默认按优先级排序，同优先级按日期倒序
    const pa = priorityOrder[a.priority] ?? 3;
    const pb = priorityOrder[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    return new Date(b.reviewDate) - new Date(a.reviewDate);
  });

  // 统计
  const stats = {
    total: allItems.length,
    byPriority: {
      P0: allItems.filter(i => i.priority === 'P0').length,
      P1: allItems.filter(i => i.priority === 'P1').length,
      P2: allItems.filter(i => i.priority === 'P2').length
    },
    byStatus: {
      pending: allItems.filter(i => i.status === 'pending').length,
      done: allItems.filter(i => i.status === 'done').length,
      ignored: allItems.filter(i => i.status === 'ignored').length
    },
    byType: {
      immediate: allItems.filter(i => i.type === 'immediate').length,
      short_term: allItems.filter(i => i.type === 'short_term').length,
      note: allItems.filter(i => i.type === 'note').length
    },
    completionRate: allItems.length > 0
      ? Math.round((allItems.filter(i => i.status === 'done').length / allItems.length) * 100)
      : 0
  };

  return {
    items: allItems,
    stats,
    total: allItems.length
  };
}

/**
 * 行动项状态存储文件路径
 */
function getActionItemStatusPath() {
  const dataDir = path.join(require('os').homedir(), 'AppData', 'Roaming', 'siyi-workbench');
  return path.join(dataDir, 'action-items-status.json');
}

/**
 * 自定义行动项存储文件路径
 */
function getCustomActionItemsPath() {
  const dataDir = path.join(require('os').homedir(), 'AppData', 'Roaming', 'siyi-workbench');
  return path.join(dataDir, 'custom-action-items.json');
}

/**
 * 加载自定义行动项
 */
function loadCustomActionItems() {
  try {
    const filePath = getCustomActionItemsPath();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('[ObsidianScanner] 加载自定义行动项失败:', err.message);
  }
  return [];
}

/**
 * 保存自定义行动项
 */
function saveCustomActionItems(items) {
  try {
    const filePath = getCustomActionItemsPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[ObsidianScanner] 保存自定义行动项失败:', err.message);
    return false;
  }
}

/**
 * 创建自定义行动项
 */
function createCustomActionItem(data) {
  const items = loadCustomActionItems();
  const newItem = {
    id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    action: data.action || '',
    priority: data.priority || 'P1',
    type: data.type || 'short_term',
    source: 'manual',
    sourceReview: '手动创建',
    sourcePath: null,
    reviewDate: new Date().toISOString().split('T')[0],
    reviewScore: null,
    status: data.status || 'pending',
    statusUpdatedAt: new Date().toISOString(),
    note: data.note || '',
    dueDate: data.dueDate || null,
    createdAt: new Date().toISOString()
  };
  items.unshift(newItem);
  saveCustomActionItems(items);
  return newItem;
}

/**
 * 删除自定义行动项
 */
function deleteCustomActionItem(id) {
  const items = loadCustomActionItems();
  const index = items.findIndex(i => i.id === id);
  if (index === -1) return false;
  items.splice(index, 1);
  saveCustomActionItems(items);
  return true;
}

/**
 * 加载行动项状态存储
 */
function loadActionItemStatus() {
  try {
    const filePath = getActionItemStatusPath();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('[ObsidianScanner] 加载行动项状态失败:', err.message);
  }
  return {};
}

/**
 * 保存行动项状态
 */
function saveActionItemStatus(statusStore) {
  try {
    const filePath = getActionItemStatusPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(statusStore, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[ObsidianScanner] 保存行动项状态失败:', err.message);
    return false;
  }
}

/**
 * 更新单个行动项状态
 * @param {string} id - 行动项ID
 * @param {string} status - 新状态（pending/done/ignored）
 * @param {string} note - 备注（可选）
 * @param {string} dueDate - 截止日期（可选，YYYY-MM-DD格式）
 */
function updateActionItemStatus(id, status, note = '', dueDate = null) {
  const statusStore = loadActionItemStatus();
  const existing = statusStore[id] || {};
  statusStore[id] = {
    status,
    note: note || existing.note || '',
    dueDate: dueDate !== null ? dueDate : existing.dueDate || null,
    updatedAt: new Date().toISOString()
  };
  return saveActionItemStatus(statusStore);
}

/**
 * 获取今日待办行动项（截止日期为今天或已过期的未完成行动项）
 * @returns {Object} 今日待办行动项列表和统计
 */
function getTodayActionItems() {
  const result = getAllActionItems({});
  const allItems = result.items || [];
  const today = new Date().toISOString().split('T')[0];

  // 筛选：未完成 + 有截止日期 + 截止日期 <= 今天
  const todayItems = allItems.filter(item => {
    if (item.status === 'done' || item.status === 'ignored') return false;
    if (!item.dueDate) return false;
    return item.dueDate <= today;
  });

  // 按优先级和截止日期排序
  const priorityOrder = { 'P0': 0, 'P1': 1, 'P2': 2 };
  todayItems.sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 3;
    const pb = priorityOrder[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });

  // 统计
  const stats = {
    total: todayItems.length,
    overdue: todayItems.filter(i => i.dueDate < today).length,
    dueToday: todayItems.filter(i => i.dueDate === today).length,
    byPriority: {
      P0: todayItems.filter(i => i.priority === 'P0').length,
      P1: todayItems.filter(i => i.priority === 'P1').length,
      P2: todayItems.filter(i => i.priority === 'P2').length
    }
  };

  return {
    items: todayItems,
    stats,
    total: todayItems.length,
    today
  };
}

// ========== 跨会话模式识别 ==========

/**
 * 从复盘文件正文中提取典型问题
 * @param {string} content - 复盘文件正文
 * @returns {Array} 问题列表
 */
function extractProblemsFromContent(content) {
  const problems = [];
  if (!content) return problems;

  const lines = content.split('\n');

  // 找到板块4的起始位置
  let section4Start = -1;
  let section5Start = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.match(/^##\s*板块4/) || line.match(/^##\s*典型问题/)) {
      section4Start = i;
    }
    if (section4Start >= 0 && (line.match(/^##\s*板块5/) || line.match(/^##\s*好的做法/))) {
      section5Start = i;
      break;
    }
  }

  if (section4Start < 0) return problems;
  const endLine = section5Start >= 0 ? section5Start : lines.length;

  // 提取每个问题（以### 问题开头）
  let currentProblem = null;
  for (let i = section4Start + 1; i < endLine; i++) {
    const line = lines[i].trim();

    // 新问题开始
    const problemMatch = line.match(/^###\s*(?:问题\s*)?\d*[：:]?\s*(.+)$/);
    if (problemMatch && !line.includes('要求') && !line.includes('问题类型')) {
      if (currentProblem) {
        problems.push(currentProblem);
      }
      currentProblem = {
        title: cleanMarkdown(problemMatch[1]),
        severity: '',
        wastedTurns: 0,
        evidence: '',
        cause: '',
        suggestion: ''
      };
      continue;
    }

    if (currentProblem) {
      // 提取严重度
      const severityMatch = line.match(/严重度[：:]\s*(.+)/);
      if (severityMatch) {
        currentProblem.severity = cleanMarkdown(severityMatch[1]);
      }
      // 提取浪费轮次
      const wastedMatch = line.match(/浪费轮次[：:]\s*(\d+)/);
      if (wastedMatch) {
        currentProblem.wastedTurns = parseInt(wastedMatch[1]) || 0;
      }
      // 提取原话证据
      const evidenceMatch = line.match(/原话证据[：:]\s*(.+)/);
      if (evidenceMatch) {
        currentProblem.evidence = cleanMarkdown(evidenceMatch[1]);
      }
      // 提取原因分析
      const causeMatch = line.match(/原因分析[：:]\s*(.+)/);
      if (causeMatch) {
        currentProblem.cause = cleanMarkdown(causeMatch[1]);
      }
      // 提取改进建议
      const suggestionMatch = line.match(/改进建议[：:]\s*(.+)/);
      if (suggestionMatch) {
        currentProblem.suggestion = cleanMarkdown(suggestionMatch[1]);
      }
    }
  }

  if (currentProblem) {
    problems.push(currentProblem);
  }

  return problems;
}

/**
 * 从复盘文件正文中提取好的做法
 * @param {string} content - 复盘文件正文
 * @returns {Array} 好做法列表
 */
function extractGoodPracticesFromContent(content) {
  const practices = [];
  if (!content) return practices;

  const lines = content.split('\n');

  // 找到板块5的起始位置
  let section5Start = -1;
  let section6Start = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.match(/^##\s*板块5/) || line.match(/^##\s*好的做法/)) {
      section5Start = i;
    }
    if (section5Start >= 0 && (line.match(/^##\s*板块6/) || line.match(/^##\s*可复用.*Prompt/) || line.match(/^##\s*Prompt/))) {
      section6Start = i;
      break;
    }
  }

  if (section5Start < 0) return practices;
  const endLine = section6Start >= 0 ? section6Start : lines.length;

  // 提取每个好做法（以### 做法开头）
  let currentPractice = null;
  for (let i = section5Start + 1; i < endLine; i++) {
    const line = lines[i].trim();

    // 新做法开始
    const practiceMatch = line.match(/^###\s*(?:做法\s*)?\d*[：:]?\s*(.+)$/);
    if (practiceMatch && !line.includes('做法描述') && !line.includes('为什么好')) {
      if (currentPractice) {
        practices.push(currentPractice);
      }
      currentPractice = {
        title: cleanMarkdown(practiceMatch[1]),
        description: '',
        whyGood: '',
        evidence: '',
        reusability: ''
      };
      continue;
    }

    if (currentPractice) {
      const descMatch = line.match(/做法描述[：:]\s*(.+)/);
      if (descMatch) { currentPractice.description = cleanMarkdown(descMatch[1]); continue; }
      const whyMatch = line.match(/为什么好[：:]\s*(.+)/);
      if (whyMatch) { currentPractice.whyGood = cleanMarkdown(whyMatch[1]); continue; }
      const reuseMatch = line.match(/可复用性[：:]\s*(.+)/);
      if (reuseMatch) { currentPractice.reusability = cleanMarkdown(reuseMatch[1]); continue; }
    }
  }

  if (currentPractice) {
    practices.push(currentPractice);
  }

  return practices;
}

/**
 * 从复盘文件正文中提取可复用Prompt
 * @param {string} content - 复盘文件正文
 * @returns {Array} Prompt列表
 */
function extractPromptsFromContent(content) {
  const prompts = [];
  if (!content) return prompts;

  const lines = content.split('\n');

  // 找到板块6的起始位置
  let section6Start = -1;
  let section7Start = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.match(/^##\s*板块6/) || line.match(/^##\s*可复用.*Prompt/) || line.match(/^##\s*Prompt.*模板/)) {
      section6Start = i;
    }
    if (section6Start >= 0 && (line.match(/^##\s*板块7/) || line.match(/^##\s*问题模式/) || line.match(/^##\s*根因分析/))) {
      section7Start = i;
      break;
    }
  }

  if (section6Start < 0) return prompts;
  const endLine = section7Start >= 0 ? section7Start : lines.length;

  // 提取每个Prompt（以### Prompt开头）
  let currentPrompt = null;
  let inCodeBlock = false;
  let codeContent = [];
  for (let i = section6Start + 1; i < endLine; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 代码块开始/结束
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        if (currentPrompt) {
          currentPrompt.content = codeContent.join('\n');
        }
        codeContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    // 新Prompt开始
    const promptMatch = trimmed.match(/^###\s*(?:Prompt\s*)?\d*[：:]?\s*(.+)$/);
    if (promptMatch && !trimmed.includes('优化后的Prompt') && !trimmed.includes('适用场景')) {
      if (currentPrompt) {
        prompts.push(currentPrompt);
      }
      currentPrompt = {
        title: cleanMarkdown(promptMatch[1]),
        content: '',
        scene: '',
        original: ''
      };
      continue;
    }

    if (currentPrompt) {
      const sceneMatch = trimmed.match(/适用场景[：:]\s*(.+)/);
      if (sceneMatch) { currentPrompt.scene = cleanMarkdown(sceneMatch[1]); continue; }
    }
  }

  if (currentPrompt) {
    prompts.push(currentPrompt);
  }

  return prompts;
}

/**
 * 问题模式定义（关键词匹配）
 */
const PROBLEM_PATTERNS = [
  {
    id: 'incomplete_feedback',
    name: '反馈不完整',
    description: '报告问题时只说现象，不提供具体位置、复现路径或错误信息',
    keywords: ['只说现象', '不说具体', '不贴错误', '反馈不完整', '没有声音', '不行', '不对', '没效果', '报错了', '复现路径']
  },
  {
    id: 'lack_root_cause',
    name: '缺乏根因排查',
    description: '同一个问题反复修改，只调参数不分析根本原因',
    keywords: ['反复', '根因', '调参数', '好几次', '反反复复', '一直出问题', '改了好多次']
  },
  {
    id: 'vague_requirement',
    name: '需求描述模糊',
    description: '提需求时不具体，只说"改一下"不说改哪里、改成什么样',
    keywords: ['模糊', '不具体', '改一下', '优化一下', '继续吧', '你自己看', '不知道要什么']
  },
  {
    id: 'emotional_feedback',
    name: '情绪化反馈',
    description: '用情绪化表达代替具体需求描述，影响沟通效率',
    keywords: ['wtf', '乱套', '什么鬼', '气死', '烦', '情绪化', '你在干什么', '搞什么']
  },
  {
    id: 'no_verification',
    name: '不验证结果',
    description: 'AI说完成了就直接相信，不实际测试验证',
    keywords: ['不验证', '没测试', '直接相信', '没发现', '以为好了']
  },
  {
    id: 'constraint_lag',
    name: '约束后置补充',
    description: '一开始不说清楚约束，AI做完后才补充"我不想要XX"',
    keywords: ['约束', '后置', '我不想要', '没说清楚', '补充', '不是这个意思']
  },
  {
    id: 'tool_underutilize',
    name: '工具利用不足',
    description: '不知道AI有某个能力，手动做了AI可以自动做的事情',
    keywords: ['手动', '不知道', '工具', '能力', '自动', '可以用']
  },
  {
    id: 'iteration_low_efficiency',
    name: '迭代效率低',
    description: '一次反馈说不清楚问题，需要多轮才能让AI理解',
    keywords: ['迭代', '效率', '多轮', '反复确认', '说不清楚', '理解错']
  }
];

/**
 * 匹配问题所属模式
 * @param {Object} problem - 问题对象
 * @returns {Array} 匹配的模式ID列表
 */
function matchProblemPattern(problem) {
  const matched = [];
  const text = `${problem.title} ${problem.cause} ${problem.evidence}`.toLowerCase();

  PROBLEM_PATTERNS.forEach(pattern => {
    const matchCount = pattern.keywords.filter(kw => text.includes(kw.toLowerCase())).length;
    if (matchCount > 0) {
      matched.push({ id: pattern.id, name: pattern.name, matchCount });
    }
  });

  return matched;
}

/**
 * 跨会话模式识别
 * @returns {Object} 模式分析结果
 */
function analyzePatterns() {
  const result = scanReviews({ page: 1, pageSize: 1000, sortBy: 'date', sortOrder: 'desc' });
  const reviews = result.reviews;

  if (reviews.length === 0) {
    return {
      totalReviews: 0,
      totalProblems: 0,
      patterns: [],
      topProblems: [],
      abilityGaps: [],
      message: '暂无复盘数据'
    };
  }

  // 提取所有问题
  const allProblems = [];
  reviews.forEach(review => {
    try {
      const detail = getReviewDetail(review.path);
      if (!detail) return;
      const problems = extractProblemsFromContent(detail.content);
      problems.forEach(p => {
        allProblems.push({
          ...p,
          sourceReview: review.title,
          sourcePath: review.path,
          reviewDate: review.date,
          reviewScore: review.average_score,
          patterns: matchProblemPattern(p)
        });
      });
    } catch (err) {
      console.warn(`[ObsidianScanner] 提取问题失败 ${review.path}:`, err.message);
    }
  });

  // 统计模式出现次数
  const patternStats = {};
  PROBLEM_PATTERNS.forEach(p => {
    patternStats[p.id] = { ...p, count: 0, problems: [], totalWastedTurns: 0 };
  });

  allProblems.forEach(p => {
    p.patterns.forEach(matched => {
      if (patternStats[matched.id]) {
        patternStats[matched.id].count++;
        patternStats[matched.id].problems.push(p);
        patternStats[matched.id].totalWastedTurns += p.wastedTurns || 0;
      }
    });
  });

  // 排序模式（按出现次数）
  const sortedPatterns = Object.values(patternStats)
    .filter(p => p.count > 0)
    .sort((a, b) => b.count - a.count || b.totalWastedTurns - a.totalWastedTurns);

  // 找出浪费轮次最多的问题TOP5
  const topProblems = [...allProblems]
    .sort((a, b) => (b.wastedTurns || 0) - (a.wastedTurns || 0))
    .slice(0, 5);

  // 能力短板（出现次数>=2的模式，或浪费轮次最多的模式）
  const abilityGaps = sortedPatterns
    .filter(p => p.count >= 1)
    .slice(0, 5)
    .map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      occurrenceCount: p.count,
      totalWastedTurns: p.totalWastedTurns,
      severity: p.count >= 3 ? 'high' : p.count >= 2 ? 'medium' : 'low',
      sampleProblems: p.problems.slice(0, 3).map(prob => ({
        title: prob.title,
        reviewDate: prob.reviewDate,
        wastedTurns: prob.wastedTurns
      }))
    }));

  return {
    totalReviews: reviews.length,
    totalProblems: allProblems.length,
    patterns: sortedPatterns.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      count: p.count,
      totalWastedTurns: p.totalWastedTurns,
      percentage: allProblems.length > 0 ? Math.round((p.count / allProblems.length) * 100) : 0
    })),
    topProblems: topProblems.map(p => ({
      title: p.title,
      severity: p.severity,
      wastedTurns: p.wastedTurns,
      evidence: p.evidence,
      suggestion: p.suggestion,
      sourceReview: p.sourceReview,
      reviewDate: p.reviewDate
    })),
    abilityGaps,
    allProblems: allProblems.map(p => ({
      title: p.title,
      severity: p.severity,
      wastedTurns: p.wastedTurns,
      patterns: p.patterns,
      sourceReview: p.sourceReview,
      reviewDate: p.reviewDate
    }))
  };
}

/**
 * 获取问题模式趋势数据（按时间统计每个模式的出现次数）
 * @returns {Object} 趋势数据
 */
function getPatternTrends() {
  const result = scanReviews({ page: 1, pageSize: 1000, sortBy: 'date', sortOrder: 'asc' });
  const reviews = result.reviews;

  if (reviews.length === 0) {
    return { totalReviews: 0, trends: [], dates: [] };
  }

  // 提取所有问题并按日期分组
  const datePatterns = {}; // { date: { patternId: count } }
  const allDates = [];

  reviews.forEach(review => {
    try {
      const detail = getReviewDetail(review.path);
      if (!detail) return;
      const problems = extractProblemsFromContent(detail.content);
      if (problems.length === 0) return;

      if (!datePatterns[review.date]) {
        datePatterns[review.date] = {};
        allDates.push(review.date);
      }

      problems.forEach(p => {
        const patterns = matchProblemPattern(p);
        patterns.forEach(matched => {
          if (!datePatterns[review.date][matched.id]) {
            datePatterns[review.date][matched.id] = 0;
          }
          datePatterns[review.date][matched.id]++;
        });
      });
    } catch (err) {
      console.warn(`[ObsidianScanner] 提取趋势数据失败 ${review.path}:`, err.message);
    }
  });

  // 排序日期
  allDates.sort();

  // 构建每个模式的趋势数据
  const trends = PROBLEM_PATTERNS.map(pattern => {
    const dataPoints = allDates.map(date => ({
      date,
      count: datePatterns[date]?.[pattern.id] || 0
    }));
    const totalCount = dataPoints.reduce((sum, d) => sum + d.count, 0);
    // 计算趋势（最近3次 vs 之前3次）
    const recentCount = dataPoints.slice(-3).reduce((sum, d) => sum + d.count, 0);
    const earlierCount = dataPoints.slice(0, -3).reduce((sum, d) => sum + d.count, 0);
    const trend = totalCount > 0 ? (recentCount > earlierCount ? 'rising' : recentCount < earlierCount ? 'falling' : 'stable') : 'none';

    return {
      id: pattern.id,
      name: pattern.name,
      description: pattern.description,
      totalCount,
      trend,
      recentCount,
      earlierCount,
      dataPoints
    };
  }).filter(t => t.totalCount > 0)
    .sort((a, b) => b.totalCount - a.totalCount);

  return {
    totalReviews: reviews.length,
    totalDates: allDates.length,
    dates: allDates,
    trends
  };
}

/**
 * 获取反复出现的问题模式预警（连续3次以上出现）
 * @returns {Object} 预警数据
 */
function getRepeatedPatterns() {
  const trends = getPatternTrends();
  if (trends.totalReviews === 0) {
    return { warnings: [], totalWarnings: 0 };
  }

  const warnings = [];
  const improvementMethods = {
    incomplete_feedback: {
      method: '使用"现象+位置+复现步骤+期望结果"四要素反馈法',
      steps: ['描述看到的现象', '说明具体位置（文件/行号/截图）', '提供复现步骤', '说明期望结果']
    },
    lack_root_cause: {
      method: '采用"5 Why分析法"深挖根本原因',
      steps: ['问"为什么会出现这个问题"', '对答案再问"为什么"', '连续问5次直到找到根因', '针对根因制定解决方案']
    },
    vague_requirement: {
      method: '使用SMART原则描述需求',
      steps: ['Specific：具体说明要什么', 'Measurable：可衡量的验收标准', 'Achievable：可实现的', 'Relevant：相关的', 'Time-bound：有时间限制']
    },
    emotional_feedback: {
      method: '情绪平复后用"事实+影响+需求"表达',
      steps: ['先深呼吸平复情绪', '描述客观事实（不加评价）', '说明造成的影响', '提出具体需求']
    },
    no_verification: {
      method: '建立"AI完成→我验证→确认"的三步流程',
      steps: ['AI说完成后不要立即相信', '按验收标准逐项测试', '发现问题立即反馈', '验证通过后再标记完成']
    },
    constraint_lag: {
      method: '需求描述时先列约束条件清单',
      steps: ['开始提需求前列出所有约束', '包括技术约束、设计约束、时间约束', '说明"不要什么"和"必须是什么"', 'AI完成后对照约束检查']
    },
    tool_underutilize: {
      method: '定期复盘AI能力清单，建立"什么可以自动化"的意识',
      steps: ['记录每次手动做的重复工作', '问自己"AI能帮我做这个吗"', '探索AI的新能力和工具', '沉淀可复用的自动化流程']
    },
    iteration_low_efficiency: {
      method: '一次反馈说清楚"哪里不对+改成什么样+参考示例"',
      steps: ['指出具体哪里不对', '说明期望改成什么样', '提供参考示例或截图', '避免只说"不对"或"再改改"']
    }
  };

  trends.trends.forEach(pattern => {
    // 检查是否连续3次以上出现
    const consecutiveCount = countConsecutiveOccurrences(pattern.dataPoints);
    const severity = consecutiveCount >= 5 ? 'critical' : consecutiveCount >= 3 ? 'warning' : 'info';
    const method = improvementMethods[pattern.id] || {
      method: '分析问题原因，制定针对性改进措施',
      steps: ['记录问题出现的场景', '分析根本原因', '制定改进措施', '跟踪改进效果']
    };

    if (consecutiveCount >= 3) {
      warnings.push({
        id: pattern.id,
        name: pattern.name,
        description: pattern.description,
        consecutiveCount,
        totalCount: pattern.totalCount,
        severity,
        trend: pattern.trend,
        improvementMethod: method.method,
        improvementSteps: method.steps,
        lastOccurrence: pattern.dataPoints.filter(d => d.count > 0).slice(-1)[0]?.date || null,
        recentOccurrences: pattern.dataPoints.filter(d => d.count > 0).slice(-5).map(d => ({ date: d.date, count: d.count }))
      });
    }
  });

  // 按严重度和连续出现次数排序
  warnings.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return b.consecutiveCount - a.consecutiveCount;
  });

  return {
    totalWarnings: warnings.length,
    criticalCount: warnings.filter(w => w.severity === 'critical').length,
    warningCount: warnings.filter(w => w.severity === 'warning').length,
    warnings
  };
}

/**
 * 计算连续出现次数（从最近一次出现开始往前数）
 * @param {Array} dataPoints - 数据点列表
 * @returns {number} 连续出现次数
 */
function countConsecutiveOccurrences(dataPoints) {
  let count = 0;
  // 从后往前遍历
  for (let i = dataPoints.length - 1; i >= 0; i--) {
    if (dataPoints[i].count > 0) {
      count++;
    } else if (count > 0) {
      // 已经开始计数后遇到0，停止
      break;
    }
  }
  return count;
}

// ========== 学习收获提取 ==========

/**
 * 从复盘文件正文中提取学习收获
 * @param {string} content - 复盘文件正文
 * @returns {Array} 学习收获列表
 */
function extractLearningsFromContent(content) {
  const learnings = [];
  if (!content) return learnings;

  const lines = content.split('\n');

  // 找到"本次学习收获"板块的起始位置
  let learnStart = -1;
  let learnEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.match(/^###\s*本次学习收获/) || line.match(/^##\s*本次学习收获/)) {
      learnStart = i;
    }
    if (learnStart >= 0 && i > learnStart && (line.match(/^###\s/) || line.match(/^##\s/) || line === '---')) {
      learnEnd = i;
      break;
    }
  }

  if (learnStart < 0) return learnings;
  const endLine = learnEnd >= 0 ? learnEnd : lines.length;

  // 提取学习收获
  // 支持格式1: 1. **标题** — 类型 — 掌握程度
  // 支持格式2: 1. **收获描述**：... (后续行有类型/场景/程度/证据)
  let currentLearning = null;

  for (let i = learnStart + 1; i < endLine; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 匹配新的学习收获（只有有序列表 数字. 开头才是新收获）
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);

    if (orderedMatch) {
      // 保存上一个收获
      if (currentLearning) {
        learnings.push(currentLearning);
      }

      const content = cleanMarkdown(orderedMatch[1]);

      // 检查是否是"标题 — 类型 — 掌握程度"格式
      const dashParts = content.split(/\s+[—–-]\s+/);
      if (dashParts.length >= 2) {
        currentLearning = {
          title: dashParts[0].trim(),
          type: dashParts[1] ? dashParts[1].trim() : '',
          mastery: dashParts[2] ? dashParts[2].trim() : '',
          scenario: '',
          evidence: ''
        };
      } else {
        // 检查是否是"收获描述：..."格式
        const descMatch = content.match(/^(?:收获描述|描述|标题)[：:]\s*(.+)$/);
        if (descMatch) {
          currentLearning = {
            title: descMatch[1].trim(),
            type: '',
            scenario: '',
            mastery: '',
            evidence: ''
          };
        } else {
          // 普通文本作为标题
          currentLearning = {
            title: content,
            type: '',
            scenario: '',
            mastery: '',
            evidence: ''
          };
        }
      }
      continue;
    }

    // 无序列表 - 开头或普通文本行，当作当前收获的属性
    if (currentLearning) {
      // 去除行首的 - 或 *
      const attrLine = line.replace(/^[-*]\s+/, '').trim();

      // 提取收获类型
      const typeMatch = attrLine.match(/(?:收获类型|类型)[：:]\s*(.+)/);
      if (typeMatch) {
        currentLearning.type = cleanMarkdown(typeMatch[1]);
      }
      // 提取应用场景
      const scenarioMatch = attrLine.match(/(?:应用场景|场景)[：:]\s*(.+)/);
      if (scenarioMatch) {
        currentLearning.scenario = cleanMarkdown(scenarioMatch[1]);
      }
      // 提取掌握程度
      const masteryMatch = attrLine.match(/(?:掌握程度|程度)[：:]\s*(.+)/);
      if (masteryMatch) {
        currentLearning.mastery = cleanMarkdown(masteryMatch[1]);
      }
      // 提取证据
      const evidenceMatch = attrLine.match(/(?:证据|原话)[：:]\s*(.+)/);
      if (evidenceMatch) {
        currentLearning.evidence = cleanMarkdown(evidenceMatch[1]);
      }
    }
  }

  // 保存最后一个收获
  if (currentLearning) {
    learnings.push(currentLearning);
  }

  // 过滤掉无效的收获（标题太短或包含说明文字）
  return learnings.filter(l =>
    l.title &&
    l.title.length > 3 &&
    !l.title.match(/^(记录|每个|要求|如果|本次|学习收获)/)
  );
}

/**
 * 获取所有复盘的学习收获汇总
 * @param {Object} options - 选项
 * @param {string} options.type - 按类型筛选
 * @param {string} options.mastery - 按掌握程度筛选
 * @returns {Object} 学习收获列表和统计
 */
function getAllLearnings(options = {}) {
  const { type = null, mastery = null } = options;

  const result = scanReviews({ page: 1, pageSize: 1000, sortBy: 'date', sortOrder: 'desc' });
  const reviews = result.reviews;

  let allLearnings = [];
  reviews.forEach(review => {
    try {
      const detail = getReviewDetail(review.path);
      if (!detail) return;
      const learnings = extractLearningsFromContent(detail.content);
      learnings.forEach(learning => {
        allLearnings.push({
          ...learning,
          sourceReview: review.title,
          sourcePath: review.path,
          reviewDate: review.date,
          reviewScore: review.average_score
        });
      });
    } catch (err) {
      console.warn(`[ObsidianScanner] 提取学习收获失败 ${review.path}:`, err.message);
    }
  });

  // 按类型筛选
  if (type) {
    allLearnings = allLearnings.filter(l => l.type === type || l.type.includes(type));
  }

  // 按掌握程度筛选
  if (mastery) {
    allLearnings = allLearnings.filter(l => l.mastery === mastery || l.mastery.includes(mastery));
  }

  // 按日期倒序
  allLearnings.sort((a, b) => new Date(b.reviewDate) - new Date(a.reviewDate));

  // 统计
  const byType = {};
  const byMastery = {};
  allLearnings.forEach(l => {
    const t = l.type || '未分类';
    byType[t] = (byType[t] || 0) + 1;
    const m = l.mastery || '未评估';
    byMastery[m] = (byMastery[m] || 0) + 1;
  });

  return {
    items: allLearnings,
    total: allLearnings.length,
    stats: {
      byType,
      byMastery,
      totalReviews: reviews.length
    }
  };
}

/**
 * 从复盘信息中提取项目名
 * @param {Object} review - 复盘信息
 * @returns {string} 项目名
 */
function extractProjectName(review) {
  const tags = review.tags || [];
  // 如果tags的第一个是"AI复盘"，则第二个是项目名
  if (tags.length >= 2 && tags[0] === 'AI复盘') {
    return tags[1];
  }
  // 否则取第一个非"AI复盘"的tag
  const projectTag = tags.find(t => t !== 'AI复盘' && t !== '能力提升');
  if (projectTag) return projectTag;
  // 从标题中提取（标题格式通常是"项目名-xxx复盘"）
  const title = review.title || '';
  const titleMatch = title.match(/^(.+?)(?:-|—|_)/);
  if (titleMatch && titleMatch[1].length > 1) {
    return titleMatch[1];
  }
  return '未分类项目';
}

/**
 * 获取所有项目聚合列表
 * @returns {Object} 项目列表和统计
 */
function getAllProjects() {
  const result = scanReviews({ page: 1, pageSize: 1000 });
  const reviews = result.reviews || [];

  // 按项目名分组
  const projectMap = {};
  reviews.forEach(review => {
    const projectName = extractProjectName(review);
    if (!projectMap[projectName]) {
      projectMap[projectName] = {
        name: projectName,
        reviews: [],
        totalScore: 0,
        totalProblems: 0,
        totalGoodPractices: 0,
        totalPrompts: 0,
        firstDate: review.date,
        lastDate: review.date
      };
    }
    const project = projectMap[projectName];
    project.reviews.push(review);
    project.totalScore += review.average_score || 0;
    project.totalProblems += review.total_problems || 0;
    project.totalGoodPractices += review.total_good_practices || 0;
    project.totalPrompts += review.total_prompts || 0;
    if (review.date < project.firstDate) project.firstDate = review.date;
    if (review.date > project.lastDate) project.lastDate = review.date;
  });

  // 转换为数组并计算统计
  const projects = Object.values(projectMap).map(project => ({
    name: project.name,
    reviewCount: project.reviews.length,
    avgScore: project.reviews.length > 0 ? Math.round((project.totalScore / project.reviews.length) * 10) / 10 : 0,
    totalProblems: project.totalProblems,
    totalGoodPractices: project.totalGoodPractices,
    totalPrompts: project.totalPrompts,
    firstDate: project.firstDate,
    lastDate: project.lastDate,
    dateSpan: project.firstDate === project.lastDate ? project.firstDate : `${project.firstDate} ~ ${project.lastDate}`
  }));

  // 按复盘数量排序
  projects.sort((a, b) => b.reviewCount - a.reviewCount);

  return {
    success: true,
    total: projects.length,
    projects
  };
}

/**
 * 获取某个项目的详细信息
 * @param {string} projectName - 项目名
 * @returns {Object} 项目详情
 */
function getProjectDetail(projectName) {
  const result = scanReviews({ page: 1, pageSize: 1000 });
  const allReviews = result.reviews || [];

  // 筛选该项目的复盘
  const projectReviews = allReviews.filter(review => extractProjectName(review) === projectName);

  if (projectReviews.length === 0) {
    return { success: false, error: '项目不存在' };
  }

  // 按日期排序
  projectReviews.sort((a, b) => new Date(b.date) - new Date(a.date));

  // 计算统计
  const totalScore = projectReviews.reduce((sum, r) => sum + (r.average_score || 0), 0);
  const avgScore = Math.round((totalScore / projectReviews.length) * 10) / 10;
  const totalProblems = projectReviews.reduce((sum, r) => sum + (r.total_problems || 0), 0);
  const totalGoodPractices = projectReviews.reduce((sum, r) => sum + (r.total_good_practices || 0), 0);
  const totalPrompts = projectReviews.reduce((sum, r) => sum + (r.total_prompts || 0), 0);

  // 能力评分趋势（按日期排序的评分）
  const scoreTrend = projectReviews
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(r => ({
      date: r.date,
      score: r.average_score || 0,
      title: r.title
    }));

  // 提取该项目的所有问题模式
  const allProblems = [];
  projectReviews.forEach(review => {
    const detail = getReviewDetail(review.path);
    if (detail && detail.content) {
      const problems = extractProblemsFromContent(detail.content);
      problems.forEach(p => {
        p.reviewDate = review.date;
        p.reviewTitle = review.title;
        allProblems.push(p);
      });
    }
  });

  // 问题模式统计
  const patternStats = {};
  allProblems.forEach(p => {
    const pattern = p.pattern || '未分类';
    if (!patternStats[pattern]) {
      patternStats[pattern] = { count: 0, totalWastedTurns: 0, problems: [] };
    }
    patternStats[pattern].count++;
    patternStats[pattern].totalWastedTurns += p.wastedTurns || 0;
    patternStats[pattern].problems.push(p);
  });

  // 提取该项目的所有学习收获
  const allLearnings = [];
  projectReviews.forEach(review => {
    const detail = getReviewDetail(review.path);
    if (detail && detail.content) {
      const learnings = extractLearningsFromContent(detail.content);
      learnings.forEach(l => {
        l.reviewDate = review.date;
        l.reviewTitle = review.title;
        allLearnings.push(l);
      });
    }
  });

  // 提取该项目的所有行动项
  const allActionItems = [];
  projectReviews.forEach(review => {
    const detail = getReviewDetail(review.path);
    if (detail && detail.content) {
      const items = extractActionItemsFromContent(detail.content);
      items.forEach(item => {
        item.reviewDate = review.date;
        item.reviewTitle = review.title;
        allActionItems.push(item);
      });
    }
  });

  return {
    success: true,
    name: projectName,
    reviewCount: projectReviews.length,
    avgScore,
    totalProblems,
    totalGoodPractices,
    totalPrompts,
    firstDate: projectReviews[projectReviews.length - 1].date,
    lastDate: projectReviews[0].date,
    reviews: projectReviews,
    scoreTrend,
    patternStats,
    learnings: allLearnings,
    actionItems: allActionItems
  };
}

// ========== 学习收获艾宾浩斯复习提醒 ==========

/**
 * 艾宾浩斯遗忘曲线复习间隔（天）
 * 第1次复习：1天后
 * 第2次复习：3天后
 * 第3次复习：7天后
 * 第4次复习：15天后
 * 第5次复习：30天后
 * 第6次及以后：60天
 */
const EBBINGHAUS_INTERVALS = [1, 3, 7, 15, 30, 60];

/**
 * 学习收获复习状态存储文件路径
 */
function getLearningReviewStatusPath() {
  const dataDir = path.join(require('os').homedir(), 'AppData', 'Roaming', 'siyi-workbench');
  return path.join(dataDir, 'learning-review-status.json');
}

/**
 * 加载学习收获复习状态
 */
function loadLearningReviewStatus() {
  try {
    const filePath = getLearningReviewStatusPath();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('[ObsidianScanner] 加载学习收获复习状态失败:', err.message);
  }
  return {};
}

/**
 * 保存学习收获复习状态
 */
function saveLearningReviewStatus(statusStore) {
  try {
    const filePath = getLearningReviewStatusPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(statusStore, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[ObsidianScanner] 保存学习收获复习状态失败:', err.message);
    return false;
  }
}

/**
 * 计算下次复习日期
 * @param {string} lastReviewDate - 上次复习日期（YYYY-MM-DD）
 * @param {number} reviewCount - 已复习次数
 * @returns {string} 下次复习日期（YYYY-MM-DD）
 */
function calculateNextReviewDate(lastReviewDate, reviewCount) {
  const intervalIndex = Math.min(reviewCount, EBBINGHAUS_INTERVALS.length - 1);
  const interval = EBBINGHAUS_INTERVALS[intervalIndex];
  const date = new Date(lastReviewDate);
  date.setDate(date.getDate() + interval);
  return date.toISOString().split('T')[0];
}

/**
 * 生成学习收获唯一ID
 */
function generateLearningId(learning, reviewPath, index) {
  return `${reviewPath}#learning-${index}`;
}

/**
 * 获取所有学习收获（含复习状态）
 * @param {Object} options - 选项
 * @returns {Object} 学习收获列表和统计
 */
function getAllLearningsWithReview(options = {}) {
  const { type = null, mastery = null, reviewStatus = null } = options;

  const result = getAllLearnings({ type, mastery });
  const statusStore = loadLearningReviewStatus();

  const today = new Date().toISOString().split('T')[0];

  const itemsWithStatus = result.items.map((learning, index) => {
    const id = generateLearningId(learning, learning.sourcePath, index);
    const saved = statusStore[id] || {};
    const reviewCount = saved.reviewCount || 0;
    const lastReviewDate = saved.lastReviewDate || null;
    const nextReviewDate = saved.nextReviewDate || (reviewCount === 0 ? learning.reviewDate : null);
    const isDue = nextReviewDate && nextReviewDate <= today && saved.status !== 'mastered';
    const isOverdue = nextReviewDate && nextReviewDate < today && saved.status !== 'mastered';

    return {
      ...learning,
      id,
      reviewCount,
      lastReviewDate,
      nextReviewDate,
      reviewStatus: saved.status || 'new', // new | learning | reviewing | mastered
      isDue,
      isOverdue,
      reviewNote: saved.note || ''
    };
  });

  // 按复习状态筛选
  let filteredItems = itemsWithStatus;
  if (reviewStatus === 'due') {
    filteredItems = itemsWithStatus.filter(l => l.isDue);
  } else if (reviewStatus === 'overdue') {
    filteredItems = itemsWithStatus.filter(l => l.isOverdue);
  } else if (reviewStatus === 'new') {
    filteredItems = itemsWithStatus.filter(l => l.reviewCount === 0);
  } else if (reviewStatus === 'mastered') {
    filteredItems = itemsWithStatus.filter(l => l.reviewStatus === 'mastered');
  }

  // 统计
  const stats = {
    total: itemsWithStatus.length,
    dueToday: itemsWithStatus.filter(l => l.isDue && !l.isOverdue).length,
    overdue: itemsWithStatus.filter(l => l.isOverdue).length,
    new: itemsWithStatus.filter(l => l.reviewCount === 0).length,
    learning: itemsWithStatus.filter(l => l.reviewCount > 0 && l.reviewCount < 5 && l.reviewStatus !== 'mastered').length,
    mastered: itemsWithStatus.filter(l => l.reviewStatus === 'mastered' || l.reviewCount >= 5).length,
    totalReviews: itemsWithStatus.reduce((sum, l) => sum + (l.reviewCount || 0), 0),
    byType: result.stats?.byType || {},
    byMastery: result.stats?.byMastery || {}
  };

  return {
    items: filteredItems,
    total: filteredItems.length,
    allTotal: itemsWithStatus.length,
    stats,
    today
  };
}

/**
 * 获取今日待复习的学习收获
 * @returns {Object} 今日待复习列表
 */
function getTodayLearningReviews() {
  const result = getAllLearningsWithReview({ reviewStatus: 'due' });
  const allResult = getAllLearningsWithReview({});

  // 按优先级排序：已过期 > 今日到期 > 新学习
  result.items.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    if (a.reviewCount === 0 && b.reviewCount > 0) return -1;
    if (a.reviewCount > 0 && b.reviewCount === 0) return 1;
    return new Date(a.nextReviewDate) - new Date(b.nextReviewDate);
  });

  return {
    items: result.items,
    total: result.items.length,
    stats: {
      dueToday: allResult.stats.dueToday,
      overdue: allResult.stats.overdue,
      new: allResult.stats.new,
      total: allResult.stats.total,
      mastered: allResult.stats.mastered
    },
    today: result.today
  };
}

/**
 * 标记学习收获已复习
 * @param {string} id - 学习收获ID
 * @param {string} quality - 复习质量（good | medium | hard）
 * @param {string} note - 复习笔记
 * @returns {boolean} 是否成功
 */
function markLearningReviewed(id, quality = 'good', note = '') {
  const statusStore = loadLearningReviewStatus();
  const existing = statusStore[id] || {};
  const today = new Date().toISOString().split('T')[0];

  const reviewCount = (existing.reviewCount || 0) + 1;
  const nextReviewDate = calculateNextReviewDate(today, reviewCount);

  // 根据复习质量调整状态
  let status = 'reviewing';
  if (quality === 'hard') {
    // 困难的话，复习次数不增加，下次复习间隔缩短
    status = 'learning';
  } else if (reviewCount >= 5 && quality === 'good') {
    status = 'mastered';
  }

  statusStore[id] = {
    status,
    reviewCount: quality === 'hard' ? existing.reviewCount || 0 : reviewCount,
    lastReviewDate: today,
    nextReviewDate: quality === 'hard' ? calculateNextReviewDate(today, Math.max(0, (existing.reviewCount || 0) - 1)) : nextReviewDate,
    note: note || existing.note || '',
    lastQuality: quality,
    updatedAt: new Date().toISOString()
  };

  return saveLearningReviewStatus(statusStore);
}

/**
 * 重置学习收获复习状态
 * @param {string} id - 学习收获ID
 * @returns {boolean} 是否成功
 */
function resetLearningReview(id) {
  const statusStore = loadLearningReviewStatus();
  delete statusStore[id];
  return saveLearningReviewStatus(statusStore);
}

// ========== 复盘质量自动评分 ==========

/**
 * 评分单个复盘文档的质量
 * @param {Object} review - 复盘对象（含content和frontmatter）
 * @returns {Object} 评分结果
 */
function scoreReviewQuality(review) {
  const content = review.content || '';
  const frontmatter = review.frontmatter || {};

  const scores = {
    completeness: 0,      // 内容完整性 0-20
    evidence: 0,          // 证据充分性 0-20
    actionability: 0,     // 行动项可执行性 0-20
    learningDepth: 0,     // 学习收获深度 0-20
    problemDepth: 0       // 问题分析深度 0-20
  };

  const suggestions = [];

  // 1. 内容完整性（检查8个板块是否存在）
  const sections = [
    { name: '基本信息', patterns: [/板块1/, /基本信息/] },
    { name: '过程时间线', patterns: [/板块2/, /过程时间线/, /时间线/] },
    { name: '用户行为分析', patterns: [/板块3/, /用户行为分析/, /行为分析/] },
    { name: '典型问题', patterns: [/板块4/, /典型问题/, /问题与不足/] },
    { name: '好的做法', patterns: [/板块5/, /好的做法/, /亮点/] },
    { name: '可复用Prompt', patterns: [/板块6/, /可复用.*Prompt/, /Prompt模板/] },
    { name: '问题模式', patterns: [/板块7/, /问题模式/, /根因分析/] },
    { name: '改进计划', patterns: [/板块8/, /改进计划/, /行动项/] }
  ];

  let foundSections = 0;
  sections.forEach(section => {
    const found = section.patterns.some(p => p.test(content));
    if (found) foundSections++;
  });
  scores.completeness = Math.round((foundSections / sections.length) * 20);
  if (foundSections < 8) {
    const missing = sections.filter(s => !s.patterns.some(p => p.test(content))).map(s => s.name);
    suggestions.push(`缺少板块: ${missing.join('、')}`);
  }

  // 2. 证据充分性（检查典型问题是否有原话证据）
  const problemSection = extractSectionContent(content, [/板块4/, /典型问题/, /问题与不足/]);
  if (problemSection) {
    const evidenceCount = (problemSection.match(/原话证据/g) || []).length;
    const problemCount = (problemSection.match(/^###\s*(?:问题\s*)?\d*/gm) || []).length || 1;
    const evidenceRatio = evidenceCount / problemCount;
    scores.evidence = Math.min(20, Math.round(evidenceRatio * 20));
    if (evidenceCount === 0) {
      suggestions.push('典型问题缺少原话证据，建议添加具体对话片段');
    } else if (evidenceRatio < 0.5) {
      suggestions.push('部分问题缺少原话证据，建议补充');
    }
  } else {
    scores.evidence = 0;
    suggestions.push('缺少典型问题板块');
  }

  // 3. 行动项可执行性（检查改进计划是否有具体行动项）
  const actionSection = extractSectionContent(content, [/板块8/, /改进计划/, /行动项/]);
  if (actionSection) {
    const tableRows = (actionSection.match(/^\|.*\|$/gm) || []).filter(l => !l.match(/^\|[-:| ]+\|$/)).length;
    const listItems = (actionSection.match(/^(?:\d+\.\s+|[-*]\s+)/gm) || []).length;
    const totalActions = tableRows + listItems;
    scores.actionability = Math.min(20, totalActions * 4);
    if (totalActions === 0) {
      suggestions.push('改进计划缺少具体行动项，建议添加可执行的改进步骤');
    } else if (totalActions < 3) {
      suggestions.push('行动项较少，建议补充更多具体改进措施');
    }
  } else {
    scores.actionability = 0;
    suggestions.push('缺少改进计划板块');
  }

  // 4. 学习收获深度（检查是否有学习收获和掌握程度）
  const learningSection = extractSectionContent(content, [/本次学习收获/, /学习收获/]);
  if (learningSection) {
    const learningCount = (learningSection.match(/^\d+\.\s+/gm) || []).length;
    const masteryCount = (learningSection.match(/掌握程度/g) || []).length;
    const typeCount = (learningSection.match(/收获类型|类型[：:]/g) || []).length;
    scores.learningDepth = Math.min(20, learningCount * 3 + masteryCount * 2 + typeCount * 2);
    if (learningCount === 0) {
      suggestions.push('缺少学习收获，建议总结本次学到的新知识/技能');
    }
    if (masteryCount === 0 && learningCount > 0) {
      suggestions.push('学习收获缺少掌握程度评估，建议标注初步了解/基本掌握/熟练应用');
    }
  } else {
    scores.learningDepth = 0;
    suggestions.push('缺少学习收获板块');
  }

  // 5. 问题分析深度（检查问题是否有原因分析和改进建议）
  if (problemSection) {
    const causeCount = (problemSection.match(/原因分析/g) || []).length;
    const suggestionCount = (problemSection.match(/改进建议/g) || []).length;
    const severityCount = (problemSection.match(/严重度/g) || []).length;
    const wastedCount = (problemSection.match(/浪费轮次/g) || []).length;
    scores.problemDepth = Math.min(20, causeCount * 5 + suggestionCount * 5 + severityCount * 3 + wastedCount * 3);
    if (causeCount === 0) {
      suggestions.push('问题缺少原因分析，建议深挖根本原因');
    }
    if (suggestionCount === 0) {
      suggestions.push('问题缺少改进建议，建议给出具体改进方向');
    }
  }

  // 计算总分
  const totalScore = scores.completeness + scores.evidence + scores.actionability + scores.learningDepth + scores.problemDepth;

  // 质量等级
  let grade, gradeColor, gradeDesc;
  if (totalScore >= 90) {
    grade = 'A+'; gradeColor = '#10b981'; gradeDesc = '优秀复盘，内容完整、分析深入、行动具体';
  } else if (totalScore >= 80) {
    grade = 'A'; gradeColor = '#22c55e'; gradeDesc = '良好复盘，内容较完整，有一定分析深度';
  } else if (totalScore >= 70) {
    grade = 'B'; gradeColor = '#84cc16'; gradeDesc = '中等复盘，基本框架完整，部分维度可加强';
  } else if (totalScore >= 60) {
    grade = 'C'; gradeColor = '#f59e0b'; gradeDesc = '及格复盘，框架较简单，建议补充细节';
  } else if (totalScore >= 40) {
    grade = 'D'; gradeColor = '#f97316'; gradeDesc = '待改进，内容较简略，建议按模板完善';
  } else {
    grade = 'E'; gradeColor = '#ef4444'; gradeDesc = '需要重做，内容严重不足，建议重新生成';
  }

  return {
    totalScore,
    grade,
    gradeColor,
    gradeDesc,
    scores,
    suggestions,
    dimensions: [
      { name: '内容完整性', score: scores.completeness, max: 20, desc: '8个板块是否齐全' },
      { name: '证据充分性', score: scores.evidence, max: 20, desc: '典型问题是否有原话证据' },
      { name: '行动可执行性', score: scores.actionability, max: 20, desc: '改进计划是否有具体行动项' },
      { name: '学习深度', score: scores.learningDepth, max: 20, desc: '学习收获是否有深度和掌握程度' },
      { name: '问题分析深度', score: scores.problemDepth, max: 20, desc: '问题是否有原因分析和改进建议' }
    ]
  };
}

/**
 * 提取指定板块的内容
 */
function extractSectionContent(content, patterns) {
  const lines = content.split('\n');
  let startIdx = -1;
  let endIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (startIdx < 0) {
      if (patterns.some(p => p.test(line) && (line.startsWith('##') || line.startsWith('###')))) {
        startIdx = i;
      }
    } else {
      if (line.startsWith('## ') || line.startsWith('### ')) {
        // 检查是否是下一个板块
        const isNextSection = !patterns.some(p => p.test(line));
        if (isNextSection) {
          endIdx = i;
          break;
        }
      }
    }
  }

  if (startIdx < 0) return null;
  return lines.slice(startIdx, endIdx).join('\n');
}

/**
 * 批量评分所有复盘的质量
 * @returns {Object} 所有复盘的质量评分汇总
 */
function getAllReviewQualityScores() {
  // 使用缓存
  if (isCacheValid(scanCache.qualityScoresTimestamp) && scanCache.qualityScores) {
    return scanCache.qualityScores;
  }

  const scanResult = getAllReviewsCached();
  const reviews = scanResult.reviews || [];

  const scores = [];
  let totalScore = 0;
  const dimensionSums = { completeness: 0, evidence: 0, actionability: 0, learningDepth: 0, problemDepth: 0 };

  reviews.forEach(review => {
    try {
      const detail = getReviewDetail(review.path);
      if (!detail) return;
      const quality = scoreReviewQuality(detail);
      scores.push({
        path: review.path,
        title: review.title,
        date: review.date,
        ...quality
      });
      totalScore += quality.totalScore;
      Object.keys(dimensionSums).forEach(key => {
        dimensionSums[key] += quality.scores[key];
      });
    } catch (err) {
      console.warn(`[ObsidianScanner] 评分失败 ${review.path}:`, err.message);
    }
  });

  const count = scores.length;
  const avgScore = count > 0 ? Math.round(totalScore / count) : 0;
  const avgDimensions = {};
  Object.keys(dimensionSums).forEach(key => {
    avgDimensions[key] = count > 0 ? Math.round(dimensionSums[key] / count) : 0;
  });

  // 质量分布
  const distribution = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0 };
  scores.forEach(s => {
    if (distribution[s.grade] !== undefined) distribution[s.grade]++;
  });

  // 最需要改进的复盘（得分最低的3个）
  const needImprovement = [...scores]
    .sort((a, b) => a.totalScore - b.totalScore)
    .slice(0, 3);

  const result = {
    total: count,
    avgScore,
    avgDimensions,
    distribution,
    needImprovement,
    scores: scores.sort((a, b) => new Date(b.date) - new Date(a.date))
  };

  // 存储缓存
  scanCache.qualityScores = result;
  scanCache.qualityScoresTimestamp = Date.now();

  return result;
}

/**
 * 获取单个复盘的质量评分
 * @param {string} relPath - 复盘文件相对路径
 * @returns {Object} 评分结果
 */
function getReviewQuality(relPath) {
  const detail = getReviewDetail(relPath);
  if (!detail) return null;
  return scoreReviewQuality(detail);
}

// ========== 能力雷达图 ==========

/**
 * 六维度能力定义
 */
const ABILITY_DIMENSIONS = [
  { id: 'goal_clarity', name: '目标清晰度', desc: '是否明确表达需求和目标' },
  { id: 'context_provision', name: '上下文提供', desc: '是否提供足够背景信息、代码、错误信息' },
  { id: 'constraint_clarity', name: '约束明确度', desc: '是否明确技术栈、格式要求、边界条件' },
  { id: 'iteration_efficiency', name: '迭代效率', desc: '是否减少不必要的追问和返工' },
  { id: 'tool_utilization', name: '工具利用', desc: '是否充分利用AI的工具调用能力' },
  { id: 'result_verification', name: '结果验证', desc: '是否验证AI输出的正确性' }
];

/**
 * 从复盘内容中提取六维度能力评分
 * @param {string} content - 复盘文件正文
 * @returns {Object} 六维度评分
 */
function extractAbilityScores(content) {
  const scores = {};
  ABILITY_DIMENSIONS.forEach(dim => {
    scores[dim.id] = 0;
  });

  if (!content) return scores;

  // 方法1：按子标题分割，提取每个维度下的评分
  // 格式A: ### 3.1 目标清晰度：4分（评分在标题中）
  // 格式B: ### 3.1 目标清晰度\n- **评分：4分**（评分在正文中）
  const subSectionPattern = /###\s*3\.\d+\s*([^\n]+)\n([\s\S]*?)(?=###\s*3\.\d+|##\s+[^3]|$)/g;
  let subMatch;
  const subSections = [];
  while ((subMatch = subSectionPattern.exec(content)) !== null) {
    subSections.push({ title: subMatch[1].trim(), content: subMatch[2] });
  }

  if (subSections.length > 0) {
    ABILITY_DIMENSIONS.forEach(dim => {
      const matched = subSections.find(s =>
        s.title.includes(dim.name) ||
        dim.name.includes(s.title.replace(/[：:].*$/, '').trim())
      );
      if (matched) {
        // 格式A：评分在标题中，如 "目标清晰度：4分"
        const titleScoreMatch = matched.title.match(/[：:]\s*(\d+)/);
        if (titleScoreMatch) {
          const score = parseInt(titleScoreMatch[1]);
          if (score >= 1 && score <= 5) {
            scores[dim.id] = score;
            return;
          }
        }
        // 格式B：评分在正文中，如 "- **评分：4分**"
        const contentScoreMatch = matched.content.match(/评分[：:]\s*\*?\*?(\d+)/);
        if (contentScoreMatch) {
          const score = parseInt(contentScoreMatch[1]);
          if (score >= 1 && score <= 5) {
            scores[dim.id] = score;
          }
        }
      }
    });
  }

  // 方法2：直接匹配维度名+评分的格式（作为补充）
  ABILITY_DIMENSIONS.forEach(dim => {
    if (scores[dim.id] > 0) return;

    const patterns = [
      new RegExp(`${dim.name}[：:]\\s*(\\d+)(?:\\s*分)?`, 'i'),
      new RegExp(`\\*\\*${dim.name}\\*\\*[：:]?\\s*(\\d+)(?:\\s*分)?`, 'i'),
      new RegExp(`\\|\\s*${dim.name}\\s*\\|\\s*(\\d+)(?:\\s*分)?`, 'i'),
      new RegExp(`[-*]\\s*${dim.name}[：:]?\\s*(\\d+)(?:\\s*[/／]\\s*5)?`, 'i')
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const score = parseInt(match[1]);
        if (score >= 1 && score <= 5) {
          scores[dim.id] = score;
          break;
        }
      }
    }
  });

  return scores;
}

/**
 * 获取所有复盘的能力评分汇总（用于雷达图）
 * @returns {Object} 能力评分汇总
 */
function getAbilityRadarData() {
  // 使用缓存
  if (isCacheValid(scanCache.radarDataTimestamp) && scanCache.radarData) {
    return scanCache.radarData;
  }

  const scanResult = getAllReviewsCached();
  const reviews = scanResult.reviews || [];

  if (reviews.length === 0) {
    return {
      total: 0,
      dimensions: ABILITY_DIMENSIONS,
      average: ABILITY_DIMENSIONS.reduce((acc, d) => { acc[d.id] = 0; return acc; }, {}),
      history: [],
      trend: {}
    };
  }

  // 提取每个复盘的能力评分
  const history = [];
  const dimensionSums = ABILITY_DIMENSIONS.reduce((acc, d) => { acc[d.id] = 0; return acc; }, {});
  const dimensionCounts = ABILITY_DIMENSIONS.reduce((acc, d) => { acc[d.id] = 0; return acc; }, {});

  reviews.forEach(review => {
    try {
      const detail = getReviewDetail(review.path);
      if (!detail) return;
      const scores = extractAbilityScores(detail.content);
      const hasAnyScore = Object.values(scores).some(s => s > 0);

      if (hasAnyScore) {
        history.push({
          date: review.date,
          title: review.title,
          path: review.path,
          scores
        });

        Object.keys(scores).forEach(key => {
          if (scores[key] > 0) {
            dimensionSums[key] += scores[key];
            dimensionCounts[key]++;
          }
        });
      }
    } catch (err) {
      console.warn(`[ObsidianScanner] 提取能力评分失败 ${review.path}:`, err.message);
    }
  });

  // 计算平均分
  const average = {};
  ABILITY_DIMENSIONS.forEach(dim => {
    average[dim.id] = dimensionCounts[dim.id] > 0
      ? Math.round((dimensionSums[dim.id] / dimensionCounts[dim.id]) * 10) / 10
      : 0;
  });

  // 计算趋势（最近3次 vs 之前3次）
  const recent = history.slice(-3);
  const earlier = history.slice(0, -3);
  const trend = {};

  ABILITY_DIMENSIONS.forEach(dim => {
    const recentAvg = recent.length > 0
      ? recent.reduce((sum, h) => sum + (h.scores[dim.id] || 0), 0) / recent.length
      : 0;
    const earlierAvg = earlier.length > 0
      ? earlier.reduce((sum, h) => sum + (h.scores[dim.id] || 0), 0) / earlier.length
      : 0;
    const diff = Math.round((recentAvg - earlierAvg) * 10) / 10;
    trend[dim.id] = {
      recent: Math.round(recentAvg * 10) / 10,
      earlier: Math.round(earlierAvg * 10) / 10,
      diff,
      direction: diff > 0.1 ? 'up' : diff < -0.1 ? 'down' : 'stable'
    };
  });

  // 总体平均分
  const totalAvg = Math.round(
    (Object.values(average).reduce((sum, s) => sum + s, 0) / ABILITY_DIMENSIONS.length) * 10
  ) / 10;

  const result = {
    total: history.length,
    totalReviews: reviews.length,
    dimensions: ABILITY_DIMENSIONS,
    average,
    totalAvg,
    history,
    trend
  };

  // 存储缓存
  scanCache.radarData = result;
  scanCache.radarDataTimestamp = Date.now();

  return result;
}

// ========== AI生成月度成长报告 ==========

/**
 * 获取指定月份的复盘数据汇总
 * @param {string} yearMonth - 年月，格式 YYYY-MM
 * @returns {Object} 月度数据汇总
 */
function getMonthlyData(yearMonth) {
  const result = scanReviews({ page: 1, pageSize: 1000, sortBy: 'date', sortOrder: 'asc' });
  const reviews = result.reviews || [];

  // 筛选指定月份的复盘
  const monthlyReviews = reviews.filter(r => r.date && r.date.startsWith(yearMonth));

  if (monthlyReviews.length === 0) {
    return {
      yearMonth,
      total: 0,
      message: `${yearMonth} 没有复盘记录`
    };
  }

  // 统计
  const stats = calculateStats(monthlyReviews);

  // 提取所有问题、学习收获、行动项
  const allProblems = [];
  const allLearnings = [];
  const allActionItems = [];

  monthlyReviews.forEach(review => {
    try {
      const detail = getReviewDetail(review.path);
      if (!detail) return;

      const problems = extractProblemsFromContent(detail.content);
      problems.forEach(p => {
        p.reviewDate = review.date;
        p.reviewTitle = review.title;
        allProblems.push(p);
      });

      const learnings = extractLearningsFromContent(detail.content);
      learnings.forEach(l => {
        l.reviewDate = review.date;
        l.reviewTitle = review.title;
        allLearnings.push(l);
      });

      const actions = extractActionItemsFromContent(detail.content);
      actions.forEach(a => {
        a.reviewDate = review.date;
        a.reviewTitle = review.title;
        allActionItems.push(a);
      });
    } catch (err) {
      console.warn(`[ObsidianScanner] 提取月度数据失败 ${review.path}:`, err.message);
    }
  });

  // 问题模式统计
  const patternStats = {};
  allProblems.forEach(p => {
    const patterns = matchProblemPattern(p);
    patterns.forEach(matched => {
      if (!patternStats[matched.id]) {
        patternStats[matched.id] = { name: matched.name, count: 0, wastedTurns: 0 };
      }
      patternStats[matched.id].count++;
      patternStats[matched.id].wastedTurns += p.wastedTurns || 0;
    });
  });

  // 能力评分趋势
  const abilityTrend = monthlyReviews.map(review => {
    try {
      const detail = getReviewDetail(review.path);
      if (!detail) return null;
      const scores = extractAbilityScores(detail.content);
      const hasScore = Object.values(scores).some(s => s > 0);
      if (!hasScore) return null;
      const avg = Math.round((Object.values(scores).reduce((a, b) => a + b, 0) / 6) * 10) / 10;
      return { date: review.date, title: review.title, scores, avg };
    } catch (err) {
      return null;
    }
  }).filter(Boolean);

  return {
    yearMonth,
    total: monthlyReviews.length,
    stats,
    reviews: monthlyReviews.map(r => ({
      date: r.date,
      title: r.title,
      score: r.average_score,
      problems: r.total_problems,
      goodPractices: r.total_good_practices,
      prompts: r.total_prompts,
      source: r.source
    })),
    problems: allProblems,
    learnings: allLearnings,
    actionItems: allActionItems,
    patternStats: Object.entries(patternStats)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([id, data]) => ({ id, ...data })),
    abilityTrend
  };
}

/**
 * AI生成月度成长报告
 * @param {string} yearMonth - 年月，格式 YYYY-MM
 * @returns {Promise<Object>} 生成的报告
 */
async function generateMonthlyReport(yearMonth) {
  const monthlyData = getMonthlyData(yearMonth);

  if (monthlyData.total === 0) {
    return {
      success: false,
      error: `${yearMonth} 没有复盘记录，无法生成报告`
    };
  }

  try {
    const aiClient = require('../../core/ai/client');

    // 构建输入数据（精简版，避免token过多）
    const inputData = {
      月份: yearMonth,
      复盘数量: monthlyData.total,
      平均评分: monthlyData.stats.avgScore,
      总问题数: monthlyData.stats.totalProblems,
      好做法数: monthlyData.stats.totalGoodPractices,
      可复用Prompt数: monthlyData.stats.totalPrompts,
      完成率: monthlyData.stats.completionRate + '%',
      问题模式TOP3: monthlyData.patternStats.slice(0, 3).map(p => ({
        模式: p.name,
        出现次数: p.count,
        浪费轮次: p.wastedTurns
      })),
      学习收获TOP5: monthlyData.learnings.slice(0, 5).map(l => ({
        标题: l.title,
        类型: l.type,
        掌握程度: l.mastery
      })),
      行动项TOP5: monthlyData.actionItems.slice(0, 5).map(a => ({
        优先级: a.priority,
        行动: a.action.substring(0, 100)
      })),
      能力评分趋势: monthlyData.abilityTrend.map(t => ({
        日期: t.date,
        平均分: t.avg
      }))
    };

    const systemPrompt = `你是一个专业的AI能力成长教练。根据用户提供的月度复盘数据，生成一份结构化的月度成长报告。

报告要求：
1. 语言风格：客观、专业、鼓励性，避免空洞的套话
2. 基于数据说话，每个结论都要有数据支撑
3. 重点突出能力成长和改进方向

报告结构（严格按照以下格式输出Markdown）：

## 📊 本月概览
- 用2-3句话总结本月整体表现
- 包含关键数据（复盘数、平均分、问题数等）

## 📈 能力成长分析
- 分析能力评分趋势（如果有数据）
- 指出进步最大的方面
- 指出需要加强的方面

## ⚠️ 主要问题与挑战
- 列出TOP3问题模式
- 分析每个问题的根本原因
- 给出具体的改进建议

## ✅ 亮点与收获
- 总结本月做得好的地方
- 列出重要的学习收获
- 可复用的经验

## 🎯 下月改进计划
- 3-5个具体的、可执行的改进目标
- 每个目标有明确的衡量标准
- 优先级排序

直接输出Markdown格式的报告，不要额外解释。`;

    const userMessage = `月度复盘数据：
${JSON.stringify(inputData, null, 2)}

请根据以上数据生成月度成长报告。`;

    const reportContent = await aiClient.chatByTask([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ], 'improvement_plan');

    return {
      success: true,
      yearMonth,
      content: reportContent,
      data: monthlyData,
      generatedAt: new Date().toISOString()
    };
  } catch (err) {
    console.error('[ObsidianScanner] 生成月度报告失败:', err.message);
    return {
      success: false,
      error: `AI生成失败: ${err.message}`,
      data: monthlyData
    };
  }
}

module.exports = {
  getReviewDir,
  scanReviews,
  getAllReviewsCached,
  invalidateCache,
  getReviewDetail,
  generateSummaryReport,
  calculateStats,
  extractActionItemsFromContent,
  getAllActionItems,
  updateActionItemStatus,
  getTodayActionItems,
  createCustomActionItem,
  deleteCustomActionItem,
  extractProblemsFromContent,
  analyzePatterns,
  getPatternTrends,
  getRepeatedPatterns,
  extractLearningsFromContent,
  getAllLearnings,
  getAllLearningsWithReview,
  getTodayLearningReviews,
  markLearningReviewed,
  resetLearningReview,
  EBBINGHAUS_INTERVALS,
  scoreReviewQuality,
  getAllReviewQualityScores,
  getReviewQuality,
  ABILITY_DIMENSIONS,
  extractAbilityScores,
  getAbilityRadarData,
  getMonthlyData,
  generateMonthlyReport,
  getAllProjects,
  getProjectDetail
};
