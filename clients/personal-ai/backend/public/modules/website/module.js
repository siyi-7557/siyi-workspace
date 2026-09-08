// 访客洞察模块（总览风格 redesign）
const WebsiteModule = {
  stats: null,
  refreshTimer: null,
  currentPage: 1,
  pageSize: 10,
  searchKeyword: '',
  searchPage: 1,
  presetExpanded: false,

  render(container) {
    container.innerHTML = `
      <div class="ws-container">
        <!-- ========== 页面标题 ========== -->
        <div class="ws-page-header">
          <div class="ws-page-header-left">
            <h1 class="ws-page-title">访客洞察</h1>
            <p class="ws-page-subtitle">了解你的网站访客和AI交互数据</p>
          </div>
          <div class="ws-page-header-right">
            <div class="ws-toolbar">
              <div class="ws-search-wrap">
                <span class="ws-search-icon">🔍</span>
                <input type="text" class="ws-search-input" id="wsSearchInput" placeholder="搜索聊天记录..."
                  onkeydown="if(event.key==='Enter')WebsiteModule.doSearch()">
              </div>
              <button class="ws-btn ws-btn-primary" id="wsSyncBtn" onclick="WebsiteModule.manualSync()">同步</button>
              <button class="ws-btn ws-btn-outline" id="wsAutoRefresh" onclick="WebsiteModule.toggleAutoRefresh()">自动刷新</button>
            </div>
          </div>
        </div>

        <!-- 搜索结果区 -->
        <div id="wsSearchResults" style="display:none;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:13px;font-weight:600;">搜索结果：<span id="wsSearchKeyword"></span>（<span id="wsSearchCount">0</span>条）</span>
            <button class="btn btn-outline btn-sm" onclick="WebsiteModule.clearSearch()">清除搜索</button>
          </div>
          <div id="wsSearchResultsList"></div>
          <div id="wsSearchPagination" style="margin-top:8px;text-align:center;"></div>
        </div>

        <!-- ========== 核心数据行 ========== -->
        <div class="ws-stats-card">
          <div class="ws-stat-item">
            <div class="ws-stat-value" id="wsTotalSessions">--</div>
            <div class="ws-stat-label">会话总数</div>
          </div>
          <div class="ws-stat-divider"></div>
          <div class="ws-stat-item">
            <div class="ws-stat-value" id="wsTotalMessages">--</div>
            <div class="ws-stat-label">消息总数</div>
          </div>
          <div class="ws-stat-divider"></div>
          <div class="ws-stat-item">
            <div class="ws-stat-value" id="wsUserMessages">--</div>
            <div class="ws-stat-label">用户提问</div>
          </div>
          <div class="ws-stat-divider"></div>
          <div class="ws-stat-item">
            <div class="ws-stat-value" id="wsAIMessages">--</div>
            <div class="ws-stat-label">AI 回复</div>
          </div>
        </div>

        <!-- ========== 趋势与洞察 ========== -->
        <div class="ws-trend-card">
          <div class="ws-trend-left">
            <div class="ws-card-header">
              <span class="ws-card-title">会话趋势</span>
              <span class="ws-card-subtitle">按日统计</span>
            </div>
            <div class="ws-empty" style="padding:36px 0;text-align:center;color:var(--color-text-muted);">
              暂无趋势数据。同步会话后可在下方洞察中分析。
            </div>
          </div>
          <div class="ws-trend-divider"></div>
          <div class="ws-trend-right">
            <div class="ws-card-header">
              <span class="ws-card-title">关键洞察</span>
            </div>
            <div class="ws-insight-list">
              <div class="ws-empty">暂无洞察，点击下方"生成洞察"分析访客提问。</div>
            </div>
            <a class="ws-link-more" onclick="WebsiteModule.scrollToInsights()">查看全部洞察 →</a>
          </div>
        </div>

        <!-- ========== 最近会话列表 ========== -->
        <div class="ws-list-card">
          <div class="ws-list-header">
            <span class="ws-card-title">最近会话</span>
            <span id="wsSessionCount" class="ws-list-count"></span>
            <a class="ws-link-more" onclick="WebsiteModule.showAllSessions()">查看全部</a>
          </div>
          <div class="ws-recent-list" id="wsSessionList"></div>
          <div id="wsSessionPagination" style="margin-top:8px;text-align:center;"></div>
        </div>

        <!-- ========== 洞察区域 ========== -->
        <div class="ws-panel-card" id="wsInsightSection">
          <div class="ws-card-header" style="flex-wrap:wrap;gap:8px;">
            <span class="ws-card-title">💡 访客洞察</span>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-left:auto;">
              <input type="date" id="wsInsightStart" class="ws-date-input">
              <span style="font-size:11px;color:var(--color-text-muted);">至</span>
              <input type="date" id="wsInsightEnd" class="ws-date-input">
              <button class="ws-btn ws-btn-primary ws-btn-sm" id="wsInsightBtn" onclick="WebsiteModule.generateInsight()">生成洞察</button>
            </div>
          </div>
          <div id="wsInsightList" style="margin-top:12px;">
            <div class="ws-empty">点击"生成洞察"分析访客提问，生成深度洞察</div>
          </div>
        </div>

        <!-- 同步状态（隐藏但保留功能） -->
        <span class="ws-sync-status" id="wsSyncStatus" style="display:none;"></span>
      </div>
    `;
    this.loadSyncStatus();
    this.loadStats();
    this.loadSessions();
    this.loadInsights();
  },

  togglePreset() {
    const content = document.getElementById('wsPresetContent');
    const arrow = document.getElementById('wsPresetArrow');
    if (content.style.display === 'none') {
      content.style.display = 'block';
      arrow.textContent = '▼';
    } else {
      content.style.display = 'none';
      arrow.textContent = '▶';
    }
  },

  scrollToInsights() {
    const el = document.getElementById('wsInsightSection');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  showAllSessions() {
    this.currentPage = 1;
    this.loadSessions();
  },

  // ========== 同步 ==========

  async loadSyncStatus() {
    try {
      const status = await API.request('GET', '/website-admin/sync/status');
      const el = document.getElementById('wsSyncStatus');
      if (el) {
        let text = `本地会话：${status.totalSessions} | `;
        if (status.isSyncing) {
          text += '<span style="color:var(--color-warning)">同步中...</span>';
        } else if (status.lastSync && !status.lastSync.success) {
          text += `<span style="color:var(--color-destructive)">同步失败：${status.lastSync.error || '未知错误'}</span>`;
        } else if (status.lastSyncedAt) {
          text += `最后同步：${new Date(status.lastSyncedAt).toLocaleString('zh-CN')}`;
        } else {
          text += '未同步';
        }
        text += ` | 云端：${status.config.cloudApiBaseUrl}`;
        el.innerHTML = text;
      }
    } catch (e) {
      // 静默失败
    }
  },

  async manualSync() {
    const btn = document.getElementById('wsSyncBtn');
    if (btn) { btn.disabled = true; btn.textContent = '同步中...'; }
    try {
      const result = await API.request('POST', '/website-admin/sync/pull');
      if (result.success) {
        UI.toast(`同步完成：新增/更新 ${result.synced}，跳过 ${result.skipped}`, 'success');
        this.loadStats();
        this.loadSessions();
      } else {
        UI.toast('同步失败：' + (result.error || '未知错误'), 'error');
      }
    } catch (e) {
      UI.toast('同步请求失败：' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '同步'; }
      this.loadSyncStatus();
    }
  },

  toggleAutoRefresh() {
    const btn = document.getElementById('wsAutoRefresh');
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      if (btn) btn.textContent = '自动刷新';
      UI.toast('已关闭自动刷新', 'info');
    } else {
      this.refreshTimer = setInterval(() => {
        this.loadStats();
        this.loadSessions();
        this.loadSyncStatus();
      }, 30000);
      if (btn) btn.textContent = '停止刷新';
      UI.toast('已开启自动刷新（30秒）', 'info');
    }
  },

  // ========== 统计 ==========

  async loadStats() {
    try {
      const data = await API.getWebsiteStats();
      this.stats = data;
      this.renderStats(data);
    } catch (e) {
      UI.toast('加载统计失败: ' + e.message, 'error');
    }
  },

  renderStats(data) {
    const map = {
      wsTotalSessions: data.totalSessions,
      wsTotalMessages: data.totalMessages,
      wsUserMessages: data.userMessages,
      wsAIMessages: data.aiMessages,
    };
    Object.keys(map).forEach((id) => {
      const el = document.getElementById(id);
      if (el && map[id] != null) el.textContent = Number(map[id]).toLocaleString();
    });
  },

  // ========== 会话列表 ==========

  async loadSessions() {
    const listEl = document.getElementById('wsSessionList');
    const countEl = document.getElementById('wsSessionCount');
    if (!listEl) return;

    listEl.innerHTML = '<div class="ws-empty">加载中...</div>';

    try {
      const data = await API.request('GET', `/website-admin/sessions?page=${this.currentPage}&pageSize=${this.pageSize}`);

      if (countEl) countEl.textContent = `共 ${data.total} 条`;

      if (data.total === 0) {
        listEl.innerHTML = '<div class="ws-empty">暂无会话数据，点击"同步"从云端拉取</div>';
        document.getElementById('wsSessionPagination').innerHTML = '';
        return;
      }

      // 分离普通会话和预设问答会话
      const normalSessions = data.sessions.filter(s => !s.is_only_preset);
      const presetSessions = data.sessions.filter(s => s.is_only_preset);

      let html = '';

      // 普通会话
      html += normalSessions.map(s => `
        <div class="ws-session-row" data-id="${s.session_id}">
          <div class="ws-session-visitor">
            <div class="ws-visitor-avatar">👤</div>
            <div class="ws-visitor-info">
              <div class="ws-visitor-name">访客 · ${UI.escapeHtml(s.source || 'direct')}</div>
              <div class="ws-visitor-page">${UI.escapeHtml(s.first_question || '(无用户提问)')}</div>
            </div>
          </div>
          <div class="ws-session-meta-right">
            <span class="ws-session-duration">${s.message_count} 条消息</span>
            <span class="ws-session-time">${s.updated_at ? new Date(s.updated_at).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''}</span>
          </div>
        </div>
      `).join('');

      // 预设问答会话（合并显示）
      if (presetSessions.length > 0) {
        const arrow = this.presetExpanded ? '▼' : '▶';
        html += `
          <div class="ws-session-row ws-preset-group" id="presetGroupHeader" style="cursor:pointer;">
            <div class="ws-session-visitor">
              <div class="ws-visitor-avatar" style="background:var(--color-secondary);">📋</div>
              <div class="ws-visitor-info">
                <div class="ws-visitor-name" style="color:var(--color-text-secondary);">${arrow} ${presetSessions.length} 位访客仅进行了预设问答</div>
                <div class="ws-visitor-page" style="color:var(--color-text-muted);">点击展开查看详情</div>
              </div>
            </div>
          </div>
          <div id="presetGroupList" style="display:${this.presetExpanded ? 'block' : 'none'};">
            ${presetSessions.map(s => `
              <div class="ws-session-row" data-id="${s.session_id}" style="opacity:0.7;">
                <div class="ws-session-visitor">
                  <div class="ws-visitor-avatar" style="background:var(--color-secondary);">👤</div>
                  <div class="ws-visitor-info">
                    <div class="ws-visitor-name">访客 · ${UI.escapeHtml(s.source || 'direct')}</div>
                    <div class="ws-visitor-page">${UI.escapeHtml(s.first_question || '(无用户提问)')}</div>
                  </div>
                </div>
                <div class="ws-session-meta-right">
                  <span class="ws-session-duration">${s.message_count} 条</span>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }

      listEl.innerHTML = html;

      // 普通会话和预设会话的点击事件
      listEl.querySelectorAll('.ws-session-row:not(.ws-preset-group)').forEach(item => {
        item.addEventListener('click', () => this.showSessionDetail(item.dataset.id));
      });

      // 预设分组展开/折叠
      const presetHeader = document.getElementById('presetGroupHeader');
      if (presetHeader) {
        presetHeader.addEventListener('click', (e) => {
          e.stopPropagation();
          this.presetExpanded = !this.presetExpanded;
          this.loadSessions();
        });
      }

      // 分页
      const totalPages = Math.ceil(data.total / data.pageSize);
      const pagEl = document.getElementById('wsSessionPagination');
      if (totalPages > 1) {
        pagEl.innerHTML = `
          <span style="font-size:11px;color:var(--color-text-muted);margin-right:8px;">第 ${data.page}/${totalPages} 页</span>
          <button class="btn btn-outline btn-sm" ${data.page <= 1 ? 'disabled' : ''} onclick="WebsiteModule.goPage(${data.page - 1})">上一页</button>
          <button class="btn btn-outline btn-sm" ${data.page >= totalPages ? 'disabled' : ''} onclick="WebsiteModule.goPage(${data.page + 1})">下一页</button>
        `;
      } else {
        pagEl.innerHTML = '';
      }
    } catch (e) {
      listEl.innerHTML = `<div class="ws-empty">加载失败：${UI.escapeHtml(e.message)}</div>`;
    }
  },

  goPage(page) {
    this.currentPage = page;
    this.loadSessions();
  },

  // ========== 会话详情 ==========

  async showSessionDetail(sessionId) {
    UI.showLoading('加载会话详情...');
    try {
      const session = await API.request('GET', `/website-admin/sessions/${encodeURIComponent(sessionId)}`);
      UI.hideLoading();

      const messages = session.messages || [];
      const html = `
        <div class="ws-session-detail">
          <div style="margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--color-border);display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <div style="font-size:13px;font-weight:600;">会话详情</div>
              <div style="font-size:11px;color:var(--color-text-muted);margin-top:4px;">
                来源：${UI.escapeHtml(session.source || '-')} | 
                创建：${session.created_at ? new Date(session.created_at).toLocaleString('zh-CN') : '-'} | 
                ${messages.length} 条消息
              </div>
            </div>
            <button class="btn btn-outline btn-sm" style="color:var(--color-destructive);border-color:var(--color-destructive);" onclick="WebsiteModule.deleteSession('${sessionId}')">删除会话</button>
          </div>
          ${messages.map(m => `
            <div class="ws-msg ${m.role}">
              <div class="ws-msg-role">
                ${m.role === 'user' ? '👤 访客' : m.role === 'assistant' ? '🤖 Siyi' : '🔧 ' + (m.tool_name || '工具')}
              </div>
              <div>${UI.escapeHtml(m.content || '').replace(/\n/g, '<br>')}</div>
              ${m.created_at ? `<div class="ws-msg-time">${new Date(m.created_at).toLocaleString('zh-CN')}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `;
      UI.showModal('会话详情', html);
    } catch (e) {
      UI.hideLoading();
      UI.toast('加载失败: ' + e.message, 'error');
    }
  },

  async deleteSession(sessionId) {
    if (!confirm('确定要删除这个会话吗？此操作不可恢复。')) return;
    try {
      await API.request('DELETE', `/website-admin/sessions/${encodeURIComponent(sessionId)}`);
      UI.toast('会话已删除', 'success');
      UI.hideModal();
      this.loadSessions();
      this.loadStats();
    } catch (e) {
      UI.toast('删除失败：' + e.message, 'error');
    }
  },

  // ========== 搜索 ==========

  async doSearch() {
    const input = document.getElementById('wsSearchInput');
    const keyword = input ? input.value.trim() : '';
    if (!keyword) { this.clearSearch(); return; }

    this.searchKeyword = keyword;
    this.searchPage = 1;
    document.getElementById('wsSearchKeyword').textContent = keyword;
    document.getElementById('wsSearchResults').style.display = 'block';
    this.renderSearchResults();
  },

  async renderSearchResults() {
    const listEl = document.getElementById('wsSearchResultsList');
    listEl.innerHTML = '<div class="ws-empty">搜索中...</div>';

    try {
      const data = await API.request('GET', `/website-admin/search?q=${encodeURIComponent(this.searchKeyword)}&page=${this.searchPage}&pageSize=10`);
      document.getElementById('wsSearchCount').textContent = data.total;

      if (data.total === 0) {
        listEl.innerHTML = '<div class="ws-empty">未找到匹配结果</div>';
        document.getElementById('wsSearchPagination').innerHTML = '';
        return;
      }

      listEl.innerHTML = data.results.map(r => `
        <div class="ws-session-row" onclick="WebsiteModule.showSessionDetail('${r.session_id}')">
          <div class="ws-session-visitor">
            <div class="ws-visitor-avatar">${r.role === 'user' ? '👤' : '🤖'}</div>
            <div class="ws-visitor-info">
              <div class="ws-visitor-name">${r.role}${r.tool_name ? ' · ' + UI.escapeHtml(r.tool_name) : ''}</div>
              <div class="ws-visitor-page">${UI.escapeHtml((r.content || '').substring(0, 100))}</div>
            </div>
          </div>
          <div class="ws-session-meta-right">
            <span class="ws-session-time">${r.created_at ? new Date(r.created_at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''}</span>
          </div>
        </div>
      `).join('');

      const totalPages = Math.ceil(data.total / data.pageSize);
      const pagEl = document.getElementById('wsSearchPagination');
      if (totalPages > 1) {
        pagEl.innerHTML = `
          <span style="font-size:11px;color:var(--color-text-muted);margin-right:8px;">第 ${data.page}/${totalPages} 页</span>
          <button class="btn btn-outline btn-sm" ${data.page <= 1 ? 'disabled' : ''} onclick="WebsiteModule.searchGoPage(${data.page - 1})">上一页</button>
          <button class="btn btn-outline btn-sm" ${data.page >= totalPages ? 'disabled' : ''} onclick="WebsiteModule.searchGoPage(${data.page + 1})">下一页</button>
        `;
      } else {
        pagEl.innerHTML = '';
      }
    } catch (e) {
      listEl.innerHTML = `<div class="ws-empty">搜索失败：${UI.escapeHtml(e.message)}</div>`;
    }
  },

  searchGoPage(page) {
    this.searchPage = page;
    this.renderSearchResults();
  },

  clearSearch() {
    const input = document.getElementById('wsSearchInput');
    if (input) input.value = '';
    this.searchKeyword = '';
    document.getElementById('wsSearchResults').style.display = 'none';
  },

  // ========== 洞察 ==========

  async loadInsights() {
    const listEl = document.getElementById('wsInsightList');
    if (!listEl) return;

    try {
      const data = await API.request('GET', '/website-admin/insights?page=1&pageSize=10');
      if (data.total === 0) {
        listEl.innerHTML = '<div class="ws-empty">暂无洞察，点击"生成洞察"开始分析</div>';
        return;
      }

      listEl.innerHTML = data.insights.map(insight => `
        <div class="ws-session-row" onclick="WebsiteModule.showInsightDetail(${insight.id})" style="cursor:pointer;">
          <div class="ws-session-visitor">
            <div class="ws-visitor-avatar" style="background:rgba(141,124,199,0.1);color:var(--color-primary);">💡</div>
            <div class="ws-visitor-info">
              <div class="ws-visitor-name" style="color:var(--color-primary);">${UI.escapeHtml(insight.title)}</div>
              <div class="ws-visitor-page">${UI.escapeHtml((insight.summary || '').substring(0, 100))}</div>
            </div>
          </div>
          <div class="ws-session-meta-right">
            <span class="ws-session-time">${insight.created_at ? new Date(insight.created_at).toLocaleDateString('zh-CN') : ''}</span>
          </div>
        </div>
      `).join('');
    } catch (e) {
      listEl.innerHTML = `<div class="ws-empty">加载洞察失败：${UI.escapeHtml(e.message)}</div>`;
    }
  },

  async generateInsight() {
    const btn = document.getElementById('wsInsightBtn');
    const startDate = document.getElementById('wsInsightStart')?.value || '';
    const endDate = document.getElementById('wsInsightEnd')?.value || '';

    if (btn) { btn.disabled = true; btn.textContent = '生成中...'; }

    try {
      UI.showLoading('正在生成洞察，分析访客提问...');
      const insight = await API.request('POST', '/website-admin/insights/generate', { startDate, endDate });
      UI.hideLoading();

      if (insight.title === '数据不足') {
        UI.toast('数据不足，无法生成洞察。请先同步数据或选择其他时间范围。', 'warning');
      } else {
        UI.toast('洞察生成成功！', 'success');
      }

      this.showInsightDetail(insight.id);
      this.loadInsights();
    } catch (e) {
      UI.hideLoading();
      UI.toast('洞察生成失败：' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '生成洞察'; }
    }
  },

  async showInsightDetail(id) {
    UI.showLoading('加载洞察详情...');
    try {
      const insight = await API.request('GET', `/website-admin/insights/${id}`);
      UI.hideLoading();

      const evidenceHtml = (insight.evidence && insight.evidence.length > 0)
        ? `<div style="margin-top:12px;">
             <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--color-text-secondary);">证据（用户提问原文）</div>
             ${insight.evidence.map((e, i) => `<div style="font-size:12px;padding:6px 10px;background:var(--color-secondary);border-radius:4px;margin-bottom:4px;color:var(--color-text-secondary);">${i + 1}. ${UI.escapeHtml(e)}</div>`).join('')}
           </div>`
        : '';

      const isConverted = insight.status === 'converted_to_review';
      const actionBtn = isConverted
        ? `<span style="font-size:11px;padding:4px 10px;background:rgba(91,140,110,0.15);color:var(--color-success);border-radius:4px;">✓ 已转化为复盘 #${insight.review_id}</span>`
        : `<button class="btn btn-outline btn-sm" style="font-size:11px;padding:4px 10px;" onclick="WebsiteModule.convertToReview(${insight.id})">生成 AI 复盘</button>`;

      const html = `
        <div style="padding:4px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px;">
            <div style="font-size:16px;font-weight:700;color:var(--color-primary);flex:1;">💡 ${UI.escapeHtml(insight.title)}</div>
            ${actionBtn}
          </div>
          <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:12px;">${UI.escapeHtml(insight.date_range || '')} · ${insight.created_at ? new Date(insight.created_at).toLocaleString('zh-CN') : ''}</div>

          <div style="margin-bottom:12px;">
            <div style="font-size:12px;font-weight:600;margin-bottom:4px;color:var(--color-text-secondary);">洞察</div>
            <div style="font-size:13px;line-height:1.7;">${UI.escapeHtml(insight.summary || '').replace(/\n/g, '<br>')}</div>
          </div>

          ${insight.cognitive_gap ? `
          <div style="margin-bottom:12px;">
            <div style="font-size:12px;font-weight:600;margin-bottom:4px;color:var(--color-warning);">认知缺口</div>
            <div style="font-size:13px;line-height:1.7;color:var(--color-warning);">${UI.escapeHtml(insight.cognitive_gap)}</div>
          </div>` : ''}

          ${insight.suggestion ? `
          <div style="margin-bottom:12px;">
            <div style="font-size:12px;font-weight:600;margin-bottom:4px;color:var(--color-success);">优化建议</div>
            <div style="font-size:13px;line-height:1.7;color:var(--color-success);">${UI.escapeHtml(insight.suggestion).replace(/\n/g, '<br>')}</div>
          </div>` : ''}

          ${evidenceHtml}
        </div>
      `;
      UI.showModal('洞察详情', html);
    } catch (e) {
      UI.hideLoading();
      UI.toast('加载洞察失败：' + e.message, 'error');
    }
  },

  async convertToReview(insightId) {
    if (!confirm('确定要将此洞察转化为 AI 复盘吗？复盘将进入你的复盘库。')) return;

    try {
      UI.showLoading('正在生成 AI 复盘...');
      const result = await API.request('POST', `/website-admin/insights/${insightId}/convert-to-review`);
      UI.hideLoading();
      UI.hideModal();
      UI.toast(`复盘生成成功！复盘ID: ${result.reviewId}`, 'success');
      this.loadInsights();
    } catch (e) {
      UI.hideLoading();
      UI.toast('复盘生成失败：' + e.message, 'error');
    }
  },

  destroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  },
};

App.registerModule('website', WebsiteModule);
