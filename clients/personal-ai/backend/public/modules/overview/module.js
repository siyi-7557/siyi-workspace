/**
 * 总览页模块
 * 展示知识统计、信息雷达、最近动态（标签轮播）
 */
const OverviewModule = {
  // 轮播状态
  carouselTab: 'knowledge', // knowledge / review / prompt
  carouselIndex: 0,
  tabTimer: null,
  itemTimer: null,
  carouselData: { knowledge: [], review: [], prompt: [] },

  async render(container) {
    this.container = container;
    this.clearTimers();
    container.innerHTML = this.getSkeleton();
    
    try {
      const [knowledgeStats, recentKnowledge, obsidianReviews, prompts, radarData] = await Promise.all([
        this.safeCall(() => API.getKnowledgeStats(), {}),
        this.safeCall(() => API.getKnowledgeList({ page: 1, pageSize: 5 }), { items: [] }),
        this.safeCall(() => API.request('GET', '/reviews/ability/obsidian/reviews?page=1&pageSize=5'), { reviews: [], total: 0 }),
        this.safeCall(() => API.getPrompts({ page: 1, pageSize: 5 }), { items: [], total: 0 }),
        this.safeCall(() => API.request('GET', '/radar/partitioned'), { partitions: {} }),
      ]);
      
      // 准备轮播数据
      this.carouselData = {
        knowledge: recentKnowledge.items || recentKnowledge.data || [],
        review: obsidianReviews.reviews || obsidianReviews.items || obsidianReviews.data || [],
        prompt: prompts.prompts || prompts.items || prompts.data || [],
      };
      
      const knowledgeCount = knowledgeStats.total || knowledgeStats.totalFiles || 0;
      const rawTags = knowledgeStats.totalTags || knowledgeStats.tags || 0;
      const tagCount = Array.isArray(rawTags) ? rawTags.length : rawTags;
      const reviewCount = obsidianReviews.total || this.carouselData.review.length || 0;
      const promptCount = prompts.total || this.carouselData.prompt.length;
      // 统计卡片标签的真实数据（区别于主数字的细分维度）
      const typeCount = Array.isArray(knowledgeStats.types) ? knowledgeStats.types.length : 0;
      const sourceCount = Array.isArray(knowledgeStats.sources) ? knowledgeStats.sources.length : 0;
      // 复盘平均分（基于已返回的复盘记录）
      const reviewList = this.carouselData.review || [];
      const scored = reviewList.filter(r => Number(r.average_score || r.quality_score) > 0);
      const avgReviewScore = scored.length > 0
        ? (scored.reduce((s, r) => s + Number(r.average_score || r.quality_score), 0) / scored.length).toFixed(1)
        : null;
      
      // 信息雷达数据
      const radarPartitions = radarData.partitions || radarData || {};
      const todayItems = radarPartitions.todayWorth || [];
      const relatedItems = radarPartitions.relatedToYou || [];
      const radarTotal = todayItems.length + relatedItems.length;
      const radarPreview = [...todayItems, ...relatedItems].slice(0, 3);
      
      container.innerHTML = this.renderFull({
        knowledgeCount,
        tagCount,
        reviewCount,
        promptCount,
        radarTotal,
        radarPreview,
        todayCount: todayItems.length,
        typeCount,
        sourceCount,
        avgReviewScore,
      });
      
      this.bindEvents(container);
      this.startCarousel(container);
    } catch (err) {
      console.error('[Overview] 加载失败:', err);
      container.innerHTML = this.renderError();
    }
  },

  safeCall(fn, fallback) {
    return fn().catch(err => {
      console.warn('[Overview] API 调用失败:', err.message);
      return fallback;
    });
  },

  getGreeting() {
    const hour = new Date().getHours();
    if (hour < 6) return '夜深了';
    if (hour < 12) return '早上好';
    if (hour < 14) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  },

  getDateString() {
    const now = new Date();
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · ${weekdays[now.getDay()]}`;
  },

  getSkeleton() {
    return `
      <div class="overview-page">
        <!-- 问候区骨架 -->
        <div class="overview-greeting-section">
          <div class="skeleton" style="height:28px;width:200px;border-radius:6px;"></div>
          <div class="skeleton" style="height:14px;width:280px;border-radius:4px;margin-top:8px;"></div>
        </div>
        <!-- 统计卡片骨架 -->
        <div class="overview-stats-grid" style="margin-top:20px;">
          ${Array(4).fill('<div class="overview-stat-card"><div class="skeleton" style="height:32px;width:32px;border-radius:6px;"></div><div class="skeleton" style="height:32px;width:70px;margin-top:14px;border-radius:4px;"></div><div class="skeleton" style="height:14px;width:60px;margin-top:6px;border-radius:4px;"></div></div>').join('')}
        </div>
      </div>
    `;
  },

  renderError() {
    return `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        </div>
        <h3 class="empty-title">加载失败</h3>
        <p class="empty-desc">总览页数据加载失败，请刷新页面重试。</p>
      </div>
    `;
  },

  renderFull(data) {
    const { knowledgeCount, tagCount, reviewCount, radarTotal, radarPreview,
            typeCount, sourceCount, avgReviewScore, todayCount } = data;
    
    return `
      <div class="overview-page">
        <!-- 1. 问候区 -->
        <div class="overview-greeting-section">
          <h2 class="overview-greeting-title">${this.getGreeting()}，思意</h2>
          <p class="overview-greeting-subtitle">${this.getDateString()} · 今天也要加油哦</p>
        </div>

        <!-- 2. 统计卡片区 -->
        <div class="overview-stats-grid">
          <!-- 知识笔记 -->
          <div class="overview-stat-card stat-knowledge" data-action="search">
            <div class="overview-stat-card-header">
              <div class="overview-stat-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
              </div>
              <div class="overview-stat-card-trend stat-trend-up">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                ${typeCount || 0} 类
              </div>
            </div>
            <div class="overview-stat-card-number">${knowledgeCount || 0}</div>
            <div class="overview-stat-card-label">知识笔记</div>
          </div>

          <!-- 标签分类 -->
          <div class="overview-stat-card stat-tags" data-action="search">
            <div class="overview-stat-card-header">
              <div class="overview-stat-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
              </div>
              <div class="overview-stat-card-trend stat-trend-up">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                ${sourceCount || 0} 源
              </div>
            </div>
            <div class="overview-stat-card-number">${tagCount || 0}</div>
            <div class="overview-stat-card-label">标签分类</div>
          </div>

          <!-- AI 复盘 -->
          <div class="overview-stat-card stat-review" data-action="review">
            <div class="overview-stat-card-header">
              <div class="overview-stat-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </div>
              <div class="overview-stat-card-trend stat-trend-up">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                ${avgReviewScore ? avgReviewScore + ' 分' : '暂无评分'}
              </div>
            </div>
            <div class="overview-stat-card-number">${reviewCount || 0}</div>
            <div class="overview-stat-card-label">AI 复盘</div>
          </div>

          <!-- 信息雷达 -->
          <div class="overview-stat-card stat-radar" data-action="radar">
            <div class="overview-stat-card-header">
              <div class="overview-stat-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
              </div>
              <div class="overview-stat-card-trend stat-trend-up">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                今日 ${todayCount || 0} 条
              </div>
            </div>
            <div class="overview-stat-card-number">${radarTotal || 0}</div>
            <div class="overview-stat-card-label">信息雷达</div>
          </div>
        </div>

        <!-- 3. 信息雷达区 -->
        <div class="overview-radar-section">
          <div class="overview-section-header">
            <h3 class="overview-section-title">信息雷达</h3>
            <button class="overview-section-link" data-action="radar">查看全部 →</button>
          </div>
          <div class="overview-radar-cards">
            ${radarPreview && radarPreview.length > 0
              ? radarPreview.map(item => this.renderRadarCard(item)).join('')
              : this.renderEmptyList('暂无雷达信息')}
          </div>
        </div>

        <!-- 4. 底部轮播 -->
        <div class="overview-carousel" id="overviewCarousel">
          <div class="overview-carousel-tabs">
            <button class="carousel-tab active" data-tab="knowledge">
              <span>知识卡片</span>
            </button>
            <button class="carousel-tab" data-tab="review">
              <span>复盘记录</span>
            </button>
            <button class="carousel-tab" data-tab="prompt">
              <span>提示词</span>
            </button>
            <span class="carousel-auto-hint">⏱ 自动切换</span>
          </div>
          <div class="overview-carousel-content" id="carouselContent">
            ${this.renderCarouselItem()}
          </div>
          <div class="overview-carousel-dots" id="carouselDots">
            ${this.renderCarouselDots()}
          </div>
        </div>
      </div>
    `;
  },

  renderCarouselItem() {
    const items = this.carouselData[this.carouselTab] || [];
    if (items.length === 0) {
      const emptyTexts = {
        knowledge: '暂无知识记录，去添加第一篇笔记吧',
        review: '暂无复盘记录，开始第一次复盘吧',
        prompt: '暂无提示词，去创建第一个模板吧',
      };
      return `
        <div class="carousel-empty">
          <div class="carousel-empty-icon">${this.carouselTab === 'knowledge' ? '📚' : this.carouselTab === 'review' ? '📝' : '⭐'}</div>
          <p>${emptyTexts[this.carouselTab] || '暂无数据'}</p>
        </div>
      `;
    }
    
    const item = items[this.carouselIndex % items.length];
    
    if (this.carouselTab === 'knowledge') {
      return this.renderKnowledgeCard(item);
    } else if (this.carouselTab === 'review') {
      return this.renderReviewCard(item);
    } else {
      return this.renderPromptCard(item);
    }
  },

  renderCarouselDots() {
    const items = this.carouselData[this.carouselTab] || [];
    if (items.length <= 1) return '';
    return items.map((_, i) => `
      <span class="carousel-dot ${i === this.carouselIndex % items.length ? 'active' : ''}" data-index="${i}"></span>
    `).join('');
  },

  renderKnowledgeCard(item) {
    const title = item.title || item.name || '未命名';
    const desc = item.excerpt || item.content || '';
    const cleanDesc = desc.replace(/^---[\s\S]*?---/, '').replace(/[#*`>\-]/g, '').trim().slice(0, 120);
    const date = item.updatedAt || item.updated_at || item.date || '';
    const tags = item.tags || [];
    const tagHtml = tags.length > 0 ? `<span class="carousel-card-tag">${this.escapeHtml(tags[0])}</span>` : '';
    
    return `
      <div class="carousel-card" data-action="all-knowledge">
        <div class="carousel-card-header">
          <h4 class="carousel-card-title">${this.escapeHtml(title)}</h4>
          ${tagHtml}
        </div>
        ${cleanDesc ? `<p class="carousel-card-desc">${this.escapeHtml(cleanDesc)}${cleanDesc.length >= 120 ? '...' : ''}</p>` : ''}
        <div class="carousel-card-footer">
          <span class="carousel-card-date">${date ? this.formatDate(date) : ''}</span>
          <span class="carousel-card-link">查看知识库 →</span>
        </div>
      </div>
    `;
  },

  renderReviewCard(item) {
    const title = item.title || item.projectName || item.project_name || '未命名复盘';
    const score = item.average_score || item.qualityScore || item.quality || item.quality_score || 0;
    const date = item.date || item.createdAt || item.created_at || '';
    const status = item.completion_status || '';
    const problems = item.total_problems || 0;
    const goodPractices = item.total_good_practices || 0;
    const tags = item.tags ? (Array.isArray(item.tags) ? item.tags : String(item.tags).split(/\s+/).filter(Boolean)) : [];
    
    // 组合描述
    const descParts = [];
    if (status) descParts.push(status);
    if (problems > 0) descParts.push(`${problems}个问题`);
    if (goodPractices > 0) descParts.push(`${goodPractices}个好实践`);
    const desc = descParts.join(' · ');
    
    return `
      <div class="carousel-card" data-action="all-reviews">
        <div class="carousel-card-header">
          <h4 class="carousel-card-title">${this.escapeHtml(title)}</h4>
          ${score ? `<span class="carousel-card-tag">${score}分</span>` : ''}
        </div>
        ${desc ? `<p class="carousel-card-desc">${this.escapeHtml(desc)}</p>` : ''}
        <div class="carousel-card-footer">
          <span class="carousel-card-date">${date ? this.escapeHtml(date) : ''}</span>
          <span class="carousel-card-link">查看复盘库 →</span>
        </div>
      </div>
    `;
  },

  renderPromptCard(item) {
    const title = item.title || item.name || '未命名提示词';
    const desc = item.description || item.content || item.prompt || item.scene || '';
    const cleanDesc = desc.replace(/[#*`>\-]/g, '').trim().slice(0, 120);
    const category = item.category || '';
    
    return `
      <div class="carousel-card" data-action="prompt">
        <div class="carousel-card-header">
          <h4 class="carousel-card-title">${this.escapeHtml(title)}</h4>
          ${category ? `<span class="carousel-card-tag">${this.escapeHtml(category)}</span>` : ''}
        </div>
        ${cleanDesc ? `<p class="carousel-card-desc">${this.escapeHtml(cleanDesc)}${cleanDesc.length >= 120 ? '...' : ''}</p>` : ''}
        <div class="carousel-card-footer">
          <span class="carousel-card-date">${item.scene ? this.escapeHtml(item.scene) : ''}</span>
          <span class="carousel-card-link">查看提示词库 →</span>
        </div>
      </div>
    `;
  },

  renderRadarCard(item) {
    const title = item.title || '无标题';
    const source = item.source || '未知';
    const category = item.category || 'AI';
    const summary = item.summary || item.content || '';
    const cleanSummary = summary.replace(/[#*`>\-]/g, '').trim().slice(0, 80);
    // 简易来源图标映射（按来源关键词匹配颜色）
    const sourceLower = String(source).toLowerCase();
    let iconColorClass = 'rc-icon-accent';
    if (sourceLower.includes('hacker') || sourceLower.includes('hn')) iconColorClass = 'rc-icon-success';
    else if (sourceLower.includes('product') || sourceLower.includes('ph')) iconColorClass = 'rc-icon-info';
    else if (sourceLower.includes('twitter') || sourceLower.includes('x.com')) iconColorClass = 'rc-icon-warning';
    
    return `
      <div class="radar-card" data-radar-card-id="${this.escapeHtml(item.id || '')}">
        <div class="radar-card-source-row">
          <div class="radar-card-source-icon ${iconColorClass}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
          </div>
          <span class="radar-card-source-name">${this.escapeHtml(source)}</span>
          <span class="radar-card-category">${this.escapeHtml(category)}</span>
        </div>
        <h4 class="radar-card-title">${this.escapeHtml(title)}</h4>
        ${cleanSummary ? `<p class="radar-card-desc">${this.escapeHtml(cleanSummary)}${cleanSummary.length >= 80 ? '...' : ''}</p>` : ''}
        <div class="radar-card-footer">
          <span class="radar-card-time">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            今日
          </span>
          <span class="radar-card-relevance">高相关</span>
        </div>
      </div>
    `;
  },

  renderEmptyList(text) {
    return `
      <div class="overview-empty">
        <span>${text}</span>
      </div>
    `;
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    } catch {
      return dateStr;
    }
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
  },

  // ===== 轮播逻辑 =====

  startCarousel(container) {
    this.container = container;
    
    // 内容每5秒切换
    this.itemTimer = setInterval(() => {
      const items = this.carouselData[this.carouselTab] || [];
      if (items.length > 1) {
        this.carouselIndex = (this.carouselIndex + 1) % items.length;
        this.updateCarousel();
      }
    }, 5000);
    
    // 板块每8秒切换
    this.tabTimer = setInterval(() => {
      const tabs = ['knowledge', 'review', 'prompt'];
      const currentIdx = tabs.indexOf(this.carouselTab);
      this.carouselTab = tabs[(currentIdx + 1) % tabs.length];
      this.carouselIndex = 0;
      this.updateCarousel();
      this.updateTabs();
    }, 8000);
  },

  updateCarousel() {
    const content = this.container?.querySelector('#carouselContent');
    const dots = this.container?.querySelector('#carouselDots');
    if (content) {
      content.style.opacity = '0';
      setTimeout(() => {
        content.innerHTML = this.renderCarouselItem();
        content.style.opacity = '1';
        this.bindCarouselCardEvents();
      }, 200);
    }
    if (dots) dots.innerHTML = this.renderCarouselDots();
  },

  updateTabs() {
    const tabs = this.container?.querySelectorAll('.carousel-tab');
    tabs?.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === this.carouselTab);
    });
  },

  clearTimers() {
    if (this.itemTimer) clearInterval(this.itemTimer);
    if (this.tabTimer) clearInterval(this.tabTimer);
    this.itemTimer = null;
    this.tabTimer = null;
  },

  bindCarouselCardEvents() {
    // 卡片点击跳转
    this.container?.querySelectorAll('.carousel-card').forEach(card => {
      card.addEventListener('click', () => {
        const action = card.dataset.action;
        const moduleMap = {
          'all-knowledge': 'search',
          'all-reviews': 'obsidian-reviews',
          'prompt': 'prompt',
        };
        const target = moduleMap[action];
        if (target && App.switchModule) {
          this.clearTimers();
          App.switchModule(target);
        }
      });
      card.style.cursor = 'pointer';
    });
  },

  bindEvents(container) {
    // 快捷操作按钮
    container.querySelectorAll('[data-action]').forEach(el => {
      if (el.closest('.carousel-card')) return; // 卡片事件单独处理
      el.addEventListener('click', () => {
        const action = el.dataset.action;
        const moduleMap = {
          search: 'search',
          review: 'obsidian-reviews',
          'all-knowledge': 'search',
          'all-reviews': 'obsidian-reviews',
          prompt: 'prompt',
          settings: 'settings',
          radar: 'radar',
        };
        const target = moduleMap[action];
        if (target && App.switchModule) {
          this.clearTimers();
          App.switchModule(target);
        }
      });
    });

    // 轮播标签点击
    container.querySelectorAll('.carousel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.carouselTab = tab.dataset.tab;
        this.carouselIndex = 0;
        this.updateCarousel();
        this.updateTabs();
        // 重置定时器
        if (this.itemTimer) clearInterval(this.itemTimer);
        if (this.tabTimer) clearInterval(this.tabTimer);
        this.startCarousel(container);
      });
    });

    // 指示点点击
    container.querySelectorAll('.carousel-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        this.carouselIndex = parseInt(dot.dataset.index);
        this.updateCarousel();
      });
    });

    // 雷达卡片点击
    container.querySelectorAll('[data-radar-card-id]').forEach(el => {
      el.addEventListener('click', () => {
        this.clearTimers();
        App.switchModule('radar');
      });
      el.style.cursor = 'pointer';
    });

    // 绑定卡片事件
    this.bindCarouselCardEvents();
  },
};

App.registerModule('overview', OverviewModule);
