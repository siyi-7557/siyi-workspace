/**
 * AIProcessor - AI 信息处理流水线
 * 
 * 负责信息的 AI 处理：分类、摘要、相关性判断、关联知识/项目、生成推荐理由。
 * 
 * 核心原则：
 * - 摘要严格基于原文，内容不足时标记"信息不足，无法判断"，不得补全
 * - 相关性以"与思意有什么关系"为核心，不是按热度排序
 * - 直接调用 LLM Router，不经过 Gateway（信息处理不需要工具调用）
 * 
 * 处理流水线：内容解析 → 分类 → 摘要 → 相关性判断 → 关联知识/项目 → 推荐理由
 */

const { matchCategory, CATEGORIES } = require('../config/categories');

class AIProcessor {
  constructor(options = {}) {
    this.llm = options.llm; // LLM Router 实例
    this.knowledgeBridge = options.knowledgeBridge; // KnowledgeBridge 实例
    this.model = options.model || 'glm-4-flash';
    this.temperature = options.temperature || 0.3;
    this.maxTokens = options.maxTokens || 2048;
  }

  /**
   * 处理单条信息（完整流水线）
   * @param {Object} rawItem - 原始信息项 {title, url, content, publishedAt, source}
   * @param {Object} context - 用户上下文 {projects, knowledge, preferences}
   * @returns {Promise<Object>} 处理结果 {category, summary, tags, relevanceScore, importanceScore, relevanceReason, relatedKnowledge, relatedProjects}
   */
  async process(rawItem, context = {}) {
    const { title, content = '' } = rawItem;
    const fullText = `${title}\n\n${content}`;

    // 1. 分类（先关键词匹配，AI 确认）
    const keywordCategory = matchCategory(fullText);

    // 2. AI 处理：分类确认 + 摘要 + 标签 + 相关性判断 + 推荐理由
    const aiResult = await this._aiAnalyze(rawItem, keywordCategory, context);

    // 3. 关联知识和项目（基于 AI 判断结果）
    const relatedKnowledge = aiResult.relatedKnowledge || [];
    const relatedProjects = aiResult.relatedProjects || [];

    return {
      category: aiResult.category || keywordCategory,
      summary: aiResult.summary || '',
      tags: aiResult.tags || [],
      relevanceScore: typeof aiResult.relevanceScore === 'number' ? aiResult.relevanceScore : 0,
      importanceScore: typeof aiResult.importanceScore === 'number' ? aiResult.importanceScore : 0,
      relevanceReason: aiResult.relevanceReason || '',
      relatedKnowledge,
      relatedProjects,
    };
  }

  /**
   * AI 分析（分类 + 摘要 + 相关性 + 推荐理由）
   */
  async _aiAnalyze(rawItem, keywordCategory, context) {
    const { title, content = '', url, source } = rawItem;

    // 构建用户上下文摘要
    const contextSummary = this._buildContextSummary(context);

    // 构建分类列表
    const categoryList = CATEGORIES.map(c => `${c.id}(${c.name})`).join(', ');

    const systemPrompt = `你是思意的个人信息筛选助手。你的任务是对外部信息进行分类、摘要和相关性判断。

核心原则：
1. 摘要必须严格基于原文内容，不得编造、补全或推断原文没有的信息。如果内容不足，明确写"信息不足，无法判断"。
2. 相关性判断以"与思意有什么关系"为核心，不是按热度排序。判断信息是否与思意的当前项目、学习方向、长期兴趣、工作方向或已有知识相关。
3. 推荐理由要简短具体，例如"与你正在搭建的Agent架构有关"、"与你最近研究的Personal AI方向有关"，不要泛泛而谈。
4. 所有输出必须是合法的 JSON 格式。

思意的当前上下文：
${contextSummary}

可用分类：${categoryList}、未分类`;

    const userPrompt = `请分析以下信息：

标题：${title}
来源：${source || '未知'}
链接：${url || '未知'}
原文内容：
${content.substring(0, 3000)}

请输出 JSON（不要输出其他内容）：
{
  "category": "分类ID",
  "summary": "基于原文的简短摘要（50-100字，内容不足则写'信息不足，无法判断'）",
  "tags": ["标签1", "标签2"],
  "relevanceScore": 0.0到1.0的相关性评分,
  "importanceScore": 0.0到1.0的重要性评分,
  "relevanceReason": "简短的关联理由（一句话）",
  "relatedKnowledge": ["相关的知识文档ID（如果有）"],
  "relatedProjects": ["相关的项目ID（如果有）"]
}`;

    try {
      const response = await this.llm.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], {
        stream: false,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        model: this.model,
      });

      const content = response.choices?.[0]?.message?.content || '';
      return this._parseAIResponse(content);
    } catch (err) {
      console.error('[AIProcessor] AI 分析失败:', err.message);
      // AI 失败时返回保守结果
      return {
        category: keywordCategory,
        summary: content ? content.substring(0, 100) : '信息不足，无法判断',
        tags: [],
        relevanceScore: 0,
        importanceScore: 0,
        relevanceReason: '',
        relatedKnowledge: [],
        relatedProjects: [],
      };
    }
  }

  /**
   * 构建用户上下文摘要
   */
  _buildContextSummary(context) {
    const parts = [];

    // 当前项目
    if (context.projects && context.projects.length > 0) {
      const projectSummaries = context.projects.map(p => {
        const title = p.title || p.name || '未知项目';
        const desc = p.content ? p.content.substring(0, 100) : '';
        return `- ${title}: ${desc}`;
      }).join('\n');
      parts.push(`当前项目：\n${projectSummaries}`);
    }

    // 已有知识（技能、学习方向）
    if (context.knowledge && context.knowledge.length > 0) {
      const knowledgeTitles = context.knowledge.map(k => k.title).join(', ');
      parts.push(`已有知识领域：${knowledgeTitles}`);
    }

    // 用户偏好（关注主题、关键词）
    if (context.preferences) {
      if (context.preferences.topics && context.preferences.topics.length > 0) {
        parts.push(`关注主题：${context.preferences.topics.join(', ')}`);
      }
      if (context.preferences.keywords && context.preferences.keywords.length > 0) {
        parts.push(`关注关键词：${context.preferences.keywords.join(', ')}`);
      }
      if (context.preferences.techDirections && context.preferences.techDirections.length > 0) {
        parts.push(`技术方向：${context.preferences.techDirections.join(', ')}`);
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : '暂无上下文信息';
  }

  /**
   * 解析 AI 响应（提取 JSON）
   */
  _parseAIResponse(content) {
    // 尝试直接解析
    try {
      return JSON.parse(content);
    } catch (e) {}

    // 尝试提取 JSON 块
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {}
    }

    // 解析失败返回保守结果
    return {
      category: '未分类',
      summary: content.substring(0, 100) || '信息不足，无法判断',
      tags: [],
      relevanceScore: 0,
      importanceScore: 0,
      relevanceReason: '',
      relatedKnowledge: [],
      relatedProjects: [],
    };
  }

  /**
   * 批量处理信息（并发控制）
   */
  async processBatch(items, context = {}, concurrency = 3) {
    const results = [];
    const queue = [...items];

    async function worker() {
      while (queue.length > 0) {
        const item = queue.shift();
        try {
          const result = await this.process(item, context);
          results.push({ item, result });
        } catch (err) {
          console.error('[AIProcessor] 批量处理失败:', err.message);
          results.push({ item, result: null, error: err.message });
        }
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker.call(this));
    await Promise.all(workers);

    return results;
  }
}

module.exports = AIProcessor;