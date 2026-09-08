/**
 * Information Radar Module - 信息雷达
 *
 * 个人信息筛选器：自动采集 → AI 筛选/摘要/关联 → 分区推荐 → 反馈沉淀。
 * 分类：全部 / 科技 / 产品 / 设计 / 开发 / 运营
 */

const RadarModule = {
  name: 'radar',
  container: null,
  partitions: null,
  allItems: [],
  currentTab: 'all',
  detailItem: null,
  sources: [],
  preferences: {},
  searchQuery: '',
  searchResults: [],
  searchTimer: null,
  statusTimer: null,
  collectPollTimer: null,
  editingSourceId: null,
  testResults: {}, // sourceId -> 文案
  _moreMenuHandler: null,

  // Mock 数据（6 张卡片）
  mockItems: [
    {
      id: 1,
      title: '2026年AI产品趋势分析',
      summary: '随着大模型技术的快速迭代，AI产品正在从单一功能向多模态、Agent化方向演进。本文深入分析了2026年最值得关注的十大AI产品趋势，包括智能体协作、端侧AI、多模态交互等核心方向。',
      source: '36氪',
      category: '科技',
      categoryKey: 'tech',
      recommendationScore: 0.92,
      relevanceReason: '与你关注的AI产品相关',
      collectedAt: Date.now() - 1000 * 60 * 30,
      isRead: false,
      isSaved: false,
      status: 'new',
      sourceIcon: '36',
      sourceColor: '#E74C3C',
    },
    {
      id: 2,
      title: 'Top 10 productivity tools you need in 2026',
      summary: 'From AI-powered note-taking to collaborative workspaces, these are the productivity tools that are changing how we work. Each tool comes with a detailed review of features, pricing, and use cases.',
      source: 'Product Hunt',
      category: '产品',
      categoryKey: 'product',
      recommendationScore: 0.85,
      relevanceReason: '你收藏过类似工具',
      collectedAt: Date.now() - 1000 * 60 * 60 * 2,
      isRead: false,
      isSaved: true,
      status: 'new',
      sourceIcon: 'PH',
      sourceColor: '#DA552F',
    },
    {
      id: 3,
      title: 'Mobile app design trends for 2026',
      summary: '探索2026年移动应用设计的最新趋势，包括玻璃态设计、微交互动效、沉浸式全屏体验、AI生成界面等前沿设计方向，附大量优秀案例赏析。',
      source: 'Dribbble',
      category: '设计',
      categoryKey: 'design',
      recommendationScore: 0.78,
      relevanceReason: '设计类热门',
      collectedAt: Date.now() - 1000 * 60 * 60 * 5,
      isRead: false,
      isSaved: false,
      status: 'new',
      sourceIcon: 'D',
      sourceColor: '#EA4C89',
    },
    {
      id: 4,
      title: 'New React 19 features you should know',
      summary: 'React 19 brings a host of new features including Server Components, Actions, use() hook, and improved Suspense handling. This article breaks down each feature with practical code examples.',
      source: 'GitHub',
      category: '开发',
      categoryKey: 'dev',
      recommendationScore: 0.88,
      relevanceReason: '与你的技术栈匹配',
      collectedAt: Date.now() - 1000 * 60 * 60 * 8,
      isRead: true,
      isSaved: false,
      status: 'new',
      sourceIcon: 'GH',
      sourceColor: '#24292E',
    },
    {
      id: 5,
      title: 'SaaS定价策略研究：如何找到最优价格点',
      summary: '深入分析SaaS产品的定价策略，包括价值定价、分层定价、用量定价等多种模式的优劣势对比，以及如何通过A/B测试找到最佳价格点。',
      source: '人人都是产品经理',
      category: '产品',
      categoryKey: 'product',
      recommendationScore: 0.72,
      relevanceReason: '产品经理分类热门',
      collectedAt: Date.now() - 1000 * 60 * 60 * 12,
      isRead: false,
      isSaved: false,
      status: 'later',
      sourceIcon: '人',
      sourceColor: '#4A90D9',
    },
    {
      id: 6,
      title: '微服务架构最佳实践：从单体到分布式的演进之路',
      summary: '本文总结了微服务架构设计的核心原则和最佳实践，包括服务拆分策略、API网关、服务发现、配置中心、分布式事务等关键技术点的落地经验。',
      source: 'InfoQ',
      category: '开发',
      categoryKey: 'dev',
      recommendationScore: 0.81,
      relevanceReason: '后端开发相关',
      collectedAt: Date.now() - 1000 * 60 * 60 * 24,
      isRead: false,
      isSaved: false,
      status: 'new',
      sourceIcon: 'IQ',
      sourceColor: '#2E8B57',
    },
  ],

  // 真实采集记录（留存最近7天），接通后端后优先展示；无真实数据时回退到上面示例
  records: [],

  _displayItems() {
    return this.records.length ? this.records : this.mockItems;
  },

  _toCard(item) {
    return {
      ...item,
      category: this._cnCategory(item.category),
      sourceIcon: item.source ? item.source.charAt(0) : '',
      _real: true,
    };
  },

  // 英文细分类 → 中文大类（合并为几个大类，避免太细）
  MAP_CN: {
    'AI': 'AI', 'Development': 'AI', 'Research': 'AI', 'Learning': 'AI', 'Science': 'AI', 'Tools': 'AI', 'Security': 'AI',
    'Product': '产品', 'Business': '产品', 'Industry': '产品',
    'Technology': '技术', 'Environment': '技术', 'Energy': '技术',
    'Design': '设计',
  },

  _cnCategory(raw) {
    if (!raw) return '其他';
    const base = String(raw).split('(')[0].trim();
    return this.MAP_CN[base] || '其他';
  },

  render(container) {
    this.destroy(); // 清理上一次进入时的定时器
    this.container = container;
    this.currentTab = 'all';
    this.searchQuery = '';
    this.searchResults = [];
    this.editingSourceId = null;
    this.testResults = {};
    this.renderShell();
    this.bindEvents();
    Promise.all([this.loadPartitions(), this.loadSources(), this.loadStatus()]);
    // 每 30 秒轻量刷新一次运行状态（不打断列表）
    this.statusTimer = setInterval(() => this.loadStatus(), 30 * 1000);
  },

  destroy() {
    if (this.statusTimer) clearInterval(this.statusTimer);
    if (this.collectPollTimer) clearInterval(this.collectPollTimer);
    if (this._moreMenuHandler) {
      document.removeEventListener('click', this._moreMenuHandler);
      this._moreMenuHandler = null;
    }
    this.statusTimer = null;
    this.collectPollTimer = null;
  },

  renderShell() {
    this.container.innerHTML = `
      <div class="radar-container">
        <!-- 页面 Header -->
        <header class="radar-header">
          <div class="radar-header-text">
            <h1 class="radar-title">信息雷达</h1>
            <p class="radar-subtitle">为你筛选值得关注的信息</p>
          </div>
          <div class="radar-header-status" id="radarStatusText">正在初始化信息源…</div>
        </header>

        <!-- 顶部操作区 -->
        <div class="radar-toolbar">
          <div class="radar-search-box">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="text" id="radarSearchInput" placeholder="搜索标题 / 摘要 / 标签" autocomplete="off">
          </div>
          <div class="radar-toolbar-actions">
            <button class="radar-btn-outline" id="radarCollectBtn">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
              采集信息
            </button>
            <button class="radar-icon-btn" id="radarMoreBtn" title="更多">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
            </button>
            <div class="radar-more-menu hidden" id="radarMoreMenu">
              <button class="radar-more-item" id="radarPrefsBtn">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                关注设置
              </button>
              <button class="radar-more-item" id="radarSourcesBtn">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                信息源管理
              </button>
            </div>
          </div>
        </div>

        <!-- 分类 Tabs -->
        <nav class="radar-tabs" id="radarTabs"></nav>

        <!-- 信息卡片列表 -->
        <main id="radarContent">
          <div class="empty-state"><div class="empty-state-icon">📡</div><h3>加载中…</h3></div>
        </main>
      </div>

      <!-- 详情抽屉 -->
      <div class="radar-drawer hidden" id="radarDrawer">
        <div class="radar-drawer-overlay" id="radarDrawerOverlay"></div>
        <div class="radar-drawer-panel">
          <div class="radar-drawer-header">
            <h2 class="radar-drawer-title" id="radarDrawerTitle"></h2>
            <button class="radar-drawer-close" id="radarDrawerClose">✕</button>
          </div>
          <div class="radar-drawer-body" id="radarDrawerBody"></div>
          <div class="radar-drawer-footer" id="radarDrawerFooter"></div>
        </div>
      </div>

      <!-- 信息源管理抽屉 -->
      <div class="radar-drawer hidden" id="radarSourcesDrawer">
        <div class="radar-drawer-overlay" id="radarSourcesOverlay"></div>
        <div class="radar-drawer-panel">
          <div class="radar-drawer-header">
            <h2 class="radar-drawer-title">信息源管理</h2>
            <button class="radar-drawer-close" id="radarSourcesClose">✕</button>
          </div>
          <div class="radar-drawer-body">
            <div class="radar-sources-list">
              <p class="radar-form-hint">开启自动更新后，系统会按各源的采集间隔自动拉取；也可对单个源立即采集或测试连通性。</p>
              <div class="radar-sources-items" id="radarSourcesItems"></div>
            </div>
            <div class="radar-add-source">
              <h3 class="radar-add-source-title" id="radarAddSourceTitle">添加信息源</h3>
              <div class="radar-form-group">
                <label class="radar-form-label">名称</label>
                <input type="text" class="radar-form-input" id="radarSourceName" placeholder="例如：Hacker News">
              </div>
              <div class="radar-form-row">
                <div class="radar-form-group">
                  <label class="radar-form-label">类型</label>
                  <select class="radar-form-input" id="radarSourceType">
                    <option value="rss">RSS</option>
                    <option value="webpage">网页</option>
                  </select>
                </div>
                <div class="radar-form-group">
                  <label class="radar-form-label">分类（可选）</label>
                  <input type="text" class="radar-form-input" id="radarSourceCategory" placeholder="如 AI / Design">
                </div>
              </div>
              <div class="radar-form-group">
                <label class="radar-form-label">URL（RSS 地址 / 网页链接）</label>
                <input type="text" class="radar-form-input" id="radarSourceUrl" placeholder="https://…">
              </div>
              <button class="btn btn-primary radar-add-source-btn" id="radarAddSourceBtn">添加信息源</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 关注设置抽屉 -->
      <div class="radar-drawer hidden" id="radarPrefsDrawer">
        <div class="radar-drawer-overlay" id="radarPrefsOverlay"></div>
        <div class="radar-drawer-panel">
          <div class="radar-drawer-header">
            <h2 class="radar-drawer-title">关注设置</h2>
            <button class="radar-drawer-close" id="radarPrefsClose">✕</button>
          </div>
          <div class="radar-drawer-body">
            <p class="radar-form-hint">告诉雷达你关心什么，AI 会据此提高相关信息的权重并归入「正在关注」。每行填一项。</p>
            <div class="radar-form-group">
              <label class="radar-form-label">关注主题</label>
              <textarea class="radar-form-input radar-form-textarea" id="prefTopics" rows="2" placeholder="如：AI 产品、个人知识管理"></textarea>
            </div>
            <div class="radar-form-group">
              <label class="radar-form-label">关键词</label>
              <textarea class="radar-form-input radar-form-textarea" id="prefKeywords" rows="2" placeholder="如：Agent、RAG、LLM"></textarea>
            </div>
            <div class="radar-form-group">
              <label class="radar-form-label">关注项目</label>
              <textarea class="radar-form-input radar-form-textarea" id="prefProjects" rows="2" placeholder="如：Personal AI 工作台"></textarea>
            </div>
            <div class="radar-form-group">
              <label class="radar-form-label">技术方向</label>
              <textarea class="radar-form-input radar-form-textarea" id="prefTech" rows="2" placeholder="如：全栈、Electron"></textarea>
            </div>
            <div class="radar-form-group">
              <label class="radar-form-label">关注分类</label>
              <textarea class="radar-form-input radar-form-textarea" id="prefCategories" rows="2" placeholder="如：AI、Product、Design"></textarea>
            </div>
            <div class="radar-form-group" id="prefSourcesGroup">
              <label class="radar-form-label">优先来源</label>
              <div class="radar-pref-sources" id="prefSources"></div>
            </div>
          </div>
          <div class="radar-drawer-footer">
            <button class="btn btn-primary" id="radarSavePrefsBtn" style="flex:1">保存关注设置</button>
          </div>
        </div>
      </div>
    `;
  },

  TABS: [
    { key: 'all', label: '全部' },
    { key: 'tech', label: '科技' },
    { key: 'product', label: '产品' },
    { key: 'design', label: '设计' },
    { key: 'dev', label: '开发' },
    { key: 'ops', label: '运营' },
  ],

  bindEvents() {
    const q = id => this.container.querySelector(id);

    // Tabs
    q('#radarTabs').addEventListener('click', e => {
      const btn = e.target.closest('.radar-tab');
      if (!btn) return;
      this.switchTab(btn.dataset.tab);
    });

    // 搜索（防抖）
    q('#radarSearchInput').addEventListener('input', e => {
      const value = e.target.value.trim();
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.doSearch(value), 350);
    });

    // 采集
    q('#radarCollectBtn').addEventListener('click', () => this.triggerCollect());

    // 更多菜单
    q('#radarMoreBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = q('#radarMoreMenu');
      menu.classList.toggle('hidden');
    });
    this._moreMenuHandler = () => {
      const menu = this.container?.querySelector('#radarMoreMenu');
      if (menu && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
      }
    };
    document.addEventListener('click', this._moreMenuHandler);

    // 信息源抽屉
    q('#radarSourcesBtn').addEventListener('click', () => {
      q('#radarMoreMenu').classList.add('hidden');
      this.openSourcesDrawer();
    });
    q('#radarSourcesClose').addEventListener('click', () => this.closeDrawerById('radarSourcesDrawer'));
    q('#radarSourcesOverlay').addEventListener('click', () => this.closeDrawerById('radarSourcesDrawer'));
    q('#radarAddSourceBtn').addEventListener('click', () => this.submitAddSource());

    // 关注设置抽屉
    q('#radarPrefsBtn').addEventListener('click', () => {
      q('#radarMoreMenu').classList.add('hidden');
      this.openPrefsDrawer();
    });
    q('#radarPrefsClose').addEventListener('click', () => this.closeDrawerById('radarPrefsDrawer'));
    q('#radarPrefsOverlay').addEventListener('click', () => this.closeDrawerById('radarPrefsDrawer'));
    q('#radarSavePrefsBtn').addEventListener('click', () => this.savePreferences());

    // 详情抽屉
    q('#radarDrawerClose').addEventListener('click', () => this.closeDrawerById('radarDrawer'));
    q('#radarDrawerOverlay').addEventListener('click', () => this.closeDrawerById('radarDrawer'));
  },

  // ========== 分类 / 列表 ==========

  async loadPartitions() {
    try {
      const data = await API.request('GET', '/radar/partitioned');
      this.partitions = data.partitions || {};
      // 展平真实分区为展示列表（含最近7天历史），确保昨日未读不被新采集顶掉
      const seen = new Set();
      const cards = [];
      const keys = ['todayWorth', 'relatedToYou', 'following', 'saved', 'later'];
      for (const key of keys) {
        const isRelated = key === 'relatedToYou';
        (this.partitions[key] || []).forEach(it => {
          if (!it || !it.id || seen.has(it.id)) return;
          seen.add(it.id);
          const card = this._toCard(it);
          card._related = isRelated;
          cards.push(card);
        });
      }
      this.records = cards;
      this.renderTabs();
      await this.renderItems();
    } catch (e) {
      console.error('[Radar] 加载分区失败:', e);
      // 加载失败时回退到示例数据
      this.records = [];
      this.renderTabs();
      await this.renderItems();
    }
  },

  renderTabs() {
    const wrap = this.container.querySelector('#radarTabs');
    const list = this._displayItems();
    // 全部 = 与你相关；其余按主题分类（动态生成）
    const relatedCount = list.filter(i => i._related).length;
    const highCount = list.filter(i => (i.recommendationScore || 0) >= 0.85).length;
    const freq = {};
    list.forEach(i => { if (i.category) freq[i.category] = (freq[i.category] || 0) + 1; });
    const cats = Object.keys(freq).sort((a, b) => {
      if (a === '其他' && b !== '其他') return 1;
      if (b === '其他' && a !== '其他') return -1;
      return (freq[b] - freq[a]) || a.localeCompare(b);
    });
    const html = [
      `<button class="radar-tab ${this.currentTab === 'all' ? 'active' : ''}" data-tab="all">全部<span class="radar-tab-count">${relatedCount}</span></button>`,
      `<button class="radar-tab ${this.currentTab === 'high' ? 'active' : ''}" data-tab="high">高相关<span class="radar-tab-count">${highCount}</span></button>`,
    ];
    cats.forEach(c => {
      html.push(`<button class="radar-tab ${this.currentTab === c ? 'active' : ''}" data-tab="${UI.escapeHtml(c)}">${UI.escapeHtml(c)}<span class="radar-tab-count">${freq[c]}</span></button>`);
    });
    wrap.innerHTML = html.join('');
  },

  switchTab(tab) {
    if (this.currentTab === tab) return;
    this.currentTab = tab;
    // 切 tab 时退出搜索态
    this.searchQuery = '';
    this.searchResults = [];
    const input = this.container.querySelector('#radarSearchInput');
    if (input) input.value = '';
    this.renderTabs();
    this.renderItems();
  },

  async doSearch(q) {
    this.searchQuery = q;
    if (!q) {
      this.searchResults = [];
      return this.renderItems();
    }
    // 在 mock 数据中搜索
    const query = q.toLowerCase();
    this.searchResults = this._displayItems().filter(item =>
      item.title.toLowerCase().includes(query) ||
      item.summary.toLowerCase().includes(query) ||
      (item.tags && item.tags.some(t => t.toLowerCase().includes(query)))
    );
    await this.renderItems();
  },

  async getCurrentItems() {
    if (this.searchQuery) return this.searchResults;
    const list = this._displayItems();
    if (this.currentTab === 'all') {
      // 全部 = 与你相关
      return list.filter(i => i._related);
    }
    if (this.currentTab === 'high') {
      // 高相关：与我相关度 ≥ 85%
      return list.filter(i => (i.recommendationScore || 0) >= 0.85);
    }
    return list.filter(i => i.category === this.currentTab);
  },

  async renderItems() {
    const items = await this.getCurrentItems();
    const content = this.container.querySelector('#radarContent');
    if (!content) return;

    if (this.searchQuery && items.length === 0) {
      content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><h3>没有匹配「${UI.escapeHtml(this.searchQuery)}」的信息</h3></div>`;
      return;
    }
    if (items.length === 0) {
      content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><h3>暂无信息</h3><p>点击右上角「采集信息」开始采集</p></div>`;
      return;
    }

    const show = items.slice(0, 120);
    content.innerHTML = `<div class="radar-card-grid">${show.map(i => this.renderItemCard(i)).join('')}</div>` +
      (items.length > 120
        ? `<div class="radar-card-more-hint">当前展示最近部分记录（${show.length}/${items.length} 条），使用搜索可查找更早内容</div>`
        : '');
    content.querySelectorAll('.radar-item-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // 点击书签或更多按钮不打开详情
        if (e.target.closest('.radar-card-bookmark') || e.target.closest('.radar-card-more')) return;
        this.openDetail(card.dataset.id);
      });
    });
    // 书签按钮
    content.querySelectorAll('.radar-card-bookmark').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        const item = this._displayItems().find(i => i.id === id);
        if (item) {
          item.isSaved = !item.isSaved;
          btn.classList.toggle('saved', item.isSaved);
          UI.toast(item.isSaved ? '已保存到知识库' : '已取消保存', 'success');
        }
      });
    });
  },

  renderItemCard(item) {
    const source = item.source || '未知来源';
    const summary = item.summary || item.content || '';
    const why = item.relevanceReason || '';
    const relevance = item.recommendationScore ?? item.relevanceScore ?? 0;
    const sourceIcon = item.sourceIcon || source.charAt(0);
    const sourceColor = item.sourceColor || 'var(--color-primary)';

    return `
      <div class="radar-item-card ${item.isRead ? 'read' : ''}" data-id="${item.id}">
        <!-- 右上角更多按钮 -->
        <button class="radar-card-more" title="更多">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
        </button>

        <!-- 卡片顶部：来源 + 相关度 -->
        <div class="radar-card-header">
          <div class="radar-card-source">
            <div class="radar-source-avatar" style="background: ${sourceColor}">
              <span>${sourceIcon}</span>
            </div>
            <span class="radar-source-name">${UI.escapeHtml(source)}</span>
          </div>
          ${relevance > 0 ? `<span class="radar-card-relevance">相关度 ${Math.round(relevance * 100)}%</span>` : ''}
        </div>

        <!-- 卡片中部：标题 + 摘要 -->
        <div class="radar-card-body">
          <h3 class="radar-card-title">${UI.escapeHtml(item.title || '无标题')}</h3>
          <p class="radar-card-summary">${UI.escapeHtml(summary)}</p>
        </div>

        <!-- 为什么推荐提示条 -->
        ${why ? `
          <div class="radar-card-why">
            <svg class="radar-why-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>${UI.escapeHtml(why)}</span>
          </div>` : ''}

        <!-- 卡片底部：时间 + 书签 -->
        <div class="radar-card-footer">
          <span class="radar-card-time">${this.formatTime(item.collectedAt || item.publishedAt)}</span>
          <button class="radar-card-bookmark ${item.isSaved ? 'saved' : ''}" data-id="${item.id}" title="${item.isSaved ? '已保存' : '保存'}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="${item.isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          </button>
        </div>
      </div>`;
  },

  // ========== 详情抽屉 + 操作 ==========

  async openDetail(id) {
    try {
      // 优先从 mock 数据查找
      const mockItem = this._displayItems().find(i => i.id === id);
      if (mockItem) {
        this.detailItem = mockItem;
        this.renderDetail();
        this.container.querySelector('#radarDrawer').classList.remove('hidden');
        mockItem.isRead = true;
        return;
      }
      const data = await API.request('GET', `/radar/items/${id}`);
      this.detailItem = data.item;
      this.renderDetail();
      this.container.querySelector('#radarDrawer').classList.remove('hidden');
      await API.request('POST', `/radar/items/${id}/read`, {});
    } catch (e) {
      UI.toast('打开详情失败：' + e.message, 'error');
    }
  },

  renderDetail() {
    const item = this.detailItem;
    if (!item) return;
    this.container.querySelector('#radarDrawerTitle').textContent = item.title || '无标题';

    const relevance = item.recommendationScore ?? item.relevanceScore ?? 0;
    const tags = (item.tags || []).map(t => `<span class="radar-tag">${UI.escapeHtml(t)}</span>`).join('');
    const related = [].concat(item.relatedProjects || [], item.relatedKnowledge || []);

    this.container.querySelector('#radarDrawerBody').innerHTML = `
      <div class="radar-detail-meta">
        <span class="radar-detail-category">${UI.escapeHtml(item.category || '未分类')}</span>
        <span class="radar-detail-source">${UI.escapeHtml(item.source || '未知来源')}</span>
        ${relevance > 0 ? `<span class="radar-detail-relevance">相关度 ${Math.round(relevance * 100)}%</span>` : ''}
      </div>
      ${item.summary ? `<div class="radar-detail-summary">${UI.escapeHtml(item.summary)}</div>` : ''}
      ${item.relevanceReason ? `
        <div class="radar-detail-why">
          <h4>为什么推荐给你</h4>
          <p>${UI.escapeHtml(item.relevanceReason)}</p>
        </div>` : ''}
      ${related.length ? `
        <div class="radar-detail-related">
          <h4>关联到你</h4>
          <div class="radar-related-tags">${related.map(r => `<span class="radar-related-tag">${UI.escapeHtml(r)}</span>`).join('')}</div>
        </div>` : ''}
      ${tags ? `<div class="radar-detail-tags">${tags}</div>` : ''}
      ${item.content ? `<div class="radar-detail-content">${UI.escapeHtml(item.content)}</div>` : ''}
      ${item.url ? `<div class="radar-detail-url"><a class="radar-link" href="${UI.escapeHtml(item.url)}" target="_blank" rel="noopener">查看原文 ↗</a></div>` : ''}
    `;

    this.container.querySelector('#radarDrawerFooter').innerHTML = `
      <button class="btn btn-ghost" id="radarActionLater">${item.status === 'later' ? '已加入稍后读' : '稍后阅读'}</button>
      <button class="btn btn-ghost" id="radarActionIgnore">不感兴趣</button>
      <button class="btn btn-primary" id="radarActionSave">${item.isSaved ? '已保存到知识库' : '保存到知识库'}</button>
    `;
    this.container.querySelector('#radarActionLater').addEventListener('click', () => this.itemAction('later'));
    this.container.querySelector('#radarActionIgnore').addEventListener('click', () => this.itemAction('ignore'));
    this.container.querySelector('#radarActionSave').addEventListener('click', () => this.itemAction('save'));
  },

  async itemAction(act) {
    const item = this.detailItem;
    if (!item) return;
    try {
      if (act === 'save') {
        // 真实记录需落库；示例数据仅本地演示
        const mockItem = this._displayItems().find(i => i.id === item.id);
        if (mockItem) mockItem.isSaved = !mockItem.isSaved;
        if (mockItem?._real) {
          await API.request('POST', `/radar/items/${item.id}/save`, {});
        }
        UI.toast(item.isSaved ? '已取消保存' : '已保存到知识库，可在「知识 · 资讯收藏」查看', 'success');
        item.isSaved = !item.isSaved;
      } else if (act === 'later') {
        const mockItem = this._displayItems().find(i => i.id === item.id);
        if (mockItem) mockItem.status = mockItem.status === 'later' ? 'new' : 'later';
        if (mockItem?._real) {
          await API.request('POST', `/radar/items/${item.id}/later`, {});
        }
        UI.toast(item.status === 'later' ? '已取消稍后阅读' : '已加入稍后阅读', 'success');
        item.status = item.status === 'later' ? 'new' : 'later';
      } else if (act === 'ignore') {
        const mockItem = this._displayItems().find(i => i.id === item.id);
        if (mockItem?._real) {
          await API.request('POST', `/radar/items/${item.id}/ignore`, {});
        }
        UI.toast('已减少此类推荐', 'success');
      }
      this.closeDrawerById('radarDrawer');
      this.renderItems();
    } catch (e) { UI.toast('操作失败：' + e.message, 'error'); }
  },

  // ========== 采集 + 运行状态 ==========

  async triggerCollect() {
    const btn = this.container.querySelector('#radarCollectBtn');
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
      采集中…
    `;
    try {
      await API.request('POST', '/radar/collect', {});
      UI.toast('已开始采集，完成后自动刷新', 'info');
      this.pollCollectStatus();
    } catch (e) {
      UI.toast('触发采集失败：' + e.message, 'error');
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  },

  pollCollectStatus() {
    if (this.collectPollTimer) clearInterval(this.collectPollTimer);
    let ticks = 0;
    this.collectPollTimer = setInterval(async () => {
      ticks++;
      try {
        const data = await API.request('GET', '/radar/status');
        const st = data.status || {};
        if (!st.isCollecting) {
          clearInterval(this.collectPollTimer);
          this.collectPollTimer = null;
          const btn = this.container.querySelector('#radarCollectBtn');
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = `
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
              采集信息
            `;
          }
          const r = st.lastCollectResult || {};
          UI.toast(`采集完成：新增 ${r.newItems ?? 0} 条`, 'success');
          await this.loadStatus();
        }
      } catch { /* 忽略单次轮询错误 */ }
      if (ticks > 40) { // 最多轮询 ~2 分钟
        clearInterval(this.collectPollTimer);
        this.collectPollTimer = null;
        const btn = this.container.querySelector('#radarCollectBtn');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
            采集信息
          `;
        }
      }
    }, 3000);
  },

  async loadStatus() {
    try {
      const data = await API.request('GET', '/radar/status');
      const st = data.status || {};
      const el = this.container.querySelector('#radarStatusText');
      if (!el) return;
      const last = st.lastCollectAt ? `上次更新 ${this.formatTime(st.lastCollectAt)}` : '尚未采集';
      const collecting = st.isCollecting ? ' · 正在采集…' : '';
      el.textContent = `自动更新已开启 · ${last} · ${st.enabledCount || 0}/${st.sourceCount || 0} 个源启用${collecting}`;
      const btn = this.container.querySelector('#radarCollectBtn');
      if (btn && !st.isCollecting && btn.disabled) { btn.disabled = false; }
    } catch { /* 状态展示失败不阻塞 */ }
  },

  // ========== 信息源管理 ==========

  async loadSources() {
    try {
      const data = await API.request('GET', '/radar/sources');
      this.sources = data.sources || [];
      if (!this.container.querySelector('#radarSourcesDrawer').classList.contains('hidden')) {
        this.renderSources();
      }
    } catch (e) {
      console.error('[Radar] 加载信息源失败:', e);
    }
  },

  openSourcesDrawer() {
    this.editingSourceId = null;
    this.container.querySelector('#radarSourcesDrawer').classList.remove('hidden');
    this.renderSources();
  },

  renderSources() {
    const wrap = this.container.querySelector('#radarSourcesItems');
    if (!this.sources.length) {
      wrap.innerHTML = '<p class="radar-form-hint">暂无信息源，请在下方添加。</p>';
      return;
    }
    wrap.innerHTML = this.sources.map(s => this.renderSourceItem(s)).join('');
    wrap.querySelectorAll('[data-act]').forEach(el => {
      const id = parseInt(el.dataset.id);
      el.addEventListener('click', () => {
        const act = el.dataset.act;
        if (act === 'toggle') this.toggleSource(id, el.dataset.enabled === '1');
        else if (act === 'edit') { this.editingSourceId = this.editingSourceId === id ? null : id; this.renderSources(); }
        else if (act === 'test') this.testSource(id);
        else if (act === 'collect') this.collectOneSource(id);
        else if (act === 'delete') this.deleteSource(id);
        else if (act === 'cancel') { this.editingSourceId = null; this.renderSources(); }
        else if (act === 'save') this.submitEditSource(id);
      });
    });
  },

  renderSourceItem(s) {
    const enabled = s.enabled === 1 || s.enabled === true;
    if (this.editingSourceId === s.id) {
      return `
        <div class="radar-source-item editing">
          <div class="radar-source-edit-form">
            <div class="radar-form-row">
              <input class="radar-form-input" data-edit="name" value="${UI.escapeHtml(s.name || '')}" placeholder="名称">
              <select class="radar-form-input" data-edit="type">
                <option value="rss" ${s.type === 'rss' ? 'selected' : ''}>RSS</option>
                <option value="webpage" ${s.type === 'webpage' ? 'selected' : ''}>网页</option>
              </select>
            </div>
            <input class="radar-form-input" data-edit="url" value="${UI.escapeHtml(s.url || '')}" placeholder="URL" style="margin:8px 0">
            <input class="radar-form-input" data-edit="category" value="${UI.escapeHtml(s.category || '')}" placeholder="分类（可选）" style="margin-bottom:8px">
            <div class="radar-source-edit-actions">
              <button class="btn btn-primary btn-sm" data-act="save" data-id="${s.id}">保存</button>
              <button class="btn btn-ghost btn-sm" data-act="cancel" data-id="${s.id}">取消</button>
            </div>
          </div>
        </div>`;
    }
    const test = this.testResults[s.id];
    return `
      <div class="radar-source-item ${enabled ? '' : 'is-off'}">
        <div class="radar-source-info">
          <div class="radar-source-name">${UI.escapeHtml(s.name || '未命名')}</div>
          <div class="radar-source-meta">
            <span class="radar-source-type">${UI.escapeHtml(s.type || '')}</span>
            <span class="radar-source-url">${UI.escapeHtml(s.url || '')}</span>
          </div>
          <div class="radar-source-sub">${s.last_fetched_at ? `上次采集 ${UI.escapeHtml(String(s.last_fetched_at).replace('T', ' ').slice(0, 16))}` : '从未采集'} · 间隔 ${Math.round((s.fetch_interval || 3600) / 60)} 分钟</div>
          ${test ? `<div class="radar-source-test ${test.ok ? 'ok' : 'fail'}">${test.ok ? `✓ 连通正常，抓取 ${test.count} 条（${test.elapsedMs}ms）` : '✗ ' + UI.escapeHtml(test.error || '失败')}</div>` : ''}
        </div>
        <div class="radar-source-actions">
          <label class="radar-switch" title="${enabled ? '点击停用' : '点击启用'}">
            <input type="checkbox" data-act="toggle" data-id="${s.id}" data-enabled="${enabled ? 1 : 0}" ${enabled ? 'checked' : ''}>
            <span class="radar-switch-slider"></span>
          </label>
          <button class="radar-source-icon-btn" data-act="test" data-id="${s.id}" title="测试连接">测</button>
          <button class="radar-source-icon-btn" data-act="collect" data-id="${s.id}" title="立即采集">采</button>
          <button class="radar-source-icon-btn" data-act="edit" data-id="${s.id}" title="编辑">改</button>
          <button class="radar-source-delete" data-act="delete" data-id="${s.id}" title="删除">✕</button>
        </div>
      </div>`;
  },

  async submitAddSource() {
    const name = this.container.querySelector('#radarSourceName').value.trim();
    const type = this.container.querySelector('#radarSourceType').value;
    const url = this.container.querySelector('#radarSourceUrl').value.trim();
    const category = this.container.querySelector('#radarSourceCategory').value.trim();
    if (!name || !url) return UI.toast('请填写名称和 URL', 'warning');
    try {
      await API.request('POST', '/radar/sources', { name, type, url, category });
      UI.toast('信息源已添加', 'success');
      ['#radarSourceName', '#radarSourceUrl', '#radarSourceCategory'].forEach(id => this.container.querySelector(id).value = '');
      await this.loadSources();
      await this.loadStatus();
    } catch (e) { UI.toast('添加失败：' + e.message, 'error'); }
  },

  async submitEditSource(id) {
    const item = this.container.querySelector(`.radar-source-item.editing`);
    const get = f => item.querySelector(`[data-edit="${f}"]`).value.trim();
    const body = { name: get('name'), type: get('type'), url: get('url'), category: get('category') };
    if (!body.name || !body.url) return UI.toast('名称和 URL 必填', 'warning');
    try {
      await API.request('PUT', `/radar/sources/${id}`, body);
      UI.toast('信息源已更新', 'success');
      this.editingSourceId = null;
      await this.loadSources();
      await this.loadStatus();
    } catch (e) { UI.toast('更新失败：' + e.message, 'error'); }
  },

  async toggleSource(id, currentlyEnabled) {
    try {
      await API.request('PUT', `/radar/sources/${id}`, { enabled: !currentlyEnabled });
      UI.toast(currentlyEnabled ? '已停用该源' : '已启用该源', 'success');
      await this.loadSources();
      await this.loadStatus();
    } catch (e) { UI.toast('切换失败：' + e.message, 'error'); }
  },

  async testSource(id) {
    this.testResults[id] = { ok: false, error: '测试中…' };
    this.renderSources();
    try {
      const r = await API.request('POST', `/radar/sources/${id}/test`, {});
      this.testResults[id] = r.success ? { ok: true, count: r.count, elapsedMs: r.elapsedMs } : { ok: false, error: r.error };
    } catch (e) {
      this.testResults[id] = { ok: false, error: e.message };
    }
    this.renderSources();
  },

  async collectOneSource(id) {
    try {
      await API.request('POST', '/radar/collect', { sourceId: id });
      UI.toast('已开始采集该源，完成后自动刷新', 'info');
      this.pollCollectStatus();
    } catch (e) { UI.toast('采集失败：' + e.message, 'error'); }
  },

  async deleteSource(id) {
    if (!confirm('确定删除这个信息源吗？已采集的信息不会被删除。')) return;
    try {
      await API.request('DELETE', `/radar/sources/${id}`);
      UI.toast('信息源已删除', 'success');
      await this.loadSources();
      await this.loadStatus();
    } catch (e) { UI.toast('删除失败：' + e.message, 'error'); }
  },

  // ========== 关注设置 ==========

  async openPrefsDrawer() {
    this.container.querySelector('#radarPrefsDrawer').classList.remove('hidden');
    try {
      const data = await API.request('GET', '/radar/preferences');
      this.preferences = data.preferences || {};
    } catch { this.preferences = {}; }
    await this.loadSources();
    this.fillPrefsForm();
  },

  fillPrefsForm() {
    const p = this.preferences;
    const join = arr => (Array.isArray(arr) ? arr : []).join('\n');
    this.container.querySelector('#prefTopics').value = join(p.topics);
    this.container.querySelector('#prefKeywords').value = join(p.keywords);
    this.container.querySelector('#prefProjects').value = join(p.projects);
    this.container.querySelector('#prefTech').value = join(p.techDirections);
    this.container.querySelector('#prefCategories').value = join(p.categories);
    const selected = new Set(Array.isArray(p.sources) ? p.sources : []);
    const box = this.container.querySelector('#prefSources');
    if (!this.sources.length) {
      box.innerHTML = '<span class="radar-form-hint">暂无信息源</span>';
    } else {
      box.innerHTML = this.sources.map(s => `
        <label class="radar-pref-source ${selected.has(s.name) ? 'on' : ''}">
          <input type="checkbox" value="${UI.escapeHtml(s.name)}" ${selected.has(s.name) ? 'checked' : ''}>
          <span>${UI.escapeHtml(s.name)}</span>
        </label>`).join('');
      box.querySelectorAll('input').forEach(cb => cb.addEventListener('change', () => {
        cb.closest('.radar-pref-source').classList.toggle('on', cb.checked);
      }));
    }
  },

  parseLines(elId) {
    return this.container.querySelector(elId).value
      .split(/[\n,，;；]+/).map(s => s.trim()).filter(Boolean);
  },

  async savePreferences() {
    const sources = Array.from(this.container.querySelectorAll('#prefSources input:checked')).map(cb => cb.value);
    const body = {
      topics: this.parseLines('#prefTopics'),
      keywords: this.parseLines('#prefKeywords'),
      projects: this.parseLines('#prefProjects'),
      techDirections: this.parseLines('#prefTech'),
      categories: this.parseLines('#prefCategories'),
      sources,
    };
    try {
      const data = await API.request('POST', '/radar/preferences', body);
      this.preferences = data.preferences || {};
      UI.toast('关注设置已保存，推荐将据此调整', 'success');
      this.closeDrawerById('radarPrefsDrawer');
    } catch (e) { UI.toast('保存失败：' + e.message, 'error'); }
  },

  // ========== 工具 ==========

  closeDrawerById(id) {
    this.container.querySelector('#' + id).classList.add('hidden');
  },

  formatTime(t) {
    if (!t) return '';
    const d = new Date(t);
    if (isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return `${min} 分钟前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} 小时前`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day} 天前`;
    return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`;
  },
};

if (typeof App !== 'undefined' && App.registerModule) {
  App.registerModule('radar', RadarModule);
}
