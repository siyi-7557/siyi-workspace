/**
 * 默认信息源配置
 * 
 * 第一阶段预置几个高质量 RSS 源，用户可以后续添加/删除。
 * 信息源不写死在页面中，通过 SourceAdapter 架构扩展。
 */

const DEFAULT_SOURCES = [
  {
    name: 'Hacker News',
    type: 'rss',
    url: 'https://hnrss.org/frontpage',
    category: 'Development',
    enabled: true,
    description: '黑客新闻首页，技术圈高质量讨论',
  },
  {
    name: 'Product Hunt',
    type: 'rss',
    url: 'https://www.producthunt.com/feed',
    category: 'Product',
    enabled: true,
    description: '每日新产品发布，发现创新产品',
  },
  {
    name: 'GitHub Trending',
    type: 'rss',
    url: 'https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml',
    category: 'Development',
    enabled: true,
    description: 'GitHub 每日热门开源项目',
  },
  {
    name: 'AI News - MIT Technology Review',
    type: 'rss',
    url: 'https://www.technologyreview.com/feed/',
    category: 'AI',
    enabled: true,
    description: 'MIT 科技评论，深度 AI 报道',
  },
  {
    name: 'Smashing Magazine',
    type: 'rss',
    url: 'https://www.smashingmagazine.com/feed/',
    category: 'Design',
    enabled: true,
    description: '设计与前端开发深度文章',
  },
];

/**
 * 获取默认信息源列表
 */
function getDefaultSources() {
  return DEFAULT_SOURCES.map(s => ({ ...s }));
}

/**
 * 初始化默认信息源（如果数据库中没有的话）
 */
function shouldInitializeDefaults(existingSources) {
  return existingSources.length === 0;
}

module.exports = { DEFAULT_SOURCES, getDefaultSources, shouldInitializeDefaults };