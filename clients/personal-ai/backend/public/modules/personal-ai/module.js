/**
 * Personal AI 前端模块
 * 浮动面板式 Chat UI
 */

const PersonalAI = {
  isOpen: false,
  isLoading: false,
  messages: [], // { role: 'user'|'assistant', content, toolCalls }
  currentConversationId: null,
  conversations: [],
  historyVisible: false,
  mode: 'drawer',      // 默认右侧抽屉(方案C) | 可切换为 'float' 浮窗(方案A)
  _savedFloat: null,   // 缓存浮窗几何，抽屉切回时恢复

  init() {
    this.injectStyles();
    this.createPanel();
    this.bindEvents();
    this.loadConversations();
    console.log('[PersonalAI] 前端模块已初始化');
  },

  injectStyles() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/modules/personal-ai/style.css';
    document.head.appendChild(link);
  },

  createPanel() {
    const panel = document.createElement('div');
    panel.className = 'pai-panel hidden';
    panel.id = 'paiPanel';
    panel.innerHTML = `
      <div class="pai-header">
        <div class="pai-header-left">
          <button class="pai-history-btn" id="paiHistoryBtn" title="对话历史">☰</button>
          <div class="pai-avatar">AI</div>
          <div>
            <div class="pai-title">Personal AI</div>
            <div class="pai-subtitle">你的个人 AI 助手</div>
          </div>
        </div>
        <button class="pai-new-btn" id="paiNewBtn" title="新对话">✎</button>
        <button class="pai-mode-btn" id="paiModeBtn" title="切换为右侧抽屉">▭</button>
        <button class="pai-max-btn" id="paiMaxBtn" title="最大化">⛶</button>
        <button class="pai-close-btn" id="paiCloseBtn">✕</button>
      </div>
      <div class="pai-body">
        <div class="pai-history-panel hidden" id="paiHistoryPanel">
          <div class="pai-history-header">
            <span>对话历史</span>
            <button class="pai-history-close" id="paiHistoryClose">✕</button>
          </div>
          <div class="pai-history-list" id="paiHistoryList"></div>
        </div>
        <div class="pai-messages" id="paiMessages">
        <div class="pai-welcome" id="paiWelcome">
          <div class="pai-welcome-icon">🧠</div>
          <div class="pai-welcome-title">你好，我是你的 Personal AI</div>
          <div class="pai-welcome-desc">正在了解你的使用习惯…</div>
          <div class="pai-suggestions" id="paiSuggestions"></div>
        </div>
      </div>
      </div>
      <div class="pai-input-area">
        <div class="pai-input-wrapper">
          <textarea class="pai-input" id="paiInput" placeholder="输入你的问题..." rows="1"></textarea>
          <button class="pai-send-btn" id="paiSendBtn" disabled>➤</button>
        </div>
        <div class="pai-footer-hint">Enter 发送 · Shift+Enter 换行</div>
      </div>
    `;
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'pai-resize-handle';
    resizeHandle.id = 'paiResizeHandle';
    resizeHandle.title = '拖拽调整大小';
    resizeHandle.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M11 3L3 11M11 7L7 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>';
    panel.appendChild(resizeHandle);
    const overlay = document.createElement('div');
    overlay.className = 'pai-drawer-overlay';
    overlay.id = 'paiDrawerOverlay';
    document.body.appendChild(overlay);
    this.overlay = overlay;
    document.body.appendChild(panel);
    this.panel = panel;
    this.messagesEl = panel.querySelector('#paiMessages');
    this.inputEl = panel.querySelector('#paiInput');
    this.sendBtn = panel.querySelector('#paiSendBtn');
    this.historyPanel = panel.querySelector('#paiHistoryPanel');
    this.historyList = panel.querySelector('#paiHistoryList');
  },

  bindEvents() {
    // 关闭按钮
    this.panel.querySelector('#paiCloseBtn').addEventListener('click', () => this.close());

    // 历史记录按钮
    this.panel.querySelector('#paiHistoryBtn').addEventListener('click', () => this.toggleHistory());
    this.panel.querySelector('#paiHistoryClose').addEventListener('click', () => this.toggleHistory());

    // 新对话按钮
    this.panel.querySelector('#paiNewBtn').addEventListener('click', () => this.newConversation());

    // 发送按钮
    this.sendBtn.addEventListener('click', () => this.sendMessage());

    // 窗口控制：模式切换 / 最大化 / 遮罩点击关闭
    this.panel.querySelector('#paiModeBtn').addEventListener('click', () => this.switchMode());
    this.panel.querySelector('#paiMaxBtn').addEventListener('click', () => this.toggleMaximize());
    this.overlay.addEventListener('click', () => this.close());
    this.setupWindowControls();
    this.loadWindowState();

    // 输入框
    this.inputEl.addEventListener('input', () => {
      this.sendBtn.disabled = !this.inputEl.value.trim();
      // 自动调整高度
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 100) + 'px';
    });

    // 键盘事件
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // 建议芯片
    this.panel.addEventListener('click', (e) => {
      if (e.target.classList.contains('pai-suggestion-chip')) {
        const msg = e.target.dataset.msg;
        this.inputEl.value = msg;
        this.inputEl.dispatchEvent(new Event('input'));
        this.sendMessage();
      }
    });
  },

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  },

  open() {
    this.panel.classList.remove('hidden');
    this.isOpen = true;
    if (this.mode === 'drawer' && this.overlay) this.overlay.classList.add('show');
    // 打开时异步填充个性化欢迎（若仍在欢迎态）
    this.loadWelcome();
    setTimeout(() => this.inputEl.focus(), 100);
  },

  close() {
    this.panel.classList.add('hidden');
    if (this.overlay) this.overlay.classList.remove('show');
    this.isOpen = false;
  },

  // ========== 窗口控制：拖拽 / 缩放 / 最大化 / 模式切换 ==========
  setupWindowControls() {
    const header = this.panel.querySelector('.pai-header');
    const handle = this.panel.querySelector('#paiResizeHandle');

    // 按住标题栏拖动（点按钮/头像时不拖）
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button') || e.target.closest('.pai-avatar')) return;
      if (this.panel.classList.contains('maximized') || this.mode === 'drawer') return;
      if (window.matchMedia('(max-width: 768px)').matches) return; // 小屏用响应式全屏布局，不拖拽
      const rect = this.panel.getBoundingClientRect();
      const startX = e.clientX, startY = e.clientY;
      const origLeft = rect.left, origTop = rect.top;
      this.panel.classList.add('dragging');
      this.panel.style.left = origLeft + 'px';
      this.panel.style.top = origTop + 'px';
      this.panel.style.right = 'auto';
      this.panel.style.bottom = 'auto';
      const onMove = (ev) => {
        const w = this.panel.offsetWidth, h = this.panel.offsetHeight;
        let nx = origLeft + (ev.clientX - startX);
        let ny = origTop + (ev.clientY - startY);
        nx = Math.min(Math.max(nx, -w + 60), window.innerWidth - 60);
        ny = Math.min(Math.max(ny, 0), window.innerHeight - 48);
        this.panel.style.left = nx + 'px';
        this.panel.style.top = ny + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        this.panel.classList.remove('dragging');
        this.saveWindowState();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });

    // 右下角拖拽缩放
    handle.addEventListener('mousedown', (e) => {
      if (this.panel.classList.contains('maximized') || this.mode === 'drawer') return;
      if (window.matchMedia('(max-width: 768px)').matches) return; // 小屏不缩放
      const startX = e.clientX, startY = e.clientY;
      const startW = this.panel.offsetWidth, startH = this.panel.offsetHeight;
      const rect = this.panel.getBoundingClientRect();
      if (!this.panel.style.left) {
        this.panel.style.left = rect.left + 'px';
        this.panel.style.top = rect.top + 'px';
        this.panel.style.right = 'auto';
        this.panel.style.bottom = 'auto';
      }
      this.panel.classList.add('resizing');
      const onMove = (ev) => {
        const nw = Math.min(Math.max(startW + (ev.clientX - startX), 360), window.innerWidth * 0.92);
        const nh = Math.min(Math.max(startH + (ev.clientY - startY), 480), window.innerHeight * 0.92);
        this.panel.style.width = nw + 'px';
        this.panel.style.height = nh + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        this.panel.classList.remove('resizing');
        this.saveWindowState();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
      e.stopPropagation();
    });
  },

  toggleMaximize() {
    if (this.mode === 'drawer') return;
    const btn = this.panel.querySelector('#paiMaxBtn');
    const isMax = this.panel.classList.toggle('maximized');
    if (isMax) { btn.textContent = '❐'; btn.title = '还原'; }
    else { btn.textContent = '⛶'; btn.title = '最大化'; }
    this.saveWindowState();
  },

  switchMode() {
    const next = this.panel.classList.contains('drawer-mode') ? 'float' : 'drawer';
    this.applyMode(next);
    this.saveWindowState();
  },

  // 统一应用窗口模式样式（不负责持久化）
  applyMode(mode) {
    this.mode = mode;
    const modeBtn = this.panel.querySelector('#paiModeBtn');
    const maxBtn = this.panel.querySelector('#paiMaxBtn');
    if (mode === 'drawer') {
      this.panel.classList.remove('maximized');
      this.panel.classList.add('drawer-mode');
      modeBtn.textContent = '◳'; modeBtn.title = '切换为浮窗';
      maxBtn.textContent = '⛶'; maxBtn.title = '最大化';
      if (this.isOpen) this.overlay.classList.add('show');
    } else {
      this.panel.classList.remove('drawer-mode');
      modeBtn.textContent = '▭'; modeBtn.title = '切换为右侧抽屉';
      this.overlay.classList.remove('show');
      this.applyFloatGeometry();
    }
  },

  applyFloatGeometry() {
    const s = this._savedFloat || {};
    this.panel.style.width = (s.width || 460) + 'px';
    this.panel.style.height = (s.height || 640) + 'px';
    if (s.left != null && s.top != null) {
      this.panel.style.left = s.left + 'px';
      this.panel.style.top = s.top + 'px';
      this.panel.style.right = 'auto';
      this.panel.style.bottom = 'auto';
    } else {
      this.panel.style.left = ''; this.panel.style.top = '';
      this.panel.style.right = ''; this.panel.style.bottom = '';
    }
  },

  saveWindowState() {
    const state = { mode: this.mode || 'drawer', maximized: this.panel.classList.contains('maximized') };
    if (this.mode === 'float' && !state.maximized) {
      state.left = parseInt(this.panel.style.left) || null;
      state.top = parseInt(this.panel.style.top) || null;
      state.width = this.panel.offsetWidth;
      state.height = this.panel.offsetHeight;
      this._savedFloat = { left: state.left, top: state.top, width: state.width, height: state.height };
    }
    try { localStorage.setItem('pai_window_state', JSON.stringify(state)); } catch (err) {}
  },

  loadWindowState() {
    let state = null;
    try { state = JSON.parse(localStorage.getItem('pai_window_state') || 'null'); } catch (err) { state = null; }
    // 无保存记录时默认抽屉(方案C)
    const mode = (state && state.mode) || 'drawer';
    if (mode === 'float' && state) {
      if (state.width) this.panel.style.width = state.width + 'px';
      if (state.height) this.panel.style.height = state.height + 'px';
      if (state.left != null && state.top != null) {
        this.panel.style.left = state.left + 'px';
        this.panel.style.top = state.top + 'px';
        this.panel.style.right = 'auto';
        this.panel.style.bottom = 'auto';
      }
      this._savedFloat = { left: state.left, top: state.top, width: state.width, height: state.height };
    }
    this.applyMode(mode);
    if (mode === 'float' && state && state.maximized) {
      this.panel.classList.add('maximized');
      const maxBtn = this.panel.querySelector('#paiMaxBtn');
      maxBtn.textContent = '❐'; maxBtn.title = '还原';
    }
  },

  async sendMessage() {
    const text = this.inputEl.value.trim();
    if (!text || this.isLoading) return;

    // 清空欢迎消息（首次发送时）
    if (this.messages.length === 0) {
      this.messagesEl.innerHTML = '';
    }

    // 添加用户消息
    this.addMessage('user', text);
    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';
    this.sendBtn.disabled = true;
    this.isLoading = true;

    // 创建 AI 消息占位（用于流式填充）
    const aiMsgEl = this.createAIMessagePlaceholder();

    try {
      // 构建消息数组（包含历史）
      const messages = this.messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      // 调用流式 API
      const response = await fetch('/api/personal-ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullReply = '';
      let toolCallsShown = false;
      // 实时工具执行轨迹：tool_start 创建"执行中"卡片，tool_end 更新状态并记录
      let liveToolEntries = [];
      let liveToolsSeen = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const data = JSON.parse(dataStr);

            if (data.type === 'start') {
              // 流开始：保持“正在思考”胶囊，直到第一条实际内容输出后再淡出
            } else if (data.type === 'tool_start') {
              // 工具开始执行：实时渲染"执行中"卡片
              liveToolsSeen = true;
              toolCallsShown = true;
              const cardEl = this.addToolCall({ name: data.name, args: data.args, step: data.step, running: true });
              liveToolEntries.push({ id: data.id, name: data.name, args: data.args, step: data.step, el: cardEl, done: false });
            } else if (data.type === 'tool_end') {
              // 工具执行结束：更新对应卡片状态、耗时与结果
              const entry = (data.id && liveToolEntries.find(e => e.id === data.id && !e.done)) || liveToolEntries.find(e => !e.done);
              if (entry) {
                entry.done = true;
                entry.success = data.success;
                entry.duration = data.duration;
                entry.result = data.result;
                this.completeToolCall(entry.el, entry);
              }
            } else if (data.type === 'tool_calls') {
              // 兼容旧后端：一次性工具调用事件（仅在未收到实时事件时渲染，避免重复）
              if (!liveToolsSeen && !toolCallsShown && data.toolCalls) {
                data.toolCalls.forEach(tc => this.addToolCall(tc));
                toolCallsShown = true;
              }
            } else if (data.type === 'content') {
              // 流式内容追加
              fullReply += data.content;
              this.updateAIMessage(aiMsgEl, fullReply);
            } else if (data.type === 'error') {
              fullReply += `\n\n[错误] ${data.error}`;
              this.updateAIMessage(aiMsgEl, fullReply);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }

      // 流结束，保存完整消息（含工具执行轨迹，切换会话后仍可查看）
      const assistantMsg = { role: 'assistant', content: fullReply || '（无回复内容）' };
      if (liveToolEntries.length > 0) {
        assistantMsg.toolCalls = liveToolEntries
          .filter(e => e.done)
          .map(e => ({ name: e.name, args: e.args, step: e.step, success: e.success !== false, duration: e.duration, result: e.result }));
      }
      if (!fullReply) {
        this.updateAIMessage(aiMsgEl, '（无回复内容）');
      }
      this.messages.push(assistantMsg);

    } catch (err) {
      this.updateAIMessage(aiMsgEl, `网络错误：${err.message}`);
      this.messages.push({ role: 'assistant', content: `网络错误：${err.message}` });
    } finally {
      this.isLoading = false;
      this.scrollToBottom();
      // 自动保存当前对话
      this.saveCurrentConversation();
    }
  },

  createAIMessagePlaceholder() {
    const el = document.createElement('div');
    el.className = 'pai-msg assistant';
    el.innerHTML = `<div class="pai-msg-bubble"><div class="pai-typing"><span class="pai-typing-orbit"><span class="pai-orbit-ring"></span><span class="pai-orbit-ring pai-orbit-ring-2"></span><span class="pai-orbit-core"></span><span class="pai-orbit-rotor"><span class="pai-orbit-dot pai-orbit-dot-1"></span><span class="pai-orbit-dot pai-orbit-dot-2"></span></span></span></div></div>`;
    this.messagesEl.appendChild(el);
    this.scrollToBottom();
    return el;
  },

  updateAIMessage(el, content) {
    const bubble = el.querySelector('.pai-msg-bubble');
    if (bubble) {
      const typing = bubble.querySelector('.pai-typing');
      if (typing) {
        // 文字插在“正在思考”胶囊之后，胶囊随后淡出，避免瞬间闪空气泡
        let streamEl = bubble.querySelector('.pai-stream-content');
        if (streamEl) {
          streamEl.innerHTML = this.renderMarkdown(content);
        } else {
          streamEl = document.createElement('div');
          streamEl.className = 'pai-stream-content';
          streamEl.innerHTML = this.renderMarkdown(content);
          typing.insertAdjacentElement('afterend', streamEl);
        }
        if (!typing.classList.contains('pai-typing-leave')) {
          typing.classList.add('pai-typing-leave');
          setTimeout(() => typing.remove(), 260);
        }
      } else {
        bubble.innerHTML = this.renderMarkdown(content);
      }
    }
    this.scrollToBottom();
  },

  addMessage(role, content) {
    this.messages.push({ role, content });

    const msgEl = document.createElement('div');
    msgEl.className = `pai-msg ${role}`;
    msgEl.innerHTML = `<div class="pai-msg-bubble">${this.renderMarkdown(content)}</div>`;
    this.messagesEl.appendChild(msgEl);
    this.scrollToBottom();
    return msgEl;
  },

  addTypingIndicator() {
    const el = document.createElement('div');
    el.className = 'pai-msg assistant';
    el.innerHTML = `<div class="pai-msg-bubble"><div class="pai-typing"><span class="pai-typing-orbit"><span class="pai-orbit-ring"></span><span class="pai-orbit-ring pai-orbit-ring-2"></span><span class="pai-orbit-core"></span><span class="pai-orbit-rotor"><span class="pai-orbit-dot pai-orbit-dot-1"></span><span class="pai-orbit-dot pai-orbit-dot-2"></span></span></span></div></div>`;
    this.messagesEl.appendChild(el);
    this.scrollToBottom();
    return el;
  },

  addToolCall(toolCall) {
    const el = document.createElement('div');
    el.className = 'pai-tool-call';

    const running = !!toolCall.running;
    const failed = toolCall.success === false || toolCall.result?.success === false;
    const status = running ? 'running' : (failed ? 'error' : 'success');
    const statusText = running ? '执行中' : (failed ? '失败' : '完成');
    const icon = this.getToolIcon(toolCall.name);
    const stepLabel = toolCall.step ? `<span class="pai-tool-step">Step ${toolCall.step}</span>` : '';
    const durationLabel = !running && toolCall.duration != null ? `<span class="pai-tool-duration">${toolCall.duration}ms</span>` : '';

    el.innerHTML = `
      <div class="pai-tool-card">
        <div class="pai-tool-header">
          <span class="pai-tool-icon">${icon}</span>
          <span class="pai-tool-name">${toolCall.name}</span>
          ${stepLabel}
          <span class="pai-tool-status ${status}">${statusText}</span>
          ${durationLabel}
          <span class="pai-tool-toggle">▼</span>
        </div>
        <div class="pai-tool-body">
          <div class="pai-tool-args">参数: ${JSON.stringify(toolCall.args)}</div>
          <div class="pai-tool-result">${running ? '等待执行结果…' : this.formatToolResult(toolCall)}</div>
        </div>
      </div>
    `;

    // 点击展开/收起
    const header = el.querySelector('.pai-tool-header');
    const body = el.querySelector('.pai-tool-body');
    const toggle = el.querySelector('.pai-tool-toggle');
    header.addEventListener('click', () => {
      body.classList.toggle('expanded');
      toggle.textContent = body.classList.contains('expanded') ? '▲' : '▼';
    });

    this.messagesEl.appendChild(el);
    this.scrollToBottom();
    return el;
  },

  // 工具执行结束：更新卡片状态徽章、耗时与结果内容
  completeToolCall(el, entry) {
    if (!el) return;
    const statusEl = el.querySelector('.pai-tool-status');
    if (statusEl) {
      const failed = entry.success === false;
      statusEl.className = `pai-tool-status ${failed ? 'error' : 'success'}`;
      statusEl.textContent = failed ? '失败' : '完成';
    }
    if (entry.duration != null) {
      const nameEl = el.querySelector('.pai-tool-name');
      if (nameEl) {
        const durationEl = document.createElement('span');
        durationEl.className = 'pai-tool-duration';
        durationEl.textContent = `${entry.duration}ms`;
        nameEl.insertAdjacentElement('afterend', durationEl);
      }
    }
    const resultEl = el.querySelector('.pai-tool-result');
    if (resultEl) {
      resultEl.innerHTML = this.formatToolResult(entry);
    }
  },

  getToolIcon(name) {
    const icons = {
      'knowledge.search': '🔍',
      'knowledge.get': '📄',
      'knowledge.save': '💾',
      'knowledge.compare': '⚖️',
      'prompt.search': '🔍',
      'prompt.get': '📋',
      'prompt.save': '💾',
      'review.search': '🔍',
      'review.get': '📊',
      'review.quality': '📈',
      'review.patterns': '🔁',
      'action.list': '📋',
      'action.create': '➕',
      'action.complete': '✅',
    };
    return icons[name] || '🔧';
  },

  formatToolResult(toolCall) {
    const result = toolCall.result;
    if (!result) return '无结果';
    if (result.success === false) {
      return `错误: ${result.error?.message || '未知错误'}`;
    }
    try {
      // 知识搜索结果：格式化显示
      if (toolCall.name === 'knowledge.search' && result.data?.results) {
        return result.data.results.map((r, i) =>
          `${i + 1}. ${r.title} (相关度: ${(r.score * 100).toFixed(0)}%)\n   ${r.excerpt?.substring(0, 80) || ''}...`
        ).join('\n\n');
      }
      // 知识对比结果：显示最接近的笔记列表 + AI 分析结论
      if (toolCall.name === 'knowledge.compare') {
        const lines = [];
        if (Array.isArray(result.results)) {
          result.results.forEach((r, i) => lines.push(`${i + 1}. ${r.title} (相关度: ${(r.score * 100).toFixed(0)}%)`));
        }
        if (result.analysis) {
          lines.push(''); lines.push('分析: ' + result.analysis);
        }
        return lines.length ? lines.join('\n') : JSON.stringify(result, null, 2).substring(0, 500);
      }
      // 复盘质量趋势：显示平均分、方向、维度与逐篇分数
      if (toolCall.name === 'review.quality') {
        const lines = [];
        const dirText = result.direction === 'up' ? '↑ 上升' : result.direction === 'down' ? '↓ 下降' : '→ 持平';
        if (result.avgScore != null) {
          lines.push(`最近${result.days}天平均分: ${result.avgScore}`);
          if (result.prevAvgScore != null) lines.push(`更早${result.days}天平均分: ${result.prevAvgScore} (${dirText})`);
        }
        if (result.firstScore != null && result.lastScore != null) {
          lines.push(`区间内首篇 ${result.firstScore} → 末篇 ${result.lastScore}`);
        }
        if (result.dimensionAverages && Object.keys(result.dimensionAverages).length) {
          const dimLabels = { completeness: '完整性', evidence: '证据', actionability: '可执行性', learningDepth: '学习深度', problemDepth: '问题深度' };
          lines.push('维度: ' + Object.entries(result.dimensionAverages).map(([k, v]) => `${dimLabels[k] || k} ${v}`).join(' / '));
        }
        if (Array.isArray(result.series) && result.series.length) {
          lines.push('逐篇: ' + result.series.map(s => `${s.date.slice(5, 10)} ${s.totalScore}分`).join(' → '));
        }
        if (result.assessment) {
          lines.push(''); lines.push('分析: ' + result.assessment);
        }
        return lines.length ? lines.join('\n') : JSON.stringify(result, null, 2).substring(0, 500);
      }
      // 重复问题模式：显示出现次数/占比/浪费轮次 + 提炼结论
      if (toolCall.name === 'review.patterns') {
        const lines = [];
        if (result.totalReviews != null) lines.push(`分析 ${result.totalReviews} 篇复盘，共 ${result.totalProblems} 个问题`);
        if (Array.isArray(result.patterns)) {
          result.patterns.forEach(p => {
            lines.push(`${p.name} ×${p.count} (${p.percentage}%)，浪费 ${p.totalWastedTurns} 轮`);
          });
        }
        if (result.assessment) {
          lines.push(''); lines.push('提炼: ' + result.assessment);
        }
        return lines.length ? lines.join('\n') : JSON.stringify(result, null, 2).substring(0, 500);
      }
      // 其他结果：JSON 格式化
      const data = result.data || result;
      return JSON.stringify(data, null, 2).substring(0, 500);
    } catch (e) {
      return String(result);
    }
  },

  renderMarkdown(text) {
    if (!text) return '';
    // 简单的 Markdown 渲染：转义 HTML + 代码块 + 行内代码 + 粗体 + 换行
    let html = this.escapeHtml(text);
    // 代码块
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 粗体
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // 换行
    html = html.replace(/\n/g, '<br>');
    return html;
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  scrollToBottom() {
    setTimeout(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }, 50);
  },

  // ========== 个性化欢迎（主动打招呼 + 建议） ==========

  // 拉取后端基于真实使用习惯生成的问候与建议，填充当前欢迎区
  async loadWelcome() {
    try {
      const response = await fetch('/api/personal-ai/welcome');
      const data = await response.json();
      // 仅在仍显示欢迎（尚未开始对话）时填充，避免覆盖已发送的消息
      const welcome = this.messagesEl.querySelector('.pai-welcome');
      if (!welcome) return;

      const title = welcome.querySelector('.pai-welcome-title');
      const desc = welcome.querySelector('.pai-welcome-desc');
      const suggestions = welcome.querySelector('.pai-suggestions');

      if (title && data.greeting) title.textContent = data.greeting;
      if (desc && data.context) desc.textContent = data.context;
      if (suggestions && Array.isArray(data.suggestions) && data.suggestions.length) {
        suggestions.innerHTML = data.suggestions.map(s =>
          `<span class="pai-suggestion-chip" data-msg="${this.escapeHtml(s.msg)}">${this.escapeHtml(s.text)}</span>`
        ).join('');
      }
    } catch (err) {
      console.error('[PersonalAI] 加载个性化欢迎失败:', err.message);
    }
  },

  // 生成欢迎占位结构（供新对话 / 空会话时重置）
  welcomePlaceholder() {
    return `<div class="pai-welcome" id="paiWelcome">
      <div class="pai-welcome-icon">🧠</div>
      <div class="pai-welcome-title">你好，我是你的 Personal AI</div>
      <div class="pai-welcome-desc">正在了解你的使用习惯…</div>
      <div class="pai-suggestions" id="paiSuggestions"></div>
    </div>`;
  },

  // ========== 对话历史 ==========

  async loadConversations() {
    try {
      const response = await fetch('/api/personal-ai/conversations');
      const data = await response.json();
      if (data.success) {
        this.conversations = data.conversations;
        this.renderConversations();
      }
    } catch (err) {
      console.error('[PersonalAI] 加载会话列表失败:', err.message);
    }
  },

  renderConversations() {
    if (!this.historyList) return;
    if (this.conversations.length === 0) {
      this.historyList.innerHTML = '<div class="pai-history-empty">暂无对话记录</div>';
      return;
    }
    this.historyList.innerHTML = this.conversations.map(conv => {
      const isActive = conv.id === this.currentConversationId;
      const title = conv.title || '新对话';
      const time = new Date(conv.updated_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `
        <div class="pai-history-item ${isActive ? 'active' : ''}" data-id="${conv.id}">
          <div class="pai-history-item-title">${this.escapeHtml(title)}</div>
          <div class="pai-history-item-meta">
            <span>${time} · ${conv.message_count || 0}条</span>
            <button class="pai-history-delete" data-id="${conv.id}" title="删除">🗑</button>
          </div>
        </div>
      `;
    }).join('');

    // 绑定点击事件
    this.historyList.querySelectorAll('.pai-history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('pai-history-delete')) return;
        this.switchConversation(parseInt(item.dataset.id));
      });
    });
    this.historyList.querySelectorAll('.pai-history-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteConversation(parseInt(btn.dataset.id));
      });
    });
  },

  toggleHistory() {
    this.historyVisible = !this.historyVisible;
    if (this.historyVisible) {
      this.historyPanel.classList.remove('hidden');
      this.loadConversations();
    } else {
      this.historyPanel.classList.add('hidden');
    }
  },

  async newConversation() {
    // 保存当前对话
    await this.saveCurrentConversation();
    // 清空
    this.currentConversationId = null;
    this.messages = [];
    this.messagesEl.innerHTML = this.welcomePlaceholder();
    this.loadWelcome();
    this.historyVisible && this.loadConversations();
  },

  async switchConversation(id) {
    try {
      const response = await fetch(`/api/personal-ai/conversations/${id}`);
      const data = await response.json();
      if (data.success) {
        this.currentConversationId = id;
        this.messages = data.conversation.messages || [];
        this.renderMessages();
        this.historyVisible && this.renderConversations();
      }
    } catch (err) {
      console.error('[PersonalAI] 切换会话失败:', err.message);
    }
  },

  async deleteConversation(id) {
    if (!confirm('确定删除这个对话吗？')) return;
    try {
      await fetch(`/api/personal-ai/conversations/${id}`, { method: 'DELETE' });
      if (this.currentConversationId === id) {
        this.currentConversationId = null;
        this.messages = [];
        this.messagesEl.innerHTML = '<div class="pai-welcome"><div class="pai-welcome-title">对话已删除</div></div>';
      }
      this.loadConversations();
    } catch (err) {
      console.error('[PersonalAI] 删除会话失败:', err.message);
    }
  },

  async saveCurrentConversation() {
    if (this.messages.length === 0) return;
    try {
      const title = this.messages[0]?.content?.substring(0, 30) || '新对话';
      if (this.currentConversationId) {
        // 更新
        await fetch(`/api/personal-ai/conversations/${this.currentConversationId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, messages: this.messages }),
        });
      } else {
        // 新建
        const response = await fetch('/api/personal-ai/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, messages: this.messages }),
        });
        const data = await response.json();
        if (data.success) {
          this.currentConversationId = data.conversation.id;
        }
      }
    } catch (err) {
      console.error('[PersonalAI] 保存会话失败:', err.message);
    }
  },

  renderMessages() {
    if (this.messages.length === 0) {
      this.messagesEl.innerHTML = this.welcomePlaceholder();
      this.loadWelcome();
      return;
    }
    this.messagesEl.innerHTML = '';
    this.messages.forEach(msg => {
      // 渲染该条 assistant 消息保存下来的工具执行轨迹
      if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
        msg.toolCalls.forEach(tc => this.addToolCall(tc));
      }
      const el = document.createElement('div');
      el.className = `pai-msg ${msg.role}`;
      el.innerHTML = `<div class="pai-msg-bubble">${this.renderMarkdown(msg.content)}</div>`;
      this.messagesEl.appendChild(el);
    });
    this.scrollToBottom();
  },
};

// 自动初始化
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PersonalAI.init());
  } else {
    PersonalAI.init();
  }
}

// 注册到 App（如果存在）
if (typeof App !== 'undefined' && App.registerModule) {
  App.registerModule('personal-ai', PersonalAI);
}
