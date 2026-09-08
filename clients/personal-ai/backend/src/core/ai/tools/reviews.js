/**
 * Review Tools - AI 复盘工具
 * 基于 Obsidian AI复盘目录的搜索和获取
 * 复用 obsidian-scanner.js 的扫描能力
 */

const obsidianScanner = require('../../obsidian/obsidian-scanner');
const aiClient = require('../client');

// ========== review.search ==========

const reviewSearch = {
  name: 'review.search',
  description: '搜索用户的 AI 复盘记录，查找最近的 AI 工作复盘。支持关键词过滤（匹配标题、项目名、标签），按日期排序。返回复盘的摘要信息（不返回完整内容）。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词，匹配标题、项目名、标签（可选，不传则返回最近的复盘）',
      },
      limit: {
        type: 'integer',
        description: '返回结果数量，默认 10，最多 30',
        default: 10,
      },
      sortBy: {
        type: 'string',
        description: '排序方式：date（按日期）、score（按评分）、problems（按问题数）',
        default: 'date',
      },
    },
  },
  async execute(args) {
    const { query, limit = 10, sortBy = 'date' } = args;
    const safeLimit = Math.min(Math.max(limit, 1), 30);

    try {
      // 扫描所有复盘（取足够多用于过滤）
      const result = obsidianScanner.scanReviews({
        page: 1,
        pageSize: Math.max(safeLimit * 3, 50),
        sortBy,
        sortOrder: 'desc',
      });

      let reviews = result.reviews || [];

      // 关键词过滤
      if (query && query.trim()) {
        const q = query.toLowerCase();
        reviews = reviews.filter(r => {
          const title = (r.title || '').toLowerCase();
          const project = (r.projectName || r.project || '').toLowerCase();
          const tags = Array.isArray(r.tags) ? r.tags.join(' ').toLowerCase() : '';
          return title.includes(q) || project.includes(q) || tags.includes(q);
        });
      }

      // 限制数量
      reviews = reviews.slice(0, safeLimit);

      return {
        query: query || null,
        total: reviews.length,
        totalAvailable: result.total || 0,
        results: reviews.map(r => ({
          path: r.path || r.relPath || '',
          title: r.title || '',
          date: r.date || '',
          projectName: r.projectName || r.project || '',
          score: r.score || r.overallScore || null,
          problemCount: r.problemCount || r.problems?.length || 0,
          learningCount: r.learningCount || r.learnings?.length || 0,
          actionCount: r.actionCount || r.actions?.length || 0,
          tags: r.tags || [],
          source: r.source || '',
        })),
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'REVIEW_SEARCH_ERROR',
          message: `搜索复盘失败: ${err.message}`,
        },
      };
    }
  },
};

// ========== review.get ==========

