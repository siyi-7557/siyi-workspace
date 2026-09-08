/**
 * Website Admin API 路由
 * 访客洞察 · 会话管理 · 同步 · 洞察生成
 * 修复：云端 pull 同步、复盘写入 schema 匹配、5分钟自动同步
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');
const db = require('../../core/db');
const websiteDb = require('./db');

// 云端 API 请求辅助（使用原生 https 替代 fetch，避免 Node v22 下 undici 间歇性原生崩溃）
function cloudRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 30000,
      // 禁用 keep-alive 连接池复用，避免复用过期 TLS 连接引发偶发底层错误
      agent: false,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { /* 非JSON响应 */ }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('云端请求超时')); });
    req.end();
  });
}

// 初始化数据库表
websiteDb.init();

// 旧版会话数据文件路径（兼容导入）
const LEGACY_SESSIONS_PATH = process.env.LEGACY_SESSIONS_PATH || '';

// 云端 API 配置
function getCloudConfig() {
  const row = db.queryOne('SELECT cloud_api_base_url, cloud_api_key FROM website_sync_status WHERE id = 1');
  return {
    baseUrl: process.env.CLOUD_API_BASE_URL || row?.cloud_api_base_url || '',
    password: process.env.CLOUD_ADMIN_PASSWORD || row?.cloud_api_key || process.env.ADMIN_PASSWORD || '',
  };
}

// ========== 统计数据 ==========

