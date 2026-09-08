const path = require('path');
const fs = require('fs');
const os = require('os');

// 应用名称
const APP_NAME = 'siyi-workbench';

// 运行模式：personal（默认，使用真实个人数据/个人环境）| demo（使用仓库内虚构演示数据）
const APP_MODE = process.env.APP_MODE === 'demo' ? 'demo' : 'personal';
function isDemo() { return APP_MODE === 'demo'; }
// Demo 模式使用的虚构 Vault（随仓库分发，代表虚构公司 Nova Labs 的知识库）
const DEMO_VAULT_PATH = path.join(__dirname, '..', '..', '..', 'demo', 'vault');

// 获取标准应用数据目录
function getAppDataDir() {
  if (process.env.SIYI_DATA_DIR) {
    return process.env.SIYI_DATA_DIR;
  }
  switch (process.platform) {
    case 'win32':
      return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), APP_NAME);
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME);
    default:
      return path.join(os.homedir(), '.config', APP_NAME);
  }
}

// 数据目录
const DATA_DIR = getAppDataDir();
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const DB_FILE = path.join(DATA_DIR, 'workbench.db');
const RAG_INDEX_FILE = path.join(DATA_DIR, 'rag-index.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const LOG_DIR = path.join(DATA_DIR, 'logs');
const CODEX_EXPORTS_DIR = path.join(DATA_DIR, 'codex-exports');

// 确保目录存在
function ensureDirs() {
  [DATA_DIR, BACKUP_DIR, LOG_DIR, CODEX_EXPORTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}
ensureDirs();

// 默认配置
const DEFAULT_CONFIG = {
  port: 8788,
  vaultPath: '',
  extraPaths: [],
  ai: {
    model: 'glm-4-flash',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: '',
    embeddingModel: 'BAAI/bge-m3',
    embeddingBaseUrl: 'https://api.siliconflow.cn/v1',
    embeddingApiKey: '',
  },
  backup: {
    autoBackup: true,
    backupTime: '03:00',
    maxBackups: 10,
  },
  ui: {
    theme: 'light',
    language: 'zh-CN',
  },
};

// 深度合并配置
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// 加载配置
let userConfig = {};
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      userConfig = deepMerge(DEFAULT_CONFIG, saved);
    } catch (e) {
      console.error('[Config] 加载配置失败，使用默认配置:', e.message);
      userConfig = { ...DEFAULT_CONFIG };
    }
  } else {
    userConfig = { ...DEFAULT_CONFIG };
  }
}
loadConfig();

// 保存配置
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(userConfig, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Config] 保存配置失败:', e.message);
  }
}

// 从旧的 .env 和 data 目录迁移
function migrateFromOld() {
  const oldDataDir = path.join(__dirname, '..', '..', 'data');
  const oldEnvFile = path.join(__dirname, '..', '..', '.env');

  // 迁移 .env 配置
  if (fs.existsSync(oldEnvFile) && !userConfig.ai.apiKey && !userConfig.ai.embeddingApiKey) {
    try {
      const envContent = fs.readFileSync(oldEnvFile, 'utf-8');
      const envVars = {};
      envContent.split('\n').forEach(line => {
        const match = line.match(/^([A-Z_]+)=(.*)$/);
        if (match) {
          envVars[match[1]] = match[2].trim();
        }
      });

      let migrated = false;
      if (envVars.ZHIPU_API_KEY) {
        userConfig.ai.apiKey = envVars.ZHIPU_API_KEY;
        migrated = true;
      }
      if (envVars.SILICONFLOW_API_KEY) {
        userConfig.ai.embeddingApiKey = envVars.SILICONFLOW_API_KEY;
        migrated = true;
      }
      if (envVars.PORT) {
        userConfig.port = parseInt(envVars.PORT) || 8788;
        migrated = true;
      }

      if (migrated) {
        saveConfig();
        console.log('[Config] 已从 .env 迁移配置');
      }
    } catch (e) {
      console.error('[Config] 迁移 .env 失败:', e.message);
    }
  }

  // 迁移数据文件
  const filesToMigrate = [
    { src: path.join(oldDataDir, 'workbench.db'), dst: DB_FILE },
    { src: path.join(oldDataDir, 'rag-index.json'), dst: RAG_INDEX_FILE },
    { src: path.join(oldDataDir, 'config.json'), dst: CONFIG_FILE },
  ];

  filesToMigrate.forEach(({ src, dst }) => {
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      try {
        fs.copyFileSync(src, dst);
        console.log(`[Config] 已迁移数据文件: ${path.basename(src)}`);
      } catch (e) {
        console.error(`[Config] 迁移 ${path.basename(src)} 失败:`, e.message);
      }
    }
  });

  // 迁移备份目录
  const oldBackupDir = path.join(oldDataDir, 'backups');
  if (fs.existsSync(oldBackupDir) && fs.readdirSync(BACKUP_DIR).length === 0) {
    try {
      fs.readdirSync(oldBackupDir).forEach(file => {
        fs.copyFileSync(path.join(oldBackupDir, file), path.join(BACKUP_DIR, file));
      });
      console.log('[Config] 已迁移备份文件');
    } catch (e) {
      console.error('[Config] 迁移备份失败:', e.message);
    }
  }

  // 重新加载配置（因为可能迁移了 config.json）
  loadConfig();
}
migrateFromOld();

// 配置接口
function get(key, defaultValue = null) {
  // Demo 模式下强制 vaultPath 指向仓库内虚构 Vault（不改写已保存的个人配置）
  if (key === 'vaultPath' && isDemo()) return DEMO_VAULT_PATH;
  const keys = key.split('.');
  let value = userConfig;
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return defaultValue;
    }
  }
  return value !== undefined ? value : defaultValue;
}

function set(key, value) {
  const keys = key.split('.');
  let target = userConfig;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in target) || typeof target[keys[i]] !== 'object') {
      target[keys[i]] = {};
    }
    target = target[keys[i]];
  }
  target[keys[keys.length - 1]] = value;
  saveConfig();
}

function getAll() {
  return JSON.parse(JSON.stringify(userConfig));
}

function reset() {
  userConfig = { ...DEFAULT_CONFIG };
  saveConfig();
}

module.exports = {
  APP_NAME,
  APP_MODE,
  isDemo,
  DEMO_VAULT_PATH,
  DATA_DIR,
  CONFIG_FILE,
  DB_FILE,
  RAG_INDEX_FILE,
  BACKUP_DIR,
  LOG_DIR,
  CODEX_EXPORTS_DIR,
  get,
  set,
  getAll,
  reset,
  saveConfig,
  port: userConfig.port,
};
