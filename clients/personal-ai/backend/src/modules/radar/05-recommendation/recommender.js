/**
 * RecommendationService - 推荐排序服务
 * 
 * 负责信息的相关性评分、排序和分区。
 * 
 * 评分维度（综合考虑）：
 * - 与当前项目的相关性（40%）
 * - 与学习方向的相关性（25%）
 * - 与长期兴趣的相关性（15%）
 * - 信息时效性（10%）
 * - 信息质量（10%）
 * 
 * 分区：
 * - 今日值得看：relevanceScore > 0.7 且 24h 内
 * - 与你有关：有 relatedProjects 或 relatedKnowledge
 * - 正在关注：用户关注的 category/source
 * - 已保存：isSaved=true
 */

class RecommendationService {
  constructor(options = {}) {
    this.weights = options.weights || {
      projectRelevance: 0.4,
      learningRelevance: 0.25,
      interestRelevance: 0.15,
      timeliness: 0.1,
      quality: 0.1,
    };
  }

  /**
   * 计算综合评分
   * @param {Object} item - RadarItem
   * @param {Object} context - 用户上下文 {projects, preferences, ignoredCategories, ignoredSources}
   * @returns {number} 综合评分 0-1
   */
  calculateScore(item, context = {}) {
    // 基础分（AI 给出的相关性和重要性）
    const aiRelevance = item.relevanceScore || 0;
    const aiImportance = item.importanceScore || 0;
    const baseScore = aiRelevance * 0.6 + aiImportance * 0.4;

    // 项目相关性加分
    let projectBonus = 0;
    if (item.relatedProjects && item.relatedProjects.length > 0) {
      projectBonus = 0.3 * Math.min(item.relatedProjects.length, 3) / 3;
    }

    // 知识关联加分
    let knowledgeBonus = 0;
    if (item.relatedKnowledge && item.relatedKnowledge.length > 0) {
      knowledgeBonus = 0.2 * Math.min(item.relatedKnowledge.length, 3) / 3;
    }

    // 时效性加分
    let timelinessBonus = 0;
    if (item.publishedAt) {
      const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60);
      if (ageHours < 24) timelinessBonus = 0.15;
      else if (ageHours < 72) timelinessBonus = 0.08;
      else if (ageHours < 168) timelinessBonus = 0.03;
    }

    // 用户关注加分
    let preferenceBonus = 0;
    if (context.preferences) {
      if (context.preferences.categories && context.preferences.categories.includes(item.category)) {
        preferenceBonus += 0.1;
      }
      if (context.preferences.sources && context.preferences.sources.includes(item.source)) {
        preferenceBonus += 0.05;
      }
      if (context.preferences.keywords && item.tags) {
        const matchCount = item.tags.filter(t => 
          context.preferences.keywords.some(k => t.toLowerCase().includes(k.toLowerCase()))
        ).length;
        preferenceBonus += 0.05 * Math.min(matchCount, 3);
      }
    }

    // 忽略减分
    let penalty = 0;
    if (context.ignoredCategories && context.ignoredCategories.includes(item.category)) {
      penalty += 0.5;
    }
    if (context.ignoredSources && context.ignoredSources.includes(item.source)) {
      penalty += 0.3;
    }
    if (item.status === 'ignored') {
      penalty += 1.0; // 已忽略的直接排除
    }

    // 综合评分
    const score = Math.max(0, Math.min(1, 
      baseScore * 0.5 + projectBonus + knowledgeBonus + timelinessBonus + preferenceBonus - penalty
    ));