router.get('/stats', (req, res) => {
  try {
    const totalSessions = db.queryOne('SELECT COUNT(*) as cnt FROM website_sessions').cnt;
    const totalMessages = db.queryOne('SELECT COUNT(*) as cnt FROM website_messages').cnt;
    const userMessages = db.queryOne("SELECT COUNT(*) as cnt FROM website_messages WHERE role = 'user'").cnt;
    const aiMessages = db.queryOne("SELECT COUNT(*) as cnt FROM website_messages WHERE role = 'assistant'").cnt;

    res.json({
      totalSessions,
      totalMessages,
      userMessages,
      aiMessages,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Website Admin] 获取统计失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== 会话列表 ==========

router.get('/sessions', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;

    const total = db.queryOne('SELECT COUNT(*) as cnt FROM website_sessions').cnt;
    const sessions = db.query(
      `SELECT session_id, source, created_at, updated_at, message_count, first_question, is_only_preset
       FROM website_sessions
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );

    res.json({
      total,
      page,
      pageSize,
      sessions: sessions.map(s => ({
        session_id: s.session_id,
        source: s.source,
        created_at: s.created_at,
        updated_at: s.updated_at,
        message_count: s.message_count,
        first_question: s.first_question,
        is_only_preset: s.is_only_preset === 1,
      })),
    });
  } catch (err) {
    console.error('[Website Admin] 获取会话列表失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== 会话详情 ==========

router.get('/sessions/:id', (req, res) => {
  try {
    const sessionId = req.params.id;
    const session = db.queryOne('SELECT * FROM website_sessions WHERE session_id = ?', [sessionId]);
    if (!session) {
      return res.status(404).json({ error: '会话不存在' });
    }

    const messages = db.query(
      'SELECT id, role, content, tool_name, created_at FROM website_messages WHERE session_id = ? ORDER BY id ASC',
      [sessionId]
    );

    res.json({
      session_id: session.session_id,
      source: session.source,
      created_at: session.created_at,
      updated_at: session.updated_at,
      message_count: session.message_count,
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        tool_name: m.tool_name,
        created_at: m.created_at,
      })),
    });
  } catch (err) {
    console.error('[Website Admin] 获取会话详情失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== 删除会话 ==========

router.delete('/sessions/:id', (req, res) => {
  try {
    const sessionId = req.params.id;
    db.execute('DELETE FROM website_messages WHERE session_id = ?', [sessionId]);
    db.execute('DELETE FROM website_sessions WHERE session_id = ?', [sessionId]);
    // 记录删除标记：同步时跳过，避免已删除的会话被云端再次拉回
    try {
      db.execute('INSERT OR REPLACE INTO website_deleted_sessions (session_id) VALUES (?)', [sessionId]);
    } catch (e) {
      console.error('[Website Admin] 删除标记写入失败:', e.message);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[Website Admin] 删除会话失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== 搜索 ==========

router.get('/search', (req, res) => {
  try {
    const q = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;

    if (!q.trim()) {
      return res.json({ total: 0, page, pageSize, results: [] });
    }

    const searchPattern = `%${q}%`;
    const total = db.queryOne(
      'SELECT COUNT(*) as cnt FROM website_messages WHERE content LIKE ?',
      [searchPattern]
    ).cnt;

    const results = db.query(
      `SELECT m.id, m.session_id, m.role, m.content, m.tool_name, m.created_at, s.source
       FROM website_messages m
       LEFT JOIN website_sessions s ON m.session_id = s.session_id
       WHERE m.content LIKE ?
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      [searchPattern, pageSize, offset]
    );

    res.json({
      total,
      page,
      pageSize,
      results: results.map(r => ({
        id: r.id,
        session_id: r.session_id,
        role: r.role,
        content: r.content,
        tool_name: r.tool_name,
        created_at: r.created_at,
        source: r.source,
      })),
    });
  } catch (err) {
    console.error('[Website Admin] 搜索失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== 同步状态 ==========

router.get('/sync/status', (req, res) => {
  try {
    const status = db.queryOne('SELECT * FROM website_sync_status WHERE id = 1');
    const totalSessions = db.queryOne('SELECT COUNT(*) as cnt FROM website_sessions').cnt;
    const cloudConfig = getCloudConfig();

    res.json({
      totalSessions,
      isSyncing: status?.is_syncing === 1,
      lastSyncedAt: status?.last_synced_at || null,
      lastSync: status?.last_sync_success === 0
        ? { success: false, error: status?.last_sync_error || '未知错误' }
        : status?.last_synced_at
        ? { success: true }
        : null,
      config: {
        cloudApiBaseUrl: cloudConfig.baseUrl || '未配置',
      },
    });
  } catch (err) {
    console.error('[Website Admin] 获取同步状态失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== 云端 API 同步 ==========

async function syncFromCloud(baseUrl, password) {
  let synced = 0, skipped = 0;

  // 获取会话统计（包含最近会话列表）
  const statsRes = await cloudRequest(`${baseUrl}/api/admin/stats`, {
    headers: { 'X-Admin-Password': password },
  });
  if (!statsRes.ok) throw new Error(`云端 API 返回 ${statsRes.status}`);
  const stats = statsRes.json || {};

  const recentSessions = stats.recentSessions || [];
  if (!recentSessions.length) return { synced: 0, skipped: 0, source: 'cloud' };

  for (const s of recentSessions) {
    const sessionId = s.id || s.sessionId;
    if (!sessionId) { skipped++; continue; }

    // 跳过已存在的会话
    const existing = db.queryOne('SELECT session_id FROM website_sessions WHERE session_id = ?', [sessionId]);
    if (existing) { skipped++; continue; }

    // 跳过用户手动删除过的会话（tombstone）
    const tombstone = db.queryOne('SELECT session_id FROM website_deleted_sessions WHERE session_id = ?', [sessionId]);
    if (tombstone) { skipped++; continue; }

    // 获取完整会话详情（含消息）
    const detailRes = await cloudRequest(`${baseUrl}/api/admin/session?id=${sessionId}`, {
      headers: { 'X-Admin-Password': password },
    });
    if (!detailRes.ok) { skipped++; continue; }
    const detail = detailRes.json || {};

    const messages = detail.messages || [];
    const firstUserMsg = messages.find(m => m.role === 'user');
    const isOnlyPreset = messages.every(m => m.role !== 'user');

    db.execute(
      `INSERT INTO website_sessions (session_id, source, created_at, updated_at, message_count, first_question, is_only_preset)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        s.source || detail.source || 'direct',
        s.createdAt || detail.createdAt || new Date().toISOString(),
        s.updatedAt || detail.updatedAt || new Date().toISOString(),
        messages.length,
        firstUserMsg?.content || '',
        isOnlyPreset ? 1 : 0,
      ]
    );

    for (const m of messages) {
      db.execute(
        `INSERT INTO website_messages (session_id, role, content, tool_name, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          sessionId,
          m.role,
          m.content || '',
          m.toolName || m.tool_name || null,
          m.atText || m.createdAt || new Date().toISOString(),
        ]
      );
    }
    synced++;
  }

  return { synced, skipped, source: 'cloud' };
}

// ========== 旧版 JSON 文件导入 ==========

function syncFromLegacyJson() {
  let synced = 0, skipped = 0;

  if (!fs.existsSync(LEGACY_SESSIONS_PATH)) {
    return { synced: 0, skipped: 0, source: 'legacy' };
  }

  const raw = fs.readFileSync(LEGACY_SESSIONS_PATH, 'utf-8');
  const sessionsObj = JSON.parse(raw);
  const sessions = Object.values(sessionsObj);

  for (const s of sessions) {
    const existing = db.queryOne('SELECT session_id FROM website_sessions WHERE session_id = ?', [s.sessionId]);
    if (existing) { skipped++; continue; }

    // 跳过用户手动删除过的会话（tombstone）
    const tombstone = db.queryOne('SELECT session_id FROM website_deleted_sessions WHERE session_id = ?', [s.sessionId]);
    if (tombstone) { skipped++; continue; }

    const messages = s.messages || [];
    const firstUserMsg = messages.find(m => m.role === 'user');
    const isOnlyPreset = messages.every(m => m.role !== 'user') || (s.source === 'preset');

    db.execute(
      `INSERT INTO website_sessions (session_id, source, created_at, updated_at, message_count, first_question, is_only_preset)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        s.sessionId,
        s.source || 'direct',
        s.createdAtText || s.createdAt || new Date().toISOString(),
        s.updatedAtText || s.updatedAt || new Date().toISOString(),
        messages.length,
        firstUserMsg?.content || '',
        isOnlyPreset ? 1 : 0,
      ]
    );

    for (const m of messages) {
      db.execute(
        `INSERT INTO website_messages (session_id, role, content, tool_name, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          s.sessionId,
          m.role,
          m.content || '',
          m.toolName || m.tool_name || null,
          m.atText || m.createdAt || new Date().toISOString(),
        ]
      );
    }
    synced++;
  }

  return { synced, skipped, source: 'legacy' };
}

// ========== 同步拉取 ==========

router.post('/sync/pull', async (req, res) => {
  try {
    // 标记同步中
    db.execute('UPDATE website_sync_status SET is_syncing = 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1');

    const { baseUrl, password } = getCloudConfig();
    let result;

    // 优先云端同步，失败回退本地 JSON
    if (baseUrl) {
      try {
        result = await syncFromCloud(baseUrl, password);
      } catch (cloudErr) {
        console.warn('[Website Admin] 云端同步失败，回退本地:', cloudErr.message);
        result = syncFromLegacyJson();
        result.cloudError = cloudErr.message;
      }
    } else {
      result = syncFromLegacyJson();
    }

    // 更新同步状态
    db.execute(
      `UPDATE website_sync_status
       SET is_syncing = 0, last_synced_at = CURRENT_TIMESTAMP, last_sync_success = 1, last_sync_error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`
    );

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Website Admin] 同步失败:', err.message);
    db.execute(
      `UPDATE website_sync_status
       SET is_syncing = 0, last_sync_success = 0, last_sync_error = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [err.message]
    );
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== 配置云端 API ==========

router.post('/sync/config', (req, res) => {
  try {
    const { cloudApiBaseUrl, cloudApiPassword } = req.body || {};
    db.execute(
      `UPDATE website_sync_status SET cloud_api_base_url = ?, cloud_api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
      [cloudApiBaseUrl || '', cloudApiPassword || '']
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Website Admin] 配置保存失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== 洞察列表 ==========

router.get('/insights', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;

    const total = db.queryOne('SELECT COUNT(*) as cnt FROM website_insights').cnt;
    const insights = db.query(
      'SELECT id, title, summary, suggestion, created_at, status, review_id FROM website_insights ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [pageSize, offset]
    );

    res.json({
      total,
      page,
      pageSize,
      insights: insights.map(i => ({
        id: i.id,
        title: i.title,
        summary: i.summary,
        suggestion: i.suggestion,
        created_at: i.created_at,
        status: i.status,
        review_id: i.review_id,
      })),
    });
  } catch (err) {
    console.error('[Website Admin] 获取洞察列表失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== 生成洞察 ==========

router.post('/insights/generate', (req, res) => {
  try {
    const { startDate, endDate } = req.body || {};

    const userMessages = db.query(
      `SELECT m.content, m.created_at, s.source
       FROM website_messages m
       LEFT JOIN website_sessions s ON m.session_id = s.session_id
       WHERE m.role = 'user' AND m.content IS NOT NULL AND m.content != ''
       ORDER BY m.created_at DESC
       LIMIT 100`
    );

    if (userMessages.length < 3) {
      return res.json({
        id: null,
        title: '数据不足',
        summary: '用户提问数据不足，无法生成有意义的洞察。请先同步更多数据。',
        evidence: [],
      });
    }

    // 关键词频率分析
    const wordFreq = {};
    const stopWords = ['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这'];

    userMessages.forEach(m => {
      const text = (m.content || '').toLowerCase();
      const words = text.match(/[\u4e00-\u9fa5]{2,}|[a-z0-9]+/g) || [];
      words.forEach(w => {
        if (!stopWords.includes(w) && w.length >= 2) {
          wordFreq[w] = (wordFreq[w] || 0) + 1;
        }
      });
    });

    const topWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));

    const topWord = topWords[0]?.word || '相关话题';
    const title = `访客关注「${topWord}」相关问题`;
    const summary = `分析了 ${userMessages.length} 条用户提问，访客最关注的话题是「${topWord}」（出现 ${topWords[0]?.count || 0} 次）。\n\n高频话题包括：${topWords.slice(0, 5).map(w => w.word).join('、')}。\n\n建议：在个人网站和 AI 回答中加强这些话题的内容覆盖。`;
    const cognitiveGap = `访客对「${topWord}」的提问较多，但现有内容可能不够全面，存在认知缺口。`;
    const suggestion = `1. 补充「${topWord}」相关的深度内容\n2. 在 AI 预设问答中增加相关问题\n3. 优化网站导航，让访客更容易找到相关内容`;
    const evidence = userMessages.slice(0, 5).map(m => m.content);

    const dateRange = startDate && endDate ? `${startDate} 至 ${endDate}` : '全部时间';

    const result = db.execute(
      `INSERT INTO website_insights (title, summary, cognitive_gap, suggestion, evidence, date_range, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [title, summary, cognitiveGap, suggestion, JSON.stringify(evidence), dateRange]
    );

    res.json({
      id: result.lastInsertRowid,
      title,
      summary,
      cognitive_gap: cognitiveGap,
      suggestion,
      evidence,
      date_range: dateRange,
      created_at: new Date().toISOString(),
      status: 'pending',
    });
  } catch (err) {
    console.error('[Website Admin] 生成洞察失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== 洞察详情 ==========

router.get('/insights/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const insight = db.queryOne('SELECT * FROM website_insights WHERE id = ?', [id]);
    if (!insight) {
      return res.status(404).json({ error: '洞察不存在' });
    }

    res.json({
      id: insight.id,
      title: insight.title,
      summary: insight.summary,
      cognitive_gap: insight.cognitive_gap,
      suggestion: insight.suggestion,
      evidence: JSON.parse(insight.evidence || '[]'),
      date_range: insight.date_range,
      created_at: insight.created_at,
      status: insight.status,
      review_id: insight.review_id,
    });
  } catch (err) {
    console.error('[Website Admin] 获取洞察详情失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== 转化为复盘（修复 schema 匹配）==========

router.post('/insights/:id/convert-to-review', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const insight = db.queryOne('SELECT * FROM website_insights WHERE id = ?', [id]);
    if (!insight) {
      return res.status(404).json({ error: '洞察不存在' });
    }

    // 构造复盘内容
    const reviewContent = `## 洞察来源\n${insight.summary}\n\n## 认知缺口\n${insight.cognitive_gap || ''}\n\n## 优化建议\n${insight.suggestion || ''}\n\n## 证据\n${JSON.parse(insight.evidence || '[]').map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

    // 检查复盘表是否存在，并使用正确的 schema 插入
    const reviewTableExists = db.queryOne("SELECT name FROM sqlite_master WHERE type='table' AND name='reviews'");
    let reviewId = null;

    if (reviewTableExists) {
      const result = db.execute(
        `INSERT INTO reviews (project_name, improvements, related_notes, created_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          `访客洞察：${insight.title}`,
          insight.suggestion || '',
          reviewContent,
        ]
      );
      reviewId = result.lastInsertRowid;
    }

    // 更新洞察状态
    db.execute(
      'UPDATE website_insights SET status = ?, review_id = ?, created_at = created_at WHERE id = ?',
      ['converted_to_review', reviewId, id]
    );

    res.json({ success: true, reviewId });
  } catch (err) {
    console.error('[Website Admin] 转化为复盘失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// ========== 5分钟自动同步 ==========
const SYNC_INTERVAL = 5 * 60 * 1000; // 5分钟
let autoSyncStarted = false;

function startAutoSync() {
  if (autoSyncStarted) return;
  autoSyncStarted = true;

  // 延迟 30 秒首次同步，避免服务器启动高峰
  setTimeout(async () => {
    await doAutoSync();
    // 之后每 5 分钟同步一次
    setInterval(doAutoSync, SYNC_INTERVAL);
  }, 30 * 1000);
}

async function doAutoSync() {
  try {
    const { baseUrl, password } = getCloudConfig();
    if (!baseUrl) return; // 未配置云端地址，跳过

    const status = db.queryOne('SELECT is_syncing FROM website_sync_status WHERE id = 1');
    if (status?.is_syncing === 1) return; // 正在手动同步，跳过

    db.execute('UPDATE website_sync_status SET is_syncing = 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1');

    try {
      await syncFromCloud(baseUrl, password);
      db.execute(
        `UPDATE website_sync_status
         SET is_syncing = 0, last_synced_at = CURRENT_TIMESTAMP, last_sync_success = 1, last_sync_error = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`
      );
      console.log('[Website Admin] 自动同步完成');
    } catch (e) {
      console.warn('[Website Admin] 自动同步失败:', e.message);
      db.execute(
        `UPDATE website_sync_status
         SET is_syncing = 0, last_sync_success = 0, last_sync_error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
        [e.message]
      );
    }
  } catch (e) {
    console.error('[Website Admin] 自动同步异常:', e.message);
  }
}

startAutoSync();
