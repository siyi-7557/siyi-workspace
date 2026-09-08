const path = require('path');
// 优先读取包根目录（clients/personal-ai/.env，与 .env.example 同级，npm 用户习惯），
// backend/.env 作为后备，两者不同时加载以避免覆盖冲突。
const rootEnvFile = path.join(__dirname, '..', '.env');
const localEnvFile = path.join(__dirname, '.env');
const envFile = require('fs').existsSync(rootEnvFile) ? rootEnvFile : localEnvFile;
if (require('fs').existsSync(envFile)) {
  require('dotenv').config({ path: envFile });
}

// 设置本地数据目录，避免沙箱访问 %APPDATA% 受限
const fs = require('fs');
const LOCAL_DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(LOCAL_DATA_DIR)) {
  fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
}
process.env.SIYI_DATA_DIR = LOCAL_DATA_DIR;
const crashLog = path.join(__dirname, 'crash.log');
process.on('uncaughtException', (err) => {
  const msg = `[${new Date().toISOString()}] uncaughtException: ${err.message}\n${err.stack}\n`;
  console.error(msg);
  try { fs.appendFileSync(crashLog, msg); } catch(e) {}
});
process.on('unhandledRejection', (reason, promise) => {
  const msg = `[${new Date().toISOString()}] unhandledRejection: ${reason}\n`;
  console.error(msg);
  try { fs.appendFileSync(crashLog, msg); } catch(e) {}
});

const app = require('./src/index');
const config = require('./src/config');

const PORT = config.port || 8788;

function startServer(host) {
  const server = app.listen(PORT, host, () => {
    console.log(`\n  思意工作台已启动`);
    console.log(`  本地地址: http://localhost:${PORT}`);
    console.log(`  监听接口: ${host || '所有接口（::）'}`);
    console.log(`  环境: ${process.env.NODE_ENV || 'development'}\n`);
    // 启动自动定时备份
    startAutoBackup();
  });
  // 端口被本机出站连接的临时源端口占用时，回退到回环地址，保证本地可访问
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && host !== '127.0.0.1') {
      console.log(`  端口 ${PORT} 在默认接口被占用，回退绑定 127.0.0.1 ...`);
      startServer('127.0.0.1');
    } else {
      console.error('  服务启动失败:', err.message);
      process.exit(1);
    }
  });
}
startServer();

// 自动定时备份 - 每天凌晨3点自动备份
function startAutoBackup() {
  const BACKUP_HOUR = 3; // 凌晨3点
  let lastBackupDate = null;

  function checkAndBackup() {
    const now = new Date();
    const today = now.toDateString();
    // 检查是否到了备份时间，且今天还没有备份过
    if (now.getHours() === BACKUP_HOUR && lastBackupDate !== today) {
      try {
        console.log(`[AutoBackup] 开始自动备份: ${now.toLocaleString('zh-CN')}`);
        const backup = require('./src/modules/backup/service');
        const result = backup.createBackup('自动定时备份');
        lastBackupDate = today;
        console.log(`[AutoBackup] 自动备份完成: ${result.id}, 大小: ${backup.formatSize(result.size || 0)}`);
      } catch (err) {
        console.error('[AutoBackup] 自动备份失败:', err.message);
      }
    }
  }

  // 每10分钟检查一次
  setInterval(checkAndBackup, 10 * 60 * 1000);

  // 启动时立即检查一次
  checkAndBackup();

  console.log('[AutoBackup] 自动定时备份已启动，每天凌晨3点自动备份');
}