    return score;
  }

  /**
   * 排序信息列表
   * @param {Array} items - RadarItem 数组
   * @param {Object} context - 用户上下文
   * @param {Object} options - {sortBy: 'relevance'|'time'|'importance', limit}
   * @returns {Array} 排序后的数组
   */
  sort(items, context = {}, options = {}) {
    const sortBy = options.sortBy || 'relevance';
    const limit = options.limit || items.length;

    const scored = items.map(item => ({
      item,
      score: this.calculateScore(item, context),
    }));

    if (sortBy === 'relevance') {
      scored.sort((a, b) => b.score - a.score);
    } else if (sortBy === 'time') {
      scored.sort((a, b) => 
        new Date(b.item.publishedAt || b.item.collectedAt) - 
        new Date(a.item.publishedAt || a.item.collectedAt)
      );
    } else if (sortBy === 'importance') {
      scored.sort((a, b) => (b.item.importanceScore || 0) - (a.item.importanceScore || 0));
    }

    return scored.slice(0, limit).map(s => ({
      ...s.item,
      recommendationScore: s.score,
    }));
  }

  /**
   * 分区信息
   * @param {Array} items - RadarItem 数组
   * @param {Object} context - 用户上下文
   * @returns {Object} {todayWorth, relatedToYou, following, saved, later}
   */
  partition(items, context = {}) {
    const now = Date.now();
    const twoDays = 48 * 60 * 60 * 1000; // 时间窗：近 48h 采集到的都算"新"

    const partitions = {
      todayWorth: [],    // 今日值得看：近期采集且综合分高
      relatedToYou: [],  // 与你有关：有关联项目或知识
      following: [],     // 正在关注：用户关注分类/来源（及其余默认）
      saved: [],         // 已保存
      later: [],         // 稍后阅读
    };

    for (const raw of items) {
      const item = { ...raw, recommendationScore: this.calculateScore(raw, context) };

      // 已保存
      if (item.isSaved) {
        partitions.saved.push(item);
        continue;
      }

      // 稍后阅读：独立分区，不被其他分区吞掉
      if (item.status === 'later') {
        partitions.later.push(item);
        continue;
      }

      // 已忽略：不进入任何展示分区
      if (item.status === 'ignored') continue;

      // "新"以采集时间为准（RSS 原文发布时间可能早已超过 24h），回退发布时间
      const itemTime = new Date(item.collectedAt || item.publishedAt || 0).getTime();
      const isRecent = itemTime && (now - itemTime) < twoDays;

      // 今日值得看：近 48h 采集到，且综合分达到阈值
      if (isRecent && item.recommendationScore >= 0.5) {
        partitions.todayWorth.push(item);
        continue;
      }

      // 与你有关：有关联项目或知识
      if ((item.relatedProjects && item.relatedProjects.length > 0) ||
          (item.relatedKnowledge && item.relatedKnowledge.length > 0)) {
        partitions.relatedToYou.push(item);
        continue;
      }

      // 正在关注：用户关注的分类或来源
      if (context.preferences) {
        const categoryMatch = context.preferences.categories?.includes(item.category);
        const sourceMatch = context.preferences.sources?.includes(item.source);
        if (categoryMatch || sourceMatch) {
          partitions.following.push(item);
          continue;
        }
      }

      // 其余归入"正在关注"（默认展示区）
      partitions.following.push(item);
    }

    // 每个分区按综合相关性排序
    for (const key of Object.keys(partitions)) {
      partitions[key].sort((a, b) => (b.recommendationScore || 0) - (a.recommendationScore || 0));
    }

    return partitions;
  }

  /**
   * 获取"为什么推荐给我"的判断依据
   * @param {Object} item - RadarItem
   * @param {Object} context - 用户上下文
   * @returns {Object} {score, reasons: string[]}
   */
  getWhyRecommended(item, context = {}) {
    const score = this.calculateScore(item, context);
    const reasons = [];

    // AI 相关性理由
    if (item.relevanceReason) {
      reasons.push(item.relevanceReason);
    }

    // 项目关联
    if (item.relatedProjects && item.relatedProjects.length > 0) {
      reasons.push(`与你的 ${item.relatedProjects.length} 个项目相关`);
    }

    // 知识关联
    if (item.relatedKnowledge && item.relatedKnowledge.length > 0) {
      reasons.push(`与你的已有知识领域相关`);
    }

    // 时效性
    if (item.publishedAt) {
      const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60);
      if (ageHours < 24) reasons.push('24小时内发布的新信息');
    }

    // 用户关注
    if (context.preferences?.categories?.includes(item.category)) {
      reasons.push(`属于你关注的 ${item.category} 分类`);
    }

    return {
      score,
      reasons: reasons.slice(0, 4), // 最多4条，控制在几句话以内
    };
  }
}

module.exports = RecommendationService;