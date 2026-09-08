const express = require('express');
const router = express.Router();
const db = require('../../core/db');
const { generateActionItems } = require('./review-generator');

// 确保 reviews 表有 action_items 和 ai_summary 字段
function ensureColumns() {
  try {
    const columns = db.query("PRAGMA table_info(reviews)");
    const colNames = columns.map(c => c.name);
    if (!colNames.includes('action_items')) {
      db.execute('ALTER TABLE reviews ADD COLUMN action_items TEXT');
    }
    if (!colNames.includes('ai_summary')) {
      db.execute('ALTER TABLE reviews ADD COLUMN ai_summary TEXT');
    }
  } catch (e) {
    console.error('[Review] 确保字段失败:', e.message);
  }
}
ensureColumns();

// 确保 pitfall_knowledge 表存在
function ensurePitfallTable() {
  try {
    db.execute(`
      CREATE TABLE IF NOT EXISTS pitfall_knowledge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        problem TEXT,
        cause TEXT,
        solution TEXT,
        prevention TEXT,
        category TEXT,
        tags TEXT,
        source TEXT,
        source_id TEXT,
        project TEXT,
        created_at TEXT
      )
    `);
  } catch (e) {
    console.error('[Review] 确保踩坑表失败:', e.message);
  }
}

// 同步踩坑到 pitfall_knowledge 表
function syncPitfallsToKnowledge(pitfalls, projectName, techStack, sourceId) {
  if (!Array.isArray(pitfalls) || pitfalls.length === 0) return 0;
  ensurePitfallTable();

  let inserted = 0;
  pitfalls.forEach(p => {
    if (!p.problem && !p.title) return;
    const title = p.title || p.problem.substring(0, 50);
    const existing = db.queryOne(
      'SELECT id FROM pitfall_knowledge WHERE project = ? AND problem = ?',
      [projectName, p.problem || '']
    );
    if (existing) {
      db.execute(
        `UPDATE pitfall_knowledge SET title=?, cause=?, solution=?, prevention=?, category=?, tags=? WHERE id=?`,
        [title, p.cause || '', p.solution || '', p.prevention || '', p.category || '项目复盘',
         JSON.stringify(techStack ? techStack.split(',').map(t => t.trim()).filter(Boolean) : []),
         existing.id]
      );
    } else {
      db.execute(
        `INSERT INTO pitfall_knowledge (title, problem, cause, solution, prevention, category, tags, source, source_id, project, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, p.problem || '', p.cause || '', p.solution || '', p.prevention || '',
         p.category || '项目复盘',
         JSON.stringify(techStack ? techStack.split(',').map(t => t.trim()).filter(Boolean) : []),
         'review', String(sourceId), projectName, new Date().toISOString()]
      );
      inserted++;
    }
  });
  return inserted;
}

// 列表
router.get('/', (req, res) => {
  try {
    const rows = db.query('SELECT * FROM reviews ORDER BY created_at DESC');
    res.json({ reviews: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 详情
router.get('/:id', (req, res) => {
  try {
    const row = db.queryOne('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: '复盘不存在' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新建（AI引导）
router.post('/', (req, res) => {
  try {
    const { project_name, start_date, end_date, tech_stack, ai_efficiency, prompt_quality, tech_learning, pitfalls, ai_hallucination, improvements, related_notes } = req.body;
    if (!project_name) return res.status(400).json({ error: '项目名称必填' });
    const result = db.execute(
      'INSERT INTO reviews (project_name, start_date, end_date, tech_stack, ai_efficiency, prompt_quality, tech_learning, pitfalls, ai_hallucination, improvements, related_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [project_name, start_date || null, end_date || null, tech_stack || '', ai_efficiency || '', prompt_quality || '', tech_learning || '', pitfalls || '[]', ai_hallucination || '', improvements || '', related_notes || '']
    );
    db.execute('INSERT INTO activity_log (date, type, detail) VALUES (?, ?, ?)',
      [new Date().toISOString().slice(0, 10), 'review_created', project_name]);
    let pitfallsList = [];
    try { pitfallsList = JSON.parse(pitfalls || '[]'); } catch (e) {}
    const inserted = syncPitfallsToKnowledge(pitfallsList, project_name, tech_stack, result.lastInsertRowid);
    res.status(201).json({ id: result.lastInsertRowid, message: '创建成功', pitfallsSynced: inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新
router.put('/:id', (req, res) => {
  try {
    const { project_name, start_date, end_date, tech_stack, ai_efficiency, prompt_quality, tech_learning, pitfalls, ai_hallucination, improvements, related_notes } = req.body;
    db.execute(
      'UPDATE reviews SET project_name=?, start_date=?, end_date=?, tech_stack=?, ai_efficiency=?, prompt_quality=?, tech_learning=?, pitfalls=?, ai_hallucination=?, improvements=?, related_notes=? WHERE id=?',
      [project_name, start_date, end_date, tech_stack, ai_efficiency, prompt_quality, tech_learning, pitfalls, ai_hallucination, improvements, related_notes, req.params.id]
    );
    let pitfallsList = [];
    try { pitfallsList = JSON.parse(pitfalls || '[]'); } catch (e) {}
    const inserted = syncPitfallsToKnowledge(pitfallsList, project_name, tech_stack, req.params.id);
    res.json({ message: '更新成功', pitfallsSynced: inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 提取踩坑列表
router.get('/:id/pitfalls', (req, res) => {
  try {
    const row = db.queryOne('SELECT pitfalls FROM reviews WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: '复盘不存在' });
    let pitfalls = [];
    try { pitfalls = JSON.parse(row.pitfalls || '[]'); } catch (e) { pitfalls = []; }
    res.json({ pitfalls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 归档为Obsidian笔记
router.post('/:id/archive', async (req, res) => {
  try {
    const row = db.queryOne('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: '复盘不存在' });
    const vault = require('../../core/obsidian/vault');
    const filePath = await vault.archiveReview(row);
    res.json({ message: '归档成功', filePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI生成复盘初稿
router.post('/generate-draft', async (req, res) => {
  try {
    const { project_name, tech_stack, description } = req.body;
    if (!project_name) return res.status(400).json({ error: '项目名称必填' });

    const aiClient = require('../../core/ai/client');
    const systemPrompt = `你是一个专业的项目复盘助手。根据用户提供的项目信息，生成一份结构化的项目复盘初稿。

请严格按照以下JSON格式输出，不要输出任何其他内容：
{
  "ai_efficiency": "AI协作效率分析（2-3句话，推测AI在哪些环节可能给力/拉胯）",
  "prompt_quality": "Prompt质量分析（2-3句话，针对该技术栈可能遇到的Prompt技巧）",
  "tech_learning": "技术学习点（2-3句话，该项目可能学到的新技术）",
  "pitfalls": [
    {"problem": "可能遇到的问题1", "cause": "原因", "solution": "解决方案", "prevention": "下次避免"}
  ],
  "ai_hallucination": "AI幻觉风险点（1-2句话，该技术栈AI容易编造什么）",
  "improvements": "下次改进建议（2-3句话）"
}

注意：
1. 这是基于项目信息的推测初稿，用户会根据实际情况修改
2. pitfalls生成2-3个该技术栈常见的踩坑点
3. 内容要具体、实用，不要空泛
4. 严格输出JSON，不要有markdown代码块标记`;

    const userMsg = `项目名称：${project_name}
技术栈：${tech_stack || '未提供'}
项目描述：${description || '未提供'}`;

    const reply = await aiClient.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg }
    ]);

    let draft;
    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      draft = JSON.parse(jsonMatch ? jsonMatch[0] : reply);
    } catch (e) {
      draft = {
        ai_efficiency: reply,
        prompt_quality: '',
        tech_learning: '',
        pitfalls: [],
        ai_hallucination: '',
        improvements: '',
      };
    }

    res.json({ draft });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 生成行动项和改进计划
router.post('/:id/action-items', async (req, res) => {
  try {
    const review = db.queryOne('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
    if (!review) return res.status(404).json({ error: '复盘不存在' });

    const reviewData = {
      project_name: review.project_name,
      tech_stack: review.tech_stack,
      ai_efficiency: review.ai_efficiency,
      prompt_quality: review.prompt_quality,
      tech_learning: review.tech_learning,
      pitfalls: review.pitfalls ? JSON.parse(review.pitfalls) : [],
      ai_hallucination: review.ai_hallucination,
      improvements: review.improvements,
    };

    const result = await generateActionItems(reviewData);

    if (result.action_items && Array.isArray(result.action_items)) {
      db.execute('UPDATE reviews SET action_items = ?, ai_summary = ? WHERE id = ?',
        [JSON.stringify(result.action_items), result.summary || '', req.params.id]);
    }

    res.json(result);
  } catch (err) {
    console.error('[Review] 生成行动项失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;