/**
 * AI Logger - AI 请求日志记录
 * 记录 Personal AI 的请求、工具调用、token usage、错误等
 * 日志存储在应用数据目录的 ai-logs.jsonl 文件中（JSON Lines 格式）
 */

const fs = require('fs');
const path = require('path');

// 应用数据目录
const appDataDir = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'siyi-workbench')
  : path.join(__dirname, '..', '..', '..', 'data');

const logFile = path.join(appDataDir, 'ai-logs.jsonl');

// 确保目录存在
try {
  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true });
  }
} catch (e) {
  console.warn('[AILogger] 创建日志目录失败:', e.message);
}

/**
 * 记录一条 AI 日志
 * @param {Object} entry - 日志条目
 */
function log(entry) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n', 'utf-8');
  } catch (e) {
    console.warn('[AILogger] 写入日志失败:', e.message);
  }
}

/**
 * 记录一次完整的 Personal AI 对话
 */
function logChat({
  input,
  reply,
  toolCalls,
  iterations,
  usage,
  duration,
  success,
  error,
  model,
}) {
  log({
    type: 'chat',
    model,
    input: typeof input === 'string' ? input : input[input.length - 1]?.content || '',
    inputLength: typeof input === 'string' ? input.length : JSON.stringify(input).length,
    reply: reply || '',
    replyLength: (reply || '').length,
    toolCalls: (toolCalls || []).map(tc => ({
      name: tc.name,
      args: tc.args,
      success: tc.result?.success !== false,
      duration: tc.duration,
    })),
    toolCallCount: (toolCalls || []).length,
    iterations,
    usage,
    duration,
    success,
    error: error || null,
  });
}

/**
 * 记录一次工具调用
 */
function logToolCall({ name, args, result, duration, success }) {
  log({
    type: 'tool_call',
    tool: name,
    args,
    duration,
    success,
    error: success ? null : result?.error,
  });
}

/**
 * 读取最近的日志（用于分析）
 * @param {number} limit - 返回条数
 */
function readRecentLogs(limit = 100) {
  try {
    if (!fs.existsSync(logFile)) return [];
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const recent = lines.slice(-limit);
    return recent.map(line => {
      try { return JSON.parse(line); } catch (e) { return null; }
    }).filter(Boolean);
  } catch (e) {
    console.warn('[AILogger] 读取日志失败:', e.message);
    return [];
  }
}

/**
 * 获取日志统计
 */
function getStats() {
  try {
    const logs = readRecentLogs(1000);
    const chatLogs = logs.filter(l => l.type === 'chat');
    const toolLogs = logs.filter(l => l.type === 'tool_call');

    const toolUsage = {};
    toolLogs.forEach(t => {
      if (!toolUsage[t.tool]) toolUsage[t.tool] = { count: 0, success: 0, totalDuration: 0 };
      toolUsage[t.tool].count++;
      if (t.success) toolUsage[t.tool].success++;
      toolUsage[t.tool].totalDuration += t.duration || 0;
    });

    return {
      totalRequests: chatLogs.length,
      totalToolCalls: toolLogs.length,
      avgDuration: chatLogs.length > 0
        ? Math.round(chatLogs.reduce((sum, l) => sum + (l.duration || 0), 0) / chatLogs.length)
        : 0,
      successRate: chatLogs.length > 0
        ? Math.round(chatLogs.filter(l => l.success).length / chatLogs.length * 100)
        : 0,
      toolUsage,
      logFile,
    };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = {
  log,
  logChat,
  logToolCall,
  readRecentLogs,
  getStats,
};
