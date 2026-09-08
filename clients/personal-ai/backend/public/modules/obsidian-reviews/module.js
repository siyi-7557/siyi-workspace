// Obsidian AI复盘模块 — 扫描并展示Obsidian中的AI复盘文档
const ObsidianReviewsModule = {
  currentView: 'overview', // overview | reviews | detail | insights | actions | report | report-detail
  reviews: [],
  stats: null,
  currentReview: null,
  currentPath: null,
  page: 1,
  pageSize: 20,
  sortBy: 'date',
  sortOrder: 'desc',
  // 行动项相关
  actionItems: [],
  actionStats: null,
  actionFilter: { priority: null, status: null, scope: 'all' }, // scope: all | today | pending | done
  actionsDoneCollapsed: true, // 已完成行动区默认折叠
  // 洞察页面状态
  insightsTab: 'radar', // radar | patterns | learnings
  // 复盘筛选
  reviewFilter: { project: null, score: null },
  // 自动刷新定时器
  _autoRefreshTimer: null,
  _autoRefreshInterval: 30000, // 30秒

  async render(container) {
    this.container = container;
    this.bindKeyboardShortcuts();
    await this.renderOverview();
  },

  // 绑定全局键盘快捷键
  bindKeyboardShortcuts() {
    if (this._keyboardBound) return;
    this._keyboardBound = true;

    document.addEventListener('keydown', (e) => {
      // ESC键：详情页返回列表页，其他子视图返回总览页
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (this.container && this.container.offsetParent !== null && this.currentView !== 'overview') {
          e.preventDefault();
          document.body.classList.add('keyboard-nav');
          if (this.currentView === 'detail') {
            this.renderReviews();
          } else {
            this.renderOverview();
          }
          setTimeout(() => document.body.classList.remove('keyboard-nav'), 300);
        }
      }
    });
  },

  // 绑定保存Prompt按钮（Notion风格）
  bindSavePromptButtons() {
    const buttons = document.querySelectorAll('.notion-save-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (btn.classList.contains('saved')) return;

        const h3 = btn.closest('.notion-h3');
        if (!h3) return;

        // 提取Prompt信息
        const title = btn.getAttribute('data-prompt-title') || '从复盘提取的Prompt';

        // 收集h3之后到下一个h3/h2/h1之前的所有兄弟元素内容
        let sectionText = '';
        let el = h3.nextElementSibling;
        while (el && !el.matches('h1, h2, h3')) {
          sectionText += el.textContent + '\n';
          el = el.nextElementSibling;
        }

        // 提取Prompt内容（查找"Prompt内容"或"优化后的Prompt"）
        let promptContent = '';
        const contentMatch = sectionText.match(/(?:Prompt内容|优化后的Prompt|优化后Prompt)[：:]\s*([\s\S]*?)(?=\n\s*(?:适用场景|原始版本|优化说明|预期效果|$))/i);
        if (contentMatch) {
          promptContent = contentMatch[1].trim();
        } else {
          // 如果没找到，取段落中第一个较长的文本
          const paragraphs = sectionText.split('\n').filter(p => p.trim().length > 20);
          for (let p of paragraphs) {
            const text = p.trim();
            if (!text.startsWith('Prompt') && !text.startsWith('适用') && !text.startsWith('优化') && !text.startsWith('原始') && !text.startsWith('预期')) {
              promptContent = text;
              break;
            }
          }
        }

        // 提取适用场景
        let scene = '';
        const sceneMatch = sectionText.match(/适用场景[：:]\s*([\s\S]*?)(?=\n\s*(?:原始版本|优化说明|预期效果|Prompt内容|$))/i);
        if (sceneMatch) {
          scene = sceneMatch[1].trim();
        }

        if (!promptContent) {
          alert('未能提取到Prompt内容，请手动复制保存');
          return;
        }

        // 显示加载状态
        btn.textContent = '保存中...';
        btn.disabled = true;

        try {
          // 调用API保存到Prompt库
          const response = await fetch('/api/prompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category: 'AI复盘提取',
              title: title.substring(0, 100),
              prompt: promptContent,
              scene: scene.substring(0, 200),
              effect: '待验证',
              tags: JSON.stringify(['AI复盘', '可复用'])
            })
          });

          const result = await response.json();
          if (response.ok) {
            btn.textContent = '✓ 已保存';
            btn.classList.add('saved');
            btn.disabled = false;
          } else {
            throw new Error(result.error || '保存失败');
          }
        } catch (err) {
          console.error('保存Prompt失败:', err);
          btn.textContent = '💾 保存';
          btn.disabled = false;
          alert('保存失败: ' + err.message);
        }
      });
    });
  },

  // 启动自动刷新（项目视图专用）
  startAutoRefresh() {
    this.stopAutoRefresh();
    this._autoRefreshTimer = setInterval(() => {
      // 只在项目列表或项目详情页时刷新
      if (this.currentView === 'projects') {
        this.renderProjects();
      } else if (this.currentView === 'project-detail' && this._currentProjectName) {
        this.renderProjectDetail(this._currentProjectName);
      }
    }, this._autoRefreshInterval);
  },

  // 停止自动刷新
  stopAutoRefresh() {
    if (this._autoRefreshTimer) {
      clearInterval(this._autoRefreshTimer);
      this._autoRefreshTimer = null;
    }
  },

  // 绑定阅读进度条
  bindReadingProgress() {
    // 停止之前的定时器
    if (this._progressTimer) {
      clearInterval(this._progressTimer);
      this._progressTimer = null;
    }

    const updateProgress = () => {
      const bar = document.getElementById('readingProgressBar');
      if (!bar) return;

      // 找到滚动容器
      const scrollContainer = document.getElementById('contentArea') || document.querySelector('.content-area') || window;
      const scrollTop = scrollContainer.scrollTop || scrollContainer.scrollY || 0;
      const scrollHeight = scrollContainer.scrollHeight || document.documentElement.scrollHeight;
      const clientHeight = scrollContainer.clientHeight || window.innerHeight;
      const maxScroll = scrollHeight - clientHeight;
      const progress = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
      bar.style.width = progress + '%';
    };

    // 立即更新一次
    updateProgress();
    // 每100ms轮询更新
    this._progressTimer = setInterval(updateProgress, 100);
  },

  // ========== 统一导航（下划线 Tab 样式） ==========
  renderNav(activeView) {
    const tabs = [
      { key: 'overview', label: '总览' },
      { key: 'reviews', label: '复盘列表' },
      { key: 'insights', label: '洞察分析' },
      { key: 'actions', label: '行动项' },
      { key: 'report', label: '成长报告' },
    ];
    return `
      <nav class="siyi-tab-bar">
        <div class="siyi-tab-track">
          ${tabs.map(t => `
            <button class="siyi-tab-item ${activeView === t.key ? 'active' : ''}" data-view="${t.key}">
              <span class="siyi-tab-label">${t.label}</span>
            </button>
          `).join('')}
        </div>
        <div class="siyi-tab-indicator-bar"></div>
      </nav>
    `;
  },

  bindPrimaryNav() {
    document.querySelectorAll('.siyi-tab-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        switch (view) {
          case 'overview': this.renderOverview(); break;
          case 'reviews': this.renderReviews(); break;
          case 'insights': this.renderInsights(); break;
          case 'actions': this.renderActions(); break;
          case 'report': this.renderReport(); break;
        }
      });
    });
  },

  // ========== 总览视图 ==========
  async renderOverview() {
    this.currentView = 'overview';
    if (this._progressTimer) { clearInterval(this._progressTimer); this._progressTimer = null; }
    this.stopAutoRefresh();

    // 重置滚动位置
    window.scrollTo(0, 0);
    const contentEl = document.getElementById("contentInner");
    if (contentEl) contentEl.scrollTop = 0;

    const chartW = 560;
    const chartH = 180;
    const padX = 20;
    const padY = 20;
    const innerW = chartW - padX * 2;
    const innerH = chartH - padY * 2;
    const rangeOptions = [
      { key: '7d', label: '近 7 天' },
      { key: '30d', label: '近 30 天' },
      { key: 'all', label: '全部' },
    ];
    const fmtMetric = (v, suffix = '') => (v == null ? '--' : Number(v).toLocaleString() + suffix);

    try {
      // 一次性拉取真实数据
      const [statsRes, qualityRes, reviewsRes, patternsRes] = await Promise.all([
        fetch('/api/reviews/ability/obsidian/stats').then(r => r.json()).catch(() => null),
        fetch('/api/reviews/ability/obsidian/quality').then(r => r.json()).catch(() => null),
        fetch('/api/reviews/ability/obsidian/reviews?page=1&pageSize=3').then(r => r.json()).catch(() => null),
        fetch('/api/reviews/ability/obsidian/patterns').then(r => r.json()).catch(() => null),
      ]);

      const stats = statsRes && statsRes.success ? statsRes.stats : null;
      const quality = qualityRes && qualityRes.success ? qualityRes : null;
      const recent = reviewsRes && reviewsRes.success ? (reviewsRes.reviews || []) : [];
      const patternsData = patternsRes && patternsRes.success ? patternsRes : null;

      // 核心指标
      const totalReviews = stats ? stats.total : (quality != null ? quality.total : null);
      const avgQuality = quality != null ? Number(quality.avgScore) : null;
      const totalProblems = stats ? stats.totalProblems : null;
      const totalActions = stats ? (stats.totalGoodPractices || 0) : null;

      // 质量趋势（真实评分，按日期聚合）
      const trend = this.buildQualityTrend(quality ? quality.scores : [], '7d');
      const trendHtml = trend.length >= 2
        ? this.buildTrendSvg(trend, chartW, chartH, padX, padY, innerW, innerH, 100, 0)
        : `<div style="padding:60px 0;text-align:center;color:var(--color-text-secondary);">暂无评分数据</div>`;

      // 关键洞察（真实数据驱动的 3 条）
      const insights = this.buildOverviewInsights(stats, patternsData, quality);
      const insightHtml = insights.map(ins => `
        <div class="siyi-insight-item">
          <div class="siyi-insight-icon">${ins.icon}</div>
          <div class="siyi-insight-body">
            <div class="siyi-insight-title">${ins.title}</div>
            <div class="siyi-insight-desc">${ins.desc}</div>
          </div>
        </div>
      `).join('') || '<div style="padding:12px 0;color:var(--color-text-secondary);">暂无洞察数据</div>';

      // 最近复盘卡片（真实数据）
      const recentHtml = recent.map(r => {
        const score = r.average_score || 0;
        const scoreClass = score >= 4 ? 'high' : score >= 3 ? 'medium' : 'low';
        const project = (r.tags && r.tags.length > 1) ? r.tags[1] : (r.source || '复盘');
        const summary = `评分 ${score}　${r.total_problems || 0} 问题　${r.total_good_practices || 0} 好做法　${new Date(r.date).toLocaleDateString()}`;
        return `
          <div class="siyi-review-card" data-path="${r.path || ''}" style="cursor:pointer;">
            <div class="siyi-review-card-top">
              <div class="siyi-score-badge ${scoreClass}">${score}</div>
              <span class="siyi-project-tag">${project}</span>
            </div>
            <h4 class="siyi-review-card-title">${r.title || '未命名复盘'}</h4>
            <p class="siyi-review-card-summary">${summary.substring(0, 60)}${summary.length > 60 ? '...' : ''}</p>
            <div class="siyi-review-card-footer">
              <span class="siyi-review-date">${r.date || ''}</span>
              <div class="siyi-review-stats">
                <span class="siyi-stat-pill problem">${r.total_problems || 0} 问题</span>
                <span class="siyi-stat-pill action">${r.total_good_practices || 0} 行动</span>
              </div>
            </div>
          </div>
        `;
      }).join('') || '<div class="siyi-empty-state">暂无复盘记录</div>';

      this.container.innerHTML = `
        <div class="siyi-reviews-container">
          <div class="siyi-page-header">
            <div class="siyi-header-text">
              <h1 class="siyi-page-title">AI 复盘</h1>
              <p class="siyi-page-subtitle">把每一次反思，变成可积累的成长</p>
            </div>
            <div class="siyi-header-actions">
              <button class="siyi-ghost-btn" id="ovRefreshBtn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
                刷新
              </button>
            </div>
          </div>

          ${this.renderNav('overview')}

          <!-- 核心数据行：4 个大数字横排 + 竖线分隔 -->
          <div class="siyi-hero-stats">
            <div class="siyi-hero-stat" data-view="reviews">
              <div class="siyi-hero-stat-value">${fmtMetric(totalReviews)}</div>
              <div class="siyi-hero-stat-label">复盘数</div>
            </div>
            <div class="siyi-hero-divider"></div>
            <div class="siyi-hero-stat" data-view="insights">
              <div class="siyi-hero-stat-value accent">${fmtMetric(avgQuality, '/100')}</div>
              <div class="siyi-hero-stat-label">平均质量</div>
            </div>
            <div class="siyi-hero-divider"></div>
            <div class="siyi-hero-stat" data-view="insights">
              <div class="siyi-hero-stat-value warning">${fmtMetric(totalProblems)}</div>
              <div class="siyi-hero-stat-label">问题数</div>
            </div>
            <div class="siyi-hero-divider"></div>
            <div class="siyi-hero-stat" data-view="actions">
              <div class="siyi-hero-stat-value success">${fmtMetric(totalActions)}</div>
              <div class="siyi-hero-stat-label">行动项</div>
            </div>
          </div>

          <!-- 本周质量趋势：左 70% 折线图 + 右 30% 关键洞察 -->
          <div class="siyi-trend-section">
            <div class="siyi-trend-chart-card">
              <div class="siyi-card-header">
                <h3 class="siyi-card-title">质量趋势</h3>
                <span class="siyi-card-badge">近 7 天</span>
              </div>
              <div class="siyi-line-chart">
                ${trendHtml}
              </div>
            </div>
            <div class="siyi-trend-insights-card">
              <div class="siyi-card-header">
                <h3 class="siyi-card-title">关键洞察</h3>
              </div>
              <div class="siyi-insight-list">
                ${insightHtml}
              </div>
            </div>
          </div>

          <!-- 最近复盘：3 张卡片横排 -->
          <div class="siyi-recent-section">
            <div class="siyi-section-header">
              <h3 class="siyi-section-title">最近复盘</h3>
              <button class="siyi-link-btn" data-view="reviews">查看全部 →</button>
            </div>
            <div class="siyi-review-cards">
              ${recentHtml}
            </div>
          </div>
        </div>
      `;

      this.bindPrimaryNav();
      this.bindOverviewEvents();
    } catch (err) {
      console.error('[Overview] 加载失败:', err);
      this.container.innerHTML = `
        <div class="siyi-reviews-container">
          <div class="siyi-page-header">
            <div class="siyi-header-text">
              <h1 class="siyi-page-title">AI 复盘</h1>
              <p class="siyi-page-subtitle">把每一次反思，变成可积累的成长</p>
            </div>
          </div>
          ${this.renderNav('overview')}
          <div class="siyi-insights-empty" style="padding:60px 20px;text-align:center;color:var(--color-text-secondary);">加载总览数据失败，请稍后重试</div>
        </div>
      `;
    }
  },

  // 从真实统计与模式数据生成关键洞察（无伪造数据）
  buildOverviewInsights(stats, patternsData, quality) {
    const insights = [];
    if (quality && quality.avgScore != null) {
      const grade = quality.avgScore >= 80 ? '优秀' : quality.avgScore >= 60 ? '中等' : '待改进';
      insights.push({ icon: '📈', title: '复盘质量' + grade, desc: `平均质量 ${quality.avgScore} 分（${quality.distribution ? Object.keys(quality.distribution).map(g => `${g}:${quality.distribution[g]}`).join(' ') : ''}）` });
    }
    if (patternsData && Array.isArray(patternsData.patterns) && patternsData.patterns.length) {
      const top = patternsData.patterns[0];
      insights.push({ icon: '⚠️', title: '最频繁问题模式', desc: `「${top.name}」出现 ${top.count} 次` });
    }
    if (stats && stats.total > 0) {
      insights.push({ icon: '💡', title: '复盘完成率', desc: `${stats.completionRate || 0}% 的复盘已完整体现 4 大板块` });
    }
    return insights;
  },

  bindOverviewEvents() {
    document.getElementById('ovRefreshBtn')?.addEventListener('click', () => this.renderOverview());
    // 统计数字点击跳转
    document.querySelectorAll('.siyi-hero-stat').forEach(card => {
      card.addEventListener('click', () => {
        const view = card.dataset.view;
        if (view === 'insights') this.renderInsights();
        else if (view === 'reviews') this.renderReviews();
        else if (view === 'actions') this.renderActions();
      });
    });
    // "查看全部" 链接按钮
    document.querySelectorAll('.siyi-link-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view === 'insights') this.renderInsights();
        else if (view === 'reviews') this.renderReviews();
        else if (view === 'actions') this.renderActions();
      });
    });
    // 最近复盘卡片：有路径则打开详情，否则跳转到列表
    document.querySelectorAll('.siyi-review-card').forEach(card => {
      card.addEventListener('click', () => {
        const path = card.dataset.path;
        if (path) this.renderDetail(path);
        else this.renderReviews();
      });
    });
  },

  renderOverviewRecentReviews(reviews) {
    const el = document.getElementById('ovRecentReviews');
    if (!reviews || reviews.length === 0) {
      el.innerHTML = '<div class="empty-state">暂无复盘记录</div>';
      return;
    }
    const r = reviews[0];
    el.innerHTML = `
      <div class="ov-review-card" data-path="${r.path || r.relPath}" style="cursor:pointer;">
        <div class="ov-review-date">${r.date || '未知日期'}</div>
        <div class="ov-review-title">${r.title || r.projectName || '未命名复盘'}</div>
        <div class="ov-review-meta">
          ${r.score ? `<span class="ov-meta-score">评分 ${r.score}</span>` : ''}
          ${r.total_problems ? `<span class="ov-meta-item">${r.total_problems} 问题</span>` : ''}
          ${r.total_good_practices ? `<span class="ov-meta-item">${r.total_good_practices} 好做法</span>` : ''}
        </div>
      </div>
    `;
    el.querySelector('.ov-review-card')?.addEventListener('click', () => {
      const path = r.path || r.relPath;
      if (path) this.renderDetail(path);
    });
  },

  renderOverviewRecentProblems(reviews) {
    const el = document.getElementById('ovRecentProblems');
    const problems = [];
    reviews.forEach(r => {
      if (r.problems && Array.isArray(r.problems)) {
        r.problems.slice(0, 2).forEach(p => {
          problems.push({ text: typeof p === 'string' ? p : (p.problem || p.title || ''), date: r.date, source: r.title || r.projectName });
        });
      }
    });
    if (problems.length === 0) {
      el.innerHTML = '<div class="empty-state">暂无问题记录</div>';
      return;
    }
    el.innerHTML = problems.slice(0, 5).map(p => `
      <div class="ov-list-item ov-item-problem">
        <div class="ov-item-text">${p.text.substring(0, 60)}${p.text.length > 60 ? '...' : ''}</div>
        <div class="ov-item-meta">${p.date} · ${p.source}</div>
      </div>
    `).join('');
  },

  renderOverviewProblemsFromDetails(problems) {
    const el = document.getElementById('ovRecentProblems');
    if (!problems || problems.length === 0) {
      el.innerHTML = '<div class="empty-state">暂无问题记录</div>';
      return;
    }
    const p = problems[0];
    el.innerHTML = `
      <div class="ov-list-item ov-item-problem" style="cursor:pointer;">
        <div class="ov-item-text">${(p.text || '').substring(0, 80)}${(p.text || '').length > 80 ? '...' : ''}</div>
        <div class="ov-item-meta">${p.date} · ${p.source}</div>
      </div>
    `;
    el.querySelector('.ov-list-item')?.addEventListener('click', () => this.renderInsights());
  },

  renderOverviewGoodFromDetails(practices) {
    const el = document.getElementById('ovRecentGood');
    if (!practices || practices.length === 0) {
      el.innerHTML = '<div class="empty-state">暂无好做法记录</div>';
      return;
    }
    const g = practices[0];
    el.innerHTML = `
      <div class="ov-list-item ov-item-good" style="cursor:pointer;">
        <div class="ov-item-text">${(g.text || '').substring(0, 80)}${(g.text || '').length > 80 ? '...' : ''}</div>
        <div class="ov-item-meta">${g.date} · ${g.source}</div>
      </div>
    `;
    el.querySelector('.ov-list-item')?.addEventListener('click', () => this.renderInsights());
  },

  renderOverviewPromptsFromDetails(prompts) {
    const el = document.getElementById('ovRecentPrompts');
    if (!prompts || prompts.length === 0) {
      el.innerHTML = '<div class="empty-state">暂无提取的Prompt</div>';
      return;
    }
    const p = prompts[0];
    el.innerHTML = `
      <div class="ov-list-item ov-item-prompt" style="cursor:pointer;">
        <div class="ov-item-text">${(p.title || '').substring(0, 60)}${(p.title || '').length > 60 ? '...' : ''}</div>
        <div class="ov-item-meta">${p.date} · ${p.source}${p.scene ? ' · ' + p.scene.substring(0, 20) : ''}</div>
      </div>
    `;
    el.querySelector('.ov-list-item')?.addEventListener('click', () => this.renderReviews());
  },

  renderOverviewRecentGood(reviews) {
    const el = document.getElementById('ovRecentGood');
    const goods = [];
    reviews.forEach(r => {
      if (r.goodPractices && Array.isArray(r.goodPractices)) {
        r.goodPractices.slice(0, 2).forEach(g => {
          goods.push({ text: typeof g === 'string' ? g : (g.practice || g.title || ''), date: r.date, source: r.title || r.projectName });
        });
      }
    });
    if (goods.length === 0) {
      el.innerHTML = '<div class="empty-state">暂无好做法记录</div>';
      return;
    }
    el.innerHTML = goods.slice(0, 5).map(g => `
      <div class="ov-list-item ov-item-good">
        <div class="ov-item-text">${g.text.substring(0, 60)}${g.text.length > 60 ? '...' : ''}</div>
        <div class="ov-item-meta">${g.date} · ${g.source}</div>
      </div>
    `).join('');
  },

  renderOverviewRecentPrompts(reviews) {
    const el = document.getElementById('ovRecentPrompts');
    const prompts = [];
    reviews.forEach(r => {
      if (r.prompts && Array.isArray(r.prompts)) {
        r.prompts.slice(0, 2).forEach(p => {
          prompts.push({ title: typeof p === 'string' ? p.substring(0, 30) : (p.title || p.name || '未命名Prompt'), date: r.date, source: r.title || r.projectName });
        });
      }
    });
    if (prompts.length === 0) {
      el.innerHTML = '<div class="empty-state">暂无提取的Prompt</div>';
      return;
    }
    el.innerHTML = prompts.slice(0, 5).map(p => `
      <div class="ov-list-item ov-item-prompt">
        <div class="ov-item-text">${p.title}</div>
        <div class="ov-item-meta">${p.date} · ${p.source}</div>
      </div>
    `).join('');
  },

  renderOverviewPendingActions(items) {
    const el = document.getElementById('ovPendingActionsList');
    if (!items || items.length === 0) {
      el.innerHTML = '<div class="empty-state">暂无待处理行动</div>';
      return;
    }
    const a = items[0];
    const text = a.text || a.title || a.action || a.content || '未命名行动';
    el.innerHTML = `
      <div class="ov-list-item ov-item-action" style="cursor:pointer;">
        <div class="ov-item-text">${text.substring(0, 80)}${text.length > 80 ? '...' : ''}</div>
        <div class="ov-item-meta">${a.priority ? '优先级: ' + a.priority : ''} ${a.source ? '· 来源: ' + a.source : ''}</div>
      </div>
    `;
    el.querySelector('.ov-list-item')?.addEventListener('click', () => this.renderActions());
  },

  // ========== 复盘视图 ==========
  async renderReviews() {
    this.currentView = 'reviews';
    if (this._progressTimer) { clearInterval(this._progressTimer); this._progressTimer = null; }
    this.stopAutoRefresh();
    // 重置滚动位置（从详情页返回时避免停留在底部）
    window.scrollTo(0, 0);
    const contentEl = document.getElementById("contentInner");
    if (contentEl) contentEl.scrollTop = 0;

    const rangeOptions = [];
    try {
      // 拉取真实复盘数据 + 统计（用于项目筛选）
      const params = new URLSearchParams({
        page: this.page,
        pageSize: this.pageSize,
        sortBy: this.sortBy,
        sortOrder: this.sortOrder
      });
      if (this.reviewFilter.project) params.set('project', this.reviewFilter.project);
      if (this.reviewFilter.score) params.set('score', this.reviewFilter.score);

      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/reviews/ability/obsidian/reviews?${params.toString()}`).then(r => r.json()).catch(() => null),
        fetch('/api/reviews/ability/obsidian/stats').then(r => r.json()).catch(() => null),
      ]);

      const reviews = listRes && listRes.success ? (listRes.reviews || []) : [];
      const total = listRes ? (listRes.total || 0) : 0;
      const stats = statsRes && statsRes.success ? statsRes.stats : null;
      const projects = stats && stats.bySource ? Object.keys(stats.bySource).filter(p => p && p !== 'unknown') : [];

      const scoreClass = (s) => s >= 4 ? 'high' : s >= 3 ? 'medium' : 'low';
      const listHtml = reviews.length
        ? reviews.map((r, i) => {
            const score = r.average_score || 0;
            const project = (r.tags && r.tags.length > 1) ? r.tags[1] : (r.source || '复盘');
            const summary = `完成状态 ${r.completion_status || '未知'} · ${r.total_problems || 0} 问题 · ${r.total_good_practices || 0} 好做法`;
            const cls = scoreClass(score);
            return `
              <div class="siyi-review-list-item ${cls}" data-index="${i}" data-path="${r.path || ''}">
                <div class="siyi-accent-bar"></div>
                <div class="siyi-review-item-body">
                  <div class="siyi-review-item-main">
                    <div class="siyi-score-circle ${cls}">${score}</div>
                    <div class="siyi-review-item-content">
                      <div class="siyi-review-item-title-row">
                        <h4 class="siyi-review-item-title">${r.title || '未命名复盘'}</h4>
                        <span class="siyi-project-chip">${project}</span>
                      </div>
                      <p class="siyi-review-item-summary">${summary}</p>
                    </div>
                  </div>
                  <div class="siyi-review-item-meta">
                    <span class="siyi-review-item-date">${r.date || ''}</span>
                    <div class="siyi-review-item-stats">
                      <span class="siyi-mini-stat">
                        <span class="siyi-mini-stat-icon problem">⚠</span>
                        <span class="siyi-mini-stat-value">${r.total_problems || 0}</span>
                        <span class="siyi-mini-stat-label">问题</span>
                      </span>
                      <span class="siyi-mini-stat">
                        <span class="siyi-mini-stat-icon action">→</span>
                        <span class="siyi-mini-stat-value">${r.total_good_practices || 0}</span>
                        <span class="siyi-mini-stat-label">好做法</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            `;
          }).join('')
        : `<div class="siyi-empty-state">暂无复盘记录</div>`;

      // 分页
      const totalPages = Math.max(1, Math.ceil(total / this.pageSize));
      const pageNum = Math.min(this.page, totalPages);
      const pageBtns = [];
      const startP = Math.max(1, pageNum - 2);
      const endP = Math.min(totalPages, startP + 4);
      for (let p = startP; p <= endP; p++) {
        pageBtns.push(`<button class="siyi-page-btn ${p === pageNum ? 'active' : ''}" data-page="${p}">${p}</button>`);
      }

      // —— 筛选下拉组件数据（统一设计系统 UI，替代原生 select）——
      const projOptions = [{ value: '', label: '全部项目' }].concat(projects.map(p => ({ value: p, label: p })));
      const scoreOptions = [
        { value: '', label: '全部评分' },
        { value: 'high', label: '高质量 (≥4)' },
        { value: 'medium', label: '中等 (3-4)' },
        { value: 'low', label: '待改进 (<3)' },
      ];
      const sortOptions = [
        { value: 'date', label: '按日期' },
        { value: 'score', label: '按评分' },
        { value: 'problems', label: '按问题数' },
      ];
      const currentProj = this.reviewFilter.project || '';
      const currentScore = this.reviewFilter.score || '';
      const projLabel = (projOptions.find(o => o.value === currentProj) || projOptions[0]).label;
      const scoreLabel = (scoreOptions.find(o => o.value === currentScore) || scoreOptions[0]).label;
      const sortLabel = (sortOptions.find(o => o.value === this.sortBy) || sortOptions[0]).label;
      const filterHtml = (kind, label, options, activeValue) => `
        <div class="siyi-filter" data-kind="${kind}">
          <button class="siyi-filter-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
            <span class="siyi-filter-value">${label}</span>
            <svg class="siyi-filter-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="siyi-filter-menu">
            ${options.map(o => {
              const active = o.value === activeValue;
              return `<div class="siyi-filter-option ${active ? 'active' : ''}" data-value="${o.value}" data-label="${o.label}">
                <svg class="siyi-filter-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" ${active ? '' : 'style="opacity:0"'}><polyline points="20 6 9 17 4 12"/></svg>
                <span>${o.label}</span>
              </div>`;
            }).join('')}
          </div>
        </div>`;

      this.container.innerHTML = `
        <div class="siyi-reviews-container">
          <div class="siyi-page-header">
            <div class="siyi-header-text">
              <h1 class="siyi-page-title">复盘列表</h1>
              <p class="siyi-page-subtitle">浏览所有 AI 复盘记录</p>
            </div>
            <div class="siyi-header-actions">
              <button class="siyi-ghost-btn" id="reviewRefreshBtn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
                刷新
              </button>
            </div>
          </div>

          ${this.renderNav('reviews')}

          <!-- 工具栏 -->
          <div class="siyi-toolbar">
            <div class="siyi-toolbar-left">
              <div class="siyi-search-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="siyi-search-icon"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input type="text" class="siyi-search-input" id="reviewSearchInput" placeholder="搜索复盘标题、项目...">
              </div>
            </div>
            <div class="siyi-toolbar-right">
              ${filterHtml('project', projLabel, projOptions, currentProj)}
              ${filterHtml('score', scoreLabel, scoreOptions, currentScore)}
              ${filterHtml('sort', sortLabel, sortOptions, this.sortBy)}
            </div>
          </div>

          <!-- 复盘列表 -->
          <div class="siyi-review-list" id="siyiReviewList">
            ${listHtml}
          </div>

          <!-- 分页 -->
          <div class="siyi-pagination">
            <button class="siyi-page-btn prev" data-page="${pageNum - 1}" ${pageNum <= 1 ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            ${pageBtns.join('')}
            <button class="siyi-page-btn next" data-page="${pageNum + 1}" ${pageNum >= totalPages ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      `;
      this.bindReviewsEvents();
    } catch (err) {
      console.error('[Reviews] 加载失败:', err);
      this.container.innerHTML = `
        <div class="siyi-reviews-container">
          <div class="siyi-page-header">
            <div class="siyi-header-text">
              <h1 class="siyi-page-title">复盘列表</h1>
              <p class="siyi-page-subtitle">浏览所有 AI 复盘记录</p>
            </div>
          </div>
          ${this.renderNav('reviews')}
          <div class="siyi-insights-empty" style="padding:60px 20px;text-align:center;color:var(--color-text-secondary);">加载复盘列表失败，请稍后重试</div>
        </div>
      `;
    }
  },

  bindReviewsEvents() {
    this.bindPrimaryNav();
    document.getElementById('reviewRefreshBtn')?.addEventListener('click', () => this.renderReviews());
    // 筛选下拉（自定义 UI）
    this.bindFilterDropdowns();
    document.getElementById('reviewSearchInput')?.addEventListener('input', () => {
      clearTimeout(this._reviewSearchTimer);
      this._reviewSearchTimer = setTimeout(() => this.filterReviewsBySearch(), 300);
    });
    // 分页
    document.querySelectorAll('.siyi-page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.dataset.page, 10);
        if (!page || page === this.page || btn.disabled) return;
        this.page = page;
        this.renderReviews();
      });
    });
    // 复盘列表项点击跳转详情
    document.querySelectorAll('.siyi-review-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const path = item.dataset.path;
        if (path && !path.startsWith('mock-')) {
          this.renderDetail(path);
        }
      });
    });
  },

  // 筛选下拉交互（项目 / 评分 / 排序）
  bindFilterDropdowns() {
    document.querySelectorAll('.siyi-filter').forEach(wd => {
      const trigger = wd.querySelector('.siyi-filter-trigger');
      const menu = wd.querySelector('.siyi-filter-menu');
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wd.classList.contains('open');
        this.closeAllFilterMenus();
        if (!isOpen) wd.classList.add('open');
      });
      menu.querySelectorAll('.siyi-filter-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const kind = wd.dataset.kind;
          const val = opt.dataset.value;
          if (kind === 'project') this.reviewFilter.project = val || null;
          else if (kind === 'score') this.reviewFilter.score = val || null;
          else if (kind === 'sort') this.sortBy = val;
          this.renderReviews();
        });
      });
    });
    // 点击下拉外部时统一关闭（仅全局绑定一次）
    if (!this._filterDocBound) {
      this._filterDocBound = true;
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.siyi-filter')) this.closeAllFilterMenus();
      });
    }
  },

  closeAllFilterMenus() {
    document.querySelectorAll('.siyi-filter.open').forEach(m => m.classList.remove('open'));
  },

  filterReviewsBySearch() {
    const keyword = document.getElementById('reviewSearchInput')?.value.trim().toLowerCase();
    const list = document.getElementById('siyiReviewList');
    if (!list) return;
    const items = list.querySelectorAll('.siyi-review-list-item');
    items.forEach(item => {
      const title = item.querySelector('.siyi-review-item-title')?.textContent.toLowerCase() || '';
      const project = item.querySelector('.siyi-project-chip')?.textContent.toLowerCase() || '';
      const match = !keyword || title.includes(keyword) || project.includes(keyword);
      item.style.display = match ? '' : 'none';
    });
  },

  async loadProjectFilter() {
    try {
      const res = await fetch('/api/reviews/ability/obsidian/reviews?page=1&pageSize=1000').then(r => r.json());
      if (res.success && res.reviews) {
        const projects = [...new Set(res.reviews.map(r => r.projectName || r.project).filter(Boolean))];
        const select = document.getElementById('projectFilter');
        if (select && projects.length > 0) {
          projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            select.appendChild(opt);
          });
        }
      }
    } catch (err) {
      console.error('[Reviews] 加载项目筛选失败:', err.message);
    }
  },

  bindListEvents() {
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
      this.loadStats();
      this.loadReviews();
    });

    // 视图切换 - Analysis Navigation
    document.querySelectorAll('.nav-item').forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.dataset.view;
        // 更新 active 状态
        document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        switch (view) {
          case 'list': this.renderReviews(); break;
          case 'quality': this.renderQualityOverview(); break;
          case 'radar': this.renderAbilityRadar(); break;
          case 'monthly': this.renderMonthlyReport(); break;
          case 'todos': this.renderTodayTodos(); break;
          case 'projects': this.renderProjects(); break;
          case 'learnings': this.renderLearnings(); break;
          case 'patterns': this.renderPatternAnalysis(); break;
          case 'actions': this.renderActionItems(); break;
          case 'summary': this.renderSummary(); break;
        }
      });
    });

    document.getElementById('sortBySelect')?.addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.loadReviews();
    });
    document.getElementById('sortOrderSelect')?.addEventListener('change', (e) => {
      this.sortOrder = e.target.value;
      this.loadReviews();
    });

    // 更多分析下拉
    const moreBtn = document.getElementById('moreAnalysisBtn');
    const morePanel = document.getElementById('moreAnalysisPanel');
    if (moreBtn && morePanel) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = morePanel.style.display === 'none';
        morePanel.style.display = isHidden ? 'block' : 'none';
        moreBtn.classList.toggle('active', isHidden);
      });
      document.addEventListener('click', (e) => {
        if (!morePanel.contains(e.target) && !moreBtn.contains(e.target)) {
          morePanel.style.display = 'none';
          moreBtn.classList.remove('active');
        }
      });
    }

    // 分析项点击
    document.querySelectorAll('.analysis-item').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        document.querySelectorAll('.analysis-item').forEach(t => t.classList.remove('active'));
        item.classList.add('active');
        if (morePanel) morePanel.style.display = 'none';
        if (moreBtn) moreBtn.classList.remove('active');
        switch (view) {
          case 'list': this.renderReviews(); break;
          case 'quality': this.renderQualityOverview(); break;
          case 'radar': this.renderAbilityRadar(); break;
          case 'monthly': this.renderMonthlyReport(); break;
          case 'todos': this.renderTodayTodos(); break;
          case 'projects': this.renderProjects(); break;
          case 'learnings': this.renderLearnings(); break;
          case 'patterns': this.renderPatternAnalysis(); break;
          case 'actions': this.renderActionItems(); break;
          case 'summary': this.renderSummary(); break;
        }
      });
    });
  },

  async loadStats() {
    try {
      const data = await API.request('GET', '/reviews/ability/obsidian/stats');
      this.stats = data.stats;
      const s = this.stats || {};
      // Overview 核心指标
      const ovTotal = document.getElementById('ovTotal');
      const ovScore = document.getElementById('ovScore');
      const ovProblems = document.getElementById('ovProblems');
      const ovGood = document.getElementById('ovGood');
      const ovPrompts = document.getElementById('ovPrompts');
      const ovCompletion = document.getElementById('ovCompletion');
      if (ovTotal) ovTotal.textContent = s.total || 0;
      if (ovScore) ovScore.textContent = s.avgScore || 0;
      if (ovProblems) ovProblems.textContent = s.totalProblems || 0;
      if (ovGood) ovGood.textContent = s.totalGoodPractices || 0;
      if (ovPrompts) ovPrompts.textContent = s.totalPrompts || 0;
      if (ovCompletion) ovCompletion.textContent = (s.completionRate || 0) + '%';

      // 侧栏复盘概览
      const sideCompletion = document.getElementById('sideCompletion');
      const sideProgressBar = document.getElementById('sideProgressBar');
      const sideProblems = document.getElementById('sideProblems');
      const sideGood = document.getElementById('sideGood');
      const sidePrompts = document.getElementById('sidePrompts');
      if (sideCompletion) sideCompletion.textContent = (s.completionRate || 0) + '%';
      if (sideProgressBar) sideProgressBar.style.width = (s.completionRate || 0) + '%';
      if (sideProblems) sideProblems.textContent = s.totalProblems || 0;
      if (sideGood) sideGood.textContent = s.totalGoodPractices || 0;
      if (sidePrompts) sidePrompts.textContent = s.totalPrompts || 0;
      this.renderSourceFilter();
      this.renderScoreDistribution();
    } catch (e) {
      console.error('加载统计失败:', e);
    }
  },

  renderSourceFilter() {
    const container = document.getElementById('sourceFilter');
    if (!container || !this.stats?.bySource) return;
    const sources = Object.keys(this.stats.bySource);
    if (sources.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = `<span class="filter-label">来源：</span>` +
      sources.map(src => `<span class="source-tag">${UI.escapeHtml(src)} (${this.stats.bySource[src]})</span>`).join('');
  },

  renderScoreDistribution() {
    // 评分分布可以放在统计区域下方，这里先不做复杂图表
  },

  async loadReviews() {
    try {
      const params = new URLSearchParams({
        page: this.page,
        pageSize: this.pageSize,
        sortBy: this.sortBy,
        sortOrder: this.sortOrder
      });
      if (this.reviewFilter.project) params.set('project', this.reviewFilter.project);
      if (this.reviewFilter.score) params.set('score', this.reviewFilter.score);
      const data = await API.request('GET',
        `/reviews/ability/obsidian/reviews?${params.toString()}`);
      this.reviews = data.reviews || [];
      this.total = data.total || 0;
      this.renderReviewList();
      this.renderPagination();
    } catch (e) {
      document.getElementById('obsReviewList').innerHTML =
        `<div class="empty-state"><div class="empty-state-icon">❌</div><div>加载失败: ${UI.escapeHtml(e.message)}</div></div>`;
    }
  },

  renderReviewList() {
    const list = document.getElementById('obsReviewList');
    if (!this.reviews || this.reviews.length === 0) {
      list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">还没有复盘文档<br><small>在豆包/Codex中说"复盘"生成第一个复盘文件</small></div>
      </div>`;
      return;
    }

    // 按月份分组
    const groups = {};
    this.reviews.forEach(r => {
      const dateStr = r.date || '';
      let monthKey = '未知日期';
      if (dateStr && dateStr.length >= 7) {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(5, 7);
        monthKey = `${year}年${month}月`;
      }
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(r);
    });

    // 按月份倒序排列
    const sortedMonths = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    list.innerHTML = `
      <div class="review-grouped">
        ${sortedMonths.map(month => `
          <div class="review-month-group">
            <div class="review-month-header">
              <span class="review-month-title">${month}</span>
              <span class="review-month-count">${groups[month].length} 篇</span>
            </div>
            <div class="review-month-items">
              ${groups[month].map(r => {
                const source = r.source || 'doubao';
                const sourceClass = source === 'codex' ? 'source-codex' : 'source-doubao';
                const score = r.average_score || 0;
                const scoreClass = score >= 4 ? 'score-high' : score >= 3 ? 'score-medium' : 'score-low';
                return `
                  <div class="obs-review-card ${sourceClass}" data-path="${UI.escapeHtml(r.path)}">
                    <div class="review-accent-bar"></div>
                    <div class="review-card-body">
                      <div class="review-card-header">
                        <span class="review-card-title">${UI.escapeHtml(r.title || '未命名')}</span>
                        <span class="review-score-tag ${scoreClass}">⭐ ${score}</span>
                      </div>
                      <div class="review-card-meta-row">
                        <span class="review-meta-item">📅 ${UI.escapeHtml(r.date || '')}</span>
                        <span class="review-meta-item meta-problems">⚠ ${r.total_problems || 0}</span>
                        <span class="review-meta-item meta-good">✓ ${r.total_good_practices || 0}</span>
                        <span class="review-meta-item meta-prompt">✦ ${r.total_prompts || 0}</span>
                      </div>
                      <div class="review-card-footer">
                        <div class="review-tags-row">
                          ${source ? `<span class="tag-source tag-${sourceClass}">${UI.escapeHtml(source)}</span>` : ''}
                          ${r.completion_status ? `<span class="tag-status tag-${r.completion_status === '完成' ? 'done' : r.completion_status === '部分完成' ? 'partial' : 'pending'}">${UI.escapeHtml(r.completion_status)}</span>` : ''}
                          ${(r.tags || []).slice(0, 2).map(t => `<span class="tag-topic">${UI.escapeHtml(t)}</span>`).join('')}
                        </div>
                        <span class="review-card-arrow">›</span>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // 绑定点击事件
    list.querySelectorAll('.obs-review-card').forEach(card => {
      card.addEventListener('click', () => {
        const path = card.getAttribute('data-path');
        this.renderDetail(path);
      });
    });
  },


  renderPagination() {
    const container = document.getElementById('obsPagination');
    if (!container) return;
    const totalPages = Math.ceil(this.total / this.pageSize);
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    let html = `<div class="pagination-info">共 ${this.total} 条，第 ${this.page}/${totalPages} 页</div>`;
    html += `<div class="pagination-buttons">`;
    if (this.page > 1) html += `<button class="btn btn-sm" data-page="${this.page - 1}">上一页</button>`;
    if (this.page < totalPages) html += `<button class="btn btn-sm" data-page="${this.page + 1}">下一页</button>`;
    html += `</div>`;
    container.innerHTML = html;
    container.querySelectorAll('button[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.page = parseInt(btn.getAttribute('data-page'));
        this.loadReviews();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  },

  // ========== 详情视图（Notion风格） ==========
  async renderDetail(path) {
    this.currentView = 'detail';
    this.currentPath = path;
    this.stopAutoRefresh();
    this.container.innerHTML = `
      <div class="obs-container notion-detail">
        <div class="notion-topbar">
          <button class="notion-back-btn" id="backBtn">
            <span>←</span> 返回
          </button>
          <div class="notion-topbar-actions">
            <button class="notion-action-btn" id="openInObsidianBtn" style="display:none;" title="在Obsidian中打开">
              <span>↗</span>
            </button>
          </div>
        </div>
        <div class="notion-page">
          <h1 class="notion-title" id="detailTitle">加载中...</h1>
          <div class="notion-properties" id="detailProperties"></div>
          <div class="notion-divider"></div>
          <div class="notion-content" id="detailContent">
            <div class="empty-state"><div class="loading-spinner" style="margin:0 auto;"></div></div>
          </div>
        </div>
      </div>
    `;
    document.getElementById('backBtn')?.addEventListener('click', () => this.renderReviews());

    try {
      const data = await API.request('GET', `/reviews/ability/obsidian/reviews/${encodeURIComponent(path)}`);
      this.currentReview = data;
      document.getElementById('detailTitle').textContent = data.title || '复盘详情';

      // 显示"在Obsidian中打开"按钮
      const openBtn = document.getElementById('openInObsidianBtn');
      if (openBtn && data.fullPath) {
        openBtn.style.display = 'inline-flex';
        openBtn.addEventListener('click', () => {
          const vaultPath = 'G:\\obsidian\\person pjl\\';
          let relPath = data.fullPath;
          if (relPath.startsWith(vaultPath)) {
            relPath = relPath.substring(vaultPath.length);
          }
          relPath = relPath.replace(/\\/g, '/');
          const obsidianUrl = `obsidian://open?file=${encodeURIComponent(relPath)}`;
          window.open(obsidianUrl, '_blank');
        });
      }

      // 渲染 Markdown 内容
      const content = data.content || '';
      const html = this.renderMarkdown(content);

      // 格式化日期
      let dateStr = data.frontmatter?.date || '';
      if (dateStr instanceof Date) {
        dateStr = dateStr.toISOString().split('T')[0];
      } else if (typeof dateStr === 'string' && dateStr.includes('T')) {
        dateStr = dateStr.split('T')[0];
      }

      // Notion风格属性区
      const props = [];
      if (dateStr) props.push(`<span class="notion-prop"><span class="notion-prop-icon">📅</span><span class="notion-prop-value">${UI.escapeHtml(dateStr)}</span></span>`);
      if (data.frontmatter?.average_score) props.push(`<span class="notion-prop"><span class="notion-prop-icon">⭐</span><span class="notion-prop-value">${data.frontmatter.average_score}分</span></span>`);
      if (data.frontmatter?.total_problems) props.push(`<span class="notion-prop"><span class="notion-prop-icon">⚠️</span><span class="notion-prop-value">${data.frontmatter.total_problems}个问题</span></span>`);
      if (data.frontmatter?.source) props.push(`<span class="notion-prop"><span class="notion-prop-icon">🏷️</span><span class="notion-prop-value">${UI.escapeHtml(data.frontmatter.source)}</span></span>`);
      if (data.frontmatter?.tags) {
        const tags = Array.isArray(data.frontmatter.tags) ? data.frontmatter.tags : [data.frontmatter.tags];
        tags.forEach(tag => props.push(`<span class="notion-prop notion-tag">${UI.escapeHtml(tag)}</span>`));
      }
      document.getElementById('detailProperties').innerHTML = props.join('');

      document.getElementById('detailContent').innerHTML = `<div class="notion-body">${html}</div>`;

      this.bindSavePromptButtons();
    } catch (e) {
      document.getElementById('detailContent').innerHTML =
        `<div class="empty-state"><div class="empty-state-icon">❌</div><div>加载失败: ${UI.escapeHtml(e.message)}</div></div>`;
    }
  },

  renderMarkdown(text) {
    // Notion风格 Markdown 渲染（极简纯文字排版，无卡片边框，无emoji）
    if (!text) return '';
    let html = text;
    html = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // 代码块
    html = html.replace(/```([\s\S]*?)```/g, (m, code) => `<pre class="notion-code"><code>${code}</code></pre>`);
    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code class="notion-inline-code">$1</code>');

    // 按行处理
    const lines = html.split('\n');
    const result = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // 二级标题（板块）— Notion风格，无emoji
      const h2Match = line.match(/^## (.*)$/);
      if (h2Match) {
        const title = h2Match[1].replace(/^[📋📅📊⚠️✅💡🔍🎯📚]\s*/, '');
        result.push(`<h2 class="notion-h2">${title}</h2>`);
        continue;
      }

      // 三级标题（子板块）— Notion风格，无卡片
      const h3Match = line.match(/^### (.*)$/);
      if (h3Match) {
        const title = h3Match[1].replace(/^[⚠️✅💡📚]\s*/, '');
        // Prompt标题添加保存按钮
        if (title.includes('Prompt') || title.includes('prompt')) {
          const safeTitle = title.replace(/"/g, '&quot;');
          result.push(`<h3 class="notion-h3 notion-prompt-title">${title}<button class="notion-save-btn" data-prompt-title="${safeTitle}" title="保存到Prompt库">保存</button></h3>`);
        } else {
          result.push(`<h3 class="notion-h3">${title}</h3>`);
        }
        continue;
      }

      // 四级标题
      const h4Match = line.match(/^#### (.*)$/);
      if (h4Match) {
        result.push(`<h4 class="notion-h4">${h4Match[1]}</h4>`);
        continue;
      }

      // 五级标题
      const h5Match = line.match(/^##### (.*)$/);
      if (h5Match) {
        result.push(`<h5 class="notion-h5">${h5Match[1]}</h5>`);
        continue;
      }

      // 六级标题
      const h6Match = line.match(/^###### (.*)$/);
      if (h6Match) {
        result.push(`<h6 class="notion-h6">${h6Match[1]}</h6>`);
        continue;
      }

      // 一级标题
      const h1Match = line.match(/^# (.*)$/);
      if (h1Match) {
        result.push(`<h1 class="notion-h1">${h1Match[1]}</h1>`);
        continue;
      }

      result.push(line);
    }
    html = result.join('\n');

    // 粗体
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // 斜体
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // 表格
    html = this.renderTables(html);
    // 无序列表
    html = html.replace(/^- (.*$)/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul class="notion-list">${m}</ul>`);
    // 有序列表
    html = html.replace(/^\d+\. (.*$)/gm, '<li>$1</li>');
    // 引用
    html = html.replace(/^> (.*$)/gm, '<blockquote class="notion-quote">$1</blockquote>');
    // 链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="notion-link">$1</a>');
    // 分割线
    html = html.replace(/^---$/gm, '<hr class="notion-hr">');
    // 段落
    html = html.replace(/\n\n/g, '</p><p>');
    html = `<p>${html}</p>`;
    // 清理空段落
    html = html.replace(/<p><\/p>/g, '');
    // 修复块级元素被p标签包裹的问题
    html = html.replace(/<p>(<h[1-6])/g, '$1');
    html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<pre)/g, '$1');
    html = html.replace(/(<\/pre>)<\/p>/g, '$1');
    html = html.replace(/<p>(<blockquote)/g, '$1');
    html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
    html = html.replace(/<p>(<hr)/g, '$1');
    html = html.replace(/(<\/hr>)<\/p>/g, '$1');
    html = html.replace(/<p>(<table)/g, '$1');
    html = html.replace(/(<\/table>)<\/p>/g, '$1');

    return html;
  },

  renderTables(html) {
    // 简单的 Markdown 表格渲染
    const lines = html.split('\n');
    let result = [];
    let inTable = false;
    let tableRows = [];
    for (let line of lines) {
      if (/^\|.*\|$/.test(line.trim())) {
        if (!inTable) { inTable = true; tableRows = []; }
        tableRows.push(line.trim());
      } else {
        if (inTable) {
          result.push(this.buildTable(tableRows));
          inTable = false;
          tableRows = [];
        }
        result.push(line);
      }
    }
    if (inTable) result.push(this.buildTable(tableRows));
    return result.join('\n');
  },

  buildTable(rows) {
    if (rows.length < 2) return rows.join('\n');
    const headers = rows[0].split('|').filter(c => c.trim()).map(c => c.trim());
    const bodyRows = rows.slice(2).map(r => r.split('|').filter(c => c.trim()).map(c => c.trim()));
    let html = '<table><thead><tr>';
    headers.forEach(h => html += `<th>${h}</th>`);
    html += '</tr></thead><tbody>';
    bodyRows.forEach(row => {
      html += '<tr>';
      row.forEach(cell => html += `<td>${cell}</td>`);
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  },

  // ========== 汇总报告视图 ==========
  async renderSummary(autoGenerate = false) {
    this.currentView = 'summary';
    this.stopAutoRefresh();
    this.container.innerHTML = `
      <div class="obs-container">
        <div class="obs-detail-header">
          <button class="btn btn-secondary btn-sm" id="backBtn">← 返回列表</button>
        </div>
        <div class="obs-summary-controls">
          <label>周期：</label>
          <select id="periodSelect" class="form-input form-input-sm" style="display:none;">
            <option value="week">本周</option>
            <option value="month" selected>本月</option>
            <option value="quarter">本季度</option>
            <option value="year">本年</option>
          </select>
          <div class="siyi-filter" data-kind="period">
            <button class="siyi-filter-trigger" type="button"><span class="siyi-filter-value">本月</span><span class="siyi-filter-caret">▾</span></button>
            <div class="siyi-filter-menu">
              ${[['week','本周'],['month','本月'],['quarter','本季度'],['year','本年']].map(([v,l]) =>
                `<button class="siyi-filter-option" type="button" data-value="${v}"><span class="siyi-filter-check"></span>${l}</button>`).join('')}
            </div>
          </div>
          <span style="opacity:0.6;margin:0 4px 0 10px;">|</span>
          <label>自由选择：</label>
          <input type="date" id="reportStartDate" class="form-input form-input-sm">
          <span style="margin:0 4px;">~</span>
          <input type="date" id="reportEndDate" class="form-input form-input-sm">
          <button class="btn btn-primary btn-sm" id="generateSummaryBtn">✨ 生成报告</button>
        </div>
        <div class="report-list-container" id="reportListContainer">
          <div class="empty-state"><div class="loading-spinner" style="margin:0 auto;"></div></div>
        </div>
      </div>
    `;
    document.getElementById('backBtn')?.addEventListener('click', () => this.renderReviews());
    document.getElementById('generateSummaryBtn')?.addEventListener('click', () => this.generateSummary());
    // 切换周期类型时，自动将自由日期范围填充为该周期的日期（用户可再手动调整选择历史月份）
    const periodSelect = document.getElementById('periodSelect');
    periodSelect?.addEventListener('change', (e) => this.fillPeriodDates(e.target.value));
    this.fillPeriodDates(document.getElementById('periodSelect')?.value || 'month');
    this.initPeriodDropdown();
    this.loadReportList();
  },

  // 通用周期下拉（自定义 UI）：隐藏原生 select，用自定义下拉展示，值仍同步回 select
  initPeriodDropdown() {
    this._bindCustomSelect('period', 'periodSelect');
  },
  initReportPeriodDropdown() {
    this._bindCustomSelect('reportPeriod', 'reportPeriodSelect');
  },
  _bindCustomSelect(kind, selectId) {
    const realSelect = document.getElementById(selectId);
    const wrap = document.querySelector(`.siyi-filter[data-kind="${kind}"]`);
    if (!realSelect || !wrap) return;
    const trigger = wrap.querySelector('.siyi-filter-trigger');
    const menu = wrap.querySelector('.siyi-filter-menu');
    const valueEl = trigger.querySelector('.siyi-filter-value');
    const sync = () => {
      const label = realSelect.options[realSelect.selectedIndex]?.textContent || '';
      if (valueEl) valueEl.textContent = label;
      menu.querySelectorAll('.siyi-filter-option').forEach(o => {
        const active = o.dataset.value === realSelect.value;
        o.classList.toggle('active', active);
        const check = o.querySelector('.siyi-filter-check');
        if (check) check.textContent = active ? '✓' : '';
      });
    };
    if (!this._filterDocBound) {
      this._filterDocBound = true;
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.siyi-filter')) this.closeAllFilterMenus();
      });
    }
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = wrap.classList.contains('open');
      this.closeAllFilterMenus();
      if (!isOpen) wrap.classList.add('open');
    });
    menu.querySelectorAll('.siyi-filter-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        realSelect.value = opt.dataset.value;
        sync();
        wrap.classList.remove('open');
        realSelect.dispatchEvent(new Event('change'));
      });
    });
    sync();
  },

  // 根据周期类型填充起止日期（基于今天）
  fillPeriodDates(period) {
    const startInput = document.getElementById('reportStartDate');
    const endInput = document.getElementById('reportEndDate');
    if (!startInput || !endInput) return;
    const now = new Date();
    let start, end;
    switch (period) {
      case 'week': {
        const day = now.getDay() || 7;
        start = new Date(now); start.setDate(now.getDate() - day + 1);
        end = new Date(start); end.setDate(start.getDate() + 6);
        break;
      }
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'quarter': {
        const q = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), q * 3, 1);
        end = new Date(now.getFullYear(), q * 3 + 3, 0);
        break;
      }
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    startInput.value = fmt(start);
    endInput.value = fmt(end);
  },

  async loadReportList() {
    const container = document.getElementById('reportListContainer');
    if (!container) return;
    try {
      const res = await fetch('/api/reviews/ability/obsidian/report/list?limit=50');
      const data = await res.json();
      const reports = data.reports || [];
      if (reports.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">还没有生成报告，选择周期后点击"生成报告"</div></div>`;
        return;
      }
      const periodLabels = { week: '周报', month: '月报', quarter: '季报', year: '年报', custom: '自定义' };
      const periodColors = { week: '#06B6D4', month: '#8B5CF6', quarter: '#F59E0B', year: '#10B981', custom: '#7A5ECD' };
      container.innerHTML = `
        <div class="report-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;margin-top:16px;">
          ${reports.map(r => `
            <div class="report-card" data-id="${r.id}" style="background:var(--bg-surface);border:1px solid var(--border-default);border-radius:12px;padding:18px;cursor:pointer;transition:all 0.2s;position:relative;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:600;color:white;background:${periodColors[r.period] || '#7A5ECD'};">${periodLabels[r.period] || r.period}</span>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-size:12px;color:var(--text-muted);">${UI.formatDateTime(r.generated_at) || ''}</span>
                  <button class="report-delete-btn" data-id="${r.id}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;border-radius:4px;font-size:14px;" title="删除报告">🗑️</button>
                </div>
              </div>
              <h4 style="margin:0 0 8px;font-size:15px;color:var(--text-primary);">${UI.escapeHtml(r.title || `${r.start_date} 至 ${r.end_date}`)}</h4>
              <p style="margin:0 0 12px;font-size:13px;color:var(--text-muted);line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${UI.escapeHtml(r.summary || '')}</p>
              <div style="display:flex;gap:16px;font-size:12px;color:var(--text-muted);">
                <span>📝 ${r.review_count || 0} 篇复盘</span>
                <span>⭐ ${r.avg_score ? r.avg_score.toFixed(1) : '-'}</span>
                <span>⚠️ ${r.total_problems || 0} 问题</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      // 绑定卡片点击事件
      container.querySelectorAll('.report-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.classList.contains('report-delete-btn')) return;
          const id = card.dataset.id;
          this.renderReportDetail(parseInt(id));
        });
      });
      // 绑定删除按钮事件
      container.querySelectorAll('.report-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          if (!confirm('确定要删除这份报告吗？删除后无法恢复。')) return;
          try {
            const res = await fetch(`/api/reviews/ability/obsidian/report/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
              this.loadReportList();
            } else {
              alert('删除失败');
            }
          } catch (err) {
            alert('删除失败: ' + err.message);
          }
        });
      });
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><div>加载失败: ${UI.escapeHtml(e.message)}</div></div>`;
    }
  },

  async generateSummary() {
    const period = document.getElementById('periodSelect')?.value || 'month';
    const startDate = document.getElementById('reportStartDate')?.value || '';
    const endDate = document.getElementById('reportEndDate')?.value || '';
    const btn = document.getElementById('generateSummaryBtn');
    if (btn) { btn.disabled = true; btn.textContent = '生成中（约30-60秒）...'; }
    // 添加加载提示
    const container = document.getElementById('reportListContainer');
    if (container) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);"><div class="loading-spinner" style="margin:0 auto 16px;"></div><div>正在分析复盘数据并生成成长报告...</div><div style="font-size:12px;margin-top:8px;">首次生成可能需要 30-60 秒，请耐心等待</div></div>';
    }
    try {
      const res = await fetch('/api/reviews/ability/obsidian/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, startDate: startDate || undefined, endDate: endDate || undefined })
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || '生成失败');
        return;
      }
      // 生成成功后刷新列表
      this.loadReportList();
    } catch (e) {
      alert('生成失败: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✨ 生成报告'; }
    }
  },

  async renderReportDetail(id) {
    this.currentView = 'report-detail';
    this.container.innerHTML = `
      <div style="max-width:900px;margin:0 auto;padding:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <button class="btn btn-secondary btn-sm" id="reportBackBtn">← 返回列表</button>
          <button class="btn btn-secondary btn-sm" id="copyReportBtn">📋 复制报告</button>
        </div>
        <div id="reportDetailContent">
          <div class="empty-state"><div class="loading-spinner" style="margin:0 auto;"></div></div>
        </div>
      </div>
    `;
    document.getElementById('reportBackBtn')?.addEventListener('click', () => this.renderSummary());
    try {
      const res = await fetch(`/api/reviews/ability/obsidian/report/${id}`);
      const report = await res.json();
      if (!report || !report.id) {
        document.getElementById('reportDetailContent').innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><div>报告不存在</div></div>`;
        return;
      }
      const periodLabels = { week: '周报', month: '月报', quarter: '季报', year: '年报', custom: '自定义' };
      const html = this.renderSimpleMarkdown(report.content || '');
      document.getElementById('reportDetailContent').innerHTML = `
        <div style="background:var(--bg-surface);border:1px solid var(--border-default);border-radius:16px;padding:32px;margin-bottom:20px;">
          <div style="margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid var(--border-divider);">
            <h2 style="margin:0 0 12px;font-size:var(--fs-title);font-weight:700;color:var(--text-primary);line-height:1.3;">${UI.escapeHtml(report.title || `${report.start_date} 至 ${report.end_date} 成长报告`)}</h2>
            <div style="display:flex;gap:16px;font-size:var(--fs-caption);color:var(--text-muted);flex-wrap:wrap;line-height:1.5;">
              <span style="display:flex;align-items:center;gap:4px;">📅 ${report.start_date} 至 ${report.end_date}</span>
              <span style="display:flex;align-items:center;gap:4px;">📝 ${report.review_count || 0} 篇复盘</span>
              <span style="display:flex;align-items:center;gap:4px;">⭐ 平均 ${report.avg_score ? report.avg_score.toFixed(1) : '-'}</span>
              <span style="display:flex;align-items:center;gap:4px;">⚠️ ${report.total_problems || 0} 个问题</span>
              <span style="display:flex;align-items:center;gap:4px;">🕐 ${UI.formatDateTime(report.generated_at) || ''}</span>
            </div>
          </div>
          <div class="report-content" style="font-size:var(--fs-body);line-height:var(--leading-body);color:var(--text-primary);">${html}</div>
        </div>
      `;
      document.getElementById('copyReportBtn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(report.content || '').then(() => {
          const btn = document.getElementById('copyReportBtn');
          if (btn) { btn.textContent = '✅ 已复制'; setTimeout(() => btn.textContent = '📋 复制报告', 2000); }
        });
      });
    } catch (e) {
      document.getElementById('reportDetailContent').innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><div>加载失败: ${UI.escapeHtml(e.message)}</div></div>`;
    }
  },

  // 简单 Markdown 渲染（标题、列表、粗体、引用、段落）
  renderSimpleMarkdown(content) {
    if (!content) return '';
    let html = UI.escapeHtml(content);
    html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:15px;font-weight:600;margin:20px 0 10px;color:var(--text-primary);line-height:1.4;">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:var(--fs-heading);font-weight:600;margin:28px 0 14px;color:var(--text-primary);line-height:1.4;padding-bottom:8px;border-bottom:1px solid var(--border-divider);">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 style="font-size:var(--fs-title);font-weight:700;margin:28px 0 16px;color:var(--text-primary);line-height:1.3;">$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600;">$1</strong>');
    html = html.replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid var(--accent);padding:8px 16px;margin:16px 0;background:var(--accent-tint);border-radius:0 8px 8px 0;color:var(--text-secondary);">$1</blockquote>');
    html = html.replace(/^- (.+)$/gm, '<li style="margin:6px 0;line-height:1.65;">$1</li>');
    html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, match => `<ul style="margin:14px 0;padding-left:24px;">${match}</ul>`);
    html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin:6px 0;line-height:1.65;">$1</li>');
    html = html.replace(/\n\n/g, '</p><p style="margin:14px 0;line-height:1.65;">');
    html = `<p style="margin:14px 0;line-height:1.65;">${html}</p>`;
    html = html.replace(/<p[^>]*>\s*<\/p>/g, '');
    return html;
  },

  // ========== 行动视图 ==========
  async renderActions() {
    this.currentView = 'actions';
    if (this._progressTimer) { clearInterval(this._progressTimer); this._progressTimer = null; }
    this.stopAutoRefresh();

    // 重置滚动位置
    window.scrollTo(0, 0);
    const contentEl = document.getElementById("contentInner");
    if (contentEl) contentEl.scrollTop = 0;

    // 仅首次进入时重置视图模式与优先级筛选；随后的刷新/勾选保留当前状态
    if (this.actionViewMode !== 'kanban' && this.actionViewMode !== 'list') {
      this.actionViewMode = 'kanban'; // kanban | list
      this.actionPriorityFilter = null;
    }

    await this.fetchActionItems();
    this.renderActionsContent();
    this.bindPrimaryNav();
    this.bindActionsEvents();
  },

  // 拉取行动项数据（客户端按优先级筛选），更新 this.actionItems / this.actionStats
  async fetchActionItems() {
    const res = await fetch('/api/reviews/ability/obsidian/action-items').then(r => r.json()).catch(() => null);
    let items = (res && res.success) ? (res.items || []) : [];
    if (this.actionPriorityFilter) {
      const normPriFor = (p) => ({ P0: 'high', P1: 'medium', P2: 'low', high: 'high', medium: 'medium', low: 'low' }[p]);
      items = items.filter(a => normPriFor(a.priority) === this.actionPriorityFilter);
    }
    this.actionItems = items;
    this.actionStats = (res && res.success) ? res.stats : null;
  },

  // 原位刷新行动项内容：保持当前视图模式与滚动位置（避免闪屏与跳回看板）
  async refreshActionItems() {
    await this.fetchActionItems();
    this.renderActionsContent();
    this.bindPrimaryNav();
    this.bindActionsEvents();
  },

  renderActionsContent() {
    const actions = this.actionItems || [];
    const byStatus = (s) => actions.filter(a => a.status === s);
    const normPri = (p) => ({ P0: 'high', P1: 'medium', P2: 'low', high: 'high', medium: 'medium', low: 'low' }[p] || 'medium');
    const priorityLabels = { P0: '高', P1: '中', P2: '低', high: '高', medium: '中', low: '低' };
    const statusLabels = { pending: '待处理', done: '已完成', ignored: '已忽略' };
    const statusColors = { pending: 'pending', done: 'done', ignored: 'ignored' };
    const overdue = actions.filter(a => a.dueDate && new Date(a.dueDate) < new Date() && a.status !== 'done' && a.status !== 'ignored').length;

    const columns = [
      { key: 'pending', label: '待处理', count: byStatus('pending').length, items: byStatus('pending'), accent: 'pending' },
      { key: 'done', label: '已完成', count: byStatus('done').length, items: byStatus('done'), accent: 'done' },
      { key: 'ignored', label: '已忽略', count: byStatus('ignored').length, items: byStatus('ignored'), accent: 'ignored' },
    ];

    const renderKanbanCard = (item, colKey) => {
      const pClass = normPri(item.priority);
      const pLabel = priorityLabels[item.priority] || '中';
      const aTitle = item.action || item.title || item.text || item.content || '未命名行动';
      const aSource = item.sourceReview || item.source || '来自复盘';
      const aDue = item.dueDate || '未设定';
      const isDone = item.status === 'done' || item.status === 'ignored';
      return `
        <div class="siyi-kanban-card priority-${pClass} ${isDone ? 'is-done' : ''}" data-id="${item.id}" data-status="${item.status || colKey}">
          <div class="siyi-kanban-card-top">
            <span class="siyi-priority-tag ${pClass}">${pLabel}优先级</span>
            <button class="siyi-action-toggle" data-id="${item.id}" data-status="${item.status || colKey}" title="${isDone ? '标记为待处理' : '标记为已完成'}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${isDone ? '<polyline points="20 6 9 17 4 12"/>' : '<circle cx="12" cy="12" r="10"/>'}</svg>
            </button>
          </div>
          <h4 class="siyi-kanban-card-title">${aTitle}</h4>
          <div class="siyi-kanban-card-meta">
            <span class="siyi-kanban-source">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              ${aSource}
            </span>
          </div>
          <div class="siyi-kanban-card-footer">
            <span class="siyi-kanban-due">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              ${aDue}
            </span>
          </div>
        </div>
      `;
    };

    // 列表视图：所有状态行动项（保留原始 status）
    const allItems = actions;

    const renderListItem = (item) => {
      const pClass = normPri(item.priority);
      const pLabel = priorityLabels[item.priority] || '中';
      const sLabel = statusLabels[item.status] || item.status || '待处理';
      const sColor = statusColors[item.status] || '';
      const isDone = item.status === 'done' || item.status === 'ignored';
      const aTitle = item.action || item.title || item.text || item.content || '未命名行动';
      const aSource = item.sourceReview || item.source || '来自复盘';
      const aDue = item.dueDate || '未设定';
      return `
        <div class="siyi-action-list-item ${isDone ? 'done' : ''}" data-id="${item.id}" data-status="${item.status}">
          <div class="siyi-action-list-main">
            <div class="siyi-action-list-title-row">
              <h4 class="siyi-action-list-title">${aTitle}</h4>
              <span class="siyi-priority-tag sm ${pClass}">${pLabel}优先级</span>
            </div>
            <div class="siyi-action-list-meta">
              <span class="siyi-action-list-source">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                ${aSource}
              </span>
              <span class="siyi-action-list-status ${sColor}">${sLabel}</span>
              <span class="siyi-action-list-due">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                ${aDue}
              </span>
            </div>
          </div>
        </div>
      `;
    };

    this.container.innerHTML = `
      <div class="siyi-reviews-container">
        <div class="siyi-page-header">
          <div class="siyi-header-text">
            <h1 class="siyi-page-title">行动项</h1>
            <p class="siyi-page-subtitle">从复盘中提炼的下一步行动</p>
          </div>
          <div class="siyi-header-actions">
            <button class="siyi-ghost-btn" id="actRefreshBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
              刷新
            </button>
          </div>
        </div>

        ${this.renderNav('actions')}

        <!-- 统计概览：4 个数字 -->
        <div class="siyi-action-stats">
          <div class="siyi-action-stat">
            <div class="siyi-action-stat-value">${byStatus('pending').length}</div>
            <div class="siyi-action-stat-label">待处理</div>
          </div>
          <div class="siyi-action-stat">
            <div class="siyi-action-stat-value accent">${byStatus('done').length}</div>
            <div class="siyi-action-stat-label">已完成</div>
          </div>
          <div class="siyi-action-stat">
            <div class="siyi-action-stat-value success">${byStatus('ignored').length}</div>
            <div class="siyi-action-stat-label">已忽略</div>
          </div>
          <div class="siyi-action-stat">
            <div class="siyi-action-stat-value destructive">${overdue}</div>
            <div class="siyi-action-stat-label">逾期</div>
          </div>
        </div>

        <!-- 筛选工具栏 -->
        <div class="siyi-actions-toolbar">
          <div class="siyi-toolbar-left">
            <select id="actPriorityFilter" class="siyi-select sm">
              <option value="">全部优先级</option>
              <option value="high" ${this.actionPriorityFilter === 'high' ? 'selected' : ''}>高优先级</option>
              <option value="medium" ${this.actionPriorityFilter === 'medium' ? 'selected' : ''}>中优先级</option>
              <option value="low" ${this.actionPriorityFilter === 'low' ? 'selected' : ''}>低优先级</option>
            </select>
            <div class="siyi-search-box sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="siyi-search-icon"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input type="text" class="siyi-search-input" id="actionSearchInput" placeholder="搜索行动项...">
            </div>
          </div>
          <div class="siyi-toolbar-right">
            <div class="siyi-view-toggle">
              <button class="siyi-view-btn ${this.actionViewMode === 'kanban' ? 'active' : ''}" data-view-mode="kanban" title="看板视图">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="12" rx="1"/></svg>
              </button>
              <button class="siyi-view-btn ${this.actionViewMode === 'list' ? 'active' : ''}" data-view-mode="list" title="列表视图">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- 看板视图 -->
        <div class="siyi-kanban-board" id="kanbanView" style="display:${this.actionViewMode === 'kanban' ? '' : 'none'};">
          ${columns.map(col => `
            <div class="siyi-kanban-column ${col.accent}" data-col="${col.key}">
              <div class="siyi-kanban-column-header">
                <div class="siyi-kanban-column-title">
                  <span class="siyi-kanban-dot ${col.accent}"></span>
                  <span>${col.label}</span>
                  <span class="siyi-kanban-count">${col.count}</span>
                </div>
              </div>
              <div class="siyi-kanban-column-body">
                ${col.items.length === 0
                  ? '<div class="siyi-kanban-empty">暂无行动项</div>'
                  : col.items.map(item => renderKanbanCard(item, col.key)).join('')
                }
              </div>
            </div>
          `).join('')}
        </div>

        <!-- 列表视图 -->
        <div class="siyi-action-list" id="listView" style="display:${this.actionViewMode === 'list' ? '' : 'none'};">
          <div class="siyi-action-list-body" id="actionList">
            ${allItems.length === 0
              ? '<div class="siyi-empty-state"><div class="siyi-empty-text">暂无行动项</div></div>'
              : allItems.map(item => renderListItem(item)).join('')
            }
          </div>
        </div>
      </div>
    `;
  },

  bindActionsEvents() {
    document.getElementById('actRefreshBtn')?.addEventListener('click', () => this.refreshActionItems());
    // 优先级筛选
    document.getElementById('actPriorityFilter')?.addEventListener('change', (e) => {
      this.actionPriorityFilter = e.target.value || null;
      this.refreshActionItems();
    });
    // 视图切换
    document.querySelectorAll('.siyi-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.actionViewMode = btn.dataset.viewMode;
        document.querySelectorAll('.siyi-view-btn').forEach(b => b.classList.toggle('active', b.dataset.viewMode === this.actionViewMode));
        const kanbanView = document.getElementById('kanbanView');
        const listView = document.getElementById('listView');
        if (kanbanView) kanbanView.style.display = this.actionViewMode === 'kanban' ? '' : 'none';
        if (listView) listView.style.display = this.actionViewMode === 'list' ? '' : 'none';
      });
    });
    // 搜索
    document.getElementById('actionSearchInput')?.addEventListener('input', () => {
      clearTimeout(this._actionSearchTimer);
      this._actionSearchTimer = setTimeout(() => {
        const kw = document.getElementById('actionSearchInput').value.trim().toLowerCase();
        document.querySelectorAll('.siyi-kanban-card').forEach(card => {
          const title = card.querySelector('.siyi-kanban-card-title')?.textContent.toLowerCase() || '';
          card.style.display = !kw || title.includes(kw) ? '' : 'none';
        });
        document.querySelectorAll('.siyi-action-list-item').forEach(item => {
          const title = item.querySelector('.siyi-action-list-title')?.textContent.toLowerCase() || '';
          item.style.display = !kw || title.includes(kw) ? '' : 'none';
        });
      }, 200);
    });
    // 行动项状态切换（看板卡片左上角勾选 / 列表项点击）— 手术式原地更新，不重建整页，避免闪屏与视图跳转
    document.querySelectorAll('.siyi-action-toggle, .siyi-action-list-item').forEach(el => {
      el.addEventListener('click', async (e) => {
        if (e.target.closest('.siyi-view-btn')) return;
        const id = el.dataset.id;
        if (!id) return;
        const cur = el.dataset.status;
        const next = (cur === 'done' || cur === 'ignored') ? 'pending' : 'done';
        try {
          await fetch('/api/reviews/ability/obsidian/action-items/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: next })
          });
          this.applyActionStatus(id, next, el);
        } catch (err) {
          console.error('更新行动状态失败:', err);
        }
      });
    });
  },

  // 手术式更新单个行动项状态：仅移动卡片/刷新徽标与计数，不重建整个容器
  applyActionStatus(id, next, el) {
    const acts = this.actionItems || [];
    const item = acts.find(a => String(a.id) === String(id));
    if (item) {
      item.status = next;
      item.statusUpdatedAt = new Date().toISOString();
    }
    const byStatus = (st) => acts.filter(a => a.status === st).length;
    const overdue = acts.filter(a => a.dueDate && new Date(a.dueDate) < new Date() && a.status !== 'done' && a.status !== 'ignored').length;
    const svgPending = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>';
    const svgDone = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    const statusLabels = { pending: '待处理', done: '已完成', ignored: '已忽略' };
    const statusColors = { pending: 'pending', done: 'done', ignored: 'ignored' };
    const isDone = next === 'done' || next === 'ignored';

    if (this.actionViewMode === 'kanban') {
      const card = el.closest('.siyi-kanban-card');
      if (card) {
        card.classList.toggle('is-done', isDone);
        card.dataset.status = next;
        const toggleBtn = card.querySelector('.siyi-action-toggle');
        if (toggleBtn) {
          toggleBtn.dataset.status = next;
          toggleBtn.title = isDone ? '标记为待处理' : '标记为已完成';
          toggleBtn.innerHTML = isDone ? svgDone : svgPending;
        }
        const targetBody = document.querySelector(`.siyi-kanban-column[data-col="${next}"] .siyi-kanban-column-body`);
        if (targetBody) targetBody.appendChild(card);
      }
      document.querySelectorAll('.siyi-kanban-column').forEach(col => {
        const st = col.dataset.col;
        const countEl = col.querySelector('.siyi-kanban-count');
        if (countEl) countEl.textContent = byStatus(st);
      });
    } else if (this.actionViewMode === 'list') {
      if (el.classList.contains('siyi-action-list-item')) {
        el.classList.toggle('done', isDone);
        el.dataset.status = next;
        const badge = el.querySelector('.siyi-action-list-status');
        if (badge) {
          badge.textContent = statusLabels[next] || next;
          badge.className = 'siyi-action-list-status ' + (statusColors[next] || '');
        }
      }
    }

    // 更新顶部统计
    const statVals = document.querySelectorAll('.siyi-action-stats .siyi-action-stat-value');
    if (statVals.length >= 4) {
      statVals[0].textContent = byStatus('pending');
      statVals[1].textContent = byStatus('done');
      statVals[2].textContent = byStatus('ignored');
      statVals[3].textContent = overdue;
    }
  },


  // ========== 行动项追踪视图 ==========
  async renderActionItems() {
    this.currentView = 'action-items';
    this.stopAutoRefresh();
    this.container.innerHTML = `
      <div class="obs-container">
        <div class="obs-header">
          <div>
            <h2>✅ 行动项追踪</h2>
            <p>从所有复盘中提取的改进行动项，追踪执行状态</p>
          </div>
          <div class="obs-header-actions">
            <button class="btn btn-primary" id="createActionBtn">+ 新建行动项</button>
            <button class="btn btn-secondary" id="backToListBtn">← 返回列表</button>
            <button class="btn btn-secondary" id="refreshActionBtn">🔄 刷新</button>
          </div>
        </div>

        <!-- 新建行动项表单（默认隐藏） -->
        <div class="create-action-form hidden" id="createActionForm">
          <div class="form-group">
            <label>行动项内容 *</label>
            <input type="text" id="newActionText" class="form-input" placeholder="输入需要改进的行动项..." />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>优先级</label>
              <select id="newActionPriority" class="form-input">
                <option value="P0">P0 紧急</option>
                <option value="P1" selected>P1 重要</option>
                <option value="P2">P2 一般</option>
              </select>
            </div>
            <div class="form-group">
              <label>类型</label>
              <select id="newActionType" class="form-input">
                <option value="immediate">立即执行</option>
                <option value="short_term" selected>短期改进</option>
                <option value="long_term">长期优化</option>
                <option value="note">备注提醒</option>
              </select>
            </div>
            <div class="form-group">
              <label>截止日期</label>
              <input type="date" id="newActionDueDate" class="form-input" />
            </div>
          </div>
          <div class="form-group">
            <label>备注</label>
            <input type="text" id="newActionNote" class="form-input" placeholder="可选备注..." />
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" id="submitActionBtn">创建</button>
            <button class="btn btn-secondary" id="cancelActionBtn">取消</button>
          </div>
        </div>

        <div class="obs-stats" id="actionStats">
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">行动项总数</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">P0 紧急</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">P1 重要</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">P2 一般</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">已完成</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">完成率</div></div>
        </div>

        <div class="obs-filter-bar">
          <div class="obs-sort">
            <label>优先级：</label>
            <select id="priorityFilter" class="form-input form-input-sm">
              <option value="">全部</option>
              <option value="P0">P0 紧急</option>
              <option value="P1">P1 重要</option>
              <option value="P2">P2 一般</option>
            </select>
            <label style="margin-left:16px;">状态：</label>
            <select id="statusFilter" class="form-input form-input-sm">
              <option value="">全部</option>
              <option value="pending">待执行</option>
              <option value="done">已完成</option>
              <option value="ignored">已忽略</option>
            </select>
          </div>
        </div>

        <div class="action-item-list" id="actionItemList">
          <div class="empty-state"><div class="loading-spinner" style="margin:0 auto;"></div></div>
        </div>
      </div>
    `;
    this.bindActionItemsEvents();
    await this.loadActionItems();
  },

  bindActionItemsEvents() {
    document.getElementById('backToListBtn')?.addEventListener('click', () => this.renderReviews());
    document.getElementById('refreshActionBtn')?.addEventListener('click', () => this.loadActionItems());
    document.getElementById('priorityFilter')?.addEventListener('change', (e) => {
      this.actionFilter.priority = e.target.value || null;
      this.renderActionItemList();
    });
    document.getElementById('statusFilter')?.addEventListener('change', (e) => {
      this.actionFilter.status = e.target.value || null;
      this.renderActionItemList();
    });
    // 新建行动项
    document.getElementById('createActionBtn')?.addEventListener('click', () => {
      document.getElementById('createActionForm').classList.toggle('hidden');
    });
    document.getElementById('cancelActionBtn')?.addEventListener('click', () => {
      document.getElementById('createActionForm').classList.add('hidden');
      document.getElementById('newActionText').value = '';
      document.getElementById('newActionNote').value = '';
    });
    document.getElementById('submitActionBtn')?.addEventListener('click', () => this.createActionItem());
  },

  async createActionItem() {
    const action = document.getElementById('newActionText').value.trim();
    if (!action) {
      alert('请输入行动项内容');
      return;
    }
    const priority = document.getElementById('newActionPriority').value;
    const type = document.getElementById('newActionType').value;
    const dueDate = document.getElementById('newActionDueDate').value || null;
    const note = document.getElementById('newActionNote').value.trim();

    try {
      const res = await fetch('/api/reviews/ability/obsidian/action-items/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, priority, type, dueDate, note })
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('createActionForm').classList.add('hidden');
        document.getElementById('newActionText').value = '';
        document.getElementById('newActionNote').value = '';
        await this.loadActionItems();
      } else {
        alert('创建失败: ' + (data.error || '未知错误'));
      }
    } catch (err) {
      alert('创建失败: ' + err.message);
    }
  },

  async deleteActionItem(id) {
    if (!confirm('确定删除这个行动项吗？')) return;
    try {
      const res = await fetch(`/api/reviews/ability/obsidian/action-items/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await this.loadActionItems();
      } else {
        alert('删除失败: ' + (data.error || '未知错误'));
      }
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  },

  async loadActionItems() {
    try {
      const params = new URLSearchParams();
      if (this.actionFilter.priority) params.set('priority', this.actionFilter.priority);
      if (this.actionFilter.status) params.set('status', this.actionFilter.status);
      const res = await fetch(`/api/reviews/ability/obsidian/action-items?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        this.actionItems = data.items || [];
        this.actionStats = data.stats || null;
        this.renderActionStats();
        this.renderActionItemList();
      }
    } catch (e) {
      console.error('加载行动项失败:', e);
      document.getElementById('actionItemList').innerHTML = `<div class="empty-state">加载失败: ${UI.escapeHtml(e.message)}</div>`;
    }
  },

  renderActionStats() {
    const s = this.actionStats;
    if (!s) return;
    const statsEl = document.getElementById('actionStats');
    if (!statsEl) return;
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-value">${s.total || 0}</div><div class="stat-label">行动项总数</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#e74c3c;">${s.byPriority?.P0 || 0}</div><div class="stat-label">P0 紧急</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#f39c12;">${s.byPriority?.P1 || 0}</div><div class="stat-label">P1 重要</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#3498db;">${s.byPriority?.P2 || 0}</div><div class="stat-label">P2 一般</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#27ae60;">${s.byStatus?.done || 0}</div><div class="stat-label">已完成</div></div>
      <div class="stat-card"><div class="stat-value">${s.completionRate || 0}%</div><div class="stat-label">完成率</div></div>
    `;
  },

  renderActionItemList() {
    const listEl = document.getElementById('actionItemList');
    if (!listEl) return;

    let items = this.actionItems || [];
    // 前端筛选（因为API已经筛选过，但切换筛选时需要重新加载）
    if (this.actionFilter.priority) {
      items = items.filter(i => i.priority === this.actionFilter.priority);
    }
    if (this.actionFilter.status) {
      items = items.filter(i => i.status === this.actionFilter.status);
    }

    if (items.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div><div>暂无行动项</div><div style="font-size:13px;color:#888;margin-top:8px;">生成复盘后会自动提取改进行动项</div></div>`;
      return;
    }

    const typeLabels = { immediate: '立即行动', short_term: '短期提升', note: '注意事项' };
    const statusLabels = { pending: '待执行', done: '已完成', ignored: '已忽略' };
    const priorityColors = { P0: '#e74c3c', P1: '#f39c12', P2: '#3498db' };

    listEl.innerHTML = items.map(item => {
      const today = new Date().toISOString().split('T')[0];
      const isOverdue = item.dueDate && item.dueDate < today && item.status === 'pending';
      const isDueToday = item.dueDate && item.dueDate === today && item.status === 'pending';
      return `
      <div class="action-item-card ${isOverdue ? 'overdue' : ''} ${isDueToday ? 'due-today' : ''}" data-id="${UI.escapeHtml(item.id)}" data-status="${item.status}">
        <div class="ai-header">
          <span class="ai-priority" style="background:${priorityColors[item.priority] || '#999'};">${UI.escapeHtml(item.priority || 'P2')}</span>
          <span class="ai-type">${typeLabels[item.type] || item.type}</span>
          <span class="ai-status ai-status-${item.status}">${statusLabels[item.status] || item.status}</span>
          ${item.dueDate ? `<span class="ai-due-date ${isOverdue ? 'overdue' : isDueToday ? 'today' : ''}">📅 ${item.dueDate}${isOverdue ? ' (已过期)' : isDueToday ? ' (今日)' : ''}</span>` : ''}
        </div>
        <div class="ai-action">${UI.escapeHtml(item.action || '')}</div>
        ${item.expectedEffect ? `<div class="ai-effect">🎯 ${UI.escapeHtml(item.expectedEffect)}</div>` : ''}
        <div class="ai-meta">
          <span>📅 ${UI.escapeHtml(item.reviewDate || '')}</span>
          <span>📝 ${UI.escapeHtml(item.sourceReview || '')}</span>
          ${item.relatedProblem ? `<span>⚠️ ${UI.escapeHtml(item.relatedProblem)}</span>` : ''}
        </div>
        <div class="ai-actions">
          <button class="btn btn-sm btn-outline" onclick="ObsidianReviewsModule.setDueDate('${UI.escapeHtml(item.id)}')">📅 设置截止</button>
          ${item.status !== 'done' ? `<button class="btn btn-sm btn-success" onclick="ObsidianReviewsModule.markActionDone('${UI.escapeHtml(item.id)}')">✓ 标记完成</button>` : ''}
          ${item.status !== 'pending' ? `<button class="btn btn-sm btn-secondary" onclick="ObsidianReviewsModule.markActionPending('${UI.escapeHtml(item.id)}')">↺ 重置待办</button>` : ''}
          ${item.status !== 'ignored' ? `<button class="btn btn-sm btn-outline" onclick="ObsidianReviewsModule.markActionIgnored('${UI.escapeHtml(item.id)}')">忽略</button>` : ''}
          ${item.id.startsWith('custom_') ? `<button class="btn btn-sm btn-danger" onclick="ObsidianReviewsModule.deleteActionItem('${UI.escapeHtml(item.id)}')">🗑 删除</button>` : ''}
        </div>
      </div>
    `}).join('');
  },

  async updateActionStatus(id, status) {
    try {
      const res = await fetch('/api/reviews/ability/obsidian/action-items/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      });
      const data = await res.json();
      if (data.success) {
        // 更新本地状态
        const item = this.actionItems.find(i => i.id === id);
        if (item) {
          item.status = status;
          item.statusUpdatedAt = new Date().toISOString();
        }
        this.renderActionStats();
        this.renderActionItemList();
      }
    } catch (e) {
      console.error('更新行动项状态失败:', e);
      alert('更新失败: ' + e.message);
    }
  },

  markActionDone(id) { this.updateActionStatus(id, 'done'); },
  markActionPending(id) { this.updateActionStatus(id, 'pending'); },
  markActionIgnored(id) { this.updateActionStatus(id, 'ignored'); },

  // 设置行动项截止日期（Electron 下 window.prompt 不可用，改用应用内日期弹窗）
  setDueDate(id) {
    const item = this.actionItems.find(i => i.id === id);
    const currentDate = item?.dueDate || '';
    const modal = document.createElement('div');
    modal.className = 'siyi-modal-overlay';
    // 当前时间用于给日期选择器设置 min，避免选中过去日期
    modal.innerHTML = `
      <div class="siyi-modal" role="dialog" aria-modal="true" aria-label="设置截止日期">
        <div class="siyi-modal-header">
          <span class="siyi-modal-title">设置截止日期</span>
          <button class="siyi-modal-close" type="button" aria-label="关闭">&times;</button>
        </div>
        <div class="siyi-modal-body">
          <label class="siyi-modal-label">截止日期（留空则清除）</label>
          <input type="date" id="dueDateInput" class="siyi-input" value="${currentDate}">
          <p class="siyi-modal-hint">选择完成后点击"保存"，留空后点击"保存"将清除截止日期。</p>
        </div>
        <div class="siyi-modal-footer">
          <button class="siyi-btn siyi-btn-ghost" id="dueCancelBtn" type="button">取消</button>
          <button class="siyi-btn siyi-btn-primary" id="dueSaveBtn" type="button">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.siyi-modal-close').addEventListener('click', close);
    modal.querySelector('#dueCancelBtn').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.querySelector('#dueSaveBtn').addEventListener('click', async () => {
      const raw = modal.querySelector('#dueDateInput').value.trim();
      let dueDate = raw;
      if (!dueDate) dueDate = null; // 清除截止日期
      modal.remove();
      await this.saveDueDate(id, dueDate, item);
    });
  },

  async saveDueDate(id, dueDate, item) {
    try {
      const res = await fetch('/api/reviews/ability/obsidian/action-items/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: item?.status || 'pending', dueDate })
      });
      const data = await res.json();
      if (data.success) {
        if (item) item.dueDate = dueDate;
        this.renderActionItemList();
        // 如果当前在今日待办页面，也刷新
        if (this.currentView === 'today-todos') {
          this.renderTodayTodos();
        }
        alert(dueDate ? `截止日期已设置为 ${dueDate}` : '截止日期已清除');
      } else {
        alert('设置失败: ' + (data.error || '未知错误'));
      }
    } catch (e) {
      console.error('设置截止日期失败:', e);
      alert('设置失败: ' + e.message);
    }
  },

  // ========== 今日待办视图 ==========
  async renderTodayTodos() {
    this.currentView = 'today-todos';
    this.stopAutoRefresh();
    this.container.innerHTML = `
      <div class="obs-container">
        <div class="obs-header">
          <div>
            <h2>📋 今日待办</h2>
            <p>截止日期为今天或已过期的未完成行动项</p>
          </div>
          <div class="obs-header-actions">
            <button class="btn btn-secondary" id="backToListBtn5">← 返回列表</button>
            <button class="btn btn-secondary" id="refreshTodayBtn">🔄 刷新</button>
          </div>
        </div>

        <div class="obs-stats" id="todayStats">
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">今日待办</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#e74c3c;">-</div><div class="stat-label">已过期</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#f39c12;">-</div><div class="stat-label">今日到期</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#e74c3c;">-</div><div class="stat-label">P0 紧急</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#f39c12;">-</div><div class="stat-label">P1 重要</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#3498db;">-</div><div class="stat-label">P2 一般</div></div>
        </div>

        <div class="today-todo-list" id="todayTodoList">
          <div class="loading">加载中...</div>
        </div>
      </div>
    `;

    document.getElementById('backToListBtn5')?.addEventListener('click', () => this.renderReviews());
    document.getElementById('refreshTodayBtn')?.addEventListener('click', () => this.renderTodayTodos());

    try {
      const response = await fetch('/api/reviews/ability/obsidian/action-items/today');
      const data = await response.json();
      if (data.success) {
        this.renderTodayTodoList(data);
      } else {
        document.getElementById('todayTodoList').innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><div>加载失败: ${data.error}</div></div>`;
      }
    } catch (err) {
      document.getElementById('todayTodoList').innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><div>加载失败: ${err.message}</div></div>`;
    }
  },

  renderTodayTodoList(data) {
    const stats = data.stats || {};
    const statsEl = document.getElementById('todayStats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat-card"><div class="stat-value">${stats.total || 0}</div><div class="stat-label">今日待办</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#e74c3c;">${stats.overdue || 0}</div><div class="stat-label">已过期</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#f39c12;">${stats.dueToday || 0}</div><div class="stat-label">今日到期</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#e74c3c;">${stats.byPriority?.P0 || 0}</div><div class="stat-label">P0 紧急</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#f39c12;">${stats.byPriority?.P1 || 0}</div><div class="stat-label">P1 重要</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#3498db;">${stats.byPriority?.P2 || 0}</div><div class="stat-label">P2 一般</div></div>
      `;
    }

    const listEl = document.getElementById('todayTodoList');
    const items = data.items || [];

    if (items.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎉</div>
          <div>今日没有待办行动项</div>
          <div style="font-size:13px;color:#888;margin-top:8px;">可以在行动项页面设置截止日期</div>
        </div>
      `;
      return;
    }

    const today = data.today || new Date().toISOString().split('T')[0];
    const priorityColors = { P0: '#e74c3c', P1: '#f39c12', P2: '#3498db' };

    listEl.innerHTML = items.map(item => {
      const isOverdue = item.dueDate && item.dueDate < today;
      const isDueToday = item.dueDate && item.dueDate === today;
      return `
      <div class="today-todo-card ${isOverdue ? 'overdue' : isDueToday ? 'due-today' : ''}" data-id="${UI.escapeHtml(item.id)}">
        <div class="todo-header">
          <span class="todo-priority" style="background:${priorityColors[item.priority] || '#999'};">${UI.escapeHtml(item.priority || 'P2')}</span>
          <span class="todo-due ${isOverdue ? 'overdue' : isDueToday ? 'today' : ''}">
            ${isOverdue ? '⚠️ 已过期' : isDueToday ? '⏰ 今日到期' : '📅 ' + item.dueDate}
          </span>
        </div>
        <div class="todo-action">${UI.escapeHtml(item.action || '')}</div>
        ${item.expectedEffect ? `<div class="todo-effect">🎯 ${UI.escapeHtml(item.expectedEffect)}</div>` : ''}
        <div class="todo-meta">
          <span>📅 来源: ${UI.escapeHtml(item.reviewDate || '')}</span>
          <span>📝 ${UI.escapeHtml(item.sourceReview || '')}</span>
        </div>
        <div class="todo-actions">
          <button class="btn btn-sm btn-success" onclick="ObsidianReviewsModule.markTodayTodoDone('${UI.escapeHtml(item.id)}')">✓ 标记完成</button>
          <button class="btn btn-sm btn-outline" onclick="ObsidianReviewsModule.setDueDate('${UI.escapeHtml(item.id)}')">📅 修改截止</button>
        </div>
      </div>
    `}).join('');
  },

  // 标记今日待办完成（完成后刷新今日待办列表）
  async markTodayTodoDone(id) {
    await this.updateActionStatus(id, 'done');
    // 刷新今日待办列表
    if (this.currentView === 'today-todos') {
      this.renderTodayTodos();
    }
  },

  // ========== 成长报告视图 ==========
  async renderReport() {
    this.currentView = 'report';
    if (this._progressTimer) { clearInterval(this._progressTimer); this._progressTimer = null; }
    this.stopAutoRefresh();

    // 重置滚动位置
    window.scrollTo(0, 0);
    const contentEl = document.getElementById("contentInner");
    if (contentEl) contentEl.scrollTop = 0;

    this.renderReportContent();
    this.bindPrimaryNav();
    this.bindReportEvents();
    // 加载报告列表
    this.loadGrowthReportList().catch(() => {});
  },

  renderReportContent() {
    const periodOptions = [
      { key: 'week', label: '本周' },
      { key: 'month', label: '本月' },
      { key: 'quarter', label: '本季度' },
      { key: 'year', label: '本年' },
      { key: 'custom', label: '自定义' },
    ];

    this.container.innerHTML = `
      <div class="siyi-reviews-container">
        <div class="siyi-page-header">
          <div class="siyi-header-text">
            <h1 class="siyi-page-title">成长报告</h1>
            <p class="siyi-page-subtitle">AI 生成的结构化成长分析报告</p>
          </div>
          <div class="siyi-header-actions">
            <button class="siyi-ghost-btn" id="reportRefreshBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
              刷新
            </button>
            <button class="siyi-primary-btn" id="genReportBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
              生成新报告
            </button>
          </div>
        </div>

        ${this.renderNav('report')}

        <!-- 周期选择 -->
        <div class="siyi-report-toolbar-row">
          <div class="siyi-report-period">
            <span class="siyi-report-period-label">报告周期：</span>
            <select id="reportPeriodSelect" class="siyi-select" style="display:none;">
              ${periodOptions.map(opt => `
                <option value="${opt.key}" ${opt.key === 'month' ? 'selected' : ''}>${opt.label}</option>
              `).join('')}
            </select>
            <div class="siyi-filter" data-kind="reportPeriod">
              <button class="siyi-filter-trigger" type="button"><span class="siyi-filter-value">本月</span><span class="siyi-filter-caret">▾</span></button>
              <div class="siyi-filter-menu">
                ${periodOptions.map(opt => `
                  <button class="siyi-filter-option" type="button" data-value="${opt.key}"><span class="siyi-filter-check"></span>${opt.label}</button>
                `).join('')}
              </div>
            </div>
            <span class="siyi-report-custom-range" id="reportCustomRange" style="display:none;">
              <input type="date" id="reportCustomStart" class="siyi-select siyi-date-input">
              <span class="siyi-report-period-label" style="margin:0 2px;">~</span>
              <input type="date" id="reportCustomEnd" class="siyi-select siyi-date-input">
            </span>
          </div>
        </div>

        <!-- 报告列表 -->
        <div class="siyi-report-list" id="reportList">
          <div class="siyi-empty-state">
            <div class="siyi-empty-spinner"></div>
          </div>
        </div>
      </div>
    `;
  },

  bindReportEvents() {
    // 刷新按钮
    document.getElementById('reportRefreshBtn')?.addEventListener('click', () => {
      this.loadGrowthReportList().catch(() => {});
    });
    // 生成报告按钮
    document.getElementById('genReportBtn')?.addEventListener('click', () => {
      this.generateGrowthReport();
    });
    // 周期切换：自定义时显示日期范围选择
    const periodSelect = document.getElementById('reportPeriodSelect');
    const customRange = document.getElementById('reportCustomRange');
    if (periodSelect && customRange) {
      const sync = () => {
        const isCustom = periodSelect.value === 'custom';
        customRange.style.display = isCustom ? 'inline-flex' : 'none';
        if (isCustom) {
          const dates = this.getPeriodDates('month');
          const startInput = document.getElementById('reportCustomStart');
          const endInput = document.getElementById('reportCustomEnd');
          if (startInput && endInput && !startInput.value) startInput.value = dates.start;
          if (startInput && endInput && !endInput.value) endInput.value = dates.end;
        }
      };
      periodSelect.addEventListener('change', sync);
      sync();
    }
    this.initReportPeriodDropdown();
    // 报告列表项事件绑定（委托在列表容器上）
    const reportList = document.getElementById('reportList');
    if (reportList) {
      reportList.addEventListener('click', (e) => {
        const viewBtn = e.target.closest('.siyi-report-view-btn');
        const deleteBtn = e.target.closest('.siyi-report-delete-btn');
        const reportItem = e.target.closest('.siyi-report-item');
        if (viewBtn && reportItem) {
          const id = parseInt(reportItem.dataset.reportId);
          this.renderGrowthReportDetail(id);
        } else if (deleteBtn && reportItem) {
          const id = parseInt(reportItem.dataset.reportId);
          this.deleteGrowthReport(id);
        } else if (reportItem && !deleteBtn && !viewBtn) {
          const id = parseInt(reportItem.dataset.reportId);
          this.renderGrowthReportDetail(id);
        }
      });
    }
  },

  async loadGrowthReportList() {
    const container = document.getElementById('reportList');
    if (!container) return;
    try {
      const res = await fetch('/api/reviews/ability/obsidian/report/list?limit=50');
      const data = await res.json();
      const reports = data.reports || [];
      if (reports.length === 0) {
        container.innerHTML = `
          <div class="siyi-empty-state">
            <div class="siyi-empty-icon">📊</div>
            <div class="siyi-empty-text">还没有生成报告</div>
            <div class="siyi-empty-desc">选择周期后点击"生成新报告"创建你的第一份成长报告</div>
          </div>
        `;
        return;
      }
      const periodLabels = { week: '周报', month: '月报', quarter: '季报', year: '年报', custom: '自定义' };
      const periodColors = { week: 'info', month: 'primary', quarter: 'warning', year: 'success', custom: 'secondary' };
      container.innerHTML = reports.map(r => `
        <div class="siyi-report-item" data-report-id="${r.id}">
          <div class="siyi-report-item-main">
            <div class="siyi-report-item-header">
              <span class="siyi-report-badge ${periodColors[r.period] || 'primary'}">${periodLabels[r.period] || r.period}</span>
              <h4 class="siyi-report-title">${UI.escapeHtml(r.title || `${r.start_date} 至 ${r.end_date} 成长报告`)}</h4>
            </div>
            <p class="siyi-report-summary">${UI.escapeHtml(r.summary || '暂无摘要')}</p>
            <div class="siyi-report-meta">
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                ${r.start_date} ~ ${r.end_date}
              </span>
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                ${r.review_count || 0} 篇复盘
              </span>
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                ${r.avg_score ? r.avg_score.toFixed(1) : '-'} 分
              </span>
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                ${UI.formatDateTime(r.generated_at) || ''}
              </span>
            </div>
          </div>
          <div class="siyi-report-item-actions">
            <button class="siyi-report-view-btn" title="查看报告">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              查看
            </button>
            <button class="siyi-report-delete-btn" title="删除报告">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              删除
            </button>
          </div>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `
        <div class="siyi-empty-state">
          <div class="siyi-empty-icon">❌</div>
          <div class="siyi-empty-text">加载失败</div>
          <div class="siyi-empty-desc">${UI.escapeHtml(e.message)}</div>
        </div>
      `;
    }
  },

  async generateGrowthReport() {
    const btn = document.getElementById('genReportBtn');
    const setLoading = (loading) => {
      if (btn) { btn.disabled = loading; btn.style.opacity = loading ? '0.6' : '1'; }
    };
    setLoading(true);

    const container = document.getElementById('reportList');
    if (container) {
      container.innerHTML = `
        <div class="siyi-empty-state">
          <div class="siyi-empty-spinner"></div>
          <div class="siyi-empty-text">正在生成成长报告...</div>
          <div class="siyi-empty-desc">AI 正在分析你的复盘数据，首次生成约需 30-60 秒</div>
        </div>
      `;
    }

    try {
      let period = document.getElementById('reportPeriodSelect')?.value || 'month';
      let dates;
      if (period === 'custom') {
        const startInput = document.getElementById('reportCustomStart');
        const endInput = document.getElementById('reportCustomEnd');
        const start = startInput?.value || '';
        const end = endInput?.value || '';
        if (!start || !end) {
          alert('请选择自定义日期范围');
          this.loadGrowthReportList();
          return;
        }
        dates = { start, end };
      } else {
        dates = this.getPeriodDates(period);
      }
      const res = await fetch('/api/reviews/ability/obsidian/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, startDate: dates.start, endDate: dates.end })
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || '生成失败');
        this.loadGrowthReportList();
        return;
      }
      this.loadGrowthReportList();
    } catch (e) {
      alert('生成失败: ' + e.message);
      this.loadGrowthReportList();
    } finally {
      setLoading(false);
    }
  },

  async deleteGrowthReport(id) {
    if (!confirm('确定要删除这份报告吗？删除后无法恢复。')) return;
    try {
      const res = await fetch(`/api/reviews/ability/obsidian/report/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        this.loadGrowthReportList();
      } else {
        alert('删除失败');
      }
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  },

  async renderGrowthReportDetail(id) {
    this.currentView = 'report-detail';
    this.container.innerHTML = `
      <div class="siyi-reviews-container">
        <div class="siyi-page-header">
          <div class="siyi-header-text">
            <h1 class="siyi-page-title">报告详情</h1>
            <p class="siyi-page-subtitle">AI 生成的结构化成长分析报告</p>
          </div>
          <div class="siyi-header-actions">
            <button class="siyi-ghost-btn" id="reportBackBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              返回报告列表
            </button>
            <button class="siyi-ghost-btn" id="copyReportBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              复制报告
            </button>
          </div>
        </div>
        <div id="reportDetailContent" class="siyi-report-detail-content">
          <div class="siyi-empty-state">
            <div class="siyi-empty-spinner"></div>
          </div>
        </div>
      </div>
    `;
    document.getElementById('reportBackBtn')?.addEventListener('click', () => this.renderReport());
    try {
      const res = await fetch(`/api/reviews/ability/obsidian/report/${id}`);
      const report = await res.json();
      if (!report || !report.id) {
        document.getElementById('reportDetailContent').innerHTML = `
          <div class="siyi-empty-state">
            <div class="siyi-empty-icon">❌</div>
            <div class="siyi-empty-text">报告不存在</div>
          </div>
        `;
        return;
      }
      const periodLabels = { week: '周报', month: '月报', quarter: '季报', year: '年报', custom: '自定义' };
      const html = this.renderSimpleMarkdown(report.content || '');
      document.getElementById('reportDetailContent').innerHTML = `
        <div class="siyi-report-detail-card">
          <div class="siyi-report-detail-header">
            <span class="siyi-report-badge ${report.period || 'primary'}">${periodLabels[report.period] || report.period || '报告'}</span>
            <h2 class="siyi-report-detail-title">${UI.escapeHtml(report.title || `${report.start_date} 至 ${report.end_date} 成长报告`)}</h2>
            <div class="siyi-report-detail-meta">
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                ${report.start_date} ~ ${report.end_date}
              </span>
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                ${report.review_count || 0} 篇复盘
              </span>
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                平均 ${report.avg_score ? report.avg_score.toFixed(1) : '-'} 分
              </span>
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                ${report.total_problems || 0} 个问题
              </span>
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                ${UI.formatDateTime(report.generated_at) || ''}
              </span>
            </div>
          </div>
          <div class="siyi-report-detail-body">${html}</div>
        </div>
      `;
      document.getElementById('copyReportBtn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(report.content || '').then(() => {
          const btn = document.getElementById('copyReportBtn');
          if (btn) {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 已复制';
            setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
          }
        });
      });
    } catch (e) {
      document.getElementById('reportDetailContent').innerHTML = `
        <div class="siyi-empty-state">
          <div class="siyi-empty-icon">❌</div>
          <div class="siyi-empty-text">加载失败</div>
          <div class="siyi-empty-desc">${UI.escapeHtml(e.message)}</div>
        </div>
      `;
    }
  },

  // ========== 洞察视图 ==========
  async renderInsights() {
    this.currentView = 'insights';
    if (this._progressTimer) { clearInterval(this._progressTimer); this._progressTimer = null; }
    this.stopAutoRefresh();

    // 重置滚动位置
    window.scrollTo(0, 0);
    const contentEl = document.getElementById("contentInner");
    if (contentEl) contentEl.scrollTop = 0;

    this.insightsRange = '30d';
    this.experienceCollapsed = {};

    await this.renderInsightsContent();
  },

  async renderInsightsContent() {
    const range = this.insightsRange || '30d';

    const rangeOptions = [
      { key: '7d', label: '近 7 天' },
      { key: '30d', label: '近 30 天' },
      { key: 'all', label: '全部' },
    ];

    const fmtMetric = (v, suffix = '') => (v == null ? '--' : Number(v).toLocaleString() + suffix);

    try {
      // 时间范围 → 最近天数（近7天=7，近30天=30，全部=0）
      const days = range === '7d' ? 7 : range === '30d' ? 30 : 0;
      const qs = days ? `?days=${days}` : '';
      // 一次性拉取真实数据（并发 + 超时保护，避免单接口卡住导致整页卡死）
      const withTimeout = (p, ms = 8000) => Promise.race([p, new Promise(res => setTimeout(() => res(null), ms))]);
      const safeJson = (p) => withTimeout(p).then(r => r ? r.json() : null).catch(() => null);
      const [statsRes, qualityRes, patternsRes, practicesRes, learningsRes] = await Promise.all([
        safeJson(fetch('/api/reviews/ability/obsidian/stats' + qs)),
        safeJson(fetch('/api/reviews/ability/obsidian/quality')),
        safeJson(fetch('/api/reviews/ability/obsidian/patterns' + qs)),
        safeJson(fetch('/api/reviews/ability/obsidian/practices' + qs)),
        safeJson(fetch('/api/reviews/ability/obsidian/learnings')),
      ]);

      const stats = statsRes && statsRes.success ? statsRes.stats : null;
      const quality = qualityRes && qualityRes.success ? qualityRes : null;
      const patternsData = patternsRes && patternsRes.success ? patternsRes : null;
      const practicesData = practicesRes && practicesRes.success ? practicesRes : null;
      const learningsData = learningsRes && learningsRes.success ? learningsRes : null;

      // 平均质量：改为按时间范围从逐条评分重算（否则与"全部"相同）
      let avgQuality = '--';
      if (quality != null) {
        const allScores = Array.isArray(quality.scores) ? quality.scores : [];
        let inRange = allScores;
        if (days) {
          const now = Date.now(), msPerDay = 86400000;
          inRange = allScores.filter(s => {
            if (!s || !s.date) return false;
            const d = new Date(s.date);
            if (isNaN(d.getTime())) return false;
            const diff = (now - d.getTime()) / msPerDay;
            return diff >= -0.5 && diff <= days + 0.5;
          });
        }
        if (!inRange.length) inRange = allScores;
        if (inRange.length) {
          const sum = inRange.reduce((a, s) => a + (Number(s.totalScore) || 0), 0);
          avgQuality = Math.round(sum / inRange.length) + '/100';
        } else {
          avgQuality = quality.avgScore != null ? quality.avgScore + '/100' : '--';
        }
      }

      // 核心指标
      const totalReviews = stats ? stats.total : (quality != null ? quality.total : null);
      const totalProblems = stats ? stats.totalProblems : (patternsData ? patternsData.totalProblems : null);
      const completionRate = stats ? fmtMetric(stats.completionRate, '%') : '--';

      const metricCards = [
        { value: fmtMetric(totalReviews), label: '总复盘数', cls: '' },
        { value: avgQuality, label: '平均质量', cls: 'accent' },
        { value: fmtMetric(totalProblems), label: '问题总数', cls: 'warning' },
        { value: completionRate, label: '行动完成率', cls: 'success' },
      ];

      // 质量趋势折线图（基于真实评分，按日期聚合平均分）
      const chartW = 900;
      const chartH = 200;
      const padX = 30;
      const padY = 20;
      const trend = this.buildQualityTrend(quality ? quality.scores : [], range);
      const trendHtml = trend.length >= 2
        ? this.buildTrendSvg(trend, chartW, chartH, padX, padY, chartW - padX * 2, chartH - padY * 2, 100, 0)
        : `<div class="siyi-insights-empty" style="padding:60px 0;text-align:center;color:var(--color-text-secondary);">暂无足够的评分数据绘制趋势</div>`;

      // 问题类型排行 & 好做法排行（真实数据）
      const topProblems = (patternsData && patternsData.patterns || []).slice(0, 10);
      const topGood = (practicesData && practicesData.topPractices || []).slice(0, 10);
      const problemsHtml = this.buildRankList(topProblems, 'problem');
      const goodHtml = this.buildRankList(topGood, 'good');

      // 经验库（来自真实学习收获，按时间范围过滤）
      const _inRange = (date) => {
        if (!days) return true;
        if (!date) return false;
        const d = new Date(date);
        if (isNaN(d.getTime())) return false;
        const diff = (Date.now() - d.getTime()) / 86400000;
        return diff >= -0.5 && diff <= days + 0.5;
      };
      const experiences = (learningsData && learningsData.items || [])
        .filter(l => _inRange(l && l.reviewDate) && l && (l.title || l.scenario || l.evidence))
        .map((l, idx) => ({
          id: idx,
          title: l.title || '(未命名收获)',
          category: l.type || '未分类',
          summary: l.scenario || l.evidence || l.reusability || '(无描述)',
          source: l.sourceReview || '复盘',
          date: l.reviewDate || ''
        }));

      this.container.innerHTML = `
        <div class="siyi-reviews-container">
          <div class="siyi-page-header">
            <div class="siyi-header-text">
              <h1 class="siyi-page-title">洞察分析</h1>
              <p class="siyi-page-subtitle">从复盘数据中发现规律与趋势</p>
            </div>
            <div class="siyi-header-actions">
              <button class="siyi-ghost-btn" id="insRefreshBtn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
                刷新
              </button>
            </div>
          </div>

          ${this.renderNav('insights')}

          <!-- 时间范围选择 -->
          <div class="siyi-range-tabs">
            ${rangeOptions.map(opt => `
              <button class="siyi-range-tab ${range === opt.key ? 'active' : ''}" data-range="${opt.key}">${opt.label}</button>
            `).join('')}
          </div>

          <!-- 核心指标卡：4 个（来自真实 API） -->
          <div class="siyi-metric-grid">
            ${metricCards.map(m => `
              <div class="siyi-metric-card">
                <div class="siyi-metric-value ${m.cls}">${m.value}</div>
                <div class="siyi-metric-label">${m.label}</div>
              </div>
            `).join('')}
          </div>

          <!-- 质量趋势图：全宽 -->
          <div class="siyi-card siyi-trend-full-card">
            <div class="siyi-card-header">
              <h3 class="siyi-card-title">质量趋势</h3>
              <span class="siyi-card-subtitle">平均评分走势（${(rangeOptions.find(o => o.key === range) || rangeOptions[1]).label}）</span>
            </div>
            <div class="siyi-line-chart-full">
              ${trendHtml}
            </div>
          </div>

          <!-- TOP 10 排行榜：左右两列 -->
          <div class="siyi-ranking-section">
            <div class="siyi-card siyi-ranking-card">
              <div class="siyi-card-header">
                <h3 class="siyi-card-title">⚠ 问题类型排行</h3>
                <span class="siyi-card-badge warning">TOP 10</span>
              </div>
              <div class="siyi-bar-list">${problemsHtml}</div>
            </div>

            <div class="siyi-card siyi-ranking-card">
              <div class="siyi-card-header">
                <h3 class="siyi-card-title">✓ 好做法排行</h3>
                <span class="siyi-card-badge success">TOP 10</span>
              </div>
              <div class="siyi-bar-list">${goodHtml}</div>
            </div>
          </div>

          <!-- 经验库：折叠式条目（来自真实学习收获） -->
          <div class="siyi-card siyi-experience-card">
            <div class="siyi-card-header">
              <h3 class="siyi-card-title">📚 经验库</h3>
              <span class="siyi-card-subtitle">${experiences.length} 条可复用经验</span>
            </div>
            <div class="siyi-experience-list">
              ${experiences.map(exp => {
                const isCollapsed = this.experienceCollapsed !== false && this.experienceCollapsed[exp.id] !== false;
                return `
                  <div class="siyi-experience-item ${isCollapsed ? 'collapsed' : ''}" data-exp-id="${exp.id}">
                    <div class="siyi-experience-header">
                      <div class="siyi-experience-title-group">
                        <span class="siyi-experience-category">${exp.category}</span>
                        <h4 class="siyi-experience-title">${exp.title}</h4>
                      </div>
                      <div class="siyi-experience-meta">
                        <span class="siyi-experience-source">来源：${exp.source}</span>
                        <span class="siyi-experience-date">${exp.date}</span>
                        <svg class="siyi-experience-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </div>
                    </div>
                    <div class="siyi-experience-body">
                      <p class="siyi-experience-summary">${exp.summary}</p>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;

      this.bindInsightsEvents();
      this.bindPrimaryNav();
    } catch (err) {
      console.error('[Insights] 加载洞察数据失败:', err);
      this.container.innerHTML = `
        <div class="siyi-reviews-container">
          <div class="siyi-page-header">
            <div class="siyi-header-text">
              <h1 class="siyi-page-title">洞察分析</h1>
              <p class="siyi-page-subtitle">从复盘数据中发现规律与趋势</p>
            </div>
          </div>
          ${this.renderNav('insights')}
          <div class="siyi-insights-empty" style="padding:60px 20px;text-align:center;color:var(--color-text-secondary);">加载洞察数据失败，请稍后重试</div>
        </div>
      `;
    }
  },

  // 从真实评分数据构建质量趋势（按日期聚合平均分）
  buildQualityTrend(scores, range) {
    if (!Array.isArray(scores) || scores.length === 0) return [];
    const cutoffDays = range === '7d' ? 7 : range === '30d' ? 30 : null;
    const byDate = {};
    let matched = 0;
    const now = Date.now();
    scores.forEach(s => {
      if (!s || !s.date) return;
      const d = new Date(s.date);
      if (isNaN(d.getTime())) return;
      if (cutoffDays) {
        const diff = (now - d.getTime()) / 86400000;
        if (diff < 0 || diff > cutoffDays) return;
      }
      const key = s.date.slice(0, 10);
      if (!byDate[key]) { byDate[key] = { sum: 0, n: 0 }; }
      byDate[key].sum += (Number(s.totalScore) || 0);
      byDate[key].n++;
      matched++;
    });
    // 范围内无数据时回退到全部评分，保证图表展示真实内容
    if (matched === 0) {
      scores.forEach(s => {
        if (!s || !s.date) return;
        const key = s.date.slice(0, 10);
        if (!byDate[key]) { byDate[key] = { sum: 0, n: 0 }; }
        byDate[key].sum += (Number(s.totalScore) || 0);
        byDate[key].n++;
      });
    }
    return Object.keys(byDate)
      .sort()
      .map(date => {
        const agg = byDate[date];
        return { day: date, score: Math.round((agg.sum / agg.n) * 10) / 10 };
      });
  },

  buildTrendSvg(trend, chartW, chartH, padX, padY, innerW, innerH, maxScore, minScore) {
    const points = trend.map((d, i) => {
      const x = padX + (i / (trend.length - 1)) * innerW;
      const y = padY + innerH - ((d.score - minScore) / (maxScore - minScore)) * innerH;
      return { x, y };
    });
    const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    const areaPath = linePath + ` L${points[points.length - 1].x.toFixed(1)},${chartH - padY} L${points[0].x.toFixed(1)},${chartH - padY} Z`;
    return `
      <svg viewBox="0 0 ${chartW} ${chartH}" preserveAspectRatio="none" class="siyi-chart-svg">
        <defs>
          <linearGradient id="insightsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.15"/>
            <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${[0, 0.25, 0.5, 0.75, 1].map(t => {
          const y = padY + t * innerH;
          return `<line x1="${padX}" y1="${y}" x2="${chartW - padX}" y2="${y}" stroke="var(--color-border)" stroke-width="1" stroke-dasharray="4 4"/>`;
        }).join('')}
        <path d="${areaPath}" fill="url(#insightsGradient)"/>
        <path d="${linePath}" fill="none" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${points[0].x.toFixed(1)}" cy="${points[0].y.toFixed(1)}" r="4" fill="var(--color-card)" stroke="var(--color-primary)" stroke-width="2"/>
        <circle cx="${points[points.length - 1].x.toFixed(1)}" cy="${points[points.length - 1].y.toFixed(1)}" r="5" fill="var(--color-primary)" stroke="var(--color-card)" stroke-width="2"/>
      </svg>
    `;
  },

  buildRankList(items, kind) {
    if (!Array.isArray(items) || items.length === 0) {
      return `<div class="siyi-insights-empty" style="padding:24px 0;text-align:center;color:var(--color-text-secondary);">暂无数据</div>`;
    }
    const usableMax = Math.max(...items.map(p => p.count || 0)) || 1;
    return items.map((item, i) => {
      const count = item.count || 0;
      const name = item.name || item.title || '(未命名)';
      const pct = Math.max(2, (count / usableMax) * 100);
      return `
        <div class="siyi-bar-item">
          <div class="siyi-bar-rank ${kind}">${i + 1}</div>
          <div class="siyi-bar-body">
            <div class="siyi-bar-label">${name}</div>
            <div class="siyi-bar-track">
              <div class="siyi-bar-fill ${kind}" style="width: ${pct}%"></div>
            </div>
          </div>
          <div class="siyi-bar-count">${count}</div>
        </div>
      `;
    }).join('');
  },

  bindInsightsEvents() {
    document.getElementById('insRefreshBtn')?.addEventListener('click', () => {
      this.renderInsightsContent();
    });
    // 时间范围切换（渲染完成后已重新绑定事件，避免重复绑定）
    document.querySelectorAll('.siyi-range-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.insightsRange = tab.dataset.range;
        this.renderInsightsContent();
      });
    });
    // 经验库折叠
    document.querySelectorAll('.siyi-experience-item').forEach(item => {
      item.querySelector('.siyi-experience-header')?.addEventListener('click', () => {
        const id = item.dataset.expId;
        this.experienceCollapsed[id] = this.experienceCollapsed[id] === false ? true : false;
        item.classList.toggle('collapsed');
      });
    });
  },

  // ========== 洞察页：报告列表 ==========
  async loadInsightsReportList() {
    const container = document.getElementById('insightsReportList');
    if (!container) return;
    try {
      const res = await fetch('/api/reviews/ability/obsidian/report/list?limit=50');
      const data = await res.json();
      const reports = data.reports || [];
      if (reports.length === 0) {
        container.innerHTML = `
          <div class="siyi-empty-state">
            <div class="siyi-empty-icon">📊</div>
            <div class="siyi-empty-text">还没有生成报告</div>
            <div class="siyi-empty-desc">选择周期后点击"生成新报告"创建你的第一份成长报告</div>
          </div>
        `;
        return;
      }
      const periodLabels = { week: '周报', month: '月报', quarter: '季报', year: '年报', custom: '自定义' };
      const periodColors = { week: 'info', month: 'primary', quarter: 'warning', year: 'success', custom: 'secondary' };
      container.innerHTML = reports.map(r => `
        <div class="siyi-report-item" data-report-id="${r.id}">
          <div class="siyi-report-item-main">
            <div class="siyi-report-item-header">
              <span class="siyi-report-badge ${periodColors[r.period] || 'primary'}">${periodLabels[r.period] || r.period}</span>
              <h4 class="siyi-report-title">${UI.escapeHtml(r.title || `${r.start_date} 至 ${r.end_date} 成长报告`)}</h4>
            </div>
            <p class="siyi-report-summary">${UI.escapeHtml(r.summary || '暂无摘要')}</p>
            <div class="siyi-report-meta">
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                ${r.start_date} ~ ${r.end_date}
              </span>
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                ${r.review_count || 0} 篇复盘
              </span>
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                ${r.avg_score ? r.avg_score.toFixed(1) : '-'} 分
              </span>
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                ${UI.formatDateTime(r.generated_at) || ''}
              </span>
            </div>
          </div>
          <div class="siyi-report-item-actions">
            <button class="siyi-report-view-btn" title="查看报告">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              查看
            </button>
            <button class="siyi-report-delete-btn" title="删除报告">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              删除
            </button>
          </div>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `
        <div class="siyi-empty-state">
          <div class="siyi-empty-icon">❌</div>
          <div class="siyi-empty-text">加载失败</div>
          <div class="siyi-empty-desc">${UI.escapeHtml(e.message)}</div>
        </div>
      `;
    }
  },

  async generateInsightsReport() {
    const period = document.getElementById('reportPeriodSelect')?.value || 'month';
    const btn1 = document.getElementById('insGenReportBtn');
    const btn2 = document.getElementById('insGenReportBtn2');
    const setLoading = (loading) => {
      if (btn1) { btn1.disabled = loading; btn1.style.opacity = loading ? '0.6' : '1'; }
      if (btn2) { btn2.disabled = loading; btn2.style.opacity = loading ? '0.6' : '1'; }
    };
    setLoading(true);

    const container = document.getElementById('insightsReportList');
    if (container) {
      container.innerHTML = `
        <div class="siyi-empty-state">
          <div class="siyi-empty-spinner"></div>
          <div class="siyi-empty-text">正在生成成长报告...</div>
          <div class="siyi-empty-desc">AI 正在分析你的复盘数据，首次生成约需 30-60 秒</div>
        </div>
      `;
    }

    try {
      // 计算周期对应的起止日期
      const dates = this.getPeriodDates(period);
      const res = await fetch('/api/reviews/ability/obsidian/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, startDate: dates.start, endDate: dates.end })
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || '生成失败');
        this.loadInsightsReportList();
        return;
      }
      // 生成成功后刷新列表
      this.loadInsightsReportList();
    } catch (e) {
      alert('生成失败: ' + e.message);
      this.loadInsightsReportList();
    } finally {
      setLoading(false);
    }
  },

  async deleteInsightsReport(id) {
    if (!confirm('确定要删除这份报告吗？删除后无法恢复。')) return;
    try {
      const res = await fetch(`/api/reviews/ability/obsidian/report/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        this.loadInsightsReportList();
      } else {
        alert('删除失败');
      }
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  },

  getPeriodDates(period) {
    const now = new Date();
    let start, end;
    switch (period) {
      case 'week': {
        const day = now.getDay() || 7;
        start = new Date(now); start.setDate(now.getDate() - day + 1);
        end = new Date(start); end.setDate(start.getDate() + 6);
        break;
      }
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'quarter': {
        const q = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), q * 3, 1);
        end = new Date(now.getFullYear(), q * 3 + 3, 0);
        break;
      }
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: fmt(start), end: fmt(end) };
  },

  async renderInsightsReportDetail(id) {
    this.currentView = 'report-detail';
    this.container.innerHTML = `
      <div class="siyi-reviews-container">
        <div class="siyi-page-header">
          <div class="siyi-header-text">
            <h1 class="siyi-page-title">报告详情</h1>
            <p class="siyi-page-subtitle">AI 生成的结构化成长分析报告</p>
          </div>
          <div class="siyi-header-actions">
            <button class="siyi-ghost-btn" id="reportBackBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              返回洞察
            </button>
            <button class="siyi-ghost-btn" id="copyReportBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              复制报告
            </button>
          </div>
        </div>
        <div id="reportDetailContent" class="siyi-report-detail-content">
          <div class="siyi-empty-state">
            <div class="siyi-empty-spinner"></div>
          </div>
        </div>
      </div>
    `;
    document.getElementById('reportBackBtn')?.addEventListener('click', () => this.renderInsights());
    try {
      const res = await fetch(`/api/reviews/ability/obsidian/report/${id}`);
      const report = await res.json();
      if (!report || !report.id) {
        document.getElementById('reportDetailContent').innerHTML = `
          <div class="siyi-empty-state">
            <div class="siyi-empty-icon">❌</div>
            <div class="siyi-empty-text">报告不存在</div>
          </div>
        `;
        return;
      }
      const periodLabels = { week: '周报', month: '月报', quarter: '季报', year: '年报', custom: '自定义' };
      const html = this.renderSimpleMarkdown(report.content || '');
      document.getElementById('reportDetailContent').innerHTML = `
        <div class="siyi-card siyi-report-detail-card">
          <div class="siyi-report-detail-header">
            <span class="siyi-report-badge ${report.period || 'primary'}">${periodLabels[report.period] || report.period || '报告'}</span>
            <h2 class="siyi-report-detail-title">${UI.escapeHtml(report.title || `${report.start_date} 至 ${report.end_date} 成长报告`)}</h2>
            <div class="siyi-report-detail-meta">
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                ${report.start_date} ~ ${report.end_date}
              </span>
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                ${report.review_count || 0} 篇复盘
              </span>
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                平均 ${report.avg_score ? report.avg_score.toFixed(1) : '-'} 分
              </span>
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                ${report.total_problems || 0} 个问题
              </span>
              <span class="siyi-report-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                ${UI.formatDateTime(report.generated_at) || ''}
              </span>
            </div>
          </div>
          <div class="siyi-report-detail-body">${html}</div>
        </div>
      `;
      document.getElementById('copyReportBtn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(report.content || '').then(() => {
          const btn = document.getElementById('copyReportBtn');
          if (btn) {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 已复制';
            setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
          }
        });
      });
    } catch (e) {
      document.getElementById('reportDetailContent').innerHTML = `
        <div class="siyi-empty-state">
          <div class="siyi-empty-icon">❌</div>
          <div class="siyi-empty-text">加载失败</div>
          <div class="siyi-empty-desc">${UI.escapeHtml(e.message)}</div>
        </div>
      `;
    }
  },

  async renderInsightsTab(tab) {
    const content = document.getElementById('insightsContent');
    if (!content) return;
    content.innerHTML = '<div class="empty-state"><div class="loading-spinner" style="margin:0 auto;"></div></div>';

    switch (tab) {
      case 'radar':
        await this.renderAbilityRadarContent(content);
        break;
      case 'patterns':
        await this.renderPatternAnalysisContent(content);
        break;
    }
  },

  // 能力雷达内容（渲染到指定容器）
  async renderAbilityRadarContent(container) {
    try {
      const res = await fetch('/api/reviews/ability/obsidian/ability-radar').then(r => r.json());
      if (!res.success) {
        container.innerHTML = `<div class="empty-state">能力数据加载失败</div>`;
        return;
      }
      const dims = res.dimensions || [];
      const avg = res.average || {};
      const scoredCount = (res.history || []).length;
      const hasScore = dims.some(d => (avg[d.id] || 0) > 0);
      if (!hasScore || scoredCount === 0) {
        container.innerHTML = `
          <div class="insights-section">
            <div class="insights-section-title">我的能力变化</div>
            <div class="empty-state small">
              <div class="empty-state-icon">📊</div>
              <div class="empty-state-text">暂无可统计的能力评分<br><small>复盘「板块3 · 用户行为分析」包含维度评分后这里会自动统计</small></div>
            </div>
          </div>`;
        return;
      }
      container.innerHTML = `
        <div class="insights-section">
          <div class="insights-section-title">我的能力变化</div>
          <div class="ability-grid">
            ${dims.map(d => {
              const value = avg[d.id] || 0;
              const pct = Math.min(100, (value / 5) * 100);
              return `
                <div class="ability-card">
                  <div class="ability-label">${d.name}</div>
                  <div class="ability-bar"><div class="ability-bar-fill" style="width:${pct}%"></div></div>
                  <div class="ability-value">${value.toFixed(1)} / 5</div>
                </div>
              `;
            }).join('')}
          </div>
          <div class="insights-note">基于 ${scoredCount} 篇含能力评分的复盘综合评估</div>
          <div class="insights-radar-full">
            <button class="obs-ghost-btn" id="insightsRadarFullBtn"><span>📊</span> 查看完整能力雷达图</button>
          </div>
        </div>
      `;
      container.querySelector('#insightsRadarFullBtn')?.addEventListener('click', () => this.renderAbilityRadar());
    } catch (err) {
      container.innerHTML = `<div class="empty-state">加载失败: ${err.message}</div>`;
    }
  },

  // 模式分析内容
  async renderPatternAnalysisContent(container) {
    try {
      const res = await fetch('/api/reviews/ability/obsidian/reviews?page=1&pageSize=20').then(r => r.json());
      if (res.success && res.reviews) {
        const reviews = res.reviews;
        // 加载前10条复盘详情，提取problems和goodPractices
        const problemCount = {};
        const goodCount = {};
        const detailPromises = reviews.slice(0, 10).map(async (r) => {
          try {
            const detailRes = await fetch(`/api/reviews/ability/obsidian/reviews/${encodeURIComponent(r.path)}`).then(r => r.json());
            if (detailRes.success) {
              if (detailRes.problems && Array.isArray(detailRes.problems)) {
                detailRes.problems.forEach(p => {
                  const text = p.title || p.problem || '';
                  if (text) problemCount[text] = (problemCount[text] || 0) + 1;
                });
              }
              if (detailRes.goodPractices && Array.isArray(detailRes.goodPractices)) {
                detailRes.goodPractices.forEach(g => {
                  const text = g.title || g.description || '';
                  if (text) goodCount[text] = (goodCount[text] || 0) + 1;
                });
              }
            }
          } catch (e) {
            console.warn('[Patterns] 加载复盘详情失败:', r.path, e.message);
          }
        });
        await Promise.all(detailPromises);

        const topProblems = Object.entries(problemCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const topGood = Object.entries(goodCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

        container.innerHTML = `
          <div class="insights-section">
            <div class="insights-section-title">模式分析</div>
            <div class="pattern-two-col">
              <div class="pattern-col">
                <div class="pattern-col-subtitle problem">⚠ 常见问题</div>
                <div class="pattern-list">
                  ${topProblems.length === 0 ? '<div class="empty-state small">暂无数据</div>' : topProblems.slice(0,4).map(([text, count]) => `
                    <div class="pattern-item">
                      <div class="pattern-text">${text.substring(0, 56)}${text.length > 56 ? '...' : ''}</div>
                      <span class="pattern-count">${count}次</span>
                    </div>
                  `).join('')}
                </div>
              </div>
              <div class="pattern-col">
                <div class="pattern-col-subtitle good">✓ 优势</div>
                <div class="pattern-list pattern-good">
                  ${topGood.length === 0 ? '<div class="empty-state small">暂无数据</div>' : topGood.slice(0,4).map(([text, count]) => `
                    <div class="pattern-item">
                      <div class="pattern-text">${text.substring(0, 56)}${text.length > 56 ? '...' : ''}</div>
                      <span class="pattern-count">${count}次</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        `;
      }
    } catch (err) {
      container.innerHTML = `<div class="empty-state">加载失败: ${err.message}</div>`;
    }
  },

  // 学习收获内容

  // ========== 模式分析视图 ==========
  async renderPatternAnalysis() {
    this.currentView = 'pattern';
    this.stopAutoRefresh();
    this.container.innerHTML = `
      <div class="obs-container">
        <div class="obs-header">
          <div>
            <h2>🔍 跨会话模式分析</h2>
            <p>分析所有复盘中的典型问题，识别反复出现的行为模式和能力短板</p>
          </div>
          <div class="obs-header-actions">
            <button class="btn btn-secondary" id="backToListBtn2">← 返回列表</button>
            <button class="btn btn-secondary" id="refreshPatternBtn">🔄 刷新</button>
          </div>
        </div>

        <div class="obs-stats" id="patternStats">
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">复盘总数</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">问题总数</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">识别模式</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">能力短板</div></div>
        </div>

        <div id="patternContent">
          <div class="empty-state"><div class="loading-spinner" style="margin:0 auto;"></div></div>
        </div>
      </div>
    `;
    document.getElementById('backToListBtn2')?.addEventListener('click', () => this.renderReviews());
    document.getElementById('refreshPatternBtn')?.addEventListener('click', () => this.loadPatternAnalysis());
    await this.loadPatternAnalysis();
  },

  async loadPatternAnalysis() {
    try {
      // 并行加载模式分析、趋势数据、预警数据
      const [patternsRes, trendsRes, warningsRes] = await Promise.all([
        fetch('/api/reviews/ability/obsidian/patterns'),
        fetch('/api/reviews/ability/obsidian/patterns/trends'),
        fetch('/api/reviews/ability/obsidian/patterns/warnings')
      ]);
      const patternsData = await patternsRes.json();
      const trendsData = await trendsRes.json();
      const warningsData = await warningsRes.json();

      if (patternsData.success) {
        this.renderPatternStats(patternsData);
        this.renderPatternContent({
          ...patternsData,
          trends: trendsData.success ? trendsData.trends : [],
          dates: trendsData.success ? trendsData.dates : [],
          warnings: warningsData.success ? warningsData.warnings : [],
          warningStats: {
            total: warningsData.success ? warningsData.totalWarnings : 0,
            critical: warningsData.success ? warningsData.criticalCount : 0,
            warning: warningsData.success ? warningsData.warningCount : 0
          }
        });
      }
    } catch (e) {
      console.error('加载模式分析失败:', e);
      document.getElementById('patternContent').innerHTML = `<div class="empty-state">加载失败: ${UI.escapeHtml(e.message)}</div>`;
    }
  },

  renderPatternStats(data) {
    const statsEl = document.getElementById('patternStats');
    if (!statsEl) return;
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-value">${data.totalReviews || 0}</div><div class="stat-label">复盘总数</div></div>
      <div class="stat-card"><div class="stat-value">${data.totalProblems || 0}</div><div class="stat-label">问题总数</div></div>
      <div class="stat-card"><div class="stat-value">${data.patterns?.length || 0}</div><div class="stat-label">识别模式</div></div>
      <div class="stat-card"><div class="stat-value">${data.abilityGaps?.length || 0}</div><div class="stat-label">能力短板</div></div>
    `;
  },

  renderPatternContent(data) {
    const contentEl = document.getElementById('patternContent');
    if (!contentEl) return;

    if (data.totalProblems === 0) {
      contentEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div><div>暂无问题数据</div><div style="font-size:13px;color:#888;margin-top:8px;">生成复盘后会自动分析典型问题模式</div></div>`;
      return;
    }

    const severityColors = { high: '#e74c3c', medium: '#f39c12', low: '#3498db' };
    const severityLabels = { high: '高优先级', medium: '中优先级', low: '低优先级' };

    contentEl.innerHTML = `
      <!-- 反复出现预警 -->
      ${(data.warnings || []).length > 0 ? `
      <div class="summary-section warning-section">
        <h3>🚨 反复出现预警 (${data.warningStats?.total || 0})</h3>
        <div class="warning-cards">
          ${(data.warnings || []).map(w => `
            <div class="warning-card warning-${w.severity}">
              <div class="warning-header">
                <span class="warning-severity">${w.severity === 'critical' ? '🔴 严重' : w.severity === 'warning' ? '🟡 警告' : '🔵 提示'}</span>
                <span class="warning-consecutive">连续出现 ${w.consecutiveCount} 次</span>
              </div>
              <div class="warning-name">${UI.escapeHtml(w.name)}</div>
              <div class="warning-desc">${UI.escapeHtml(w.description || '')}</div>
              <div class="warning-meta">
                <span>总计出现 ${w.totalCount} 次</span>
                <span>最近出现: ${w.lastOccurrence || '未知'}</span>
                <span class="warning-trend trend-${w.trend}">${w.trend === 'rising' ? '📈 上升' : w.trend === 'falling' ? '📉 下降' : '➡️ 稳定'}</span>
              </div>
              <div class="warning-improvement">
                <div class="improvement-title">💡 改进方法: ${UI.escapeHtml(w.improvementMethod || '')}</div>
                <ol class="improvement-steps">
                  ${(w.improvementSteps || []).map((step, i) => `<li>${UI.escapeHtml(step)}</li>`).join('')}
                </ol>
              </div>
              ${w.recentOccurrences?.length ? `
              <div class="warning-recent">
                <div style="font-size:11px;color:#888;margin-bottom:4px;">最近出现记录:</div>
                ${w.recentOccurrences.map(r => `<span class="recent-tag">${r.date} (${r.count}次)</span>`).join('')}
              </div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>` : ''}

      <!-- 能力短板 -->
      <div class="summary-section">
        <h3>⚠️ 能力短板 TOP</h3>
        <div class="pattern-cards">
          ${(data.abilityGaps || []).map(gap => `
            <div class="pattern-card">
              <div class="pattern-header">
                <span class="pattern-severity" style="background:${severityColors[gap.severity] || '#999'};">${severityLabels[gap.severity] || gap.severity}</span>
                <span class="pattern-name">${UI.escapeHtml(gap.name)}</span>
              </div>
              <div class="pattern-desc">${UI.escapeHtml(gap.description || '')}</div>
              <div class="pattern-meta">
                <span>出现 ${gap.occurrenceCount} 次</span>
                <span>浪费 ${gap.totalWastedTurns} 轮</span>
              </div>
              ${gap.sampleProblems?.length ? `
              <div class="pattern-samples">
                <div style="font-size:12px;color:#888;margin-bottom:4px;">典型问题:</div>
                ${gap.sampleProblems.map(p => `<div class="pattern-sample">• ${UI.escapeHtml(p.title)} (${p.reviewDate})</div>`).join('')}
              </div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 问题模式分布 -->
      <div class="summary-section">
        <h3>📊 问题模式分布</h3>
        <div class="pattern-list">
          ${(data.patterns || []).map(p => `
            <div class="pattern-list-item">
              <div class="pli-name">${UI.escapeHtml(p.name)}</div>
              <div class="pli-bar">
                <div class="pli-bar-fill" style="width:${p.percentage}%;"></div>
              </div>
              <div class="pli-count">${p.count}次 (${p.percentage}%)</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 问题模式趋势图 -->
      ${(data.trends || []).length > 0 ? `
      <div class="summary-section">
        <h3>📈 问题模式趋势</h3>
        <div class="trend-charts">
          ${(data.trends || []).map(t => `
            <div class="trend-chart-card">
              <div class="trend-chart-header">
                <span class="trend-chart-name">${UI.escapeHtml(t.name)}</span>
                <span class="trend-chart-trend trend-${t.trend}">${t.trend === 'rising' ? '📈 上升' : t.trend === 'falling' ? '📉 下降' : '➡️ 稳定'}</span>
              </div>
              <div class="trend-chart-desc">${UI.escapeHtml(t.description || '')}</div>
              <div class="trend-bar-chart">
                ${(t.dataPoints || []).map(d => `
                  <div class="trend-bar-item" title="${d.date}: ${d.count}次">
                    <div class="trend-bar" style="height: ${d.count > 0 ? Math.max(10, d.count * 20) : 4}px; ${d.count > 0 ? '' : 'opacity:0.3;'}"></div>
                    <div class="trend-bar-label">${d.date.slice(5)}</div>
                  </div>
                `).join('')}
              </div>
              <div class="trend-chart-meta">
                <span>总计: ${t.totalCount}次</span>
                <span>最近3次: ${t.recentCount}次</span>
                <span>之前: ${t.earlierCount}次</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>` : ''}

      <!-- 浪费轮次最多的问题 -->
      <div class="summary-section">
        <h3>🔥 浪费轮次最多的问题 TOP5</h3>
        <div class="top-problems-list">
          ${(data.topProblems || []).map((p, i) => `
            <div class="top-problem-item">
              <div class="tp-rank">#${i + 1}</div>
              <div class="tp-content">
                <div class="tp-title">${UI.escapeHtml(p.title)}</div>
                <div class="tp-meta">
                  <span class="tp-wasted">浪费 ${p.wastedTurns || 0} 轮</span>
                  <span class="tp-severity">${UI.escapeHtml(p.severity || '')}</span>
                  <span class="tp-source">${UI.escapeHtml(p.sourceReview || '')} (${p.reviewDate || ''})</span>
                </div>
                ${p.suggestion ? `<div class="tp-suggestion">💡 ${UI.escapeHtml(p.suggestion)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  // ========== 学习收获视图 ==========
  async renderLearnings() {
    this.currentView = 'learnings';
    this.stopAutoRefresh();
    this.container.innerHTML = `
      <div class="obs-container">
        <div class="obs-header">
          <div>
            <h2>📚 学习收获知识库</h2>
            <p>从所有复盘中提取的新技能、新知识、新工具和新方法</p>
          </div>
          <div class="obs-header-actions">
            <button class="btn btn-secondary" id="backToListBtn3">← 返回列表</button>
            <button class="btn btn-secondary" id="learningReviewBtn">🔄 复习提醒</button>
            <button class="btn btn-secondary" id="refreshLearningsBtn">🔄 刷新</button>
          </div>
        </div>

        <div class="obs-stats" id="learningsStats">
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">收获总数</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">新技能</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">新知识</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">新方法</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">基本掌握</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">初步了解</div></div>
        </div>

        <div class="obs-filter-bar">
          <div class="obs-sort">
            <label>类型：</label>
            <select id="learningTypeFilter" class="form-input form-input-sm">
              <option value="">全部</option>
              <option value="新技能">新技能</option>
              <option value="新知识">新知识</option>
              <option value="新工具">新工具</option>
              <option value="新方法">新方法</option>
              <option value="新概念">新概念</option>
            </select>
            <label style="margin-left:16px;">掌握程度：</label>
            <select id="learningMasteryFilter" class="form-input form-input-sm">
              <option value="">全部</option>
              <option value="熟练应用">熟练应用</option>
              <option value="基本掌握">基本掌握</option>
              <option value="初步了解">初步了解</option>
            </select>
          </div>
        </div>

        <div class="learning-list" id="learningList">
          <div class="empty-state"><div class="loading-spinner" style="margin:0 auto;"></div></div>
        </div>
      </div>
    `;
    document.getElementById('backToListBtn3')?.addEventListener('click', () => this.renderReviews());
    document.getElementById('refreshLearningsBtn')?.addEventListener('click', () => this.loadLearnings());
    document.getElementById('learningReviewBtn')?.addEventListener('click', () => this.renderLearningReview());
    document.getElementById('learningTypeFilter')?.addEventListener('change', () => this.loadLearnings());
    document.getElementById('learningMasteryFilter')?.addEventListener('change', () => this.loadLearnings());
    await this.loadLearnings();
  },

  async loadLearnings() {
    try {
      const typeFilter = document.getElementById('learningTypeFilter')?.value || '';
      const masteryFilter = document.getElementById('learningMasteryFilter')?.value || '';
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      if (masteryFilter) params.set('mastery', masteryFilter);
      const res = await fetch(`/api/reviews/ability/obsidian/learnings?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        this.renderLearningsStats(data);
        this.renderLearningList(data);
      }
    } catch (e) {
      console.error('加载学习收获失败:', e);
      document.getElementById('learningList').innerHTML = `<div class="empty-state">加载失败: ${UI.escapeHtml(e.message)}</div>`;
    }
  },

  renderLearningsStats(data) {
    const statsEl = document.getElementById('learningsStats');
    if (!statsEl) return;
    const s = data.stats || {};
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-value">${data.total || 0}</div><div class="stat-label">收获总数</div></div>
      <div class="stat-card"><div class="stat-value">${s.byType?.['新技能'] || 0}</div><div class="stat-label">新技能</div></div>
      <div class="stat-card"><div class="stat-value">${s.byType?.['新知识'] || 0}</div><div class="stat-label">新知识</div></div>
      <div class="stat-card"><div class="stat-value">${s.byType?.['新方法'] || 0}</div><div class="stat-label">新方法</div></div>
      <div class="stat-card"><div class="stat-value">${s.byMastery?.['基本掌握'] || 0}</div><div class="stat-label">基本掌握</div></div>
      <div class="stat-card"><div class="stat-value">${s.byMastery?.['初步了解'] || 0}</div><div class="stat-label">初步了解</div></div>
    `;
  },

  renderLearningList(data) {
    const listEl = document.getElementById('learningList');
    if (!listEl) return;

    const items = data.items || [];
    if (items.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📚</div><div>暂无学习收获</div><div style="font-size:13px;color:#888;margin-top:8px;">生成复盘后会自动提取学习收获</div></div>`;
      return;
    }

    const typeColors = {
      '新技能': '#3b82f6',
      '新知识': '#8b5cf6',
      '新工具': '#10b981',
      '新方法': '#f59e0b',
      '新概念': '#ec4899'
    };
    const masteryColors = {
      '熟练应用': '#10b981',
      '基本掌握': '#3b82f6',
      '初步了解': '#f59e0b'
    };

    listEl.innerHTML = items.map(item => `
      <div class="learning-card">
        <div class="learning-header">
          <span class="learning-type" style="background:${typeColors[item.type] || '#999'};">${UI.escapeHtml(item.type || '未分类')}</span>
          <span class="learning-mastery" style="color:${masteryColors[item.mastery] || '#888'};">${UI.escapeHtml(item.mastery || '未评估')}</span>
        </div>
        <div class="learning-title">${UI.escapeHtml(item.title || '')}</div>
        ${item.scenario ? `<div class="learning-scenario">🎯 应用场景: ${UI.escapeHtml(item.scenario)}</div>` : ''}
        ${item.evidence ? `<div class="learning-evidence">📝 证据: ${UI.escapeHtml(item.evidence.substring(0, 100))}${item.evidence.length > 100 ? '...' : ''}</div>` : ''}
        <div class="learning-meta">
          <span>📅 ${UI.escapeHtml(item.reviewDate || '')}</span>
          <span>📝 ${UI.escapeHtml(item.sourceReview || '')}</span>
        </div>
      </div>
    `).join('');
  },

  // ========== 学习收获艾宾浩斯复习视图 ==========
  async renderLearningReview() {
    this.currentView = 'learning-review';
    this.stopAutoRefresh();
    this.container.innerHTML = `
      <div class="obs-container">
        <div class="obs-header">
          <div>
            <h2>🔄 学习收获复习提醒</h2>
            <p>基于艾宾浩斯遗忘曲线（1/3/7/15/30天），智能提醒复习时间</p>
          </div>
          <div class="obs-header-actions">
            <button class="btn btn-secondary" id="backToLearningsBtn">← 返回学习收获</button>
            <button class="btn btn-primary" id="todayReviewBtn">📋 今日待复习</button>
            <button class="btn btn-secondary" id="refreshReviewBtn">🔄 刷新</button>
          </div>
        </div>

        <div class="obs-stats" id="reviewStats">
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">学习收获总数</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#e74c3c;">-</div><div class="stat-label">已过期</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#f39c12;">-</div><div class="stat-label">今日到期</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#3498db;">-</div><div class="stat-label">学习中</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#27ae60;">-</div><div class="stat-label">已掌握</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">累计复习次数</div></div>
        </div>

        <div class="obs-filter-bar">
          <div class="obs-sort">
            <label>复习状态：</label>
            <select id="reviewStatusFilter" class="form-input form-input-sm">
              <option value="">全部</option>
              <option value="due">待复习（含过期）</option>
              <option value="overdue">已过期</option>
              <option value="new">未复习</option>
              <option value="mastered">已掌握</option>
            </select>
          </div>
        </div>

        <div class="learning-review-list" id="learningReviewList">
          <div class="empty-state"><div class="loading-spinner" style="margin:0 auto;"></div></div>
        </div>
      </div>
    `;
    document.getElementById('backToLearningsBtn')?.addEventListener('click', () => this.renderLearnings());
    document.getElementById('todayReviewBtn')?.addEventListener('click', () => this.renderTodayLearningReviews());
    document.getElementById('refreshReviewBtn')?.addEventListener('click', () => this.loadLearningReviews());
    document.getElementById('reviewStatusFilter')?.addEventListener('change', () => this.loadLearningReviews());
    await this.loadLearningReviews();
  },

  async loadLearningReviews() {
    try {
      const statusFilter = document.getElementById('reviewStatusFilter')?.value || '';
      const params = new URLSearchParams();
      if (statusFilter) params.set('reviewStatus', statusFilter);
      const res = await fetch(`/api/reviews/ability/obsidian/learnings/review?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        this.renderReviewStats(data);
        this.renderLearningReviewList(data);
      }
    } catch (e) {
      console.error('加载复习状态失败:', e);
      document.getElementById('learningReviewList').innerHTML = `<div class="empty-state">加载失败: ${UI.escapeHtml(e.message)}</div>`;
    }
  },

  renderReviewStats(data) {
    const s = data.stats || {};
    const statsEl = document.getElementById('reviewStats');
    if (!statsEl) return;
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-value">${s.total || 0}</div><div class="stat-label">学习收获总数</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#e74c3c;">${s.overdue || 0}</div><div class="stat-label">已过期</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#f39c12;">${s.dueToday || 0}</div><div class="stat-label">今日到期</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#3498db;">${s.learning || 0}</div><div class="stat-label">学习中</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#27ae60;">${s.mastered || 0}</div><div class="stat-label">已掌握</div></div>
      <div class="stat-card"><div class="stat-value">${s.totalReviews || 0}</div><div class="stat-label">累计复习次数</div></div>
    `;
  },

  renderLearningReviewList(data) {
    const listEl = document.getElementById('learningReviewList');
    if (!listEl) return;

    const items = data.items || [];
    if (items.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎉</div><div>暂无符合条件的学习收获</div><div style="font-size:13px;color:#888;margin-top:8px;">生成复盘后会自动提取学习收获</div></div>`;
      return;
    }

    const today = data.today || new Date().toISOString().split('T')[0];
    const typeColors = { '新技能': '#3b82f6', '新知识': '#8b5cf6', '新工具': '#10b981', '新方法': '#f59e0b', '新概念': '#ec4899' };

    listEl.innerHTML = items.map(item => {
      const isOverdue = item.isOverdue;
      const isDueToday = item.isDue && !item.isOverdue;
      const reviewInterval = [1, 3, 7, 15, 30, 60];
      const nextInterval = reviewInterval[Math.min(item.reviewCount || 0, 5)];
      return `
      <div class="learning-review-card ${isOverdue ? 'overdue' : isDueToday ? 'due-today' : ''}" data-id="${UI.escapeHtml(item.id)}">
        <div class="lrc-header">
          <span class="lrc-type" style="background:${typeColors[item.type] || '#999'};">${UI.escapeHtml(item.type || '未分类')}</span>
          <span class="lrc-status lrc-status-${item.reviewStatus}">${item.reviewStatus === 'mastered' ? '✅ 已掌握' : item.reviewCount > 0 ? `📖 复习${item.reviewCount}次` : '🆕 未复习'}</span>
          ${item.nextReviewDate ? `<span class="lrc-next ${isOverdue ? 'overdue' : isDueToday ? 'today' : ''}">${isOverdue ? '⚠️ 已过期' : isDueToday ? '⏰ 今日复习' : '📅 下次: ' + item.nextReviewDate}</span>` : ''}
        </div>
        <div class="lrc-title">${UI.escapeHtml(item.title || '')}</div>
        ${item.scenario ? `<div class="lrc-scenario">🎯 ${UI.escapeHtml(item.scenario)}</div>` : ''}
        <div class="lrc-meta">
          <span>📅 学习: ${UI.escapeHtml(item.reviewDate || '')}</span>
          <span>📝 ${UI.escapeHtml(item.sourceReview || '')}</span>
          ${item.lastReviewDate ? `<span>🔄 上次: ${item.lastReviewDate}</span>` : ''}
          <span>⏱️ 下次间隔: ${nextInterval}天</span>
        </div>
        <div class="lrc-actions">
          <button class="btn btn-sm btn-success" onclick="ObsidianReviewsModule.markReviewed('${UI.escapeHtml(item.id)}', 'good')">😊 记住了</button>
          <button class="btn btn-sm btn-warning" onclick="ObsidianReviewsModule.markReviewed('${UI.escapeHtml(item.id)}', 'medium')">🤔 模糊</button>
          <button class="btn btn-sm btn-danger" onclick="ObsidianReviewsModule.markReviewed('${UI.escapeHtml(item.id)}', 'hard')">😫 忘记了</button>
          ${item.reviewCount > 0 ? `<button class="btn btn-sm btn-outline" onclick="ObsidianReviewsModule.resetReview('${UI.escapeHtml(item.id)}')">↺ 重置</button>` : ''}
        </div>
      </div>
    `}).join('');
  },

  // 今日待复习视图
  async renderTodayLearningReviews() {
    this.currentView = 'today-learning-review';
    this.stopAutoRefresh();
    this.container.innerHTML = `
      <div class="obs-container">
        <div class="obs-header">
          <div>
            <h2>📋 今日待复习</h2>
            <p>基于艾宾浩斯遗忘曲线，今天需要复习的学习收获</p>
          </div>
          <div class="obs-header-actions">
            <button class="btn btn-secondary" id="backToReviewBtn">← 返回复习列表</button>
            <button class="btn btn-secondary" id="refreshTodayReviewBtn">🔄 刷新</button>
          </div>
        </div>

        <div class="obs-stats" id="todayReviewStats">
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">今日待复习</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#e74c3c;">-</div><div class="stat-label">已过期</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#f39c12;">-</div><div class="stat-label">今日到期</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">学习收获总数</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#27ae60;">-</div><div class="stat-label">已掌握</div></div>
        </div>

        <div class="today-review-list" id="todayReviewList">
          <div class="empty-state"><div class="loading-spinner" style="margin:0 auto;"></div></div>
        </div>
      </div>
    `;
    document.getElementById('backToReviewBtn')?.addEventListener('click', () => this.renderLearningReview());
    document.getElementById('refreshTodayReviewBtn')?.addEventListener('click', () => this.renderTodayLearningReviews());

    try {
      const res = await fetch('/api/reviews/ability/obsidian/learnings/review/today');
      const data = await res.json();
      if (data.success) {
        this.renderTodayReviewStats(data);
        this.renderTodayReviewList(data);
      }
    } catch (e) {
      document.getElementById('todayReviewList').innerHTML = `<div class="empty-state">加载失败: ${UI.escapeHtml(e.message)}</div>`;
    }
  },

  renderTodayReviewStats(data) {
    const s = data.stats || {};
    const statsEl = document.getElementById('todayReviewStats');
    if (!statsEl) return;
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-value">${data.total || 0}</div><div class="stat-label">今日待复习</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#e74c3c;">${s.overdue || 0}</div><div class="stat-label">已过期</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#f39c12;">${s.dueToday || 0}</div><div class="stat-label">今日到期</div></div>
      <div class="stat-card"><div class="stat-value">${s.total || 0}</div><div class="stat-label">学习收获总数</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#27ae60;">${s.mastered || 0}</div><div class="stat-label">已掌握</div></div>
    `;
  },

  renderTodayReviewList(data) {
    const listEl = document.getElementById('todayReviewList');
    if (!listEl) return;

    const items = data.items || [];
    if (items.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎉</div><div>今日没有待复习的学习收获</div><div style="font-size:13px;color:#888;margin-top:8px;">继续保持，明天再来看看</div></div>`;
      return;
    }

    const typeColors = { '新技能': '#3b82f6', '新知识': '#8b5cf6', '新工具': '#10b981', '新方法': '#f59e0b', '新概念': '#ec4899' };

    listEl.innerHTML = items.map(item => {
      const isOverdue = item.isOverdue;
      return `
      <div class="today-review-card ${isOverdue ? 'overdue' : 'due-today'}" data-id="${UI.escapeHtml(item.id)}">
        <div class="trc-header">
          <span class="trc-type" style="background:${typeColors[item.type] || '#999'};">${UI.escapeHtml(item.type || '未分类')}</span>
          <span class="trc-priority">${isOverdue ? '🔴 已过期' : '🟡 今日到期'}</span>
          ${item.reviewCount > 0 ? `<span class="trc-count">已复习${item.reviewCount}次</span>` : '<span class="trc-count">首次复习</span>'}
        </div>
        <div class="trc-title">${UI.escapeHtml(item.title || '')}</div>
        ${item.scenario ? `<div class="trc-scenario">🎯 ${UI.escapeHtml(item.scenario)}</div>` : ''}
        ${item.evidence ? `<div class="trc-evidence">📝 ${UI.escapeHtml(item.evidence.substring(0, 150))}${item.evidence.length > 150 ? '...' : ''}</div>` : ''}
        <div class="trc-meta">
          <span>📅 学习: ${UI.escapeHtml(item.reviewDate || '')}</span>
          <span>📝 ${UI.escapeHtml(item.sourceReview || '')}</span>
        </div>
        <div class="trc-actions">
          <button class="btn btn-sm btn-success" onclick="ObsidianReviewsModule.markReviewedToday('${UI.escapeHtml(item.id)}', 'good')">😊 记住了</button>
          <button class="btn btn-sm btn-warning" onclick="ObsidianReviewsModule.markReviewedToday('${UI.escapeHtml(item.id)}', 'medium')">🤔 模糊</button>
          <button class="btn btn-sm btn-danger" onclick="ObsidianReviewsModule.markReviewedToday('${UI.escapeHtml(item.id)}', 'hard')">😫 忘记了</button>
        </div>
      </div>
    `}).join('');
  },

  // 标记复习完成
  async markReviewed(id, quality) {
    try {
      const res = await fetch('/api/reviews/ability/obsidian/learnings/review/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, quality })
      });
      const data = await res.json();
      if (data.success) {
        this.loadLearningReviews();
      } else {
        alert('标记失败: ' + (data.error || '未知错误'));
      }
    } catch (e) {
      alert('标记失败: ' + e.message);
    }
  },

  // 今日复习页面标记完成
  async markReviewedToday(id, quality) {
    try {
      const res = await fetch('/api/reviews/ability/obsidian/learnings/review/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, quality })
      });
      const data = await res.json();
      if (data.success) {
        this.renderTodayLearningReviews();
      } else {
        alert('标记失败: ' + (data.error || '未知错误'));
      }
    } catch (e) {
      alert('标记失败: ' + e.message);
    }
  },

  // 重置复习状态
  async resetReview(id) {
    if (!confirm('确定要重置这个学习收获的复习状态吗？')) return;
    try {
      const res = await fetch('/api/reviews/ability/obsidian/learnings/review/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        this.loadLearningReviews();
      } else {
        alert('重置失败: ' + (data.error || '未知错误'));
      }
    } catch (e) {
      alert('重置失败: ' + e.message);
    }
  },

  // ========== 复盘质量评分视图 ==========
  async renderQualityOverview() {
    this.currentView = 'quality-overview';
    this.stopAutoRefresh();
    this.container.innerHTML = `
      <div class="obs-container">
        <div class="obs-header">
          <div>
            <h2>📊 复盘质量评分</h2>
            <p>自动评估复盘文档质量，五维度评分（内容完整性/证据充分性/行动可执行性/学习深度/问题分析深度）</p>
          </div>
          <div class="obs-header-actions">
            <button class="btn btn-secondary" id="backToListBtn6">← 返回列表</button>
            <button class="btn btn-secondary" id="refreshQualityBtn">🔄 刷新</button>
          </div>
        </div>

        <div class="obs-stats" id="qualityStats">
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">复盘总数</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">平均质量分</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#10b981;">-</div><div class="stat-label">A+优秀</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#84cc16;">-</div><div class="stat-label">B中等</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#f59e0b;">-</div><div class="stat-label">C及格</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#ef4444;">-</div><div class="stat-label">D/E待改进</div></div>
        </div>

        <div id="qualityContent">
          <div class="empty-state"><div class="loading-spinner" style="margin:0 auto;"></div></div>
        </div>
      </div>
    `;
    document.getElementById('backToListBtn6')?.addEventListener('click', () => this.renderReviews());
    document.getElementById('refreshQualityBtn')?.addEventListener('click', () => this.loadQualityOverview());
    await this.loadQualityOverview();
  },

  async loadQualityOverview() {
    try {
      const res = await fetch('/api/reviews/ability/obsidian/quality');
      const data = await res.json();
      if (data.success) {
        this.renderQualityStats(data);
        this.renderQualityContent(data);
      }
    } catch (e) {
      document.getElementById('qualityContent').innerHTML = `<div class="empty-state">加载失败: ${UI.escapeHtml(e.message)}</div>`;
    }
  },

  renderQualityStats(data) {
    const d = data.distribution || {};
    const statsEl = document.getElementById('qualityStats');
    if (!statsEl) return;
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-value">${data.total || 0}</div><div class="stat-label">复盘总数</div></div>
      <div class="stat-card"><div class="stat-value">${data.avgScore || 0}</div><div class="stat-label">平均质量分</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#10b981;">${(d['A+'] || 0) + (d['A'] || 0)}</div><div class="stat-label">A优秀</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#84cc16;">${d['B'] || 0}</div><div class="stat-label">B中等</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#f59e0b;">${d['C'] || 0}</div><div class="stat-label">C及格</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#ef4444;">${(d['D'] || 0) + (d['E'] || 0)}</div><div class="stat-label">D/E待改进</div></div>
    `;
  },

  renderQualityContent(data) {
    const contentEl = document.getElementById('qualityContent');
    if (!contentEl) return;

    if (data.total === 0) {
      contentEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📊</div><div>暂无复盘数据</div></div>`;
      return;
    }

    const avgDims = data.avgDimensions || {};
    const dimNames = {
      completeness: '内容完整性',
      evidence: '证据充分性',
      actionability: '行动可执行性',
      learningDepth: '学习深度',
      problemDepth: '问题分析深度'
    };

    contentEl.innerHTML = `
      <!-- 平均维度得分 -->
      <div class="summary-section">
        <h3>📈 平均维度得分</h3>
        <div class="quality-dimensions">
          ${Object.entries(dimNames).map(([key, name]) => {
            const score = avgDims[key] || 0;
            const percentage = (score / 20) * 100;
            const color = score >= 16 ? '#10b981' : score >= 12 ? '#84cc16' : score >= 8 ? '#f59e0b' : '#ef4444';
            return `
              <div class="quality-dim-item">
                <div class="qdim-header">
                  <span class="qdim-name">${name}</span>
                  <span class="qdim-score" style="color:${color};">${score}/20</span>
                </div>
                <div class="qdim-bar">
                  <div class="qdim-bar-fill" style="width:${percentage}%;background:${color};"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- 最需要改进的复盘 -->
      ${(data.needImprovement || []).length > 0 ? `
      <div class="summary-section">
        <h3>⚠️ 最需要改进的复盘 (${data.needImprovement.length})</h3>
        <div class="quality-improvement-list">
          ${(data.needImprovement || []).map(item => `
            <div class="quality-improvement-card" data-path="${UI.escapeHtml(item.path)}">
              <div class="qic-header">
                <span class="qic-grade" style="background:${item.gradeColor};color:white;">${item.grade}</span>
                <span class="qic-title">${UI.escapeHtml(item.title)}</span>
                <span class="qic-score">${item.totalScore}分</span>
              </div>
              <div class="qic-date">📅 ${UI.escapeHtml(item.date)}</div>
              ${(item.suggestions || []).length > 0 ? `
                <div class="qic-suggestions">
                  ${item.suggestions.slice(0, 3).map(s => `<div class="qic-suggestion">💡 ${UI.escapeHtml(s)}</div>`).join('')}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>` : ''}

      <!-- 所有复盘质量列表 -->
      <div class="summary-section">
        <h3>📋 所有复盘质量评分</h3>
        <div class="quality-list">
          ${(data.scores || []).map(item => `
            <div class="quality-list-item" data-path="${UI.escapeHtml(item.path)}">
              <div class="qli-grade" style="background:${item.gradeColor};">${item.grade}</div>
              <div class="qli-info">
                <div class="qli-title">${UI.escapeHtml(item.title)}</div>
                <div class="qli-meta">
                  <span>📅 ${UI.escapeHtml(item.date)}</span>
                  <span>📊 ${item.totalScore}分</span>
                  <span class="qli-desc">${UI.escapeHtml(item.gradeDesc)}</span>
                </div>
              </div>
              <div class="qli-mini-bars">
                ${(item.dimensions || []).map(d => {
                  const pct = (d.score / d.max) * 100;
                  return `<div class="qli-mini-bar" title="${d.name}: ${d.score}/${d.max}"><div class="qli-mini-fill" style="width:${pct}%;"></div></div>`;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // 绑定点击事件
    contentEl.querySelectorAll('.quality-improvement-card, .quality-list-item').forEach(card => {
      card.addEventListener('click', () => {
        const path = card.getAttribute('data-path');
        if (path) this.renderDetail(path);
      });
    });
  },

  // ========== 能力雷达图视图 ==========
  async renderAbilityRadar() {
    this.currentView = 'ability-radar';
    this.stopAutoRefresh();
    this.container.innerHTML = `
      <div class="obs-container">
        <div class="obs-header">
          <div>
            <h2>🎯 能力雷达图</h2>
            <p>六维度AI使用能力评估：目标清晰度/上下文提供/约束明确度/迭代效率/工具利用/结果验证</p>
          </div>
          <div class="obs-header-actions">
            <button class="btn btn-secondary" id="backToListBtn7">← 返回列表</button>
            <button class="btn btn-secondary" id="refreshRadarBtn">🔄 刷新</button>
          </div>
        </div>

        <div class="obs-stats" id="radarStats">
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">有效复盘数</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">综合能力分</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#10b981;">-</div><div class="stat-label">最强维度</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#ef4444;">-</div><div class="stat-label">最弱维度</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#3b82f6;">-</div><div class="stat-label">上升维度</div></div>
          <div class="stat-card"><div class="stat-value" style="color:#f59e0b;">-</div><div class="stat-label">下降维度</div></div>
        </div>

        <div class="radar-layout">
          <div class="radar-chart-container">
            <h3>📊 能力雷达图（平均）</h3>
            <div id="radarChart" class="radar-chart"></div>
          </div>
          <div class="radar-details-container">
            <h3>📈 维度详情与趋势</h3>
            <div id="radarDetails" class="radar-details"></div>
          </div>
        </div>

        <div class="radar-history-section">
          <h3>📋 历史能力评分</h3>
          <div id="radarHistory" class="radar-history"></div>
        </div>
      </div>
    `;
    document.getElementById('backToListBtn7')?.addEventListener('click', () => this.renderInsights());
    document.getElementById('refreshRadarBtn')?.addEventListener('click', () => this.loadAbilityRadar());
    await this.loadAbilityRadar();
  },

  async loadAbilityRadar() {
    try {
      const res = await fetch('/api/reviews/ability/obsidian/ability-radar');
      const data = await res.json();
      if (data.success) {
        this.renderRadarStats(data);
        this.renderRadarChart(data);
        this.renderRadarDetails(data);
        this.renderRadarHistory(data);
      }
    } catch (e) {
      document.getElementById('radarChart').innerHTML = `<div class="empty-state">加载失败: ${UI.escapeHtml(e.message)}</div>`;
    }
  },

  renderRadarStats(data) {
    const dims = data.dimensions || [];
    const avg = data.average || {};
    const trend = data.trend || {};

    // 最强/最弱维度
    let strongest = null, weakest = null;
    dims.forEach(d => {
      const score = avg[d.id] || 0;
      if (!strongest || score > strongest.score) strongest = { ...d, score };
      if (!weakest || score < weakest.score) weakest = { ...d, score };
    });

    // 上升/下降维度
    const upDims = dims.filter(d => trend[d.id]?.direction === 'up');
    const downDims = dims.filter(d => trend[d.id]?.direction === 'down');

    const statsEl = document.getElementById('radarStats');
    if (!statsEl) return;
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-value">${data.total || 0}</div><div class="stat-label">有效复盘数</div></div>
      <div class="stat-card"><div class="stat-value">${data.totalAvg || 0}</div><div class="stat-label">综合能力分</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#10b981;">${strongest ? strongest.name : '-'}</div><div class="stat-label">最强维度 (${strongest ? strongest.score : 0}分)</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#ef4444;">${weakest ? weakest.name : '-'}</div><div class="stat-label">最弱维度 (${weakest ? weakest.score : 0}分)</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#3b82f6;">${upDims.length}</div><div class="stat-label">上升维度</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#f59e0b;">${downDims.length}</div><div class="stat-label">下降维度</div></div>
    `;
  },

  renderRadarChart(data) {
    const container = document.getElementById('radarChart');
    if (!container) return;

    const dims = data.dimensions || [];
    const avg = data.average || {};
    const n = dims.length;
    if (n === 0) {
      container.innerHTML = `<div class="empty-state">暂无数据</div>`;
      return;
    }

    const size = 360;
    const center = size / 2;
    const radius = size / 2 - 50;
    const levels = 5;

    // 计算每个维度的角度
    const angles = dims.map((_, i) => (Math.PI * 2 * i / n) - Math.PI / 2);

    // 生成SVG
    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="radar-svg">`;

    // 绘制背景网格（同心圆）
    for (let level = 1; level <= levels; level++) {
      const r = (radius / levels) * level;
      const points = angles.map(angle => {
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return `${x},${y}`;
      }).join(' ');
      svg += `<polygon points="${points}" fill="none" stroke="#e5e7eb" stroke-width="1"/>`;
    }

    // 绘制轴线
    angles.forEach((angle, i) => {
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);
      svg += `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
    });

    // 绘制数据多边形（平均）
    const dataPoints = angles.map((angle, i) => {
      const score = avg[dims[i].id] || 0;
      const r = (score / 5) * radius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      return `${x},${y}`;
    }).join(' ');
    svg += `<polygon points="${dataPoints}" fill="rgba(59, 130, 246, 0.2)" stroke="#3b82f6" stroke-width="2"/>`;

    // 绘制数据点
    angles.forEach((angle, i) => {
      const score = avg[dims[i].id] || 0;
      const r = (score / 5) * radius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      svg += `<circle cx="${x}" cy="${y}" r="4" fill="#3b82f6" stroke="white" stroke-width="2"/>`;
    });

    // 绘制维度标签
    dims.forEach((dim, i) => {
      const angle = angles[i];
      const labelR = radius + 25;
      const x = center + labelR * Math.cos(angle);
      const y = center + labelR * Math.sin(angle);
      const score = avg[dim.id] || 0;
      const anchor = Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end');
      svg += `<text x="${x}" y="${y - 6}" text-anchor="${anchor}" class="radar-label">${dim.name}</text>`;
      svg += `<text x="${x}" y="${y + 10}" text-anchor="${anchor}" class="radar-score-label">${score}分</text>`;
    });

    svg += `</svg>`;
    container.innerHTML = svg;
  },

  renderRadarDetails(data) {
    const container = document.getElementById('radarDetails');
    if (!container) return;

    const dims = data.dimensions || [];
    const avg = data.average || {};
    const trend = data.trend || {};

    container.innerHTML = dims.map(dim => {
      const score = avg[dim.id] || 0;
      const percentage = (score / 5) * 100;
      const t = trend[dim.id] || {};
      const trendIcon = t.direction === 'up' ? '📈' : t.direction === 'down' ? '📉' : '➡️';
      const trendColor = t.direction === 'up' ? '#10b981' : t.direction === 'down' ? '#ef4444' : '#9ca3af';
      const barColor = score >= 4 ? '#10b981' : score >= 3 ? '#84cc16' : score >= 2 ? '#f59e0b' : '#ef4444';

      return `
        <div class="radar-dim-detail">
          <div class="rdim-header">
            <span class="rdim-name">${dim.name}</span>
            <span class="rdim-score" style="color:${barColor};">${score}/5</span>
            <span class="rdim-trend" style="color:${trendColor};">${trendIcon} ${t.diff > 0 ? '+' : ''}${t.diff || 0}</span>
          </div>
          <div class="rdim-bar">
            <div class="rdim-bar-fill" style="width:${percentage}%;background:${barColor};"></div>
          </div>
          <div class="rdim-desc">${dim.desc}</div>
          ${t.recent > 0 ? `<div class="rdim-compare">近期: ${t.recent}分 vs 前期: ${t.earlier}分</div>` : ''}
        </div>
      `;
    }).join('');
  },

  renderRadarHistory(data) {
    const container = document.getElementById('radarHistory');
    if (!container) return;

    const history = data.history || [];
    if (history.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div><div>暂无历史能力评分数据</div><div style="font-size:13px;color:#888;margin-top:8px;">复盘文档中包含六维度评分时会自动提取</div></div>`;
      return;
    }

    const dims = data.dimensions || [];

    container.innerHTML = `
      <div class="radar-history-table">
        <div class="rht-header">
          <div class="rht-col rht-date">日期</div>
          <div class="rht-col rht-title">复盘标题</div>
          ${dims.map(d => `<div class="rht-col rht-dim">${d.name.substring(0, 4)}</div>`).join('')}
          <div class="rht-col rht-avg">平均</div>
        </div>
        ${history.slice().reverse().map(h => {
          const scores = dims.map(d => h.scores[d.id] || 0);
          const avg = scores.reduce((a, b) => a + b, 0) / dims.length;
          const avgScore = Math.round(avg * 10) / 10;
          return `
            <div class="rht-row" data-path="${UI.escapeHtml(h.path)}">
              <div class="rht-col rht-date">${UI.escapeHtml(h.date)}</div>
              <div class="rht-col rht-title">${UI.escapeHtml(h.title)}</div>
              ${scores.map(s => {
                const color = s >= 4 ? '#10b981' : s >= 3 ? '#84cc16' : s >= 2 ? '#f59e0b' : s > 0 ? '#ef4444' : '#d1d5db';
                return `<div class="rht-col rht-dim" style="color:${color};font-weight:600;">${s || '-'}</div>`;
              }).join('')}
              <div class="rht-col rht-avg" style="font-weight:700;">${avgScore}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // 绑定点击事件
    container.querySelectorAll('.rht-row').forEach(row => {
      row.addEventListener('click', () => {
        const path = row.getAttribute('data-path');
        if (path) this.renderDetail(path);
      });
    });
  },

  // ========== AI月度成长报告视图 ==========
  async renderMonthlyReport() {
    this.currentView = 'monthly-report';
    this.stopAutoRefresh();

    // 默认选择上个月
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const defaultMonth = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

    this.container.innerHTML = `
      <div class="obs-container">
        <div class="obs-header">
          <div>
            <h2>📝 AI月度成长报告</h2>
            <p>基于月度复盘数据，AI自动生成结构化成长报告</p>
          </div>
          <div class="obs-header-actions">
            <button class="btn btn-secondary" id="backToListBtn8">← 返回列表</button>
          </div>
        </div>

        <div class="monthly-controls">
          <label>选择月份：</label>
          <input type="month" id="monthSelect" class="form-input form-input-sm" value="${defaultMonth}">
          <button class="btn btn-primary" id="loadMonthlyDataBtn">📊 查看数据</button>
          <button class="btn btn-success" id="generateReportBtn">🤖 AI生成报告</button>
        </div>

        <div id="monthlyDataSection" style="display:none;">
          <div class="obs-stats" id="monthlyStats"></div>
          <div class="monthly-data-grid">
            <div class="monthly-data-card">
              <h3>⚠️ 问题模式 TOP5</h3>
              <div id="monthlyPatterns"></div>
            </div>
            <div class="monthly-data-card">
              <h3>📚 学习收获 TOP5</h3>
              <div id="monthlyLearnings"></div>
            </div>
          </div>
        </div>

        <div id="monthlyReportSection" style="display:none;">
          <div class="report-header">
            <h3>🤖 AI生成的月度成长报告</h3>
            <button class="btn btn-secondary btn-sm" id="copyReportBtn">📋 复制报告</button>
          </div>
          <div class="report-content" id="reportContent"></div>
        </div>

        <div id="monthlyLoading" style="display:none;">
          <div class="empty-state">
            <div class="loading-spinner" style="margin:0 auto;"></div>
            <div style="margin-top:16px;font-size:14px;color:#666;">AI正在生成报告，请稍候（约10-30秒）...</div>
          </div>
        </div>

        <div id="monthlyEmpty" class="empty-state">
          <div class="empty-state-icon">📝</div>
          <div class="empty-state-text">选择月份后点击"查看数据"或"AI生成报告"</div>
        </div>
      </div>
    `;

    document.getElementById('backToListBtn8')?.addEventListener('click', () => this.renderReviews());
    document.getElementById('loadMonthlyDataBtn')?.addEventListener('click', () => this.loadMonthlyData());
    document.getElementById('generateReportBtn')?.addEventListener('click', () => this.generateMonthlyReport());
    document.getElementById('copyReportBtn')?.addEventListener('click', () => this.copyReport());
  },

  async loadMonthlyData() {
    const month = document.getElementById('monthSelect')?.value;
    if (!month) {
      alert('请选择月份');
      return;
    }

    try {
      const res = await fetch(`/api/reviews/ability/obsidian/monthly/data?month=${month}`);
      const data = await res.json();

      document.getElementById('monthlyEmpty').style.display = 'none';
      document.getElementById('monthlyReportSection').style.display = 'none';

      if (!data.success || data.total === 0) {
        document.getElementById('monthlyDataSection').style.display = 'none';
        document.getElementById('monthlyEmpty').innerHTML = `
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-text">${month} 没有复盘记录</div>
          <div style="font-size:13px;color:#888;margin-top:8px;">生成复盘后才能查看月度数据</div>
        `;
        document.getElementById('monthlyEmpty').style.display = 'flex';
        return;
      }

      this.renderMonthlyStats(data);
      this.renderMonthlyPatterns(data);
      this.renderMonthlyLearnings(data);
      document.getElementById('monthlyDataSection').style.display = 'block';
    } catch (e) {
      alert('加载失败: ' + e.message);
    }
  },

  renderMonthlyStats(data) {
    const s = data.stats || {};
    const statsEl = document.getElementById('monthlyStats');
    if (!statsEl) return;
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-value">${data.total || 0}</div><div class="stat-label">复盘数量</div></div>
      <div class="stat-card"><div class="stat-value">${s.avgScore || 0}</div><div class="stat-label">平均评分</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#ef4444;">${s.totalProblems || 0}</div><div class="stat-label">总问题数</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#10b981;">${s.totalGoodPractices || 0}</div><div class="stat-label">好做法</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#3b82f6;">${s.totalPrompts || 0}</div><div class="stat-label">可复用Prompt</div></div>
      <div class="stat-card"><div class="stat-value">${s.completionRate || 0}%</div><div class="stat-label">完成率</div></div>
    `;
  },

  renderMonthlyPatterns(data) {
    const container = document.getElementById('monthlyPatterns');
    if (!container) return;
    const patterns = data.patternStats || [];
    if (patterns.length === 0) {
      container.innerHTML = '<div class="empty-text">暂无问题模式数据</div>';
      return;
    }
    container.innerHTML = patterns.slice(0, 5).map((p, i) => `
      <div class="monthly-pattern-item">
        <span class="mp-rank">#${i + 1}</span>
        <span class="mp-name">${UI.escapeHtml(p.name)}</span>
        <span class="mp-count">${p.count}次</span>
        <span class="mp-wasted">浪费${p.wastedTurns}轮</span>
      </div>
    `).join('');
  },

  renderMonthlyLearnings(data) {
    const container = document.getElementById('monthlyLearnings');
    if (!container) return;
    const learnings = data.learnings || [];
    if (learnings.length === 0) {
      container.innerHTML = '<div class="empty-text">暂无学习收获</div>';
      return;
    }
    const typeColors = { '新技能': '#3b82f6', '新知识': '#8b5cf6', '新工具': '#10b981', '新方法': '#f59e0b', '新概念': '#ec4899' };
    container.innerHTML = learnings.slice(0, 5).map(l => `
      <div class="monthly-learning-item">
        <span class="ml-type" style="background:${typeColors[l.type] || '#999'};">${UI.escapeHtml(l.type || '未分类')}</span>
        <span class="ml-title">${UI.escapeHtml(l.title || '')}</span>
      </div>
    `).join('');
  },

  async generateMonthlyReport() {
    const month = document.getElementById('monthSelect')?.value;
    if (!month) {
      alert('请选择月份');
      return;
    }

    document.getElementById('monthlyEmpty').style.display = 'none';
    document.getElementById('monthlyDataSection').style.display = 'none';
    document.getElementById('monthlyReportSection').style.display = 'none';
    document.getElementById('monthlyLoading').style.display = 'block';

    try {
      const res = await fetch('/api/reviews/ability/obsidian/monthly/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month })
      });
      const data = await res.json();

      document.getElementById('monthlyLoading').style.display = 'none';

      if (data.success && data.content) {
        this._currentReportContent = data.content;
        const html = this.renderMarkdown(data.content);
        document.getElementById('reportContent').innerHTML = `<div class="markdown-body">${html}</div>`;
        document.getElementById('monthlyReportSection').style.display = 'block';
      } else {
        document.getElementById('monthlyEmpty').innerHTML = `
          <div class="empty-state-icon">❌</div>
          <div class="empty-state-text">生成失败</div>
          <div style="font-size:13px;color:#888;margin-top:8px;">${data.error || '未知错误'}</div>
        `;
        document.getElementById('monthlyEmpty').style.display = 'flex';
      }
    } catch (e) {
      document.getElementById('monthlyLoading').style.display = 'none';
      document.getElementById('monthlyEmpty').innerHTML = `
        <div class="empty-state-icon">❌</div>
        <div class="empty-state-text">生成失败</div>
        <div style="font-size:13px;color:#888;margin-top:8px;">${e.message}</div>
      `;
      document.getElementById('monthlyEmpty').style.display = 'flex';
    }
  },

  copyReport() {
    if (!this._currentReportContent) {
      alert('没有可复制的报告内容');
      return;
    }
    navigator.clipboard.writeText(this._currentReportContent).then(() => {
      const btn = document.getElementById('copyReportBtn');
      if (btn) {
        btn.textContent = '✓ 已复制';
        setTimeout(() => { btn.textContent = '📋 复制报告'; }, 2000);
      }
    }).catch(() => {
      alert('复制失败，请手动复制');
    });
  },

  // ========== 项目聚合视图 ==========
  async renderProjects() {
    this.currentView = 'projects';
    this.container.innerHTML = `
      <div class="obs-container">
        <div class="obs-header">
          <div>
            <h2>📁 项目聚合视图</h2>
            <p>按项目名聚合复盘，查看每个项目的整体进度和能力变化</p>
          </div>
          <div class="obs-header-actions">
            <button class="btn btn-secondary" id="backToListBtn4">← 返回列表</button>
            <button class="btn btn-secondary" id="refreshProjectsBtn">🔄 刷新</button>
          </div>
        </div>

        <div class="obs-stats" id="projectsStats">
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">项目总数</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">复盘总数</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">总问题数</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">好做法</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">可复用Prompt</div></div>
          <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">平均评分</div></div>
        </div>

        <div class="projects-grid" id="projectsGrid">
          <div class="loading">加载中...</div>
        </div>
      </div>
    `;

    document.getElementById('backToListBtn4')?.addEventListener('click', () => this.renderReviews());
    document.getElementById('refreshProjectsBtn')?.addEventListener('click', () => this.renderProjects());

    try {
      const response = await fetch('/api/reviews/ability/obsidian/projects');
      const data = await response.json();
      if (data.success) {
        this.renderProjectList(data);
      } else {
        document.getElementById('projectsGrid').innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><div>加载失败: ${data.error}</div></div>`;
      }
    } catch (err) {
      document.getElementById('projectsGrid').innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><div>加载失败: ${err.message}</div></div>`;
    }

    // 启动自动刷新
    this.startAutoRefresh();
  },

  renderProjectList(data) {
    const projects = data.projects || [];
    const totalReviews = projects.reduce((sum, p) => sum + p.reviewCount, 0);
    const totalProblems = projects.reduce((sum, p) => sum + p.totalProblems, 0);
    const totalGoodPractices = projects.reduce((sum, p) => sum + p.totalGoodPractices, 0);
    const totalPrompts = projects.reduce((sum, p) => sum + p.totalPrompts, 0);
    const avgScore = totalReviews > 0 ? Math.round((projects.reduce((sum, p) => sum + p.avgScore * p.reviewCount, 0) / totalReviews) * 10) / 10 : 0;

    // 更新统计
    const statsEl = document.getElementById('projectsStats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat-card"><div class="stat-value">${projects.length}</div><div class="stat-label">项目总数</div></div>
        <div class="stat-card"><div class="stat-value">${totalReviews}</div><div class="stat-label">复盘总数</div></div>
        <div class="stat-card"><div class="stat-value">${totalProblems}</div><div class="stat-label">总问题数</div></div>
        <div class="stat-card"><div class="stat-value">${totalGoodPractices}</div><div class="stat-label">好做法</div></div>
        <div class="stat-card"><div class="stat-value">${totalPrompts}</div><div class="stat-label">可复用Prompt</div></div>
        <div class="stat-card"><div class="stat-value">${avgScore}</div><div class="stat-label">平均评分</div></div>
      `;
    }

    const gridEl = document.getElementById('projectsGrid');
    if (projects.length === 0) {
      gridEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><div>暂无项目数据</div></div>`;
      return;
    }

    gridEl.innerHTML = projects.map(project => `
      <div class="project-card" data-project="${UI.escapeHtml(project.name)}">
        <div class="project-card-header">
          <h3 class="project-name">📁 ${UI.escapeHtml(project.name)}</h3>
          <span class="project-review-count">${project.reviewCount} 个复盘</span>
        </div>
        <div class="project-card-stats">
          <div class="project-stat">
            <span class="project-stat-label">平均评分</span>
            <span class="project-stat-value score-${project.avgScore >= 4 ? 'high' : project.avgScore >= 3 ? 'medium' : 'low'}">${project.avgScore}</span>
          </div>
          <div class="project-stat">
            <span class="project-stat-label">问题数</span>
            <span class="project-stat-value">${project.totalProblems}</span>
          </div>
          <div class="project-stat">
            <span class="project-stat-label">好做法</span>
            <span class="project-stat-value">${project.totalGoodPractices}</span>
          </div>
          <div class="project-stat">
            <span class="project-stat-label">Prompt</span>
            <span class="project-stat-value">${project.totalPrompts}</span>
          </div>
        </div>
        <div class="project-card-footer">
          <span class="project-date-span">📅 ${UI.escapeHtml(project.dateSpan)}</span>
          <button class="btn btn-primary btn-sm project-detail-btn">查看详情 →</button>
        </div>
      </div>
    `).join('');

    // 绑定点击事件
    gridEl.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', () => {
        const projectName = card.getAttribute('data-project');
        this.renderProjectDetail(projectName);
      });
    });
  },

  async renderProjectDetail(projectName) {
    this.currentView = 'project-detail';
    this._currentProjectName = projectName;
    this.container.innerHTML = `
      <div class="obs-container">
        <div class="obs-header">
          <div>
            <h2>📁 ${UI.escapeHtml(projectName)}</h2>
            <p>项目复盘详情、能力变化趋势、问题模式分布</p>
          </div>
          <div class="obs-header-actions">
            <button class="btn btn-secondary" id="backToProjectsBtn">← 返回项目列表</button>
          </div>
        </div>

        <div id="projectDetailContent">
          <div class="loading">加载中...</div>
        </div>
      </div>
    `;

    document.getElementById('backToProjectsBtn')?.addEventListener('click', () => this.renderProjects());

    try {
      const encodedName = encodeURIComponent(projectName);
      const response = await fetch(`/api/reviews/ability/obsidian/projects/${encodedName}`);
      const data = await response.json();
      if (data.success) {
        this.renderProjectDetailContent(data);
      } else {
        document.getElementById('projectDetailContent').innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><div>加载失败: ${data.error}</div></div>`;
      }
    } catch (err) {
      document.getElementById('projectDetailContent').innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><div>加载失败: ${err.message}</div></div>`;
    }

    // 启动自动刷新
    this.startAutoRefresh();
  },

  renderProjectDetailContent(data) {
    const contentEl = document.getElementById('projectDetailContent');

    // 问题模式统计
    const patterns = Object.entries(data.patternStats || {}).sort((a, b) => b[1].count - a[1].count);

    // 评分趋势（简单的文本展示，后续可以加图表）
    const scoreTrend = data.scoreTrend || [];
    const trendHtml = scoreTrend.length > 0 ? `
      <div class="score-trend">
        ${scoreTrend.map((item, i) => `
          <div class="trend-item">
            <span class="trend-date">${item.date}</span>
            <span class="trend-score score-${item.score >= 4 ? 'high' : item.score >= 3 ? 'medium' : 'low'}">${item.score}分</span>
            <span class="trend-title">${UI.escapeHtml(item.title.substring(0, 30))}</span>
          </div>
        `).join('')}
      </div>
    ` : '<div class="empty-text">暂无评分趋势数据</div>';

    contentEl.innerHTML = `
      <!-- 项目概览统计 -->
      <div class="obs-stats">
        <div class="stat-card"><div class="stat-value">${data.reviewCount}</div><div class="stat-label">复盘总数</div></div>
        <div class="stat-card"><div class="stat-value">${data.avgScore}</div><div class="stat-label">平均评分</div></div>
        <div class="stat-card"><div class="stat-value">${data.totalProblems}</div><div class="stat-label">总问题数</div></div>
        <div class="stat-card"><div class="stat-value">${data.totalGoodPractices}</div><div class="stat-label">好做法</div></div>
        <div class="stat-card"><div class="stat-value">${data.totalPrompts}</div><div class="stat-label">可复用Prompt</div></div>
        <div class="stat-card"><div class="stat-value">${data.firstDate} ~ ${data.lastDate}</div><div class="stat-label">时间跨度</div></div>
      </div>

      <div class="project-detail-grid">
        <!-- 复盘时间线 -->
        <div class="detail-section">
          <h3 class="detail-section-title">📋 复盘时间线</h3>
          <div class="review-timeline">
            ${(data.reviews || []).map(review => `
              <div class="timeline-item" data-path="${UI.escapeHtml(review.path)}">
                <div class="timeline-date">${UI.escapeHtml(review.date)}</div>
                <div class="timeline-content">
                  <div class="timeline-title">${UI.escapeHtml(review.title)}</div>
                  <div class="timeline-meta">
                    <span>⭐ ${review.average_score}分</span>
                    <span>⚠️ ${review.total_problems}问题</span>
                    <span>✅ ${review.total_good_practices}好做法</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- 问题模式分布 -->
        <div class="detail-section">
          <h3 class="detail-section-title">🔍 问题模式分布</h3>
          ${patterns.length > 0 ? `
            <div class="pattern-distribution">
              ${patterns.map(([pattern, stats]) => `
                <div class="pattern-item">
                  <div class="pattern-name">${UI.escapeHtml(pattern)}</div>
                  <div class="pattern-bar">
                    <div class="pattern-bar-fill" style="width: ${Math.min(100, stats.count * 20)}%"></div>
                  </div>
                  <div class="pattern-count">${stats.count}次 · 浪费${stats.totalWastedTurns}轮</div>
                </div>
              `).join('')}
            </div>
          ` : '<div class="empty-text">暂无问题模式数据</div>'}
        </div>

        <!-- 评分变化趋势 -->
        <div class="detail-section">
          <h3 class="detail-section-title">📈 评分变化趋势</h3>
          ${trendHtml}
        </div>

        <!-- 学习收获汇总 -->
        <div class="detail-section">
          <h3 class="detail-section-title">📚 学习收获 (${(data.learnings || []).length})</h3>
          ${(data.learnings || []).length > 0 ? `
            <div class="learning-list-compact">
              ${data.learnings.slice(0, 10).map(l => `
                <div class="learning-item-compact">
                  <span class="learning-type-tag" style="background:${l.type === '新技能' ? '#10b981' : l.type === '新知识' ? '#3b82f6' : l.type === '新方法' ? '#8b5cf6' : '#f59e0b'}">${UI.escapeHtml(l.type || '未分类')}</span>
                  <span class="learning-item-title">${UI.escapeHtml(l.title || '')}</span>
                </div>
              `).join('')}
            </div>
          ` : '<div class="empty-text">暂无学习收获</div>'}
        </div>

        <!-- 行动项汇总 -->
        <div class="detail-section">
          <h3 class="detail-section-title">✅ 行动项 (${(data.actionItems || []).length})</h3>
          ${(data.actionItems || []).length > 0 ? `
            <div class="action-list-compact">
              ${data.actionItems.slice(0, 10).map(item => `
                <div class="action-item-compact">
                  <span class="action-priority priority-${item.priority || 'P1'}">${item.priority || 'P1'}</span>
                  <span class="action-item-text">${UI.escapeHtml((item.action || item.title || '').substring(0, 60))}</span>
                </div>
              `).join('')}
            </div>
          ` : '<div class="empty-text">暂无行动项</div>'}
        </div>
      </div>
    `;

    // 绑定复盘时间线点击事件
    contentEl.querySelectorAll('.timeline-item').forEach(item => {
      item.addEventListener('click', () => {
        const path = item.getAttribute('data-path');
        this.renderDetail(path);
      });
    });
  }
};

App.registerModule('obsidian-reviews', ObsidianReviewsModule);
