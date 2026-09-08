/**
 * Public Tools - 公开工具集合
 * 
 * Meet Siyi 和 Personal AI 均可调用。
 * 从原 ai-persona.js TOOLS 迁移而来。
 */

const KnowledgeService = require('../../knowledge/service');

let knowledgeService = null;

function getKnowledgeService() {
  if (!knowledgeService) {
    knowledgeService = new KnowledgeService();
  }
  return knowledgeService;
}

module.exports = [
  // ========== 个人信息 ==========
  {
    name: 'get_profile',
    category: 'public',
    description: '获取思意的基本个人信息，包括身份、当前方向、自我描述、兴趣爱好等。',
    parameters: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          description: '要获取的信息部分：basic / direction / self_description / interests / all',
          enum: ['basic', 'direction', 'self_description', 'interests', 'all'],
          default: 'all',
        },
      },
    },
    execute: async (args) => {
      const ks = getKnowledgeService();
      const doc = await ks.getDocument('public-identity');
      return doc ? { profile: doc.content } : { profile: null, note: '未找到个人信息文档' };
    },
  },

  // ========== 项目信息 ==========
  {
    name: 'get_projects',
    category: 'public',
    description: '获取思意的项目列表和项目详情。包含项目背景、为什么做、解决的问题、实现过程、个人收获。',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: '项目ID，不传则返回所有项目列表',
        },
        includeDetail: {
          type: 'boolean',
          description: '是否包含详细信息',
          default: true,
        },
      },
    },
    execute: async (args) => {
      const ks = getKnowledgeService();
      if (args.projectId) {
        const doc = await ks.getDocument(`project-${args.projectId}`);
        return doc ? { project: doc } : { error: '项目不存在' };
      }
      const results = await ks.searchKnowledge('项目', { visibility: 'public', topK: 10 });
      return { projects: results.filter(r => r.id.includes('project') || r.title.includes('项目')) };
    },
  },

  // ========== 成长故事 ==========
  {
    name: 'get_growth_story',
    category: 'public',
    description: '获取思意的成长故事，包括为什么学习AI、为什么搭建个人网站、为什么做Personal AI、AI如何改变学习方式等。',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: '故事主题：why_ai / why_website / why_personal_ai / ai_change / all',
          enum: ['why_ai', 'why_website', 'why_personal_ai', 'ai_change', 'all'],
          default: 'all',
        },
      },
    },
    execute: async (args) => {
      const ks = getKnowledgeService();
      const doc = await ks.getDocument('public-growth_story');
      return doc ? { story: doc.content } : { story: null };
    },
  },

  // ========== 当前状态 ==========
  {
    name: 'get_current_focus',
    category: 'public',
    description: '获取思意当前正在做什么、关注什么、近期计划等。',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      const ks = getKnowledgeService();
      const doc = await ks.getDocument('public-current_focus');
      return doc ? { currentFocus: doc.content } : { currentFocus: null, note: '暂无当前状态记录' };
    },
  },

  // ========== 公开知识检索 ==========
  {
    name: 'search_public_knowledge',
    category: 'public',
    description: '在思意的公开知识库中搜索相关内容。包括人格知识、项目、成长故事、工作方式等。当用户的问题无法通过其他工具直接回答时使用。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索查询',
        },
        topK: {
          type: 'number',
          description: '返回结果数量',
          default: 3,
        },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const ks = getKnowledgeService();
      const results = await ks.searchKnowledge(args.query, {
        visibility: 'public',
        topK: args.topK || 3,
      });
      return { results, count: results.length };
    },
  },

  // ========== 联系方式 ==========
  {
    name: 'get_contact_card',
    category: 'public',
    description: '获取思意的联系方式，包括邮箱、GitHub、个人网站等。',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      return {
        contact: {
          email: 'siyi@example.com',
          github: 'https://github.com/siyi',
          website: 'https://siyi.example.com',
          note: '具体联系方式请以实际配置为准',
        },
      };
    },
  },
];
