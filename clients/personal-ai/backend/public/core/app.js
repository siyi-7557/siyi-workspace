// 主应用逻辑 - 路由与模块切换
const App = {
  currentModule: 'overview',
  modules: {},

  init() {
    this.initTheme();
    this.bindNav();
    this.bindSidebarToggle();
    this.bindTheme();
    this.bindShortcuts();
    this.bindModal();
    this.bindHeaderSearch();
    this.bindHeaderButtons();
    this.loadModule('overview');
    this.updateIndexStatus();
    // 定时更新索引状态
    setInterval(() => this.updateIndexStatus(), 5000);

    // Electron 环境初始化
    this.initElectron();
  },

  initElectron() {
    if (window.electronAPI && window.electronAPI.isElectron) {
      console.log('[App] 检测到 Electron 环境');
      // 监听全局搜索快捷键（托盘 / Ctrl+Shift+Space）
      window.electronAPI.onGlobalSearch(() => {
        this.switchModule('search');
        setTimeout(() => {
          if (this.modules.search && typeof this.modules.search.focusSearch === 'function') {
            this.modules.search.focusSearch();
          }
        }, 100);
      });
    }
  },

  bindModal() {
    // 使用事件委托 + capture 模式，确保关闭按钮事件不会被阻止
    const overlay = document.getElementById('modalOverlay');
    overlay.addEventListener('click', (e) => {
      // 点击关闭按钮（或其子元素）
      if (e.target.closest('#modalClose')) {
        UI.hideModal();
        return;
      }
      // 点击遮罩区域
      if (e.target.id === 'modalOverlay') {
        UI.hideModal();
      }
    }, true);
  },

  // ========== Header 搜索 ==========
  bindHeaderSearch() {
    const input = document.getElementById('headerSearchInput');
    if (!input) return;
    input.addEventListener('focus', () => {
      if (this.currentModule !== 'search') {
        this.switchModule('search');
      }
    });
    input.addEventListener('input', () => {
      setTimeout(() => {
        const searchInput = document.getElementById('knowledgeSearchInput');
        if (searchInput && searchInput.value !== input.value) {
          searchInput.value = input.value;
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 50);
    });
  },

  // ========== Header 按钮 ==========
  bindHeaderButtons() {
    const settingsBtn = document.getElementById('settingsNavBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.switchModule('settings'));
    }
    const aiBtn = document.getElementById('aiToggleBtn');
    if (aiBtn) {
      aiBtn.addEventListener('click', () => {
        if (typeof PersonalAI !== 'undefined' && typeof PersonalAI.toggle === 'function') {
          PersonalAI.toggle();
        }
      });
    }
  },

  initTheme() {
    // 默认浅色主题；:root 为浅色，[data-theme="dark"] 为深色
    const saved = localStorage.getItem('siyi_theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    this.updateThemeToggleIcon();
  },

  updateThemeToggleIcon() {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    toggle.textContent = isDark ? '☀️' : '🌙';
  },

  bindShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+K / Cmd+K 聚焦搜索
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (this.currentModule !== 'search') {
          this.switchModule('search');
        }
        setTimeout(() => {
          if (this.modules.search && typeof this.modules.search.focusSearch === 'function') {
            this.modules.search.focusSearch();
          }
        }, 50);
        return;
      }

      // Alt+1~0 切换模块
      if (e.altKey && ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].includes(e.key)) {
        e.preventDefault();
        const modules = ['overview', 'search', 'obsidian-reviews', 'prompt', 'website', 'settings'];
        const idx = e.key === '0' ? 9 : parseInt(e.key) - 1;
        if (modules[idx]) this.switchModule(modules[idx]);
        return;
      }

      // Esc 关闭弹窗
      if (e.key === 'Escape') {
        // 通用弹窗
        const modalOverlay = document.getElementById('modalOverlay');
        if (modalOverlay && modalOverlay.style.display !== 'none') {
          UI.hideModal();
          return;
        }
        // 其他模态弹窗
        const modals = document.querySelectorAll('.note-detail-modal, .prompt-modal');
        if (modals.length > 0) {
          modals[modals.length - 1].remove();
        }
      }
    });
  },

  bindNav() {
    // 导航项点击
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const module = item.dataset.module;
        this.switchModule(module);
      });
    });

    // 分组折叠/展开
    document.querySelectorAll('.nav-group-header').forEach(header => {
      header.addEventListener('click', () => {
        const group = header.parentElement;
        const isCollapsed = group.classList.toggle('collapsed');
        const toggle = header.querySelector('.nav-group-toggle');
        if (toggle) {
          toggle.textContent = isCollapsed ? '▶' : '▼';
        }
        // 保存折叠状态
        this.saveNavGroupState();
      });
    });

    // 恢复折叠状态
    this.restoreNavGroupState();
  },

  saveNavGroupState() {
    const state = {};
    document.querySelectorAll('.nav-group').forEach(group => {
      state[group.dataset.group] = group.classList.contains('collapsed');
    });
    localStorage.setItem('siyi_nav_group_state', JSON.stringify(state));
  },

  restoreNavGroupState() {
    try {
      const state = JSON.parse(localStorage.getItem('siyi_nav_group_state') || '{}');
      document.querySelectorAll('.nav-group').forEach(group => {
        if (state[group.dataset.group]) {
          group.classList.add('collapsed');
          const toggle = group.querySelector('.nav-group-toggle');
          if (toggle) toggle.textContent = '▶';
        }
      });
    } catch (e) {}
  },

  // ========== 侧边栏折叠 ==========
  bindSidebarCollapse() {
    document.getElementById('sidebarCollapseBtn')?.addEventListener('click', () => this.toggleSidebar());
    document.getElementById('topbarToggle')?.addEventListener('click', () => this.toggleSidebar());
  },

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const isCollapsed = sidebar.classList.toggle('collapsed');
    localStorage.setItem('siyi_sidebar_collapsed', isCollapsed ? '1' : '0');
  },

  restoreSidebarCollapse() {
    if (localStorage.getItem('siyi_sidebar_collapsed') === '1') {
      document.getElementById('sidebar')?.classList.add('collapsed');
    }
  },

  // ========== 移动端抽屉侧边栏 ==========
  bindSidebarToggle() {
    const btn = document.getElementById('sidebarToggleBtn');
    const sidebar = document.getElementById('sidebar');
    if (!btn || !sidebar) return;
    btn.addEventListener('click', () => {
      const open = sidebar.classList.toggle('mobile-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.title = open ? '关闭菜单' : '打开菜单';
    });
    // 点击导航项后自动收起抽屉
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        if (btn) {
          btn.setAttribute('aria-expanded', 'false');
          btn.title = '打开菜单';
        }
      });
    });
    // 点击遮罩（内容区）关闭抽屉
    document.querySelector('.app-content')?.addEventListener('click', () => {
      if (window.innerWidth <= 768 && sidebar.classList.contains('mobile-open')) {
        sidebar.classList.remove('mobile-open');
        if (btn) {
          btn.setAttribute('aria-expanded', 'false');
          btn.title = '打开菜单';
        }
      }
    });
  },

  // ========== 顶栏搜索 ==========
  bindTopbarSearch() {
    const searchBtn = document.getElementById('topbarSearch');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        this.switchModule('search');
        setTimeout(() => {
          if (this.modules.search && typeof this.modules.search.focusSearch === 'function') {
            this.modules.search.focusSearch();
          }
        }, 100);
      });
    }
  },

  // ========== 顶部搜索框输入 ==========
  bindTopSearchInput() {
    const input = document.getElementById('topSearchInput');
    if (!input) return;

    // 聚焦时切换到搜索模块
    input.addEventListener('focus', () => {
      if (this.currentModule !== 'search') {
        this.switchModule('search');
      }
    });

    // 输入时同步到搜索模块的搜索框
    input.addEventListener('input', () => {
      setTimeout(() => {
        const searchInput = document.getElementById('searchInput');
        if (searchInput && searchInput.value !== input.value) {
          searchInput.value = input.value;
          // 触发搜索模块的输入事件
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 50);
    });

    // 回车时执行搜索
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
          searchInput.value = input.value;
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          // 触发搜索
          if (this.modules.search && typeof this.modules.search.doSearch === 'function') {
            this.modules.search.doSearch();
          }
        }
      }
    });
  },

  // ========== 侧边栏拖拽排序 ==========
  _editMode: false,
  _dragElement: null,
  _dragType: null, // 'group' | 'item'

  bindSidebarEdit() {
    document.getElementById('sidebarEditBtn')?.addEventListener('click', () => this.enterEditMode());
    document.getElementById('sidebarDoneBtn')?.addEventListener('click', () => this.exitEditMode());
    document.getElementById('sidebarResetBtn')?.addEventListener('click', () => this.resetNavOrder());
  },

  enterEditMode() {
    this._editMode = true;
    document.body.classList.add('sidebar-edit-mode');
    const editBar = document.getElementById('sidebarEditBar');
    if (editBar) editBar.style.display = 'flex';

    // 所有分组和导航项可拖拽
    document.querySelectorAll('.nav-group').forEach(group => {
      group.draggable = true;
      group.dataset.dragType = 'group';
      this._attachDragEvents(group);
    });

    document.querySelectorAll('.nav-item').forEach(item => {
      item.draggable = true;
      item.dataset.dragType = 'item';
      this._attachDragEvents(item);
    });

    UI.toast('进入编辑模式，拖拽调整顺序', 'info');
  },

  exitEditMode() {
    this._editMode = false;
    document.body.classList.remove('sidebar-edit-mode');
    const editBar = document.getElementById('sidebarEditBar');
    if (editBar) editBar.style.display = 'none';

    // 移除拖拽属性和事件
    document.querySelectorAll('.nav-group, .nav-item').forEach(el => {
      el.draggable = false;
      el.removeAttribute('data-drag-type');
      this._detachDragEvents(el);
    });

    // 清除拖拽残留样式
    document.querySelectorAll('.drag-over-top, .drag-over-bottom, .dragging').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
    });

    this.saveNavOrder();
    UI.toast('排序已保存', 'success');
  },

  _attachDragEvents(el) {
    el.addEventListener('dragstart', this._onDragStart.bind(this));
    el.addEventListener('dragend', this._onDragEnd.bind(this));
    el.addEventListener('dragover', this._onDragOver.bind(this));
    el.addEventListener('dragleave', this._onDragLeave.bind(this));
    el.addEventListener('drop', this._onDrop.bind(this));
  },

  _detachDragEvents(el) {
    el.removeEventListener('dragstart', this._onDragStart);
    el.removeEventListener('dragend', this._onDragEnd);
    el.removeEventListener('dragover', this._onDragOver);
    el.removeEventListener('dragleave', this._onDragLeave);
    el.removeEventListener('drop', this._onDrop);
  },

  _onDragStart(e) {
    this._dragElement = e.currentTarget;
    this._dragType = e.currentTarget.dataset.dragType;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    // 设置拖拽数据（Firefox需要）
    e.dataTransfer.setData('text/plain', this._dragType);
  },

  _onDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    this._dragElement = null;
    this._dragType = null;
  },

  _onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const target = e.currentTarget;
    if (target === this._dragElement) return;

    const targetType = target.dataset.dragType;
    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    // 清除之前的标记
    target.classList.remove('drag-over-top', 'drag-over-bottom');

    if (e.clientY < midY) {
      target.classList.add('drag-over-top');
    } else {
      target.classList.add('drag-over-bottom');
    }
  },

  _onDragLeave(e) {
    e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
  },

  _onDrop(e) {
    e.preventDefault();
    const target = e.currentTarget;
    if (target === this._dragElement || !this._dragElement) return;

    const targetType = target.dataset.dragType;
    const dragType = this._dragType;
    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const insertBefore = e.clientY < midY;

    target.classList.remove('drag-over-top', 'drag-over-bottom');

    if (dragType === 'group' && targetType === 'group') {
      // 分组之间排序
      const parent = target.parentElement;
      if (insertBefore) {
        parent.insertBefore(this._dragElement, target);
      } else {
        parent.insertBefore(this._dragElement, target.nextSibling);
      }
    } else if (dragType === 'item' && targetType === 'item') {
      // 导航项之间排序（支持跨分组）
      const targetGroup = target.closest('.nav-group-items');
      if (targetGroup) {
        if (insertBefore) {
          targetGroup.insertBefore(this._dragElement, target);
        } else {
          targetGroup.insertBefore(this._dragElement, target.nextSibling);
        }
      }
    } else if (dragType === 'item' && targetType === 'group') {
      // 导航项拖到分组上，移动到该分组
      const targetItems = target.querySelector('.nav-group-items');
      if (targetItems) {
        targetItems.appendChild(this._dragElement);
      }
    }
    // group拖到item上不处理（避免混乱）
  },

  saveNavOrder() {
    const order = {
      groups: [],
      items: {}
    };

    document.querySelectorAll('.nav-group').forEach(group => {
      const groupId = group.dataset.group;
      order.groups.push(groupId);
      order.items[groupId] = [];
      group.querySelectorAll('.nav-item').forEach(item => {
        order.items[groupId].push(item.dataset.module);
      });
    });

    localStorage.setItem('siyi_nav_order', JSON.stringify(order));
  },

  restoreNavOrder() {
    try {
      const order = JSON.parse(localStorage.getItem('siyi_nav_order') || 'null');
      if (!order || !order.groups || !order.items) return;

      const nav = document.querySelector('.sidebar-nav');
      if (!nav) return;

      // 恢复分组顺序
      order.groups.forEach(groupId => {
        const group = document.querySelector(`.nav-group[data-group="${groupId}"]`);
        if (group) {
          nav.appendChild(group);
        }
      });

      // 恢复每个分组内的导航项顺序
      Object.entries(order.items).forEach(([groupId, modules]) => {
        const group = document.querySelector(`.nav-group[data-group="${groupId}"] .nav-group-items`);
        if (!group) return;
        modules.forEach(moduleName => {
          const item = document.querySelector(`.nav-item[data-module="${moduleName}"]`);
          if (item && item.closest('.nav-group').dataset.group === groupId) {
            group.appendChild(item);
          }
        });
      });
    } catch (e) {
      console.warn('恢复导航排序失败:', e);
    }
  },

  resetNavOrder() {
    if (!confirm('确定重置为默认排序吗？')) return;
    localStorage.removeItem('siyi_nav_order');
    location.reload();
  },

  bindTheme() {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;
    toggle.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('siyi_theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('siyi_theme', 'dark');
      }
      this.updateThemeToggleIcon();
    });
  },

  switchModule(module) {
    if (this.currentModule === module) return;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`.nav-item[data-module="${module}"]`).classList.add('active');
    this.currentModule = module;

    // 页面切换：仅 opacity 过渡（高频操作，克制动画）
    const content = document.getElementById('contentInner');
    if (content) {
      content.style.opacity = '0';
      content.style.transition = 'opacity 120ms ease-out';
      setTimeout(() => {
        this.loadModule(module);
        content.style.opacity = '1';
      }, 100);
    } else {
      this.loadModule(module);
    }
  },

  loadModule(module) {
    const meta = {
      overview: { title: '总览', desc: '你的个人 AI 工作空间概览' },
      search: { title: '知识', desc: '搜索和浏览你的个人知识库' },
      prompt: { title: '提示词', desc: '管理可复用的 AI 工作流和提示词' },
      'obsidian-reviews': { title: '复盘', desc: '把 AI 使用记录转化为洞察、Prompt 和行动' },
      radar: { title: '信息雷达', desc: '与思意真正相关的信息筛选器' },
      english: { title: '英语学习', desc: '思意的英语学习空间' },
      website: { title: '网站', desc: '网站后台管理' },
      settings: { title: '设置', desc: '配置索引源、API 和系统偏好' },
    };
    const m = meta[module] || { title: module, desc: '' };
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) pageTitle.textContent = m.title;
    const pageDesc = document.getElementById('pageDesc');
    if (pageDesc) pageDesc.textContent = m.desc;

    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-module="${module}"]`);
    if (navItem) navItem.classList.add('active');

    const area = document.getElementById('contentInner');
    if (area) area.innerHTML = '';
    const target = area;

    if (this.modules[module] && typeof this.modules[module].render === 'function') {
      this.modules[module].render(target);
    } else if (module === 'settings') {
      this.renderSettings(target);
    } else if (module === 'overview') {
      this.renderOverviewPlaceholder(target);
    }
  },

  renderOverviewPlaceholder(container) {
    container.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;text-align:center;gap:12px;"><div style="width:56px;height:56px;border-radius:12px;background:var(--accent-tint);display:flex;align-items:center;justify-content:center;color:var(--accent);"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg></div><h2 style="font-size:18px;font-weight:600;color:var(--text-primary);margin:0;">总览页</h2><p style="font-size:13px;color:var(--text-muted);margin:0;max-width:400px;line-height:1.6;">总览页正在建设中，将展示知识统计、最近活动、AI 洞察和快捷入口。</p></div>';
  },

  registerModule(name, moduleObj) {
    this.modules[name] = moduleObj;
  },

  async updateIndexStatus() {
    try {
      const status = await API.getObsidianStatus();
      const el = document.getElementById('indexStatus');
      if (!el) return;
      const dot = el.querySelector('.status-dot');
      if (!dot) return;
      const synced = (status.indexedFiles ?? status.totalFiles ?? 0) > 0;
      dot.className = 'status-dot';
      if (status.isBuilding) {
        dot.classList.add('building');
      } else if (status.error) {
        dot.classList.add('error');
      } else if (synced) {
        dot.classList.add('synced');
      }
      // 同步更新底部索引计数（indexedFiles 为实际已索引文件数）
      const countEl = document.getElementById('indexCount');
      if (countEl) {
        const n = status.indexedFiles ?? status.totalFiles ?? 0;
        countEl.textContent = status.isBuilding
          ? `索引中`
          : `${n}`;
      }
    } catch (e) {}
  },

  renderSettings(container) {
    container.innerHTML = `
      <div class="card" style="max-width:650px;">
        <h3 style="margin-bottom:16px;">📁 索引源配置</h3>
        <div class="form-group">
          <label class="form-label">Obsidian Vault 路径（主索引源）</label>
          <input type="text" class="form-input" id="vaultPathInput" placeholder="例如: C:/Users/name/Documents/ObsidianVault">
        </div>

        <div style="margin:16px 0 8px;">
          <label class="form-label">📂 额外索引文件夹（多源索引）</label>
          <p style="font-size:11px;color:var(--text-muted);margin:4px 0 8px;">添加其他包含 .md 文件的文件夹，索引时会一并扫描</p>
          <div id="extraPathsList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;"></div>
          <div style="display:flex;gap:6px;">
            <input type="text" class="form-input" id="newExtraPathInput" placeholder="输入文件夹路径..." style="flex:1;">
            <button class="btn btn-outline btn-sm" id="addExtraPathBtn">添加</button>
          </div>
        </div>

        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="saveVaultBtn">保存配置</button>
          <button class="btn btn-outline" id="reindexBtn">重建索引</button>
          <button class="btn btn-outline" id="incrementalIndexBtn">增量索引</button>
        </div>
        <div id="vaultStats" style="margin-top:20px;"></div>

        <div style="margin-top:30px;padding-top:20px;border-top:1px solid var(--border-color);">
          <h3 style="font-size:15px;margin:0 0 12px;">💾 数据备份</h3>
          <p style="font-size:12px;color:var(--text-muted);margin:0 0 12px;">备份数据库和索引文件，防止数据丢失。自动保留最近10个备份。</p>
          <div style="display:flex;gap:8px;margin-bottom:16px;">
            <button class="btn btn-primary btn-sm" id="createBackupBtn">立即备份</button>
            <button class="btn btn-outline btn-sm" id="refreshBackupBtn">刷新列表</button>
          </div>
          <div id="backupList" style="max-height:300px;overflow-y:auto;"></div>
        </div>

        <div style="margin-top:30px;padding-top:20px;border-top:1px solid var(--border-color);">
          <h3 style="font-size:15px;margin:0 0 12px;">⚙️ 配置导入导出</h3>
          <p style="font-size:12px;color:var(--text-muted);margin:0 0 12px;">导出系统配置（Obsidian路径、额外索引路径等），方便在其他设备上导入使用。</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" id="exportConfigBtn">📤 导出配置</button>
            <button class="btn btn-outline btn-sm" id="importConfigBtn">📥 导入配置</button>
            <input type="file" id="importConfigFile" accept=".json" style="display:none;">
          </div>
        </div>
      </div>
    `;
    this._extraPaths = [];

    // 加载当前配置
    API.getObsidianConfig().then(cfg => {
      document.getElementById('vaultPathInput').value = cfg.vaultPath || '';
      this._extraPaths = cfg.extraPaths || [];
      this.renderExtraPathsList();
      if (cfg.vaultPath) this.loadVaultStats();
    }).catch(() => {});

    // 添加额外路径
    document.getElementById('addExtraPathBtn').addEventListener('click', () => {
      const input = document.getElementById('newExtraPathInput');
      const path = input.value.trim();
      if (!path) return;
      if (this._extraPaths.includes(path)) {
        UI.toast('该路径已添加', 'warning');
        return;
      }
      this._extraPaths.push(path);
      this.renderExtraPathsList();
      input.value = '';
    });

    document.getElementById('saveVaultBtn').addEventListener('click', async () => {
      const vaultPath = document.getElementById('vaultPathInput').value.trim();
      if (!vaultPath && this._extraPaths.length === 0) {
        UI.toast('请至少配置一个索引路径', 'warning');
        return;
      }
      try {
        await API.setObsidianConfig(vaultPath || undefined, this._extraPaths);
        UI.toast('配置已保存', 'success');
        this.loadVaultStats();
      } catch (e) { UI.toast(e.message, 'error'); }
    });

    document.getElementById('reindexBtn').addEventListener('click', async () => {
      try {
        await API.reindex();
        UI.toast('索引重建已启动', 'info');
      } catch (e) { UI.toast(e.message, 'error'); }
    });

    document.getElementById('incrementalIndexBtn').addEventListener('click', async () => {
      try {
        await API.incrementalIndex();
        UI.toast('增量索引已启动，只处理修改过的文件', 'info');
      } catch (e) { UI.toast(e.message, 'error'); }
    });

    // 备份相关
    document.getElementById('createBackupBtn').addEventListener('click', () => this.createBackup());
    document.getElementById('refreshBackupBtn').addEventListener('click', () => this.loadBackupList());
    this.loadBackupList();

    // 配置导入导出
    document.getElementById('exportConfigBtn').addEventListener('click', () => this.exportConfig());
    document.getElementById('importConfigBtn').addEventListener('click', () => document.getElementById('importConfigFile').click());
    document.getElementById('importConfigFile').addEventListener('change', (e) => this.importConfig(e));
  },

  exportConfig() {
    window.open('/api/config/export', '_blank');
    UI.toast('配置已导出', 'success');
  },

  importConfig(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data.config) {
          UI.toast('配置文件格式错误', 'error');
          return;
        }
        if (!confirm('确定导入配置吗？这将覆盖当前的 Obsidian 路径和额外索引路径配置。')) return;
        UI.showLoading('正在导入配置...');
        const result = await API.request('POST', '/config/import', data);
        UI.hideLoading();
        UI.toast('配置导入成功，建议刷新页面使配置生效', 'success');
        // 刷新页面
        setTimeout(() => location.reload(), 1500);
      } catch (err) {
        UI.hideLoading();
        UI.toast('导入失败: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  },

  async createBackup() {
    const description = prompt('输入备份描述（可选）:', '');
    if (description === null) return;
    try {
      UI.showLoading('正在创建备份...');
      const result = await API.request('POST', '/backup', { description });
      UI.hideLoading();
      UI.toast('备份创建成功', 'success');
      this.loadBackupList();
    } catch (e) {
      UI.hideLoading();
      UI.toast('备份失败: ' + e.message, 'error');
    }
  },

  async loadBackupList() {
    try {
      const data = await API.request('GET', '/backup');
      const container = document.getElementById('backupList');
      if (!container) return;
      if (data.backups.length === 0) {
        container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:12px;text-align:center;">暂无备份，点击「立即备份」创建第一个备份</div>';
        return;
      }
      container.innerHTML = data.backups.map(b => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:6px;margin-bottom:6px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;font-weight:500;color:var(--text-primary);">${new Date(b.timestamp).toLocaleString('zh-CN')}</div>
            <div style="font-size:11px;color:var(--text-muted);">${b.sizeFormatted || ''} ${b.description ? '· ' + UI.escapeHtml(b.description) : ''}</div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <button class="btn btn-ghost btn-sm" data-action="restore" data-id="${b.id}" style="font-size:11px;">恢复</button>
            <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${b.id}" style="font-size:11px;">删除</button>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('[data-action="restore"]').forEach(btn => {
        btn.addEventListener('click', () => this.restoreBackup(btn.dataset.id));
      });
      container.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', () => this.deleteBackup(btn.dataset.id));
      });
    } catch (e) {
      console.error('加载备份列表失败:', e);
    }
  },

  async restoreBackup(backupId) {
    if (!confirm('确定恢复此备份吗？恢复前会自动创建当前状态的备份，但建议重启服务器使更改生效。')) return;
    try {
      UI.showLoading('正在恢复备份...');
      const result = await API.request('POST', `/backup/${backupId}/restore`);
      UI.hideLoading();
      UI.toast('备份恢复成功，建议重启服务器', 'success');
      this.loadBackupList();
    } catch (e) {
      UI.hideLoading();
      UI.toast('恢复失败: ' + e.message, 'error');
    }
  },

  async deleteBackup(backupId) {
    if (!confirm('确定删除此备份吗？此操作不可恢复。')) return;
    try {
      await API.request('DELETE', `/backup/${backupId}`);
      UI.toast('备份删除成功', 'success');
      this.loadBackupList();
    } catch (e) {
      UI.toast('删除失败: ' + e.message, 'error');
    }
  },

  renderExtraPathsList() {
    const list = document.getElementById('extraPathsList');
    if (!list) return;
    if (this._extraPaths.length === 0) {
      list.innerHTML = '<div style="font-size:11px;color:var(--text-muted);">暂无额外索引路径</div>';
      return;
    }
    list.innerHTML = this._extraPaths.map((p, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-tertiary);border-radius:6px;">
        <span style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📁 ${UI.escapeHtml(p)}</span>
        <button class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:11px;" data-idx="${i}" onclick="App._removeExtraPath(${i})">删除</button>
      </div>
    `).join('');
  },

  _removeExtraPath(idx) {
    this._extraPaths.splice(idx, 1);
    this.renderExtraPathsList();
  },

  async loadVaultStats() {
    try {
      const stats = await API.getVaultStats();
      document.getElementById('vaultStats').innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
          <div class="card" style="padding:14px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:var(--accent);">${stats.totalFiles}</div>
            <div style="font-size:12px;color:var(--text-muted);">笔记文件</div>
          </div>
          <div class="card" style="padding:14px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:var(--success);">${(stats.totalWords/1000).toFixed(1)}k</div>
            <div style="font-size:12px;color:var(--text-muted);">总字数</div>
          </div>
          <div class="card" style="padding:14px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:var(--warning);">${stats.tags?.length || 0}</div>
            <div style="font-size:12px;color:var(--text-muted);">标签数</div>
          </div>
        </div>
      `;
    } catch (e) {}
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
