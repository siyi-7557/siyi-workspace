// 全局搜索模块 - Ctrl+K
const GlobalSearch = {
  isOpen: false,
  searchTimer: null,
  recentSearches: [],

  init() {
    // 加载最近搜索
    try {
      this.recentSearches = JSON.parse(localStorage.getItem('globalSearchRecent') || '[]');
    } catch (e) {
      this.recentSearches = [];
    }

    // 监听快捷键
    document.addEventListener('keydown', (e) => {
      // Ctrl+K 或 Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.toggle();
      }
      // ESC 关闭
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    // 创建弹窗 DOM
    this.createModal();
  },

  createModal() {
    const modal = document.createElement('div');
    modal.id = 'globalSearchModal';
    modal.className = 'global-search-overlay';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="global-search-container">
        <div class="global-search-header">
          <input type="text" class="global-search-input" id="globalSearchInput" placeholder="搜索笔记、复盘、Prompt、踩坑记录... (ESC 关闭)" autofocus>
          <span class="global-search-shortcut">Ctrl+K</span>
        </div>
        <div class="global-search-body" id="globalSearchBody">
          <div class="global-search-section">
            <div class="global-search-section-title">最近搜索</div>
            <div class="global-search-recent" id="globalSearchRecent"></div>
          </div>
          <div class="global-search-section">
            <div class="global-search-section-title">快速导航</div>
            <div class="global-search-quicknav">
              <div class="global-search-item" data-module="search">
                <span class="gs-icon">🔍</span>
                <span class="gs-text">语义检索</span>
                <span class="gs-hint">搜索笔记</span>
              </div>
              <div class="global-search-item" data-module="agent">
                <span class="gs-icon">🤖</span>
                <span class="gs-text">AI Agent</span>
                <span class="gs-hint">对话助手</span>
              </div>
              <div class="global-search-item" data-module="pitfalls">
                <span class="gs-icon">⚠️</span>
                <span class="gs-text">踩坑知识库</span>
                <span class="gs-hint">查看踩坑记录</span>
              </div>
              <div class="global-search-item" data-module="codex">
                <span class="gs-icon">💬</span>
                <span class="gs-text">会话复盘</span>
                <span class="gs-hint">Codex/豆包对话</span>
              </div>
              <div class="global-search-item" data-module="review">
                <span class="gs-icon">📊</span>
                <span class="gs-text">项目复盘</span>
                <span class="gs-hint">项目管理</span>
              </div>
              <div class="global-search-item" data-module="prompt">
                <span class="gs-icon">📝</span>
                <span class="gs-text">Prompt 库</span>
                <span class="gs-hint">提示词管理</span>
              </div>
            </div>
          </div>
        </div>
        <div class="global-search-footer">
          <span>↑↓ 选择 | Enter 打开 | ESC 关闭</span>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // 点击遮罩关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });

    // 搜索输入
    const input = modal.querySelector('#globalSearchInput');
    input.addEventListener('input', () => {
      clearTimeout(this.searchTimer);
      const q = input.value.trim();
      if (q.length === 0) {
        this.showDefault();
      } else if (q.length >= 2) {
        this.searchTimer = setTimeout(() => this.doSearch(q), 300);
      }
    });

    // 快速导航点击
    modal.querySelectorAll('.global-search-item[data-module]').forEach(item => {
      item.addEventListener('click', () => {
        const module = item.dataset.module;
        this.close();
        App.switchModule(module);
      });
    });

    this.modal = modal;
    this.input = input;
    this.body = modal.querySelector('#globalSearchBody');
    this.recentEl = modal.querySelector('#globalSearchRecent');

    this.renderRecent();
  },

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  },

  open() {
    this.isOpen = true;
    this.modal.style.display = 'flex';
    this.input.value = '';
    this.showDefault();
    setTimeout(() => this.input.focus(), 50);
  },

  close() {
    this.isOpen = false;
    this.modal.style.display = 'none';
  },

  showDefault() {
    this.renderRecent();
    // 显示快速导航（默认已在 DOM 中）
  },

  renderRecent() {
    if (this.recentSearches.length === 0) {
      this.recentEl.innerHTML = '<div class="gs-empty">暂无最近搜索</div>';
      return;
    }
    this.recentEl.innerHTML = this.recentSearches.slice(0, 5).map(q => `
      <div class="global-search-item gs-recent-item" data-query="${UI.escapeHtml(q)}">
        <span class="gs-icon">🕐</span>
        <span class="gs-text">${UI.escapeHtml(q)}</span>
      </div>
    `).join('');

    this.recentEl.querySelectorAll('.gs-recent-item').forEach(item => {
      item.addEventListener('click', () => {
        const q = item.dataset.query;
        this.input.value = q;
        this.doSearch(q);
      });
    });
  },

  addToRecent(q) {
    this.recentSearches = this.recentSearches.filter(s => s !== q);
    this.recentSearches.unshift(q);
    if (this.recentSearches.length > 10) this.recentSearches = this.recentSearches.slice(0, 10);
    try {
      localStorage.setItem('globalSearchRecent', JSON.stringify(this.recentSearches));
    } catch (e) {}
  },

  async doSearch(q) {
    this.addToRecent(q);
    this.body.innerHTML = '<div class="global-search-loading"><div class="loading-spinner" style="margin:0 auto;"></div><div style="margin-top:12px;color:var(--text-muted);">搜索中...</div></div>';

    try {
      // 并行搜索多个来源
      const [notesResult, pitfallsResult] = await Promise.all([
        API.search(q, 8, 'hybrid').catch(() => ({ results: [] })),
        API.request('GET', `/pitfalls?q=${encodeURIComponent(q)}&pageSize=5`).catch(() => ({ pitfalls: [] })),
      ]);

      const notes = notesResult.results || [];
      const pitfalls = pitfallsResult.pitfalls || [];

      if (notes.length === 0 && pitfalls.length === 0) {
        this.body.innerHTML = `
          <div class="global-search-empty">
            <div class="gs-empty-icon">📭</div>
            <div class="gs-empty-text">未找到与「${UI.escapeHtml(q)}」相关的内容</div>
            <div class="gs-empty-hint">试试其他关键词，或在下方快速导航</div>
          </div>
        `;
        return;
      }

      let html = '';

      // 笔记结果
      if (notes.length > 0) {
        html += `
          <div class="global-search-section">
            <div class="global-search-section-title">📄 笔记 (${notes.length})</div>
            <div class="global-search-results">
              ${notes.map(r => `
                <div class="global-search-item gs-result-item" data-type="note" data-path="${UI.escapeHtml(r.filePath)}">
                  <span class="gs-icon">📄</span>
                  <div class="gs-content">
                    <div class="gs-title">${UI.escapeHtml(r.heading || r.filePath.split('/').pop())}</div>
                    <div class="gs-snippet">${UI.escapeHtml(this.extractSnippet(r.content, q, 100))}</div>
                  </div>
                  <span class="gs-score">${(r.score * 100).toFixed(0)}%</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      // 踩坑结果
      if (pitfalls.length > 0) {
        html += `
          <div class="global-search-section">
            <div class="global-search-section-title">⚠️ 踩坑记录 (${pitfalls.length})</div>
            <div class="global-search-results">
              ${pitfalls.map(p => `
                <div class="global-search-item gs-result-item" data-type="pitfall" data-id="${p.id}">
                  <span class="gs-icon">⚠️</span>
                  <div class="gs-content">
                    <div class="gs-title">${UI.escapeHtml(p.title)}</div>
                    <div class="gs-snippet">${UI.escapeHtml((p.problem || p.solution || '').substring(0, 100))}</div>
                  </div>
                  ${p.category ? `<span class="gs-tag">${UI.escapeHtml(p.category)}</span>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      this.body.innerHTML = html;

      // 绑定点击事件
      this.body.querySelectorAll('.gs-result-item').forEach(item => {
        item.addEventListener('click', () => {
          const type = item.dataset.type;
          if (type === 'note') {
            const path = item.dataset.path;
            this.close();
            App.switchModule('search');
            // 延迟显示笔记详情
            setTimeout(() => {
              if (window.SearchModule) {
                SearchModule.showNoteDetail(path);
              }
            }, 300);
          } else if (type === 'pitfall') {
            const id = item.dataset.id;
            this.close();
            App.switchModule('pitfalls');
          }
        });
      });
    } catch (e) {
      this.body.innerHTML = `<div class="global-search-empty"><div class="gs-empty-icon">❌</div><div class="gs-empty-text">搜索失败: ${UI.escapeHtml(e.message)}</div></div>`;
    }
  },

  extractSnippet(content, query, maxLen = 100) {
    if (!content) return '';
    const lower = content.toLowerCase();
    const qLower = query.toLowerCase();
    const idx = lower.indexOf(qLower);
    if (idx === -1) return content.substring(0, maxLen) + '...';
    const start = Math.max(0, idx - 30);
    const end = Math.min(content.length, idx + query.length + 50);
    let snippet = content.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    return snippet;
  }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  GlobalSearch.init();
});
