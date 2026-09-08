/**
 * KnowledgeBridge - 与 Siyi OS Knowledge Core 交互的桥接层
 * 
 * 职责：
 * - 读取 Knowledge 用于判断信息相关性（项目、技能、学习方向）
 * - 保存信息到 Knowledge 候选（不直接写入，生成候选）
 * 
 * 权限：默认 private，只有明确标记 public 的知识才可被 Meet Siyi 访问。
 */

const path = require('path');
const fs = require('fs');

class KnowledgeBridge {
  constructor(options = {}) {
    this.options = options;
    this.knowledgeService = options.knowledgeService; // Siyi OS KnowledgeService 实例
    this.candidateDir = options.candidateDir || path.join(__dirname, '..', '..', '..', '..', 'data', 'knowledge-candidates');
  }

  /**
   * 初始化
   */
  async init() {
    if (!fs.existsSync(this.candidateDir)) {
      fs.mkdirSync(this.candidateDir, { recursive: true });
    }
    console.log('[KnowledgeBridge] 初始化完成');
  }

  /**
   * 获取用户项目列表（用于相关性判断）
   * @returns {Promise<Array>} 项目数组
   */
  async getProjects() {
    if (!this.knowledgeService) return [];

    try {
      const projects = [];
      // KnowledgeService 的文档中，项目以 project-0, project-1 等 ID 存储
      for (let i = 0; i < 10; i++) {
        const project = await this.knowledgeService.getProject(i);
        if (project) {
          const doc = await this.knowledgeService.getDocument(`project-${i}`);
          projects.push({
            id: `project-${i}`,
            title: doc?.title || `项目 ${i}`,
            content: project,
            visibility: doc?.visibility || 'private',
          });
        }
      }
      return projects;
    } catch (err) {
      console.error('[KnowledgeBridge] 获取项目失败:', err.message);
      return [];
    }
  }

  /**
   * 获取知识摘要（用于相关性判断）
   * @returns {Promise<Array>} 知识文档摘要数组
   */
  async getKnowledgeSummary() {
    if (!this.knowledgeService) return [];

    try {
      // 搜索几个关键领域的知识
      const queries = ['技能', '学习', '方向', '工作', '兴趣'];
      const docs = new Map();

      for (const query of queries) {
        const results = await this.knowledgeService.searchKnowledge(query, {
          visibility: 'all',
          topK: 3,
        });
        for (const r of results) {
          if (!docs.has(r.id)) {
            docs.set(r.id, {
              id: r.id,
              title: r.title,
              visibility: r.visibility,
              content: r.content?.substring(0, 200) || '',
            });
          }
        }
      }

      return Array.from(docs.values());
    } catch (err) {
      console.error('[KnowledgeBridge] 获取知识摘要失败:', err.message);
      return [];
    }
  }

  /**
   * 搜索相关知识（用于信息关联）
   * @param {string} query - 搜索关键词
   * @param {number} topK - 返回数量
   * @returns {Promise<Array>} 相关知识文档
   */
  async searchRelated(query, topK = 3) {
    if (!this.knowledgeService) return [];

    try {
      return await this.knowledgeService.searchKnowledge(query, {
        visibility: 'all',
        topK,
      });
    } catch (err) {
      console.error('[KnowledgeBridge] 搜索相关知识失败:', err.message);
      return [];
    }
  }

  /**
   * 添加知识候选（不直接写入 Knowledge，生成候选文件）
   * @param {Object} candidate - 候选知识
   * @returns {Promise<Object>} 候选记录
   */
  async addCandidate(candidate) {
    const id = `cand_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const record = {
      id,
      title: candidate.title,
      sourceUrl: candidate.sourceUrl,
      summary: candidate.summary,
      tags: candidate.tags || [],
      userNote: candidate.userNote || '',
      source: candidate.source || 'radar',
      sourceItemId: candidate.sourceItemId,
      status: 'pending', // pending / approved / rejected
      visibility: 'private', // 默认 private，用户确认后才可能变为 public
      createdAt: new Date().toISOString(),
    };

    // 保存为候选文件
    const file = path.join(this.candidateDir, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify(record, null, 2), 'utf-8');

    console.log(`[KnowledgeBridge] 知识候选已创建: ${id} (${candidate.title})`);
    return record;
  }

  /**
   * 获取候选列表
   */
  getCandidates(status = 'pending') {
    if (!fs.existsSync(this.candidateDir)) return [];

    const files = fs.readdirSync(this.candidateDir).filter(f => f.endsWith('.json'));
    const candidates = files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(this.candidateDir, f), 'utf-8'));
      } catch {
        return null;
      }
    }).filter(Boolean);

    return candidates.filter(c => c.status === status);
  }

  /**
   * 批准候选（写入 Knowledge）
   * 注意：这是一个需要用户确认的操作，不自动执行
   */
  async approveCandidate(id, visibility = 'private') {
    const file = path.join(this.candidateDir, `${id}.json`);
    if (!fs.existsSync(file)) {
      throw new Error('候选不存在');
    }

    const candidate = JSON.parse(fs.readFileSync(file, 'utf-8'));
    candidate.status = 'approved';
    candidate.visibility = visibility;
    candidate.approvedAt = new Date().toISOString();

    fs.writeFileSync(file, JSON.stringify(candidate, null, 2), 'utf-8');

    // 如果标记为 public，可以写入 Knowledge public 目录
    if (visibility === 'public' && this.knowledgeService) {
      // 预留：写入 Knowledge public 目录
      console.log(`[KnowledgeBridge] 候选已批准为 public: ${id}`);
    }

    return candidate;
  }
}

module.exports = KnowledgeBridge;