// Prompt知识库模块
const PromptModule = {
  categories: ['全部'],
  allTags: [],
  currentCategory: '全部',
  currentTag: '',
  filters: { category: '', effect: '', tag: '' },
  prompts: [],

  render(container) {
    container.innerHTML = `
      <div class="prompt-container">
        <div class="prompt-page-header">
          <div class="prompt-page-header-left">
            <h1 class="prompt-page-title">提示词库</h1>
            <p class="prompt-page-subtitle">Your reusable AI workflows, prompts and knowledge.</p>
          </div>
          <button class="prompt-btn prompt-btn-primary" id="newPromptBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>新建</span>
          </button>
        </div>
        <div class="prompt-toolbar-glass">
          <div class="prompt-toolbar">
            <div class="prompt-search-wrapper">
              <svg class="prompt-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input type="text" class="prompt-search-input" id="promptSearch" placeholder="搜索 Prompt 标题、内容或标签...">
            </div>
            <div class="prompt-filter" data-kind="category">
              <button class="prompt-filter-trigger" type="button" data-target="categoryMenu">
                <span class="prompt-filter-value">全部分类</span>
                <svg class="prompt-filter-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div class="prompt-filter-menu" id="categoryMenu">
                <div class="prompt-filter-option active" data-value="" data-label="全部分类">全部分类</div>
              </div>
            </div>
            <div class="prompt-filter" data-kind="effect">
              <button class="prompt-filter-trigger" type="button" data-target="effectMenu">
                <span class="prompt-filter-value">全部效果</span>
                <svg class="prompt-filter-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div class="prompt-filter-menu" id="effectMenu">
                <div class="prompt-filter-option active" data-value="" data-label="全部效果">全部效果</div>
                <div class="prompt-filter-option" data-value="好用" data-label="好用">好用</div>
                <div class="prompt-filter-option" data-value="一般" data-label="一般">一般</div>
                <div class="prompt-filter-option" data-value="踩坑" data-label="踩坑">踩坑</div>
              </div>
            </div>
            <div class="prompt-filter" data-kind="tag">
              <button class="prompt-filter-trigger" type="button" data-target="tagMenu">
                <span class="prompt-filter-value">全部标签</span>
                <svg class="prompt-filter-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div class="prompt-filter-menu" id="tagMenu">
                <div class="prompt-filter-option active" data-value="" data-label="全部标签">全部标签</div>
              </div>
            </div>
            <div class="prompt-toolbar-actions">
              <button class="prompt-btn prompt-btn-outline" id="aiGenBtn">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z"></path></svg>
                <span>AI生成</span>
              </button>
              <button class="prompt-btn prompt-btn-ghost" id="exportBtn" title="导出为JSON">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </button>
            </div>
          </div>
        </div>
        <div class="prompt-grid" id="promptGrid"></div>
      </div>
    `;
    this.loadMeta();
    this.loadPrompts();
    this.bindEvents();
  },

  async loadMeta() {
    try {
      const data = await API.request('GET', '/prompts/meta/stats');
      if (data.categories && data.categories.length > 0) {
        this.categories = ['全部', ...data.categories];
        const catMenu = document.getElementById('categoryMenu');
        if (catMenu) {
          catMenu.innerHTML = '<div class="prompt-filter-option active" data-value="" data-label="全部分类">全部分类</div>' +
            data.categories.map(c => `<div class="prompt-filter-option" data-value="${UI.escapeHtml(c)}" data-label="${UI.escapeHtml(c)}">${UI.escapeHtml(c)}</div>`).join('');
        }
      }
      if (data.tags && data.tags.length > 0) {
        this.allTags = data.tags;
        const tagMenu = document.getElementById('tagMenu');
        if (tagMenu) {
          tagMenu.innerHTML = '<div class="prompt-filter-option active" data-value="" data-label="全部标签">全部标签</div>' +
            data.tags.map(t => `<div class="prompt-filter-option" data-value="${UI.escapeHtml(t)}" data-label="${UI.escapeHtml(t)}">${UI.escapeHtml(t)}</div>`).join('');
        }
      }
    } catch (e) {
      console.error('加载Prompt元数据失败:', e);
    }
  },

  async loadPrompts() {
    const grid = document.getElementById('promptGrid');
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="loading-spinner" style="margin:0 auto;"></div></div>';
    try {
      const params = {};
      const category = this.filters.category;
      if (category) params.category = category;
      const search = document.getElementById('promptSearch')?.value.trim();
      if (search) params.search = search;
      const effect = this.filters.effect;
      if (effect) params.effect = effect;
      const tag = this.filters.tag;
      if (tag) params.tag = tag;

      const data = await API.getPrompts(params);
      this.prompts = data.prompts;
      if (this.prompts.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;">
            <div class="empty-state-icon">📋</div>
            <div class="empty-state-text">还没有Prompt，点击「新建」或「AI生成」开始</div>
          </div>
        `;
        return;
      }
      grid.innerHTML = this.prompts.map(p => {
        const effectKey = p.effect === '好用' ? 'good' : p.effect === '踩坑' ? 'bad' : (p.effect === '一般' ? 'normal' : 'none');
        const tagList = p.tags ? p.tags.split(/[,，]/).map(t => t.trim()).filter(t => t).slice(0, 3) : [];
        return `
        <div class="prompt-card effect-${effectKey}" data-id="${p.id}">
          <div class="prompt-accent-bar"></div>
          <div class="prompt-card-body">
            <div class="prompt-card-header">
              <span class="prompt-card-title">${UI.escapeHtml(p.title)}</span>
              <div class="prompt-card-actions">
                <button class="prompt-card-action" data-action="copy" data-id="${p.id}" title="复制">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                <button class="prompt-card-action" data-action="edit" data-id="${p.id}" title="编辑">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="prompt-card-action" data-action="delete" data-id="${p.id}" title="删除">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </div>
            <div class="prompt-card-content">${UI.escapeHtml(p.prompt.substring(0, 140))}${p.prompt.length > 140 ? '...' : ''}</div>
            <div class="prompt-card-effect-row">
              <span class="prompt-card-effect effect-${effectKey}">${UI.escapeHtml(p.effect || '未标注')}</span>
            </div>
            <div class="prompt-card-footer">
              <span class="prompt-card-category">${UI.escapeHtml(p.category || '未分类')}</span>
              <div class="prompt-card-tags">
                ${tagList.map(t => `<span class="prompt-card-tag">${UI.escapeHtml(t)}</span>`).join('')}
              </div>
            </div>
          </div>
        </div>
      `}).join('');

      grid.querySelectorAll('.prompt-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          this.editPrompt(parseInt(card.dataset.id));
        });
      });
      grid.querySelectorAll('[data-action="copy"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const p = this.prompts.find(x => x.id === parseInt(btn.dataset.id));
          if (p) {
            navigator.clipboard.writeText(p.prompt);
            UI.toast('已复制到剪贴板', 'success');
            // 记录使用次数
            try {
              await API.request('POST', `/prompts/${p.id}/use`);
              p.use_count = (p.use_count || 0) + 1;
            } catch (err) {
              console.error('记录使用次数失败:', err);
            }
          }
        });
      });
      grid.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.editPrompt(parseInt(btn.dataset.id));
        });
      });
      grid.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = parseInt(btn.dataset.id);
          if (!confirm('确定删除此Prompt？')) return;
          try {
            await API.deletePrompt(id);
            UI.toast('已删除', 'success');
            this.loadPrompts();
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
      });
    } catch (e) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-text">加载失败: ${UI.escapeHtml(e.message)}</div></div>`;
    }
  },

  bindEvents() {
    document.getElementById('newPromptBtn').addEventListener('click', () => this.editPrompt(null));
    document.getElementById('promptSearch').addEventListener('input', () => {
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => this.loadPrompts(), 300);
    });
    this.bindPromptFilters();
    document.getElementById('aiGenBtn').addEventListener('click', () => this.aiGenerate());
    document.getElementById('exportBtn').addEventListener('click', () => this.exportPrompts());
  },

  // 筛选下拉交互（分类 / 效果 / 标签）
  bindPromptFilters() {
    document.querySelectorAll('.prompt-filter').forEach(wd => {
      const trigger = wd.querySelector('.prompt-filter-trigger');
      const menu = wd.querySelector('.prompt-filter-menu');
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wd.classList.contains('open');
        this.closePromptFilters();
        if (!isOpen) wd.classList.add('open');
      });
      menu.addEventListener('click', (e) => {
        const opt = e.target.closest('.prompt-filter-option');
        if (!opt) return;
        e.stopPropagation();
        const kind = wd.dataset.kind;
        const val = opt.dataset.value;
        const label = opt.dataset.label || opt.textContent.trim();
        this.filters[kind] = val;
        menu.querySelectorAll('.prompt-filter-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        const valueEl = trigger.querySelector('.prompt-filter-value');
        if (valueEl) valueEl.textContent = label;
        wd.classList.remove('open');
        this.loadPrompts();
      });
    });
    if (!this._promptFilterDocBound) {
      this._promptFilterDocBound = true;
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.prompt-filter')) this.closePromptFilters();
      });
    }
  },

  closePromptFilters() {
    document.querySelectorAll('.prompt-filter.open').forEach(m => m.classList.remove('open'));
  },

  exportPrompts() {
    if (this.prompts.length === 0) { UI.toast('没有可导出的Prompt', 'warning'); return; }
    const data = {
      exportedAt: new Date().toISOString(),
      count: this.prompts.length,
      prompts: this.prompts,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `siyi-prompts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    UI.toast(`已导出 ${this.prompts.length} 个Prompt`, 'success');
  },

  editPrompt(id) {
    // 清理可能残留的模态层，避免旧弹窗（如AI生成框）叠加遮挡，导致保存等按钮点击无响应
    document.querySelectorAll('.prompt-modal').forEach(m => m.remove());
    const p = id ? this.prompts.find(x => x.id === id) : null;
    const modal = document.createElement('div');
    modal.className = 'prompt-modal';
    modal.innerHTML = `
      <div class="prompt-modal-content">
        <div class="prompt-modal-header">
          <span class="prompt-modal-title">${p ? '编辑Prompt' : '新建Prompt'}</span>
          <button class="prompt-modal-close">&times;</button>
        </div>
        <div class="form-group">
          <label class="form-label">标题</label>
          <input type="text" class="form-input" id="pTitle" value="${p ? UI.escapeHtml(p.title) : ''}">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">分类</label>
            <select class="form-select" id="pCategory">
              ${['通用','前端','后端','调试','重构','部署','学习','雅思'].map(c => `<option ${p && p.category === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">效果评价</label>
            <select class="form-select" id="pEffect">
              ${['好用','一般','踩坑'].map(e => `<option ${p && p.effect === e ? 'selected' : ''}>${e}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">使用场景</label>
          <input type="text" class="form-input" id="pScene" value="${p ? UI.escapeHtml(p.scene || '') : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Prompt内容</label>
          <textarea class="form-textarea" id="pPrompt" style="min-height:160px;">${p ? UI.escapeHtml(p.prompt) : ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">标签（逗号分隔）</label>
          <input type="text" class="form-input" id="pTags" value="${p ? UI.escapeHtml(p.tags || '') : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">备注</label>
          <textarea class="form-textarea" id="pNotes" style="min-height:60px;">${p ? UI.escapeHtml(p.notes || '') : ''}</textarea>
        </div>
        <div class="prompt-modal-actions">
          ${p ? `<button class="btn btn-danger" id="pDelete">删除</button>` : ''}
          <button class="btn btn-outline" id="pCancel">取消</button>
          <button class="btn btn-primary" id="pSave">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.prompt-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('#pCancel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#pSave').addEventListener('click', async () => {
      const data = {
        title: modal.querySelector('#pTitle').value.trim(),
        category: modal.querySelector('#pCategory').value,
        effect: modal.querySelector('#pEffect').value,
        scene: modal.querySelector('#pScene').value.trim(),
        prompt: modal.querySelector('#pPrompt').value.trim(),
        tags: modal.querySelector('#pTags').value.trim(),
        notes: modal.querySelector('#pNotes').value.trim(),
      };
      if (!data.title || !data.prompt) { UI.toast('标题和内容必填', 'warning'); return; }
      try {
        if (p) await API.updatePrompt(p.id, data);
        else await API.createPrompt(data);
        UI.toast(p ? '更新成功' : '创建成功', 'success');
        modal.remove();
        // 清空搜索条件，确保新建的Prompt能显示
        const searchInput = document.getElementById('promptSearch');
        if (searchInput) searchInput.value = '';
        this.filters.effect = '';
        const effectValue = document.querySelector('.prompt-filter[data-kind="effect"] .prompt-filter-value');
        if (effectValue) effectValue.textContent = '全部效果';
        this.loadPrompts();
      } catch (e) { UI.toast(e.message, 'error'); }
    });

    if (p) {
      modal.querySelector('#pDelete').addEventListener('click', async () => {
        if (!confirm('确定删除此Prompt？')) return;
        try { await API.deletePrompt(p.id); UI.toast('已删除', 'success'); modal.remove(); this.loadPrompts(); }
        catch (e) { UI.toast(e.message, 'error'); }
      });
    }
  },

  async aiGenerate() {
    // Electron 下 window.prompt() 不可用（静默返回 null），改为应用内弹窗输入
    // 先清理残留模态层，避免与后续"新建"弹窗叠加
    document.querySelectorAll('.prompt-modal').forEach(m => m.remove());
    const modal = document.createElement('div');
    modal.className = 'prompt-modal';
    modal.innerHTML = `
      <div class="prompt-modal-content">
        <div class="prompt-modal-header">
          <span class="prompt-modal-title">AI 生成 Prompt</span>
          <button class="prompt-modal-close" type="button">&times;</button>
        </div>
        <div class="form-group">
          <label class="form-label">描述你需要的 Prompt 用途</label>
          <textarea id="aiReqInput" class="form-textarea" rows="5" placeholder="例如：帮我写一个代码审查的 Prompt">${this._aiReq || ''}</textarea>
          <p style="font-size:12px;color:var(--color-text-muted, #8b8b8b);margin-top:6px;">AI 将根据你的描述生成一个可直接使用的 Prompt，生成后可继续编辑再保存。</p>
        </div>
        <div class="prompt-modal-footer" style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
          <button class="prompt-btn prompt-btn-outline" id="aiCancel" type="button">取消</button>
          <button class="prompt-btn prompt-btn-primary" id="aiSubmit" type="button">生成</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.prompt-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('#aiCancel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    const input = modal.querySelector('#aiReqInput');
    input.focus();
    const submit = modal.querySelector('#aiSubmit');
    const submitHTML = submit.innerHTML;
    const setLoading = (loading) => {
      submit.disabled = loading;
      submit.innerHTML = loading
        ? '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:promptSpin .7s linear infinite;vertical-align:-2px;margin-right:6px;"></span>生成中…'
        : submitHTML;
    };
    const run = async () => {
      const requirement = input.value.trim();
      if (!requirement) { UI.toast('请描述 Prompt 用途', 'warning'); return; }
      setLoading(true);
      try {
        const data = await API.generatePrompt(requirement);
        this._aiReq = requirement;
        // 生成完后直接保存到知识库，不再进入编辑表单
        const promptText = typeof data === 'string' ? data : (data && data.prompt) || '';
        if (!promptText) throw new Error('生成结果为空');
        await API.createPrompt({
          title: (requirement.length > 30 ? requirement.substring(0, 30) : requirement) || '生成的Prompt',
          category: '通用',
          effect: '一般',
          scene: requirement,
          prompt: promptText,
          tags: '',
          notes: '',
        });
        modal.remove();
        UI.toast('已生成并保存到库', 'success');
        // 清空搜索条件，确保新Prompt能显示
        const searchInput = document.getElementById('promptSearch');
        if (searchInput) searchInput.value = '';
        this.filters.effect = '';
        const effectValue = document.querySelector('.prompt-filter[data-kind="effect"] .prompt-filter-value');
        if (effectValue) effectValue.textContent = '全部效果';
        this.loadPrompts();
      } catch (e) {
        setLoading(false);
        UI.toast('生成或保存失败: ' + e.message, 'error');
      }
    };
    submit.addEventListener('click', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); });
  },
};

App.registerModule('prompt', PromptModule);
