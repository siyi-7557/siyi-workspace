// API调用封装
const API = {
  baseUrl: '/api',

  async request(method, path, data = null) {
    const url = this.baseUrl + path;
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (data) options.body = JSON.stringify(data);
    try {
      const res = await fetch(url, options);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '请求失败');
      return json;
    } catch (err) {
      console.error(`[API] ${method} ${path} 失败:`, err.message);
      throw err;
    }
  },

  // 检索（原语义检索，向后兼容）
  search: (q, limit = 10, mode = 'hybrid', source = 'all', fileType = 'all') =>
    API.request('GET', `/search?q=${encodeURIComponent(q)}&limit=${limit}&mode=${mode}&source=${source}&fileType=${fileType}`),
  listNotes: (page = 1, pageSize = 20) =>
    API.request('GET', `/search/notes?page=${page}&pageSize=${pageSize}`),
  getNote: (id) =>
    API.request('GET', `/search/notes/${encodeURIComponent(id)}`),

  // 知识空间（新）
  getKnowledgeList: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return API.request('GET', `/search/knowledge${qs ? '?' + qs : ''}`);
  },
  searchKnowledge: (q, limit = 10) =>
    API.request('GET', `/search/knowledge/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  getKnowledgeStats: () =>
    API.request('GET', '/search/knowledge/stats'),
  getKnowledgeDetail: (id) =>
    API.request('GET', `/search/knowledge/${encodeURIComponent(id)}`),

  // Prompt库
  getPrompts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return API.request('GET', `/prompts${qs ? '?' + qs : ''}`);
  },
  getPrompt: (id) => API.request('GET', `/prompts/${id}`),
  createPrompt: (data) => API.request('POST', '/prompts', data),
  updatePrompt: (id, data) => API.request('PUT', `/prompts/${id}`, data),
  deletePrompt: (id) => API.request('DELETE', `/prompts/${id}`),
  generatePrompt: (requirement) => API.request('POST', '/prompts/generate', { requirement }),
  iteratePrompt: (id, data) => API.request('POST', `/prompts/${id}/iterate`, data),

  // 复盘
  getReviews: () => API.request('GET', '/reviews'),
  getReview: (id) => API.request('GET', `/reviews/${id}`),
  createReview: (data) => API.request('POST', '/reviews', data),
  updateReview: (id, data) => API.request('PUT', `/reviews/${id}`, data),
  getReviewPitfalls: (id) => API.request('GET', `/reviews/${id}/pitfalls`),
  archiveReview: (id) => API.request('POST', `/reviews/${id}/archive`),
  generateReviewDraft: (data) => API.request('POST', '/reviews/generate-draft', data),

  // 统计
  getStatsOverview: () => API.request('GET', '/stats/overview'),
  getHeatmap: (year) => API.request('GET', `/stats/heatmap?year=${year}`),
  getTrend: (days = 30) => API.request('GET', `/stats/trend?days=${days}`),
  getRecentActivities: (limit = 10) => API.request('GET', `/stats/recent?limit=${limit}`),
  logActivity: (data) => API.request('POST', '/stats/log', data),

  // Obsidian配置
  getObsidianStatus: () => API.request('GET', '/obsidian/status'),
  getObsidianConfig: () => API.request('GET', '/obsidian/config'),
  setObsidianConfig: (vaultPath, extraPaths) => API.request('POST', '/obsidian/config', { vaultPath, extraPaths }),
  reindex: () => API.request('POST', '/obsidian/reindex'),
  incrementalIndex: () => API.request('POST', '/obsidian/incremental-index'),
  getVaultStats: () => API.request('GET', '/obsidian/vault-stats'),

  // AI
  aiChat: (messages, model) => API.request('POST', '/ai/chat', { messages, model }),
  resumeAnalyze: (jd_text, resume_text) => API.request('POST', '/resume/analyze', { jd_text, resume_text }),
  codeExplain: (code, language, depth) => API.request('POST', '/code/explain', { code, language, depth }),
  getGraph: (limit, threshold) => API.request('GET', `/graph?limit=${limit || 80}&threshold=${threshold || 0.5}`),
  getPitfalls: (tech, search) => API.request('GET', `/learning/pitfalls?tech=${encodeURIComponent(tech || '')}&search=${encodeURIComponent(search || '')}`),
  generateLearningPath: (data) => API.request('POST', '/learning/learning-path', data),
  writingCheck: (data) => API.request('POST', '/learning/writing-check', data),
  getWebsiteStats: () => API.request('GET', '/website-admin/stats'),
  getWebsiteSession: (id) => API.request('GET', `/website-admin/session/${id}`),
  getModels: () => API.request('GET', '/ai/models'),

  // 健康检查
  health: () => API.request('GET', '/health'),
};

// UI工具函数
const UI = {
  showLoading(text = '加载中...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').style.display = 'flex';
  },
  hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
  },
  toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <div class="toast-content">
        <div class="toast-desc">${UI.escapeHtml(message)}</div>
      </div>
    `;

    container.appendChild(toast);

    // 触发进入动画
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('show'));
    });

    // 3秒后自动消失
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 200);
    }, 3000);

    // Electron 环境下同时显示原生系统通知（仅对重要类型）
    if (window.electronAPI && window.electronAPI.isElectron && (type === 'success' || type === 'error')) {
      const title = type === 'success' ? '✅ 操作成功' : '❌ 操作失败';
      window.electronAPI.showNotification(title, message);
    }
  },
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr).substring(0, 10);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  },
  formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr).substring(0, 10);
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  },
  showModal(title, html) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = html;
    const overlay = document.getElementById('modalOverlay');
    overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add('show'));
    });
    // 确保关闭按钮正常工作（克隆替换，移除可能失效的旧监听器）
    const oldCloseBtn = document.getElementById('modalClose');
    if (oldCloseBtn) {
      const newCloseBtn = oldCloseBtn.cloneNode(true);
      oldCloseBtn.parentNode.replaceChild(newCloseBtn, oldCloseBtn);
      newCloseBtn.addEventListener('click', () => UI.hideModal());
    }
    // 点击遮罩区域关闭
    if (!overlay.__modalOverlayClickBound) {
      overlay.addEventListener('click', (e) => {
        if (e.target.id === 'modalOverlay') {
          UI.hideModal();
        }
      }, true);
      overlay.__modalOverlayClickBound = true;
    }
    // 绑定 ESC 关闭（确保每次打开都有效）
    if (!window.__modalEscHandler) {
      window.__modalEscHandler = (e) => {
        if (e.key === 'Escape') {
          const ov = document.getElementById('modalOverlay');
          if (ov && ov.style.display !== 'none') {
            UI.hideModal();
          }
        }
      };
      document.addEventListener('keydown', window.__modalEscHandler);
    }
  },
  hideModal() {
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.remove('show');
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 200);
  },
};
