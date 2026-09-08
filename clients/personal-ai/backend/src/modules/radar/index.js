/**
 * Information Radar 模块入口
 *
 * 信息雷达 - 思意的个人信息筛选器。
 * 帮助持续发现与当前学习、工作、项目和长期发展真正相关的信息，
 * 并通过 AI 进行筛选、摘要、关联和沉淀。
 *
 * 6层架构：
 * 01 Sources - 信息源（RSS、网页等）
 * 02 Ingestion - 信息采集（采集调度、去重）
 * 03 Intelligence - AI理解（分类、摘要、相关性判断）
 * 04 Context - 我的状态（Knowledge、Memory、Projects、Preferences）
 * 05 Recommendation - 推荐排序（分区、排序、推荐理由）
 * 06 Feedback - 用户反馈（阅读、保存、忽略、Event输出）
 *
 * 定位：不是普通新闻列表，而是"与思意有什么关系"的个人信息筛选器。
 */

const path = require('path');
const { router, init: initRoute } = require('./route');
const InformationRadarService = require('./service');

// 04 Context 层
const KnowledgeBridge = require('./04-context/knowledge-bridge');
const MemoryBridge = require('./04-context/memory-bridge');
const { ProjectsBridge } = require('./04-context/projects-bridge');
const { PreferencesManager } = require('./04-context/preferences');

// 06 Feedback 层
const { EventBridge } = require('./06-feedback/event-bridge');

// Siyi OS AI Core 路径
const SIYI_OS_ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..');
const AI_CORE_PATH = path.join(SIYI_OS_ROOT, 'ai-core');

let radarService = null;

/**
 * 初始化模块
 * 加载 Siyi OS AI Core 组件，创建各层服务并注入
 */
async function init() {
  try {
    // 加载 Siyi OS AI Core 组件
    const KnowledgeService = require(path.join(AI_CORE_PATH, 'knowledge', 'service.js'));
    const MemoryService = require(path.join(AI_CORE_PATH, 'memory', 'service.js'));
    const { EventService } = require(path.join(AI_CORE_PATH, 'event', 'service.js'));
    const LLRouter = require(path.join(AI_CORE_PATH, 'llm', 'router.js'));

    // 初始化 AI Core 服务
    const knowledgeService = new KnowledgeService({
      rootDir: SIYI_OS_ROOT,
    });
    await knowledgeService.init();

    const memoryService = new MemoryService({
      memoryDir: path.join(SIYI_OS_ROOT, 'data', 'memory'),
    });
    await memoryService.init();

    const eventService = new EventService({
      eventDir: path.join(SIYI_OS_ROOT, 'data', 'events'),
    });
    await eventService.init();

    const llmRouter = new LLRouter({
      zhipuApiKey: process.env.ZHIPU_API_KEY,
      deepseekApiKey: process.env.DEEPSEEK_API_KEY,
      qwenApiKey: process.env.QWEN_API_KEY,
    });

    // 04 Context 层 - 创建 Bridge 和 Manager
    const knowledgeBridge = new KnowledgeBridge({
      knowledgeService,
      candidateDir: path.join(SIYI_OS_ROOT, 'data', 'knowledge-candidates'),
    });
    await knowledgeBridge.init();

    const memoryBridge = new MemoryBridge({
      memoryService,
    });
    await memoryBridge.init();

    const projectsBridge = new ProjectsBridge({});
    await projectsBridge.init();

    const preferencesManager = new PreferencesManager({});
    await preferencesManager.init();

    // 06 Feedback 层 - 创建 EventBridge
    const eventBridge = new EventBridge({
      eventService,
    });
    await eventBridge.init();

    // 创建主服务（协调层，注入各层服务）
    radarService = new InformationRadarService({
      llm: llmRouter,
      // 04 Context
      knowledgeBridge,
      memoryBridge,
      projectsBridge,
      preferencesManager,
      // 06 Feedback
      eventBridge,
    });
    await radarService.init();

    // 注入服务到路由
    initRoute(radarService);

    // 启动自动采集调度
    radarService.startScheduler();

    console.log('[Radar] 信息雷达模块初始化完成（6层架构）');
    return radarService;
  } catch (err) {
    console.error('[Radar] 模块初始化失败:', err.message);
    console.error('[Radar] 错误详情:', err.stack);
    // 初始化失败时，路由返回错误
    initRoute({
      getItems: () => { throw new Error('信息雷达模块初始化失败: ' + err.message); },
      getItem: () => null,
      getSources: () => [],
      getPreferences: () => ({}),
      collect: async () => ({ collected: 0, newItems: 0, processed: 0, errors: [err.message] }),
    });
    return null;
  }
}

// 异步初始化（不阻塞模块加载）
init().catch(err => {
  console.error('[Radar] 异步初始化失败:', err.message);
});

module.exports = {
  name: 'radar',
  router,
  init,
  getService: () => radarService,
};