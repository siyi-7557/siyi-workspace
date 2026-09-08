const express = require('express');
const router = express.Router();
const db = require('../../core/db');

// ============================================================
//  统计概览模块
//  路由前缀：/api/stats  (由 routePathMap 映射)
// ============================================================

// 获取统计概览
router.get('/overview', (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // 今日活动数
    const todayActivity = db.queryOne(
      'SELECT COUNT(*) as count FROM activity_log WHERE date = ?', [today]
    );

    // 总 Prompt 数
    const totalPrompts = db.queryOne(
      'SELECT COUNT(*) as count FROM prompts'
    );

    // 总复盘数
    const totalReviews = db.queryOne(
      'SELECT COUNT(*) as count FROM reviews'
    );

    // 总活动记录数
    const totalActivities = db.queryOne(
      'SELECT COUNT(*) as count FROM activity_log'
    );

    // 最近7天活动趋势
    const weeklyTrend = db.query(
      `SELECT date, COUNT(*) as count FROM activity_log
       WHERE date >= date('now', '-7 days')
       GROUP BY date ORDER BY date`
    );

    // 各类型活动分布
    const typeDistribution = db.query(
      'SELECT type, COUNT(*) as count FROM activity_log GROUP BY type ORDER BY count DESC'
    );

    res.json({
      todayActivities: todayActivity?.count || 0,
      totalPrompts: totalPrompts?.count || 0,
      totalReviews: totalReviews?.count || 0,
      totalActivities: totalActivities?.count || 0,
      weeklyTrend: weeklyTrend || [],
      typeDistribution: typeDistribution || [],
    });
  } catch (err) {
    console.error('[Dashboard] 获取概览失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 获取活动热力图数据（一年中每天的活跃度）
router.get('/heatmap', (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const rows = db.query(
      `SELECT date, COUNT(*) as count FROM activity_log
       WHERE date >= ? AND date <= ?
       GROUP BY date ORDER BY date`,
      [startDate, endDate]
    );

    // 补全全年所有日期，缺的日期填 count=0
    const start = new Date(startDate);
    const end = new Date(endDate);
    const heatmap = [];
    const dataMap = {};
    for (const r of rows) {
      dataMap[r.date] = r.count;
    }

    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().slice(0, 10);
      heatmap.push({
        date: dateStr,
        count: dataMap[dateStr] || 0,
      });
      current.setDate(current.getDate() + 1);
    }

    res.json({ year, heatmap });
  } catch (err) {
    console.error('[Dashboard] 获取热力图失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 获取趋势数据（最近N天各类活动分布）
router.get('/trend', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().slice(0, 10);

    const rows = db.query(
      `SELECT date, type, COUNT(*) as count FROM activity_log
       WHERE date >= ?
       GROUP BY date, type ORDER BY date`,
      [startStr]
    );

    // 按日期分组
    const trendMap = {};
    for (const r of rows) {
      if (!trendMap[r.date]) {
        trendMap[r.date] = { date: r.date, total: 0 };
      }
      trendMap[r.date][r.type] = r.count;
      trendMap[r.date].total += r.count;
    }

    // 获取所有活动类型作为系列
    const types = [...new Set(rows.map(r => r.type))];

    // 补全缺失日期
    const trend = [];
    const current = new Date(startStr);
    const end = new Date();
    while (current <= end) {
      const dateStr = current.toISOString().slice(0, 10);
      const entry = trendMap[dateStr] || { date: dateStr, total: 0 };
      for (const t of types) {
        if (entry[t] === undefined) entry[t] = 0;
      }
      trend.push(entry);
      current.setDate(current.getDate() + 1);
    }

    res.json({ days, trend, types });
  } catch (err) {
    console.error('[Dashboard] 获取趋势失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 获取最近活动列表
router.get('/recent', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const rows = db.query(
      'SELECT * FROM activity_log ORDER BY id DESC LIMIT ?',
      [limit]
    );
    res.json({ activities: rows, total: rows.length });
  } catch (err) {
    console.error('[Dashboard] 获取最近活动失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 记录活动
router.post('/log', (req, res) => {
  try {
    const { date, type, detail, duration } = req.body;
    if (!type) return res.status(400).json({ error: '活动类型必填' });

    const logDate = date || new Date().toISOString().slice(0, 10);
    const result = db.execute(
      'INSERT INTO activity_log (date, type, detail, duration) VALUES (?, ?, ?, ?)',
      [logDate, type, detail || '', duration || null]
    );
    res.status(201).json({
      id: result.lastInsertRowid,
      message: '活动已记录',
    });
  } catch (err) {
    console.error('[Dashboard] 记录活动失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;