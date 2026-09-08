/**
 * 信息分类体系配置
 * 
 * 第一阶段分类，配置化，未来可调整。
 * 分类用于 AI 信息分类和前端筛选。
 */

const CATEGORIES = [
  {
    id: 'AI',
    name: 'AI',
    description: '人工智能、大模型、机器学习相关',
    keywords: ['AI', 'LLM', '大模型', '机器学习', '深度学习', 'GPT', 'Agent', 'RAG', 'embedding', 'transformer', '神经网络', 'NLP', '计算机视觉'],
    color: '#7A5ECD',
  },
  {
    id: 'Agent',
    name: 'Agent',
    description: '智能体、多智能体、自主代理相关',
    keywords: ['Agent', '智能体', '多智能体', 'Multi-Agent', 'autonomous', 'tool use', 'function calling', 'workflow', 'orchestration', 'MCP', 'A2A'],
    color: '#E07A5F',
  },
  {
    id: 'Product',
    name: 'Product',
    description: '产品设计、产品管理、用户体验相关',
    keywords: ['产品', 'Product', 'UX', 'UI', '用户体验', '交互设计', '产品设计', '需求', 'PRD', '用户研究', '增长', '留存'],
    color: '#3D8B7A',
  },
  {
    id: 'Design',
    name: 'Design',
    description: '设计、视觉、创意相关',
    keywords: ['设计', 'Design', '视觉', '排版', '字体', '色彩', '品牌', '平面设计', '3D', '动效', 'illustration', 'figma'],
    color: '#C9A227',
  },
  {
    id: 'Development',
    name: 'Development',
    description: '软件开发、编程、工程实践相关',
    keywords: ['开发', 'Development', '编程', '代码', '架构', '后端', '前端', '全栈', 'DevOps', 'CI/CD', '测试', '重构', '设计模式', '算法'],
    color: '#4A90D9',
  },
  {
    id: 'Tools',
    name: 'Tools',
    description: '开发工具、效率工具、软件推荐相关',
    keywords: ['工具', 'Tools', '效率', '软件', '插件', 'VS Code', 'CLI', '命令行', '自动化', '生产力', 'workflow', 'shortcut'],
    color: '#8B5CF6',
  },
  {
    id: 'Industry',
    name: 'Industry',
    description: '行业动态、趋势、商业相关',
    keywords: ['行业', 'Industry', '趋势', '商业', '市场', '创业', '投资', '融资', '政策', '经济', '科技动态', '行业报告'],
    color: '#DC2626',
  },
  {
    id: 'Learning',
    name: 'Learning',
    description: '学习方法、教育、个人成长相关',
    keywords: ['学习', 'Learning', '教育', '成长', '方法论', '认知', '思维', '习惯', '时间管理', '知识管理', '笔记', '复盘'],
    color: '#059669',
  },
];

/**
 * 获取所有分类
 */
function getAllCategories() {
  return CATEGORIES.map(c => ({ id: c.id, name: c.name, description: c.description, color: c.color }));
}

/**
 * 根据文本匹配分类（基于关键词）
 * @param {string} text - 标题+摘要+内容
 * @returns {string} 分类 ID
 */
function matchCategory(text) {
  if (!text) return '未分类';
  
  const lowerText = text.toLowerCase();
  let bestCategory = '未分类';
  let bestScore = 0;

  for (const cat of CATEGORIES) {
    let score = 0;
    for (const keyword of cat.keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat.id;
    }
  }

  return bestCategory;
}

/**
 * 获取分类的颜色
 */
function getCategoryColor(categoryId) {
  const cat = CATEGORIES.find(c => c.id === categoryId);
  return cat ? cat.color : '#817C90';
}

module.exports = { CATEGORIES, getAllCategories, matchCategory, getCategoryColor };