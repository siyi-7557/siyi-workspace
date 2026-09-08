/**
 * 知识模块 - 个人知识空间
 * 原「语义检索」升级为「知识」，不再只是搜索工具，而是个人知识空间
 * 底层统一调用 ai-core/knowledge/service.js
 */

const KnowledgeModule = {
  // 状态
  currentType: 'all',
  currentSource: 'all',
  currentQuery: '',
  searchTimer: null,
  knowledgeList: [],
  searchResults: [],
  stats: null,
  currentKnowledgeId: null,
  isLoading: false,
  viewMode: 'list', // 'list' | 'grid'
  sortBy: 'updated', // 'updated' | 'created' | 'title'
  sortOrder: 'desc', // 'asc' | 'desc'
  sortMenuOpen: false,

  // 知识类型定义（与设计系统颜色映射一致）
  TYPE_META: {
    project: { label: '项目', icon: '📁', color: '#8D7CC7' },
    concept: { label: '概念', icon: '💡', color: '#5A8AA8' },
    experience: { label: '经验', icon: '⭐', color: '#B8865A' },
    learning: { label: '学习', icon: '📚', color: '#5B8C6E' },
    note: { label: '笔记', icon: '📝', color: '#77727F' },
    reflection: { label: '反思', icon: '🔮', color: '#B06068' },
    resource: { label: '资源', icon: '🔗', color: '#5A8AA8' },
    report: { label: '报告', icon: '📊', color: '#8D7CC7' },
    article: { label: '资讯', icon: '📰', color: '#B8865A' },
  },

  // 知识来源分类
  SOURCE_CATEGORIES: [
    { key: 'all', label: '全部知识', icon: '📚' },
    { key: 'core', label: '人格知识', icon: '🧠', match: ['知识库'] },
    { key: 'obsidian', label: 'Obsidian笔记', icon: '📝', match: ['obsidian'] },
    { key: 'project', label: '项目文档', icon: '📁', match: ['项目文档', '项目', 'project'] },
    { key: 'report', label: '成长报告', icon: '📊', match: ['成长报告', '报告', 'report'] },
    { key: 'radar', label: '资讯收藏', icon: '📰', match: ['信息雷达', '资讯', 'radar', '新闻'] },
  ],

  render(container) {
    container.innerHTML = `
      <div class="knowledge-container">
        <!-- 搜索 Surface -->
        <div class="knowledge-search-surface">
          <div class="knowledge-search-box">
            <svg class="knowledge-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" class="knowledge-search-input" id="knowledgeSearchInput" placeholder="搜索知识：关键词、概念、项目..." autocomplete="off">
            <button class="knowledge-search-clear" id="knowledgeSearchClear" style="display:none;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>

        <!-- 内容区 -->
        <div class="knowledge-content" id="knowledgeContent">
          <div class="knowledge-loading">
            <div class="loading-spinner"></div>
            <p>加载知识空间中...</p>
          </div>
        </div>
      </div>

      <!-- 详情 Drawer -->
      <div class="knowledge-drawer-overlay" id="knowledgeDrawerOverlay" style="display:none;"></div>
      <div class="knowledge-drawer" id="knowledgeDrawer">
        <div class="knowledge-drawer-header">
          <div class="knowledge-drawer-title-group">
            <h2 class="knowledge-drawer-title" id="drawerTitle">知识详情</h2>
            <div class="knowledge-drawer-meta" id="drawerMeta"></div>
          </div>
          <button class="knowledge-drawer-close" id="drawerClose">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="knowledge-drawer-body" id="drawerBody">
          <div class="knowledge-loading"><div class="loading-spinner"></div></div>
        </div>
      </div>
    `;
    this.bindEvents();
    this.loadKnowledge();
  },

  bindEvents() {
    const input = document.getElementById('knowledgeSearchInput');
    const clearBtn = document.getElementById('knowledgeSearchClear');
    const drawerClose = document.getElementById('drawerClose');
    const drawerOverlay = document.getElementById('knowledgeDrawerOverlay');

    // 搜索输入（防抖）
    input.addEventListener('input', () => {
      clearTimeout(this.searchTimer);
      const val = input.value.trim();
      clearBtn.style.display = val ? 'flex' : 'none';
      if (val.length === 0) {
        this.currentQuery = '';
        this.updatePersonalAIContext();
        this.renderKnowledgeList();
        return;
      }
      if (val.length >= 2) {
        this.searchTimer = setTimeout(() => this.doSearch(val), 400);
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(this.searchTimer);
        this.doSearch(input.value.trim());
      }
      if (e.key === 'Escape') {
        input.blur();
        if (input.value) {
          input.value = '';
          clearBtn.style.display = 'none';
          this.currentQuery = '';
          this.renderKnowledgeList();
        }
      }
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      this.currentQuery = '';
      this.updatePersonalAIContext();
      this.renderKnowledgeList();
      input.focus();
    });

    // Drawer 关闭
    drawerClose.addEventListener('click', () => this.closeDrawer());
    drawerOverlay.addEventListener('click', () => this.closeDrawer());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('knowledgeDrawer').classList.contains('open')) {
        this.closeDrawer();
      }
    });
  },

  // 加载知识空间
  async loadKnowledge() {
    const contentEl = document.getElementById('knowledgeContent');
    if (!contentEl) return;

    this.isLoading = true;
    contentEl.innerHTML = '<div class="knowledge-loading"><div class="loading-spinner"></div><p>加载知识空间中...</p></div>';

    try {
      // 并行加载统计和知识列表
      const [statsData, listData] = await Promise.all([
        API.getKnowledgeStats(),
        API.getKnowledgeList({ page: 1, pageSize: 50, sort: 'updated' }),
      ]);

      this.stats = statsData;
      this.knowledgeList = listData.items || [];

      this.renderKnowledgeList();
    } catch (err) {
      console.error('[Knowledge] 加载失败:', err);
      contentEl.innerHTML = `
        <div class="knowledge-error">
          <div class="knowledge-error-icon">⚠️</div>
          <div class="knowledge-error-title">加载失败</div>
          <div class="knowledge-error-desc">${UI.escapeHtml(err.message)}</div>
          <button class="btn btn-primary btn-sm" onclick="KnowledgeModule.loadKnowledge()">重试</button>
        </div>
      `;
    } finally {
      this.isLoading = false;
    }
  },

  // 渲染知识列表（含分类筛选和最近更新）
  renderKnowledgeList() {
    const contentEl = document.getElementById('knowledgeContent');
    if (!contentEl) return;

    // 搜索时展示独立于主列表的搜索结果子集，避免污染/清空主列表
    let items = this.currentQuery ? (this.searchResults || []) : [...this.knowledgeList];

    // 按来源筛选
    if (this.currentSource !== 'all') {
      const cat = this.SOURCE_CATEGORIES.find(c => c.key === this.currentSource);
      if (cat && cat.match) {
        items = items.filter(item => cat.match.some(m => (item.source || '').toLowerCase().includes(m.toLowerCase())));
      }
    }

    // 按类型筛选
    if (this.currentType !== 'all') {
      items = items.filter(item => item.type === this.currentType);
    }

    const recent = !this.currentQuery ? (items.slice(0, 6)) : [];
    const noFilter = this.currentSource === 'all' && this.currentType === 'all';

    contentEl.innerHTML = `
      ${this.renderFilterBar()}
      ${this.renderStatsInfo(items.length)}
      ${!this.currentQuery && noFilter ? this.renderRecentSection(recent) : ''}
      ${items.length === 0 ? this.renderEmptyState() : this.renderKnowledgeCards(items)}
    `;

    this.bindCardEvents();
    this.bindFilterEvents();
  },

  // 筛选栏：文字式类型筛选（下划线选中态） + 右侧排序/视图切换
  renderFilterBar() {
    // 类型列表：全部 + 所有出现的类型（按 TYPE_META 顺序）
    const typeOrder = ['project', 'concept', 'experience', 'learning', 'note', 'reflection', 'resource', 'report', 'article'];
    const availableTypes = new Set();
    this.knowledgeList.forEach(it => { if (it.type) availableTypes.add(it.type); });

    const typeChips = [
      `<button class="knowledge-type-tab ${this.currentType === 'all' ? 'active' : ''}" data-type="all">全部</button>`
    ].concat(
      typeOrder
        .filter(t => availableTypes.has(t))
        .map(t => {
          const meta = this.TYPE_META[t] || this.TYPE_META.note;
          return `<button class="knowledge-type-tab ${this.currentType === t ? 'active' : ''}" data-type="${t}" style="--tab-color:${meta.color};">${meta.label}</button>`;
        })
    ).join('');

    return `
      <div class="knowledge-filter-bar">
        <div class="knowledge-type-tabs">
          ${typeChips}
        </div>
        <div class="knowledge-filter-actions">
          <div class="knowledge-sort-wrapper">
            <button class="knowledge-filter-action-btn knowledge-sort-btn" id="knowledgeSortBtn" title="排序">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18M6 12h12M10 18h4"/>
              </svg>
            </button>
            <div class="knowledge-sort-dropdown" id="knowledgeSortDropdown" style="display:none;">
              <div class="knowledge-sort-item ${this.sortBy === 'updated' ? 'active' : ''}" data-sort="updated">
                <span>最近更新</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="${this.sortBy === 'updated' ? '' : 'display:none;'}"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <div class="knowledge-sort-item ${this.sortBy === 'created' ? 'active' : ''}" data-sort="created">
                <span>创建时间</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="${this.sortBy === 'created' ? '' : 'display:none;'}"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <div class="knowledge-sort-item ${this.sortBy === 'title' ? 'active' : ''}" data-sort="title">
                <span>标题排序</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="${this.sortBy === 'title' ? '' : 'display:none;'}"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <div class="knowledge-sort-divider"></div>
              <div class="knowledge-sort-item" data-sort-order>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  ${this.sortOrder === 'desc'
                    ? '<line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 19 19 12"></polyline>'
                    : '<line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 5 5 12"></polyline>'}
                </svg>
                <span>${this.sortOrder === 'desc' ? '降序' : '升序'}</span>
              </div>
            </div>
          </div>
          <div class="knowledge-view-toggle">
            <button class="knowledge-view-btn ${this.viewMode === 'list' ? 'active' : ''}" data-view="list" title="列表视图">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </button>
            <button class="knowledge-view-btn ${this.viewMode === 'grid' ? 'active' : ''}" data-view="grid" title="网格视图">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  },

  // 筛选条事件：类型 tab + 视图切换
  bindFilterEvents() {
    document.querySelectorAll('.knowledge-type-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.currentType = tab.dataset.type;
        this.renderKnowledgeList();
      });
    });

    // 视图切换
    document.querySelectorAll('.knowledge-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view && view !== this.viewMode) {
          this.viewMode = view;
          this.renderKnowledgeList();
        }
      });
    });

    // 排序下拉菜单
    const sortBtn = document.getElementById('knowledgeSortBtn');
    const sortDropdown = document.getElementById('knowledgeSortDropdown');
    if (sortBtn && sortDropdown) {
      sortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sortMenuOpen = !this.sortMenuOpen;
        sortDropdown.style.display = this.sortMenuOpen ? 'block' : 'none';
      });

      // 点击外部关闭
      document.addEventListener('click', (e) => {
        if (!sortBtn.contains(e.target) && !sortDropdown.contains(e.target)) {
          this.sortMenuOpen = false;
          sortDropdown.style.display = 'none';
        }
      });

      // 排序选项点击
      sortDropdown.querySelectorAll('.knowledge-sort-item[data-sort]').forEach(item => {
        item.addEventListener('click', () => {
          this.sortBy = item.dataset.sort;
          this.sortKnowledgeList();
          this.renderKnowledgeList();
        });
      });

      // 排序方向切换
      const sortOrderItem = sortDropdown.querySelector('[data-sort-order]');
      if (sortOrderItem) {
        sortOrderItem.addEventListener('click', () => {
          this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
          this.sortKnowledgeList();
          this.renderKnowledgeList();
        });
      }
    }
  },

  // 对知识列表进行排序
  sortKnowledgeList() {
    if (!this.knowledgeList || this.knowledgeList.length === 0) return;
    const sortField = this.sortBy;
    const order = this.sortOrder;

    this.knowledgeList.sort((a, b) => {
      let valA, valB;
      if (sortField === 'title') {
        valA = (a.title || '').toLowerCase();
        valB = (b.title || '').toLowerCase();
        return order === 'asc'
          ? valA.localeCompare(valB, 'zh-CN')
          : valB.localeCompare(valA, 'zh-CN');
      } else {
        valA = a[sortField] || a.updatedAt || a.createdAt || 0;
        valB = b[sortField] || b.updatedAt || b.createdAt || 0;
        if (typeof valA === 'string') valA = new Date(valA).getTime();
        if (typeof valB === 'string') valB = new Date(valB).getTime();
        return order === 'asc' ? valA - valB : valB - valA;
      }
    });
  },

  // 统计信息行
  renderStatsInfo(count) {
    const typeCount = this.stats?.types?.length || Object.keys(this.TYPE_META).length;
    const sourceCount = this.stats?.sources?.length || (this.SOURCE_CATEGORIES.length - 1);
    const total = this.stats?.total || count;
    return `
      <div class="knowledge-stats-bar">
        <span class="knowledge-stats-text">共 ${total} 条知识 · ${typeCount} 种类型 · ${sourceCount} 个来源</span>
      </div>
    `;
  },

  // 最近更新区域
  renderRecentSection(items) {
    if (!items || items.length === 0) return '';
    const isGrid = this.viewMode === 'grid';
    const inner = isGrid
      ? `<div class="knowledge-list grid-view">${items.map(i => this.renderKnowledgeCardGrid(i)).join('')}</div>`
      : `<div class="knowledge-list">${items.map(i => this.renderKnowledgeCard(i)).join('')}</div>`;
    return `
      <section class="knowledge-section knowledge-recent-section">
        <div class="knowledge-section-header">
          <h2 class="knowledge-section-title">最近更新</h2>
        </div>
        ${inner}
      </section>
    `;
  },

  // 知识卡片列表
  renderKnowledgeCards(items) {
    const viewClass = this.viewMode === 'grid' ? 'knowledge-list grid-view' : 'knowledge-list';
    const renderFn = this.viewMode === 'grid'
      ? (item) => this.renderKnowledgeCardGrid(item)
      : (item) => this.renderKnowledgeCard(item);
    return `
      <section class="knowledge-section">
        <div class="${viewClass}">
          ${items.map(renderFn).join('')}
        </div>
      </section>
    `;
  },

  renderKnowledgeCard(item) {
    const typeMeta = this.TYPE_META[item.type] || this.TYPE_META.note;
    return `
      <div class="knowledge-card" data-id="${UI.escapeHtml(item.id)}" style="--type-color:${typeMeta.color};">
        <div class="knowledge-card-accent"></div>
        <div class="knowledge-card-body">
          <h3 class="knowledge-card-title">${UI.escapeHtml(item.title)}</h3>
          <p class="knowledge-card-summary">${UI.escapeHtml(item.summary || '暂无摘要')}</p>
          <div class="knowledge-card-footer">
            <span class="knowledge-card-type-badge">
              ${typeMeta.label}
            </span>
            <span class="knowledge-card-source">${UI.escapeHtml(item.source || '知识库')}</span>
            <span class="knowledge-card-date">${UI.formatDate(item.updatedAt)}</span>
          </div>
        </div>
      </div>
    `;
  },

  // 网格视图卡片（紧凑，顶部 accent bar，无摘要）
  renderKnowledgeCardGrid(item) {
    const typeMeta = this.TYPE_META[item.type] || this.TYPE_META.note;
    const summary = item.summary || item.excerpt || '';
    const summaryShort = summary.length > 60 ? summary.slice(0, 60) + '…' : (summary || '暂无摘要');
    return `
      <div class="knowledge-card-grid" data-id="${UI.escapeHtml(item.id)}" style="--type-color:${typeMeta.color};">
        <div class="knowledge-card-grid-icon">
          <span class="knowledge-card-grid-emoji">${typeMeta.icon}</span>
        </div>
        <div class="knowledge-card-grid-content">
          <h3 class="knowledge-card-grid-title">${UI.escapeHtml(item.title)}</h3>
          <p class="knowledge-card-grid-desc">${UI.escapeHtml(summaryShort)}</p>
          <div class="knowledge-card-grid-meta">
            <span class="knowledge-card-grid-type">${typeMeta.label}</span>
            <span class="knowledge-card-grid-date">${UI.formatDate(item.updatedAt || item.date)}</span>
          </div>
        </div>
      </div>
    `;
  },

  // 空状态
  renderEmptyState() {
    if (this.currentQuery) {
      return `
        <div class="knowledge-empty">
          <div class="knowledge-empty-icon">🔍</div>
          <div class="knowledge-empty-title">未找到相关知识</div>
          <div class="knowledge-empty-desc">没有与「${UI.escapeHtml(this.currentQuery)}」匹配的知识，试试其他关键词</div>
        </div>
      `;
    }
    return `
      <div class="knowledge-empty">
        <div class="knowledge-empty-icon">📚</div>
        <div class="knowledge-empty-title">知识空间为空</div>
        <div class="knowledge-empty-desc">还没有知识内容，知识会从 Obsidian、AI复盘、信息雷达等来源逐步沉淀</div>
      </div>
    `;
  },

  // 绑定卡片事件
  bindCardEvents() {
    // 卡片点击（最近更新、列表、网格）
    document.querySelectorAll('.knowledge-recent-card, .knowledge-card, .knowledge-card-grid').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        if (id) this.openDrawer(id);
      });
    });
  },

  // 搜索
  async doSearch(query) {
    if (!query || query.trim() === '') {
      this.currentQuery = '';
      this.renderKnowledgeList();
      return;
    }

    this.currentQuery = query.trim();
    this.updatePersonalAIContext();

    const contentEl = document.getElementById('knowledgeContent');
    contentEl.innerHTML = '<div class="knowledge-loading"><div class="loading-spinner"></div><p>搜索知识中...</p></div>';

    try {
      const data = await API.searchKnowledge(this.currentQuery, 20);
      this.searchResults = data.results || [];
      this.renderKnowledgeList();
    } catch (err) {
      console.error('[Knowledge] 搜索失败:', err);
      contentEl.innerHTML = `
        <div class="knowledge-error">
          <div class="knowledge-error-icon">⚠️</div>
          <div class="knowledge-error-title">搜索失败</div>
          <div class="knowledge-error-desc">${UI.escapeHtml(err.message)}</div>
        </div>
      `;
    }
  },

  // 打开详情 Drawer
  async openDrawer(id) {
    const drawer = document.getElementById('knowledgeDrawer');
    const overlay = document.getElementById('knowledgeDrawerOverlay');
    const body = document.getElementById('drawerBody');
    const title = document.getElementById('drawerTitle');
    const meta = document.getElementById('drawerMeta');

    this.currentKnowledgeId = id;
    this.updatePersonalAIContext();

    drawer.classList.add('open');
    overlay.style.display = 'block';
    body.innerHTML = '<div class="knowledge-loading"><div class="loading-spinner"></div><p>加载知识详情中...</p></div>';

    try {
      const item = await API.getKnowledgeDetail(id);
      if (!item) {
        body.innerHTML = '<div class="knowledge-empty"><p>知识不存在</p></div>';
        return;
      }

      const typeMeta = this.TYPE_META[item.type] || this.TYPE_META.note;

      title.textContent = item.title;
      meta.innerHTML = `
        <span class="knowledge-drawer-type" style="color:${typeMeta.color};">${typeMeta.icon} ${typeMeta.label}</span>
        <span class="knowledge-drawer-source">${UI.escapeHtml(item.source || '知识库')}</span>
        <span class="knowledge-drawer-visibility">${item.visibility === 'public' ? '公开' : '私人'}</span>
      `;

      body.innerHTML = `
        <div class="knowledge-detail">
          <div class="knowledge-detail-meta-row">
            <div class="knowledge-detail-meta-item">
              <span class="knowledge-detail-meta-label">创建时间</span>
              <span class="knowledge-detail-meta-value">${UI.formatDateTime(item.createdAt) || '-'}</span>
            </div>
            <div class="knowledge-detail-meta-item">
              <span class="knowledge-detail-meta-label">更新时间</span>
              <span class="knowledge-detail-meta-value">${UI.formatDateTime(item.updatedAt) || '-'}</span>
            </div>
            <div class="knowledge-detail-meta-item">
              <span class="knowledge-detail-meta-label">来源</span>
              <span class="knowledge-detail-meta-value">${UI.escapeHtml(item.source || '-')}</span>
            </div>
          </div>

          ${item.tags && item.tags.length ? `
            <div class="knowledge-detail-tags">
              ${item.tags.map(tag => `<span class="knowledge-detail-tag">${UI.escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}

          <div class="knowledge-detail-content">
            ${this.renderMarkdown(item.content || '')}
          </div>

          <!-- 相关知识（预留，当前无真实关系数据） -->
          <div class="knowledge-detail-related">
            <h4 class="knowledge-detail-related-title">相关知识</h4>
            <div class="knowledge-detail-related-empty">
              <span>暂无相关知识关联</span>
              <span class="knowledge-detail-related-hint">知识关系功能开发中</span>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('[Knowledge] 加载详情失败:', err);
      body.innerHTML = `
        <div class="knowledge-error">
          <div class="knowledge-error-icon">⚠️</div>
          <div class="knowledge-error-title">加载失败</div>
          <div class="knowledge-error-desc">${UI.escapeHtml(err.message)}</div>
        </div>
      `;
    }
  },

  // 关闭 Drawer
  closeDrawer() {
    const drawer = document.getElementById('knowledgeDrawer');
    const overlay = document.getElementById('knowledgeDrawerOverlay');
    drawer.classList.remove('open');
    overlay.style.display = 'none';
    this.currentKnowledgeId = null;
    this.updatePersonalAIContext();
  },

  // 简单 Markdown 渲染（标题、列表、粗体、段落）
  renderMarkdown(content) {
    if (!content) return '<p class="knowledge-detail-no-content">暂无内容</p>';

    let html = UI.escapeHtml(content);

    // 标题
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // 粗体
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // 引用
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // 无序列表
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, match => `<ul>${match}</ul>`);

    // 有序列表
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // 段落（连续非空行）
    html = html.replace(/\n\n/g, '</p><p>');
    html = `<p>${html}</p>`;

    // 清理空段落
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>\s*<\/p>/g, '');

    return html;
  },

  // 更新 Personal AI Context（第一阶段只实现数据结构和传递接口）
  updatePersonalAIContext() {
    if (typeof App !== 'undefined') {
      App.currentContext = App.currentContext || {};
      App.currentContext.currentModule = 'knowledge';
      App.currentContext.currentKnowledgeId = this.currentKnowledgeId;
      App.currentContext.currentSearchQuery = this.currentQuery;
      App.currentContext.currentType = this.currentType;
    }
  },

  // 聚焦搜索（供全局搜索调用）
  focusSearch() {
    const input = document.getElementById('knowledgeSearchInput');
    if (input) {
      input.focus();
      input.select();
    }
  },
};

App.registerModule('search', KnowledgeModule);
