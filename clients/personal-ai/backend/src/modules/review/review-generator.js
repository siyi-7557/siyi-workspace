/**
 * AI 复盘生成服务
 * 从 Codex 会话内容中自动生成结构化的项目复盘
 */
const https = require('https');
const { URL } = require('url');

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || '';
const MODEL = 'glm-4-flash';

// 使用原生 https 替代 axios，避免 Node v22 下 axios/undici 的间歇性原生崩溃
function httpsPost(urlStr, body, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const postData = JSON.stringify(body);
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ZHIPU_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: timeout,
      // 禁用 keep-alive 连接池复用，避免复用过期 TLS 连接引发偶发底层错误
      agent: false,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${json.error?.message || data.substring(0, 200)}`));
          }
        } catch (e) {
          reject(new Error(`HTTP ${res.statusCode}: 响应JSON解析失败: ${data.substring(0, 500)}`));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(postData);
    req.end();
  });
}

const REVIEW_SYSTEM_PROMPT = `你是一个专业的项目复盘分析师。请根据提供的 AI 编程助手会话记录，生成一份结构化的项目复盘。

请严格按照以下 JSON 格式输出，不要输出任何其他内容：

{
  "project_name": "项目名称（从工作目录或对话内容推断，如无法推断则填'未命名项目'）",
  "tech_stack": "技术栈（从对话中提到的技术、框架、工具推断，用逗号分隔）",
  "start_date": "开始日期（YYYY-MM-DD格式，从会话时间推断）",
  "end_date": "结束日期（YYYY-MM-DD格式，从会话时间推断）",
  "ai_efficiency": "AI协作效率评估（200字以内，评估AI在本次会话中的帮助程度、响应质量、是否节省时间）",
  "prompt_quality": "Prompt质量评估（200字以内，评估用户提问的清晰度、具体性、是否提供足够上下文）",
  "tech_learning": "技术学习收获（300字以内，总结本次会话中学到的新技术、新概念、新方法）",
  "pitfalls": [
    {
      "problem": "遇到的问题（简洁描述）",
      "cause": "问题原因分析",
      "solution": "解决方案",
      "prevention": "如何避免下次再犯"
    }
  ],
  "ai_hallucination": "AI幻觉记录（200字以内，记录AI是否有编造信息、错误建议、不准确的代码等，没有则填'无明显幻觉'）",
  "improvements": "下次改进建议（200字以内，针对本次会话的不足，提出具体的改进建议）"
}

注意事项：
1. 只基于会话内容进行分析，不要编造没有提到的信息
2. 踩坑记录要具体，包含实际遇到的问题和解决方案
3. 如果某个字段无法从会话中推断，填'未提及'或空数组
4. 确保输出是合法的 JSON 格式`;

async function generateReview(session) {
  if (!ZHIPU_API_KEY) {
    throw new Error('未配置ZHIPU_API_KEY，无法生成复盘');
  }

  let conversationText = `工作目录: ${session.cwd}\n`;
  conversationText += `开始时间: ${session.startTime}\n`;
  conversationText += `结束时间: ${session.endTime}\n`;
  conversationText += `消息数: ${session.stats.totalMessages}\n`;
  conversationText += `工具调用数: ${session.stats.toolCalls}\n\n`;
  conversationText += `=== 对话内容 ===\n\n`;

  const messages = session.messages.slice(-50);
  for (const msg of messages) {
    const role = msg.role === 'user' ? '用户' : 'Codex';
    const text = msg.text.length > 2000 ? msg.text.substring(0, 2000) + '\n...(内容过长已截断)' : msg.text;
    conversationText += `【${role}】\n${text}\n\n`;
  }

  if (session.toolCalls.length > 0) {
    conversationText += `=== 工具调用记录 ===\n`;
    session.toolCalls.slice(-20).forEach((tc, i) => {
      conversationText += `${i + 1}. ${tc.name}\n`;
    });
  }

  try {
    const response = await httpsPost(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      {
        model: MODEL,
        messages: [
          { role: 'system', content: REVIEW_SYSTEM_PROMPT },
          { role: 'user', content: conversationText }
        ],
        temperature: 0.5,
        max_tokens: 4000
      },
      120000
    );

    const content = response.choices[0].message.content;
    let reviewData;
    try {
      const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
      reviewData = JSON.parse(jsonStr);
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        reviewData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('AI返回的内容无法解析为JSON: ' + content.substring(0, 200));
      }
    }

    if (!Array.isArray(reviewData.pitfalls)) {
      reviewData.pitfalls = [];
    }

    return {
      ...reviewData,
      source_session_id: session.id,
      source_cwd: session.cwd,
      generated_at: new Date().toISOString()
    };
  } catch (err) {
    console.error('[ReviewGenerator] 生成复盘失败:', err.message);
    throw new Error('生成复盘失败: ' + err.message);
  }
}

function extractPitfalls(reviewData) {
  if (!reviewData.pitfalls || !Array.isArray(reviewData.pitfalls)) {
    return [];
  }
  return reviewData.pitfalls.map((p, i) => ({
    title: p.problem || `踩坑${i + 1}`,
    problem: p.problem || '',
    cause: p.cause || '',
    solution: p.solution || '',
    prevention: p.prevention || '',
    category: inferCategory(p.problem || ''),
    tags: inferTags(reviewData.tech_stack || ''),
    source: 'codex_session',
    source_id: reviewData.source_session_id || '',
    project: reviewData.project_name || '',
    created_at: new Date().toISOString()
  }));
}

function inferCategory(problem) {
  const lower = problem.toLowerCase();
  if (lower.includes('报错') || lower.includes('错误') || lower.includes('error') || lower.includes('bug')) return '错误调试';
  if (lower.includes('配置') || lower.includes('环境') || lower.includes('安装')) return '环境配置';
  if (lower.includes('性能') || lower.includes('慢') || lower.includes('优化')) return '性能优化';
  if (lower.includes('api') || lower.includes('接口') || lower.includes('调用')) return 'API使用';
  if (lower.includes('语法') || lower.includes('类型') || lower.includes('编译')) return '语法类型';
  return '其他';
}

function inferTags(techStack) {
  if (!techStack) return [];
  return techStack.split(/[,，、\s]+/).filter(t => t.length > 0 && t.length < 20).slice(0, 5);
}

const ACTION_ITEMS_PROMPT = `你是一个专业的项目管理顾问。请根据提供的项目复盘内容，生成具体、可执行的行动项和改进计划。

请严格按照以下 JSON 格式输出，不要输出任何其他内容：

{
  "action_items": [
    {
      "title": "行动项标题（简洁明确）",
      "description": "具体描述（100字以内，说明要做什么）",
      "priority": "优先级（high/medium/low）",
      "category": "分类（如：技术改进/流程优化/知识管理/工具配置）",
      "due_date": "建议完成时间（如：1周内/2周内/1个月内）",
      "success_criteria": "成功标准（如何判断这个行动项完成了）"
    }
  ],
  "summary": "整体改进建议（200字以内，总结本次复盘的核心改进方向）"
}

注意事项：
1. 行动项要具体、可执行，不要空泛的建议
2. 优先关注复盘内容中提到的问题、踩坑、不足
3. 每个行动项都要有明确的成功标准
4. 根据问题的严重程度合理分配优先级
5. 生成 3-8 个行动项，不要太多也不要太少`;

async function generateActionItems(reviewData) {
  if (!ZHIPU_API_KEY) {
    throw new Error('未配置ZHIPU_API_KEY，无法生成行动项');
  }

  try {
    let reviewText = `项目名称: ${reviewData.project_name || '未命名'}\n`;
    reviewText += `技术栈: ${reviewData.tech_stack || '未提及'}\n\n`;
    reviewText += `=== AI协作效率 ===\n${reviewData.ai_efficiency || '未提及'}\n\n`;
    reviewText += `=== Prompt质量 ===\n${reviewData.prompt_quality || '未提及'}\n\n`;
    reviewText += `=== 技术学习 ===\n${reviewData.tech_learning || '未提及'}\n\n`;
    reviewText += `=== 踩坑记录 ===\n`;
    if (Array.isArray(reviewData.pitfalls) && reviewData.pitfalls.length > 0) {
      reviewData.pitfalls.forEach((p, i) => {
        reviewText += `${i + 1}. 问题: ${p.problem || ''}\n   原因: ${p.cause || ''}\n   解决: ${p.solution || ''}\n   预防: ${p.prevention || ''}\n\n`;
      });
    } else {
      reviewText += '无\n\n';
    }
    reviewText += `=== AI幻觉 ===\n${reviewData.ai_hallucination || '未提及'}\n\n`;
    reviewText += `=== 改进建议 ===\n${reviewData.improvements || '未提及'}\n`;

    const response = await httpsPost(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      {
        model: MODEL,
        messages: [
          { role: 'system', content: ACTION_ITEMS_PROMPT },
          { role: 'user', content: reviewText }
        ],
        temperature: 0.7,
      },
      60000
    );

    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('AI返回的内容无法解析为JSON');
    }
  } catch (err) {
    console.error('[ReviewGenerator] 生成行动项失败:', err.message);
    throw new Error('生成行动项失败: ' + err.message);
  }
}

module.exports = {
  generateReview,
  extractPitfalls,
  generateActionItems
};