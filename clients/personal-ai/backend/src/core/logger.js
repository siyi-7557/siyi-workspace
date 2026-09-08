const fs = require('fs');
const path = require('path');
const config = require('./config');

const LOG_DIR = config.LOG_DIR;

// 日志级别
const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

let currentLevel = LEVELS.info;
let logFile = null;
let logStream = null;

// 获取当前日志文件名（按天）
function getLogFileName() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  return `app-${date}.log`;
}

// 初始化日志文件
function init() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  const fileName = getLogFileName();
  logFile = path.join(LOG_DIR, fileName);

  // 如果日期变了，重新创建日志流
  if (logStream) {
    logStream.end();
  }
  logStream = fs.createWriteStream(logFile, { flags: 'a' });
}
init();

// 格式化日志消息
function format(level, message, meta) {
  const timestamp = new Date().toISOString();
  const levelStr = level.toUpperCase().padEnd(5);
  let msg = `[${timestamp}] [${levelStr}] ${message}`;
  if (meta && Object.keys(meta).length > 0) {
    msg += ` ${JSON.stringify(meta)}`;
  }
  return msg;
}

// 写入日志
function write(level, message, meta) {
  if (LEVELS[level] > currentLevel) return;

  const line = format(level, message, meta);

  // 控制台输出
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }

  // 写入文件
  if (logStream) {
    // 检查日期是否变了
    const expectedFile = path.join(LOG_DIR, getLogFileName());
    if (logFile !== expectedFile) {
      init();
    }
    logStream.write(line + '\n');
  }
}

// 清理旧日志（保留最近30天）
function cleanupOldLogs(days = 30) {
  if (!fs.existsSync(LOG_DIR)) return;
  const now = Date.now();
  const maxAge = days * 24 * 60 * 60 * 1000;

  fs.readdirSync(LOG_DIR).forEach(file => {
    if (!file.startsWith('app-') || !file.endsWith('.log')) return;
    const filePath = path.join(LOG_DIR, file);
    try {
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`[Logger] 已删除旧日志: ${file}`);
      }
    } catch (e) {
      // 忽略
    }
  });
}

// 设置日志级别
function setLevel(level) {
  if (LEVELS[level] !== undefined) {
    currentLevel = LEVELS[level];
  }
}

module.exports = {
  error: (msg, meta) => write('error', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  info: (msg, meta) => write('info', msg, meta),
  debug: (msg, meta) => write('debug', msg, meta),
  setLevel,
  cleanupOldLogs,
  LOG_DIR,
};
