const express = require('express');
const router = express.Router();
const db = require('../../core/db');

// 确保 prompts 表有 use_count 字段
function ensureColumns() {
  try {
    const columns = db.query("PRAGMA table_info(prompts)");
    const colNames = columns.map(c => c.name);
    if (!colNames.includes('use_count')) {
      db.execute('ALTER TABLE prompts ADD COLUMN use_count INTEGER DEFAULT 0');
    }
    if (!colNames.includes('last_used_at')) {
      db.execute('ALTER TABLE prompts ADD COLUMN last_used_at DATETIME');
    }
  } catch (e) {
    console.error('[Prompt] 确保字段失败:', e.message);
  }
}
ensureColumns();

// 列表+过滤
router.get('/', (req, res) => {
  try {
    const { category, effect, tag, search } = req.query;
    let sql = 'SELECT * FROM prompts WHERE 1=1';
    const params = [];
    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (effect) { sql += ' AND effect = ?'; params.push(effect); }
    if (tag) { sql += ' AND tags LIKE ?'; params.push(`%${tag}%`); }
    if (search) { sql += ' AND (title LIKE ? OR prompt LIKE ? OR scene LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    sql += ' ORDER BY updated_at DESC';
    const rows = db.query(sql, params);
    res.json({ prompts: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取所有分类和标签
router.get('/meta/stats', (req, res) => {
  try {
    const categories = db.query("SELECT DISTINCT category FROM prompts WHERE category IS NOT NULL AND category != '' ORDER BY category");
    const categoryList = categories.map(c => c.category);

    const allPrompts = db.query("SELECT tags FROM prompts WHERE tags IS NOT NULL AND tags != ''");
    const tagSet = new Set();
    allPrompts.forEach(p => {
      try {
        const tags = JSON.parse(p.tags);
        if (Array.isArray(tags)) {
          tags.forEach(t => tagSet.add(t));
        }
      } catch (e) {
        if (p.tags) {
          p.tags.split(/[,，、]/).forEach(t => {
            const trimmed = t.trim();
            if (trimmed) tagSet.add(trimmed);
          });
        }
      }
    });

    res.json({
      categories: categoryList,
      tags: Array.from(tagSet).sort(),
      total: allPrompts.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 详情
router.get('/:id', (req, res) => {
  try {
    const row = db.queryOne('SELECT * FROM prompts WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Prompt不存在' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 记录使用次数
router.post('/:id/use', (req, res) => {
  try {
    db.execute('UPDATE prompts SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    const row = db.queryOne('SELECT use_count FROM prompts WHERE id = ?', [req.params.id]);
    res.json({ use_count: row?.use_count || 0, message: '已记录使用' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新建
router.post('/', (req, res) => {
  try {
    const { category, title, prompt, scene, effect, model, tags, notes } = req.body;
    if (!title || !prompt) return res.status(400).json({ error: '标题和Prompt内容必填' });
    const result = db.execute(
      'INSERT INTO prompts (category, title, prompt, scene, effect, model, tags, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [category || '通用', title, prompt, scene || '', effect || '一般', model || '', tags || '', notes || '']
    );
    db.execute('INSERT INTO activity_log (date, type, detail) VALUES (?, ?, ?)',
      [new Date().toISOString().slice(0, 10), 'prompt_created', title]);
    res.status(201).json({ id: result.lastInsertRowid, message: '创建成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新
router.put('/:id', (req, res) => {
  try {
    const { category, title, prompt, scene, effect, model, tags, notes } = req.body;
    db.execute(
      'UPDATE prompts SET category=?, title=?, prompt=?, scene=?, effect=?, model=?, tags=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [category, title, prompt, scene, effect, model, tags, notes, req.params.id]
    );
    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除
router.delete('/:id', (req, res) => {
  try {
    db.execute('DELETE FROM prompts WHERE id = ?', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI生成Prompt模板
router.post('/generate', async (req, res) => {
  try {
    const { requirement } = req.body;
    if (!requirement) return res.status(400).json({ error: '需求描述必填' });
    const aiClient = require('../../core/ai/client');
    const generated = await aiClient.generatePrompt(requirement);
    res.json({ prompt: generated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 创建新版本（迭代）
router.post('/:id/iterate', (req, res) => {
  try {
    const original = db.queryOne('SELECT * FROM prompts WHERE id = ?', [req.params.id]);
    if (!original) return res.status(404).json({ error: '原Prompt不存在' });
    const { prompt, notes } = req.body;
    const result = db.execute(
      'INSERT INTO prompts (category, title, prompt, scene, effect, model, tags, iteration, parent_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [original.category, original.title, prompt || original.prompt, original.scene, original.effect, original.model, original.tags, original.iteration + 1, original.id, notes || '']
    );
    res.status(201).json({ id: result.lastInsertRowid, iteration: original.iteration + 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;