const reviewGet = {
  name: 'review.get',
  description: '获取一篇 AI 复盘的完整内容和结构化摘要。需要知道复盘的相对路径（从 review.search 的结果中获取 path 字段）。返回复盘的关键板块摘要（目标、完成度、问题、学习收获、行动项），不返回完整原文。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '复盘文件的相对路径（相对于 AI复盘 目录），例如 "2026-08-25-项目名-复盘.md"',
      },
    },
    required: ['path'],
  },
  async execute(args) {
    const { path } = args;

    try {
      const detail = obsidianScanner.getReviewDetail(path);

      if (!detail) {
        return {
          success: false,
          error: {
            code: 'REVIEW_NOT_FOUND',
            message: `复盘不存在: ${path}`,
          },
        };
      }

      // 提取结构化摘要（从 frontmatter 和内容中提取关键信息）
      const summary = this._extractSummary(detail);
      const fm = detail.frontmatter || {};

      return {
        path: detail.path || path,
        title: detail.title || fm.title || '',
        date: fm.date || fm.created || detail.mtime || '',
        projectName: fm.projectName || fm.project || '',
        score: fm.score || fm.overallScore || null,
        source: fm.source || '',
        tags: fm.tags || [],
        summary,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'REVIEW_GET_ERROR',
          message: `获取复盘失败: ${err.message}`,
        },
      };
    }
  },

  _extractSummary(detail) {
    const content = detail.content || '';
    const fm = detail.frontmatter || detail;

    // 尝试从 frontmatter 获取结构化数据
    const summary = {
      goal: fm.goal || fm.objective || '',
      completion: fm.completion || fm.completionRate || '',
      problems: fm.problems || [],
      goodPractices: fm.goodPractices || fm.highlights || [],
      learnings: fm.learnings || [],
      actions: fm.actions || fm.actionItems || [],
      abilityScores: fm.abilityScores || fm.scores || {},
    };

    // 如果 frontmatter 没有结构化数据，从内容中简单提取
    if (!summary.goal && content) {
      const goalMatch = content.match(/目标[：:]\s*(.+?)(?:\n|$)/);
      if (goalMatch) summary.goal = goalMatch[1].trim();
    }

    // 统计问题数量（如果没有结构化数据）
    if (summary.problems.length === 0 && content) {
      const problemSection = content.match(/典型问题[\s\S]*?(?=\n##|\n###|$)/);
      if (problemSection) {
        const problemMatches = problemSection[0].match(/\d+\.\s+(.+?)(?:\n|$)/g);
        if (problemMatches) {
          summary.problems = problemMatches.map(m => m.replace(/^\d+\.\s+/, '').trim()).slice(0, 10);
        }
      }
    }

    return summary;
  },
};

// ========== review.quality ==========

const reviewQuality = {
  name: 'review.quality',
  description: '分析最近一段时间内 AI 复盘的质量趋势。返回该时间段内每篇复盘的评分（0-100，含完整性/证据/可执行性/学习深度/问题深度五个维度）、平均分、以及相比更早一段时间的升降方向与具体分数依据。用于回答"复盘质量在变好还是变差、依据是什么"这类问题。',
  parameters: {
    type: 'object',
    properties: {
      days: {
        type: 'integer',
        description: '要分析的时间范围（最近 N 天），支持 7/14/30/90，默认 30',
        default: 30,
      },
      compare: {
        type: 'boolean',
        description: '是否与更早一段（前 N 天）对比升降方向，默认 true',
        default: true,
      },
    },
  },
  async execute(args) {
    const { days = 30, compare = true } = args;
    const safeDays = [7, 14, 30, 90].includes(days) ? days : 30;
    const now = Date.now();
    const msPerDay = 86400000;

    const quality = obsidianScanner.getAllReviewQualityScores();
    const allScores = quality.scores || [];

    const inWindow = (s, startDays, endDays) => {
      if (!s || !s.date) return false;
      const d = new Date(s.date);
      if (isNaN(d.getTime())) return false;
      const diff = (now - d.getTime()) / msPerDay;
      return diff >= startDays - 0.5 && diff <= endDays + 0.5;
    };

    const cur = allScores.filter(s => inWindow(s, 0, safeDays));
    const prev = compare ? allScores.filter(s => inWindow(s, safeDays, safeDays * 2)) : [];

    const avg = arr => arr.length ? Math.round(arr.reduce((a, s) => a + (s.totalScore || 0), 0) / arr.length) : null;
    const curAvg = avg(cur);
    const prevAvg = avg(prev);

    // 方向判定：相差 ≥2 分才算明显变化，避免小幅波动误导
    let direction = 'flat';
    if (curAvg != null && prevAvg != null) {
      if (curAvg - prevAvg >= 2) direction = 'up';
      else if (prevAvg - curAvg >= 2) direction = 'down';
    }

    // 区间内五个维度平均分
    const dimKeys = ['completeness', 'evidence', 'actionability', 'learningDepth', 'problemDepth'];
    const dimensionAverages = {};
    if (cur.length) {
      dimKeys.forEach(k => {
        dimensionAverages[k] = Math.round(cur.reduce((a, s) => a + ((s.scores && s.scores[k]) || 0), 0) / cur.length);
      });
    }

    // 按时间升序的质量序列
    const series = cur
      .map(s => ({ date: s.date, title: s.title, totalScore: s.totalScore, grade: s.grade }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // 用 LLM 依据真实分数给出简洁判断
    let assessment = '';
    try {
      const seriesText = series.length
        ? series.map(s => `${s.date} ${s.title}：${s.totalScore}分(${s.grade})`).join('\n')
        : '（该时间段内没有复盘记录）';
      assessment = await aiClient.chat([
        {
          role: 'system',
          content: `你是复盘质量分析助手。基于给出的真实评分数据回答"复盘质量在变好还是变差、依据什么判断"。要求：
1. 必须引用具体数字（平均分、首尾分数、具体某篇的分数）作为依据，不要泛泛而谈；
2. 明确指出是上升、下降还是基本持平，以及变化幅度；
3. 若维度数据可用，指出最弱/最强的维度作为改进建议依据；
4. 控制在 150 字内，用中文，简洁直接。`,
        },
        {
          role: 'user',
          content: `最近${safeDays}天复盘质量序列（平均分 ${curAvg}，对比更早${safeDays}天平均分 ${prevAvg}，方向 ${direction}）：
${seriesText}`,
        },
      ]);
    } catch (e) {
      assessment = '';
    }

    return {
      days: safeDays,
      total: cur.length,
      avgScore: curAvg,
      prevAvgScore: prevAvg,
      direction,
      firstScore: series.length ? series[0].totalScore : null,
      lastScore: series.length ? series[series.length - 1].totalScore : null,
      dimensionAverages,
      series,
      assessment,
    };
  },
};

// ========== review.patterns ==========

const reviewPatterns = {
  name: 'review.patterns',
  description: '分析最近 AI 复盘中重复出现的问题模式。返回重复出现的问题（含出现次数、占总问题比例、浪费轮次、严重度）、以及最典型的几条问题样例。用于回答"提炼重复出现的一个问题 / 我反复踩的坑是什么"这类问题。',
  parameters: {
    type: 'object',
    properties: {
      top: {
        type: 'integer',
        description: '返回重复问题模式的条数，默认 5，最多 10',
        default: 5,
      },
    },
  },
  async execute(args) {
    const { top = 5 } = args;
    const safeTop = Math.min(Math.max(top, 1), 10);

    const analysis = obsidianScanner.analyzePatterns();
    if (!analysis || !analysis.patterns || analysis.patterns.length === 0) {
      return {
        totalReviews: analysis ? analysis.totalReviews : 0,
        totalProblems: analysis ? analysis.totalProblems : 0,
        patterns: [],
        topProblems: [],
        assessment: analysis && analysis.message ? analysis.message : '没有可分析的复盘数据',
      };
    }

    const patterns = (analysis.patterns || []).slice(0, safeTop);
    const topProblems = (analysis.topProblems || []).slice(0, 3);

    // 用 LLM 依据真实统计提炼"重复出现的问题"，必须引用次数/占比
    let assessment = '';
    try {
      const patternText = patterns.map(p =>
        `- ${p.name}：出现 ${p.count} 次（占总问题 ${p.percentage}%），累计浪费 ${p.totalWastedTurns} 轮`
      ).join('\n');
      const samplesText = topProblems.length
        ? topProblems.map((p, i) => `${i + 1}. ${p.title}（${p.reviewDate}，浪费 ${p.wastedTurns} 轮）`).join('\n')
        : '';
      assessment = await aiClient.chat([
        {
          role: 'system',
          content: `你是复盘问题分析助手。基于真实的重复问题统计数据，提炼"最近复盘中重复出现的问题"。要求：
1. 明确指出重复次数最多/最值得关注的那个问题，并引用具体次数和占比作为依据；
2. 简要说明这个问题的典型表现，可引用 1 个具体样例；
3. 如数据支持，给 1 句针对性改进建议；
4. 控制在 180 字内，用中文，具体、直接，不要空话。`,
        },
        {
          role: 'user',
          content: `共分析 ${analysis.totalReviews} 篇复盘、${analysis.totalProblems} 个问题。\n重复问题模式：\n${patternText}\n${samplesText ? '典型样例：\n' + samplesText : ''}`,
        },
      ]);
    } catch (e) {
      assessment = '';
    }

    return {
      totalReviews: analysis.totalReviews,
      totalProblems: analysis.totalProblems,
      patterns,
      topProblems,
      assessment,
    };
  },
};

// ========== 导出所有工具 ==========

module.exports = [reviewSearch, reviewGet, reviewQuality, reviewPatterns];
