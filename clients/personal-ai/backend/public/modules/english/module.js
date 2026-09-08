/**
 * English Learning 前端模块
 */

const EnglishLearning = {
  init() {
    console.log('[EnglishLearning] 模块已初始化');
  },

  render(container) {
    this.container = container;
    container.innerHTML = `
      <div class="english-container">
        <!-- Hero 区 -->
        <div class="english-hero">
          <div class="english-hero-content">
            <h1 class="english-hero-title">英语学习</h1>
            <p class="english-hero-subtitle">每天进步一点，积累看得见</p>
          </div>
          <div class="english-hero-decoration">
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id="heroGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="rgba(141,124,199,0.15)" />
                  <stop offset="100%" stop-color="rgba(141,124,199,0)" />
                </radialGradient>
              </defs>
              <circle cx="100" cy="100" r="90" fill="url(#heroGlow)" />
            </svg>
          </div>
        </div>

        <!-- 统计卡片行 -->
        <div class="english-stats">
          <div class="english-stat-card">
            <div class="english-stat-icon english-stat-icon--vocab">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="english-stat-info">
              <div class="english-stat-value">--<span class="english-stat-unit">个</span></div>
              <div class="english-stat-label">今日单词</div>
            </div>
            <div class="english-stat-trend english-stat-trend--neutral">
              功能开发中
            </div>
          </div>

          <div class="english-stat-card">
            <div class="english-stat-icon english-stat-icon--total">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="english-stat-info">
              <div class="english-stat-value">--<span class="english-stat-unit">个</span></div>
              <div class="english-stat-label">累计学习</div>
            </div>
            <div class="english-stat-trend english-stat-trend--neutral">
              功能开发中
            </div>
          </div>

          <div class="english-stat-card">
            <div class="english-stat-icon english-stat-icon--streak">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C12 2 8 6 8 10C8 12.21 8.89 14.18 10.33 15.5C9.67 16.5 8 17.5 8 20C8 21.1 8.9 22 10 22H14C15.1 22 16 21.1 16 20C16 17.5 14.33 16.5 13.67 15.5C15.11 14.18 16 12.21 16 10C16 6 12 2 12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="english-stat-info">
              <div class="english-stat-value">--<span class="english-stat-unit">天</span></div>
              <div class="english-stat-label">连续打卡</div>
            </div>
            <div class="english-stat-trend english-stat-trend--neutral">
              功能开发中
            </div>
          </div>

          <div class="english-stat-card">
            <div class="english-stat-icon english-stat-icon--score">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="english-stat-info">
              <div class="english-stat-value">--<span class="english-stat-unit">分</span></div>
              <div class="english-stat-label">测试分数</div>
            </div>
            <div class="english-stat-trend english-stat-trend--neutral">
              功能开发中
            </div>
          </div>
        </div>

        <!-- 功能区 2x2 网格 -->
        <div class="english-features">
          <!-- 单词记忆 -->
          <div class="english-feature-card">
            <div class="english-feature-icon english-feature-icon--vocab">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M9 7H15M9 11H15M9 15H12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="english-feature-body">
              <h3 class="english-feature-title">单词记忆</h3>
              <p class="english-feature-desc">基于艾宾浩斯遗忘曲线的智能单词复习</p>
              <ul class="english-feature-highlights">
                <li>
                  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  智能复习算法
                </li>
                <li>
                  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  个性化记忆曲线
                </li>
                <li>
                  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  生词本自动收集
                </li>
              </ul>
            </div>
            <div class="english-feature-footer">
              <span class="english-badge english-badge--muted">开发中</span>
            </div>
          </div>

          <!-- 阅读理解 -->
          <div class="english-feature-card">
            <div class="english-feature-icon english-feature-icon--reading">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 3H8C10 3 11 4 11 6V21C11 20.5 10.8 20 10.5 19.5C10 19 9 18.5 8 18.5H2V3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M22 3H16C14 3 13 4 13 6V21C13 20.5 13.2 20 13.5 19.5C14 19 15 18.5 16 18.5H22V3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="english-feature-body">
              <h3 class="english-feature-title">阅读理解</h3>
              <p class="english-feature-desc">AI 精选文章 + 难度分级 + 生词标注</p>
              <ul class="english-feature-highlights">
                <li>
                  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  智能难度匹配
                </li>
                <li>
                  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  生词一键标注
                </li>
                <li>
                  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  深度阅读解析
                </li>
              </ul>
            </div>
            <div class="english-feature-footer">
              <span class="english-badge english-badge--muted">开发中</span>
            </div>
          </div>

          <!-- 口语练习 -->
          <div class="english-feature-card">
            <div class="english-feature-icon english-feature-icon--speaking">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" stroke-width="2"/>
                <path d="M5 10a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M12 17v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M8 21h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="english-feature-body">
              <h3 class="english-feature-title">口语练习</h3>
              <p class="english-feature-desc">AI 对话练习 + 发音纠正 + 场景模拟</p>
              <ul class="english-feature-highlights">
                <li>
                  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  实时发音反馈
                </li>
                <li>
                  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  多场景对话模拟
                </li>
                <li>
                  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  AI 角色扮演
                </li>
              </ul>
            </div>
            <div class="english-feature-footer">
              <span class="english-badge english-badge--muted">开发中</span>
            </div>
          </div>

          <!-- 写作提升 -->
          <div class="english-feature-card">
            <div class="english-feature-icon english-feature-icon--writing">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="english-feature-body">
              <h3 class="english-feature-title">写作提升</h3>
              <p class="english-feature-desc">AI 作文批改 + 语法纠错 + 表达优化</p>
              <ul class="english-feature-highlights">
                <li>
                  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  智能语法纠错
                </li>
                <li>
                  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  表达润色建议
                </li>
                <li>
                  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  多文体写作指导
                </li>
              </ul>
            </div>
            <div class="english-feature-footer">
              <span class="english-badge english-badge--muted">开发中</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }
};

// 注册到 App
if (typeof App !== 'undefined' && App.registerModule) {
  App.registerModule('english', EnglishLearning);
}
