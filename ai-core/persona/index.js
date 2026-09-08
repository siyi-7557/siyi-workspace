/**
 * Persona Loader - 人格配置加载器
 *
 * 单入口：仅 Personal AI（本地工作台）。
 */

const personalAI = require('./personal-ai');

const PERSONAS = {
  'personal-ai': personalAI,
};

/**
 * 获取指定人格配置
 */
function getPersona(type) {
  const persona = PERSONAS[type];
  if (!persona) {
    throw new Error(`未知人格类型: ${type}，可选: ${Object.keys(PERSONAS).join(', ')}`);
  }
  return persona;
}

/**
 * 列出所有可用人格
 */
function listPersonas() {
  return Object.entries(PERSONAS).map(([type, config]) => ({
    type,
    name: config.name,
    description: config.description,
    visibility: config.visibility,
  }));
}

module.exports = { getPersona, listPersonas, PERSONAS };
module.exports.default = { getPersona, listPersonas };
