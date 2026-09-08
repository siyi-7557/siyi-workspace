/**
 * Demo Mode 初始化
 *
 * 1. 确保 .env 存在（从 .env.example 复制）
 * 2. 打印下一步启动方式
 *
 * 用法：npm run demo:init
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envFile = path.join(root, '.env');
const envExample = path.join(root, '.env.example');

function ensureEnv() {
  if (fs.existsSync(envFile)) {
    console.log('[demo:init] .env 已存在，跳过');
    return;
  }
  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, envFile);
    console.log('[demo:init] 已从 .env.example 生成 .env');
    console.log('[demo:init]   —— 请填入 ZHIPU_API_KEY（聊天用，自填）');
    console.log('[demo:init]   —— 视图/检索/记忆无需 Key 即可看效果');
  } else {
    console.log('[demo:init] 未找到 .env.example，请手动创建 .env');
  }
}

console.log('\n[Demo Mode 初始化]');
console.log('  演示 Vault: ' + path.join(__dirname, 'vault'));
ensureEnv();
console.log('\n  下一步（任选其一）：');
console.log('    npm run demo:app   启动真实工作台前端（复刻你界面，http://localhost:8788）');
console.log('    npm run demo:web   零依赖小演示（快速能力预览，http://localhost:8789）');
console.log('    npm run eval:rag   跑 RAG 召回评测（Recall@1/3/5 + MRR）\n');
