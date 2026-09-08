#!/usr/bin/env node
/**
 * seed-demo.js - 植入演示数据
 *
 * 将 examples/demo-data/ 下的虚构演示数据（人物「林拾意」）复制到 data/ 目录，
 * 让新 clone 的仓库可以立即体验信息雷达、记忆检索等完整流程。
 *
 * 用法：
 *   node scripts/seed-demo.js            # data/ 已有真实数据时会拒绝执行
 *   node scripts/seed-demo.js --force    # 强制植入（只新增 demo 文件，不覆盖、不删除已有文件）
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const demoDir = path.join(rootDir, 'examples', 'demo-data');
const dataDir = path.join(rootDir, 'data');
const force = process.argv.includes('--force');

function copyDir(src, dst) {
  let count = 0;
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) {
      count += copyDir(s, d);
    } else {
      if (fs.existsSync(d)) {
        console.log(`  跳过（已存在）: ${path.relative(rootDir, d)}`);
        continue;
      }
      fs.copyFileSync(s, d);
      console.log(`  已植入: ${path.relative(rootDir, d)}`);
      count++;
    }
  }
  return count;
}

function dirHasFiles(dir) {
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some(f => !f.startsWith('.'));
}

console.log('[seed-demo] 植入演示数据（虚构人物「林拾意」，不含真实个人数据）\n');

// 安全检查：data/ 已有真实数据时，必须显式 --force
if (!force) {
  const eventsDir = path.join(dataDir, 'events');
  const memoryDir = path.join(dataDir, 'memory');
  if (dirHasFiles(eventsDir) || dirHasFiles(memoryDir)) {
    console.error('[seed-demo] 检测到 data/ 下已有数据（可能是你的真实运行数据）。');
    console.error('[seed-demo] 如确认要合并植入 demo 数据（不会覆盖已有文件），请使用:');
    console.error('           node scripts/seed-demo.js --force');
    process.exit(1);
  }
}

let total = 0;
for (const sub of ['events', 'memory']) {
  const src = path.join(demoDir, sub);
  if (fs.existsSync(src)) {
    console.log(`→ ${sub}/`);
    total += copyDir(src, path.join(dataDir, sub));
  }
}

console.log(`\n[seed-demo] 完成，共植入 ${total} 个文件。`);
console.log('[seed-demo] 现在可以启动工作台体验信息雷达与记忆检索的完整流程。');
