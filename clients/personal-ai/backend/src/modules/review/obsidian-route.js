/**
 * Obsidian AI复盘 API 路由
 * 扫描Obsidian中的AI复盘文档，展示列表/详情/统计/汇总
 */
const express = require('express');
const router = express.Router();

// 扫描Obsidian中的AI复盘文档列表
router.get('/obsidian/reviews', (req, res) => {
  try {
    const { page = 1, pageSize = 20, sortBy = 'date', sortOrder = 'desc' } = req.query;
    const obsidianScanner = require('./obsidian-scanner');
    const result = obsidianScanner.scanReviews({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      sortBy,
      sortOrder
    });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ObsidianReview] 扫描失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取单个Obsidian复盘详情
router.get('/obsidian/reviews/*', (req, res) => {
  try {
    const relPath = req.params[0];
    if (!relPath) {
      return res.status(400).json({ success: false, error: '缺少文件路径' });
    }
    const obsidianScanner = require('./obsidian-scanner');
    const detail = obsidianScanner.getReviewDetail(relPath);
    if (!detail) {
      return res.status(404).json({ success: false, error: '复盘文件不存在' });
    }
    res.json({ success: true, ...detail });
  } catch (err) {
    console.error('[ObsidianReview] 获取详情失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取Obsidian复盘统计
router.get('/obsidian/stats', (req, res) => {
  try {
    const obsidianScanner = require('./obsidian-scanner');
    const { days: daysQ } = req.query;
    const days = Number(daysQ) > 0 ? Number(daysQ) : null;
    const result = obsidianScanner.computeStatsForRange(days);
    res.json({ success: true, stats: result.stats, total: result.total });
  } catch (err) {
    console.error('[ObsidianReview] 获取统计失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 生成Obsidian复盘汇总报告
router.get('/obsidian/summary', (req, res) => {
  try {
    const { period = 'month', startDate, endDate } = req.query;
    const obsidianScanner = require('./obsidian-scanner');
    const report = obsidianScanner.generateSummaryReport(period, startDate, endDate);
    res.json({ success: true, ...report });
  } catch (err) {
    console.error('[ObsidianReview] 生成汇总失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== 行动项提取与追踪 ==========

// 获取所有复盘的行动项汇总
router.get('/obsidian/action-items', (req, res) => {
  try {
    const { priority, status, sortBy = 'priority' } = req.query;
    const obsidianScanner = require('./obsidian-scanner');
    const result = obsidianScanner.getAllActionItems({ priority, status, sortBy });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ObsidianReview] 获取行动项失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新行动项状态
router.post('/obsidian/action-items/update', (req, res) => {
  try {
    const { id, status, note, dueDate } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, error: '缺少行动项ID' });
    }
    if (!['pending', 'done', 'ignored'].includes(status)) {
      return res.status(400).json({ success: false, error: '无效的状态值，必须是 pending/done/ignored' });
    }
    const obsidianScanner = require('./obsidian-scanner');
    const success = obsidianScanner.updateActionItemStatus(id, status, note || '', dueDate !== undefined ? dueDate : null);
    if (success) {
      res.json({ success: true, message: '状态已更新' });
    } else {
      res.status(500).json({ success: false, error: '保存状态失败' });
    }
  } catch (err) {
    console.error('[ObsidianReview] 更新行动项状态失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 创建手动行动项
router.post('/obsidian/action-items/create', (req, res) => {
  try {
    const { action, priority, type, dueDate, note } = req.body;
    const obsidianScanner = require('./obsidian-scanner');
    const result = obsidianScanner.createActionItem({ action, priority, type, dueDate, note });
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('[ObsidianReview] 创建行动项失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除手动行动项
router.delete('/obsidian/action-items/:id', (req, res) => {
  try {
    const { id } = req.params;
    const obsidianScanner = require('./obsidian-scanner');
    const success = obsidianScanner.deleteActionItem(id);
    if (!success) {
      return res.status(404).json({ success: false, error: '行动项不存在或无法删除' });
    }
    res.json({ success: true, message: '已删除' });
  } catch (err) {
    console.error('[ObsidianReview] 删除行动项失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取今日待办行动项
router.get('/obsidian/action-items/today', (req, res) => {
  try {
    const obsidianScanner = require('./obsidian-scanner');
    const result = obsidianScanner.getTodayActionItems();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ObsidianReview] 获取今日待办失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== 跨会话模式识别 ==========

// 获取跨会话问题模式分析
router.get('/obsidian/patterns', (req, res) => {
  try {
    const obsidianScanner = require('./obsidian-scanner');
    const { days: daysQ } = req.query;
    const days = Number(daysQ) > 0 ? Number(daysQ) : null;
    const result = obsidianScanner.analyzePatterns(days);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ObsidianReview] 模式分析失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取问题模式趋势数据
router.get('/obsidian/patterns/trends', (req, res) => {
  try {
    const obsidianScanner = require('./obsidian-scanner');
    const result = obsidianScanner.getPatternTrends();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ObsidianReview] 获取趋势数据失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取反复出现的问题模式预警
router.get('/obsidian/patterns/warnings', (req, res) => {
  try {
    const obsidianScanner = require('./obsidian-scanner');
    const result = obsidianScanner.getRepeatedPatterns();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ObsidianReview] 获取预警数据失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取跨会话好做法排行
router.get('/obsidian/practices', (req, res) => {
  try {
    const obsidianScanner = require('./obsidian-scanner');
    const { days: daysQ } = req.query;
    const days = Number(daysQ) > 0 ? Number(daysQ) : null;
    const result = obsidianScanner.analyzeGoodPractices(days);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ObsidianReview] 获取好做法排行失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== 学习收获知识库 ==========

// 获取所有复盘的学习收获
router.get('/obsidian/learnings', (req, res) => {
  try {
    const { type, mastery } = req.query;
    const obsidianScanner = require('./obsidian-scanner');
    const result = obsidianScanner.getAllLearnings({ type, mastery });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ObsidianReview] 获取学习收获失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== 学习收获艾宾浩斯复习提醒 ==========

// 获取所有学习收获（含复习状态）
router.get('/obsidian/learnings/review', (req, res) => {
  try {
    const { type, mastery, reviewStatus } = req.query;
    const obsidianScanner = require('./obsidian-scanner');
    const result = obsidianScanner.getAllLearningsWithReview({ type, mastery, reviewStatus });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ObsidianReview] 获取学习收获复习状态失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取今日待复习的学习收获
router.get('/obsidian/learnings/review/today', (req, res) => {
  try {
    const obsidianScanner = require('./obsidian-scanner');
    const result = obsidianScanner.getTodayLearningReviews();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ObsidianReview] 获取今日待复习失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 标记学习收获已复习
router.post('/obsidian/learnings/review/mark', (req, res) => {
  try {
    const { id, quality, note } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, error: '缺少学习收获ID' });
    }
    if (quality && !['good', 'medium', 'hard'].includes(quality)) {
      return res.status(400).json({ success: false, error: '无效的复习质量，必须是 good/medium/hard' });
    }
    const obsidianScanner = require('./obsidian-scanner');
    const success = obsidianScanner.markLearningReviewed(id, quality || 'good', note || '');
    if (success) {
      res.json({ success: true, message: '已标记复习' });
    } else {
      res.status(500).json({ success: false, error: '保存失败' });
    }
  } catch (err) {
    console.error('[ObsidianReview] 标记复习失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 重置学习收获复习状态
router.post('/obsidian/learnings/review/reset', (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, error: '缺少学习收获ID' });
    }
    const obsidianScanner = require('./obsidian-scanner');
    const success = obsidianScanner.resetLearningReview(id);
    if (success) {
      res.json({ success: true, message: '已重置复习状态' });
    } else {
      res.status(500).json({ success: false, error: '重置失败' });
    }
  } catch (err) {
    console.error('[ObsidianReview] 重置复习状态失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== 复盘质量自动评分 ==========

// 获取所有复盘的质量评分汇总
router.get('/obsidian/quality', (req, res) => {
  try {
    const obsidianScanner = require('./obsidian-scanner');
    const result = obsidianScanner.getAllReviewQualityScores();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ObsidianReview] 获取质量评分失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取单个复盘的质量评分
router.get('/obsidian/quality/*', (req, res) => {
  try {
    const relPath = req.params[0];
    if (!relPath) {
      return res.status(400).json({ success: false, error: '缺少文件路径' });
    }
    const obsidianScanner = require('./obsidian-scanner');
    const result = obsidianScanner.getReviewQuality(relPath);
    if (!result) {
      return res.status(404).json({ success: false, error: '复盘文件不存在' });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ObsidianReview] 获取单个质量评分失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== 能力雷达图 ==========

// 获取能力雷达图数据
router.get('/obsidian/ability-radar', (req, res) => {
  try {
    const obsidianScanner = require('./obsidian-scanner');
    const result = obsidianScanner.getAbilityRadarData();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ObsidianReview] 获取能力雷达图失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== AI生成月度成长报告 ==========

// 获取指定月份的复盘数据
router.get('/obsidian/monthly/data', (req, res) => {
  try {
    const { month } = req.query;
    if (!month) {
      return res.status(400).json({ success: false, error: '缺少月份参数，格式 YYYY-MM' });
    }
    const obsidianScanner = require('./obsidian-scanner');
    const result = obsidianScanner.getMonthlyData(month);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ObsidianReview] 获取月度数据失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// AI生成月度成长报告
router.post('/obsidian/monthly/generate', async (req, res) => {
  try {
    const { month } = req.body;
    if (!month) {
      return res.status(400).json({ success: false, error: '缺少月份参数，格式 YYYY-MM' });
    }
    const obsidianScanner = require('./obsidian-scanner');
    const result = await obsidianScanner.generateMonthlyReport(month);
    res.json(result);
  } catch (err) {
    console.error('[ObsidianReview] 生成月度报告失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== 项目聚合视图 ==========

// 获取所有项目聚合列表
router.get('/obsidian/projects', (req, res) => {
  try {
    const obsidianScanner = require('./obsidian-scanner');
    const result = obsidianScanner.getAllProjects();
    res.json(result);
  } catch (err) {
    console.error('[ObsidianReview] 获取项目列表失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取某个项目的详细信息
router.get('/obsidian/projects/:projectName', (req, res) => {
  try {
    const { projectName } = req.params;
    if (!projectName) {
      return res.status(400).json({ success: false, error: '缺少项目名' });
    }
    const obsidianScanner = require('./obsidian-scanner');
    const result = obsidianScanner.getProjectDetail(decodeURIComponent(projectName));
    res.json(result);
  } catch (err) {
    console.error('[ObsidianReview] 获取项目详情失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 生成周期报告（周/月/季/年）- AI 生成总结报告
 * POST /obsidian/report/generate
 * Body: { period: 'week' | 'month' | 'quarter' | 'year' }
 */
router.post('/obsidian/report/generate', async (req, res) => {
  try {
    const { period = 'month', startDate, endDate } = req.body;
    const validPeriods = ['week', 'month', 'quarter', 'year', 'custom'];
    if (period && !validPeriods.includes(period)) {
      return res.status(400).json({ error: '无效的周期，可选: week/month/quarter/year/custom' });
    }
    // 若提供了自定义日期范围，则校验其格式；两者可二选一或同时使用
    if ((startDate && !endDate) || (!startDate && endDate)) {
      return res.status(400).json({ error: 'startDate 和 endDate 需成对提供' });
    }
    if (startDate && isNaN(new Date(startDate).getTime())) {
      return res.status(400).json({ error: '无效的日期格式，请使用 YYYY-MM-DD' });
    }
    const obsidianScanner = require('./obsidian-scanner');
    const result = await obsidianScanner.generatePeriodReport(period, startDate, endDate);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('[Obsidian] 生成周期报告失败:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 获取报告列表
 * GET /obsidian/report/list?limit=50
 */
router.get('/obsidian/report/list', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const obsidianScanner = require('./obsidian-scanner');
    const reports = obsidianScanner.getReportList(parseInt(limit));
    res.json({ reports, total: reports.length });
  } catch (err) {
    console.error('[Obsidian] 获取报告列表失败:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 获取报告详情
 * GET /obsidian/report/:id
 */
router.get('/obsidian/report/:id', (req, res) => {
  try {
    const { id } = req.params;
    const obsidianScanner = require('./obsidian-scanner');
    const report = obsidianScanner.getReportDetail(parseInt(id));
    if (!report) {
      return res.status(404).json({ error: '报告不存在' });
    }
    res.json(report);
  } catch (err) {
    console.error('[Obsidian] 获取报告详情失败:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /obsidian/report/:id
 * 删除周期报告
 */
router.delete('/obsidian/report/:id', (req, res) => {
  try {
    const { id } = req.params;
    const obsidianScanner = require('./obsidian-scanner');
    const success = obsidianScanner.deleteReport(parseInt(id));
    res.json({ success });
  } catch (err) {
    console.error('[Obsidian] 删除报告失败:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;