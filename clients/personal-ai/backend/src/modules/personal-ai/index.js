/**
 * Personal AI 模块入口
 * 注册所有工具并导出路由
 */

const express = require('express');
const router = require('./route');
const toolRegistry = require('../../core/ai/tool-registry');

// ========== 注册所有工具 ==========

// Knowledge Tools
const knowledgeTools = require('../../core/ai/tools/knowledge');
toolRegistry.registerAll(knowledgeTools);

// Prompt Tools
const promptTools = require('../../core/ai/tools/prompts');
toolRegistry.registerAll(promptTools);

// Review Tools
const reviewTools = require('../../core/ai/tools/reviews');
toolRegistry.registerAll(reviewTools);

// Action Tools
const actionTools = require('../../core/ai/tools/actions');
toolRegistry.registerAll(actionTools);

console.log('[PersonalAI] 工具注册完成，可用工具:', toolRegistry.listNames());

module.exports = {
  name: 'personal-ai',
  router,
};
