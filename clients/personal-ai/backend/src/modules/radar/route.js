/**
 * Information Radar API 路由
 * 
 * 信息雷达的所有 API 端点。
 * 前端只负责展示和交互，不直接处理抓取、AI分析或知识库逻辑。
 */

const express = require('express');
const router = express.Router();

let radarService = null;

/**
 * 初始化路由（注入服务实例）
 */
function init(service) {
  radarService = service;
}

// ========== 信息查询 ==========

/**
 * GET /api/radar/items
 * 获取信息列表（支持筛选、分页、排序）
 * Query: status, category, source, isRead, isSaved, sortBy, page, pageSize
 */
router.get('/items', (req, res) => {
  try {
    const options = {
      status: req.query.status,
      category: req.query.category,
      source: req.query.source,
      isRead: req.query.isRead !== undefined ? req.query.isRead === 'true' : undefined,
      isSaved: req.query.isSaved !== undefined ? req.query.isSaved === 'true' : undefined,
      sortBy: req.query.sortBy || 'relevance',
      page: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.pageSize) || 20,
    };
    const result = radarService.getItems(options);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Radar API] 获取信息列表失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/radar/partitioned
 * 获取分区信息（今日值得看、与你有关、正在关注、已保存）
 */
router.get('/partitioned', async (req, res) => {
  try {
    const partitions = await radarService.getPartitionedItems();
    res.json({ success: true, partitions });
  } catch (err) {
    console.error('[Radar API] 获取分区信息失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/radar/items/:id
 * 获取单条信息详情
 */
/**
 * GET /api/radar/status
 * 采集调度运行状态（是否采集中、上次采集时间与结果、各源状态）
 */
router.get('/status', (req, res) => {
  try {
    res.json({ success: true, status: radarService.getStatus() });
  } catch (err) {
    console.error('[Radar API] 获取运行状态失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/items/:id', (req, res) => {
  try {
    const item = radarService.getItem(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: '信息项不存在' });
    }
    res.json({ success: true, item });
  } catch (err) {
    console.error('[Radar API] 获取信息详情失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== 用户操作 ==========

/**
 * POST /api/radar/items/:id/read
 * 标记已读
 */
router.post('/items/:id/read', async (req, res) => {
  try {
    const item = await radarService.markAsRead(req.params.id);
    res.json({ success: true, item });
  } catch (err) {
    console.error('[Radar API] 标记已读失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/radar/items/:id/save
 * 保存到知识库候选（含用户备注）
 * Body: { userNote?: string }
 */
router.post('/items/:id/save', async (req, res) => {
  try {
    const { userNote = '' } = req.body;
    const item = await radarService.saveToKnowledge(req.params.id, userNote);
    res.json({ success: true, item, message: '已保存到知识库候选，待确认后进入知识库' });
  } catch (err) {
    console.error('[Radar API] 保存到知识库失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/radar/items/:id/later
 * 稍后阅读
 */
router.post('/items/:id/later', async (req, res) => {
  try {
    const item = await radarService.markAsLater(req.params.id);
    res.json({ success: true, item });
  } catch (err) {
    console.error('[Radar API] 稍后阅读失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/radar/items/:id/ignore
 * 忽略此类信息（记录偏好信号）
 */
router.post('/items/:id/ignore', async (req, res) => {
  try {
    const item = await radarService.ignoreItem(req.params.id);
    res.json({ success: true, item, message: '已忽略，未来将减少此类信息推荐' });
  } catch (err) {
    console.error('[Radar API] 忽略信息失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/radar/items/:id/why
 * 获取"为什么推荐给我"
 */
router.get('/items/:id/why', async (req, res) => {
  try {
    const why = await radarService.getWhyRecommended(req.params.id);
    res.json({ success: true, ...why });
  } catch (err) {
    console.error('[Radar API] 获取推荐理由失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== 采集 ==========

/**
 * POST /api/radar/collect
 * 手动触发采集
 * Body: { sourceId?: number, force?: boolean }
 */
router.post('/collect', async (req, res) => {
  try {
    const { sourceId, force } = req.body || {};
    // 异步执行采集，立即返回
    res.json({ success: true, message: '采集已触发，请稍候刷新查看结果' });
    
    // 后台执行采集
    radarService.collect({ sourceId, force }).then(result => {
      console.log(`[Radar API] 采集完成: 新增 ${result.newItems} 条`);
    }).catch(err => {
      console.error('[Radar API] 采集失败:', err.message);
    });
  } catch (err) {
    console.error('[Radar API] 触发采集失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== 信息源管理 ==========

/**
 * GET /api/radar/sources
 * 获取信息源列表
 */
router.get('/sources', (req, res) => {
  try {
    const sources = radarService.getSources();
    res.json({ success: true, sources });
  } catch (err) {
    console.error('[Radar API] 获取信息源失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/radar/sources
 * 添加信息源
 * Body: { name, type, url, category?, enabled? }
 */
router.post('/sources', (req, res) => {
  try {
    const { name, type, url, category, enabled } = req.body;
    if (!name || !type || !url) {
      return res.status(400).json({ success: false, error: 'name, type, url 必填' });
    }
    const id = radarService.addSource({ name, type, url, category, enabled });
    res.json({ success: true, id, message: '信息源已添加' });
  } catch (err) {
    console.error('[Radar API] 添加信息源失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/radar/sources/:id
 * 更新信息源
 */
router.put('/sources/:id', (req, res) => {
  try {
    radarService.updateSource(parseInt(req.params.id), req.body);
    res.json({ success: true, message: '信息源已更新' });
  } catch (err) {
    console.error('[Radar API] 更新信息源失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/radar/sources/:id
 * 删除信息源
 */
router.delete('/sources/:id', (req, res) => {
  try {
    radarService.deleteSource(parseInt(req.params.id));
    res.json({ success: true, message: '信息源已删除' });
  } catch (err) {
    console.error('[Radar API] 删除信息源失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/radar/sources/:id/test
 * 测试信息源连通性（不入库）
 */
router.post('/sources/:id/test', async (req, res) => {
  try {
    const result = await radarService.testSource(parseInt(req.params.id));
    res.json({ success: true, ...result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ========== 偏好配置 ==========

/**
 * GET /api/radar/preferences
 * 获取用户关注配置
 */
router.get('/preferences', (req, res) => {
  try {
    const preferences = radarService.getPreferences();
    res.json({ success: true, preferences });
  } catch (err) {
    console.error('[Radar API] 获取偏好失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/radar/preferences
 * 更新用户关注配置
 * Body: { topics?, keywords?, projects?, techDirections?, categories?, sources? }
 */
router.post('/preferences', (req, res) => {
  try {
    const preferences = radarService.updatePreferences(req.body);
    res.json({ success: true, preferences, message: '偏好已更新' });
  } catch (err) {
    console.error('[Radar API] 更新偏好失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ========== 搜索 ==========

router.get('/search', (req, res) => {
  try {
    const q = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const result = radarService.searchItems(q, { page, pageSize });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Radar API] 搜索失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== 知识库候选 ==========

router.get('/saved-items', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const status = req.query.status || 'pending';
    const result = radarService.getSavedItems({ page, pageSize, status });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Radar API] 获取候选列表失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 说明：保存信息即直接 approved 进入知识库（见 feedback-service.saveToKnowledge），
// 不再需要二次审核队列，approve/reject 接口已移除。

module.exports = { router, init };