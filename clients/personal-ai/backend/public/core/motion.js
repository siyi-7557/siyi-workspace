/* ============================================================
 * motion.js — 思意工作台交互动效增强
 * 独立文件，与 app.js 解耦，通过 MutationObserver 监听内容变化
 * ============================================================ */

(function () {
  'use strict';

  const contentInner = document.getElementById('contentInner');
  if (!contentInner) return;

  // ===== 1. 页面切换进入动画 =====
  // 监听 contentInner 子节点变化，模块切换后重新触发动画
  let pageEnterTimer = null;

  const observer = new MutationObserver((mutations) => {
    // 只响应子节点添加（模块渲染完成）
    const hasContentChange = mutations.some(m => m.addedNodes.length > 0 || m.type === 'childList');
    if (!hasContentChange) return;

    // 清除 app.js 设置的 inline opacity/transition，让 CSS 动画接管
    contentInner.style.opacity = '';
    contentInner.style.transition = '';

    // 页面进入动画：只在内容区没有正在运行的动画时才重启
    if (!contentInner.classList.contains('motion-page-entering')) {
      contentInner.classList.add('motion-page-entering');
      contentInner.style.animation = 'none';
      void contentInner.offsetWidth;
      contentInner.style.animation = '';
      setTimeout(() => contentInner.classList.remove('motion-page-entering'), 500);
    }

    // 给内容区直接子元素加 stagger（延迟一小段，等 DOM 稳定）
    clearTimeout(pageEnterTimer);
    pageEnterTimer = setTimeout(() => {
      applyStagger();
      initRevealObserver();
    }, 50);
  });

  observer.observe(contentInner, { childList: true, subtree: false });

  // ===== 2. Stagger 子元素进入（已禁用：反复导致异步渲染内容卡在 opacity:0，只保留页面级淡入） =====
  function applyStagger() {
    // 暂不启用 stagger 动画，避免异步渲染内容看不见
  }

  // ===== 3. 滚动渐入（Intersection Observer） =====
  let revealObserver = null;

  function initRevealObserver() {
    if (revealObserver) {
      revealObserver.disconnect();
    }

    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.08,
      rootMargin: '0px 0px -40px 0px'
    });

    // 给卡片、列表项等加 reveal 类
    const revealTargets = contentInner.querySelectorAll(
      '.card:not(.reveal), .knowledge-item:not(.reveal), .review-item:not(.reveal), ' +
      '.prompt-item:not(.reveal), .radar-item:not(.reveal), .stat-card:not(.reveal), ' +
      '.section-block:not(.reveal), .widget:not(.reveal)'
    );

    revealTargets.forEach((el, index) => {
      el.classList.add('reveal');
      // 错开延迟，避免同一屏所有元素同时出现
      el.style.transitionDelay = `${Math.min(index * 25, 200)}ms`;
      revealObserver.observe(el);
    });
  }

  // ===== 4. 模态框动画辅助 =====
  // 监听 modalOverlay 的 display 变化，添加进入动画
  const modalOverlay = document.getElementById('modalOverlay');
  if (modalOverlay) {
    const modalObserver = new MutationObserver(() => {
      const isVisible = modalOverlay.style.display !== 'none';
      if (isVisible) {
        const box = modalOverlay.querySelector('.modal-box');
        if (box) {
          box.style.animation = 'none';
          void box.offsetWidth;
          box.style.animation = '';
        }
      }
    });
    modalObserver.observe(modalOverlay, { attributes: true, attributeFilter: ['style'] });
  }

  // ===== 5. 点击涟漪效果（轻量，仅主按钮） =====
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-primary, button.primary, .header-icon-btn');
    if (!btn) return;

    const ripple = document.createElement('span');
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.cssText = `
      position: absolute;
      border-radius: 50%;
      background: currentColor;
      opacity: 0.15;
      width: ${size}px;
      height: ${size}px;
      left: ${e.clientX - rect.left - size / 2}px;
      top: ${e.clientY - rect.top - size / 2}px;
      transform: scale(0);
      animation: rippleExpand 400ms ease-out forwards;
      pointer-events: none;
    `;

    // 确保按钮有 position: relative 和 overflow: hidden
    const computedStyle = getComputedStyle(btn);
    if (computedStyle.position === 'static') {
      btn.style.position = 'relative';
    }
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);

    setTimeout(() => ripple.remove(), 450);
  });

  // 注入涟漪 keyframes
  const rippleStyle = document.createElement('style');
  rippleStyle.textContent = `
    @keyframes rippleExpand {
      to {
        transform: scale(2.5);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(rippleStyle);

  // ===== 6. 导航项点击反馈 =====
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      // 点击时给一个短暂的缩放反馈
      item.style.transform = 'scale(0.97)';
      setTimeout(() => { item.style.transform = ''; }, 120);
    });
  });

  // ===== 7. 初始化 =====
  // 页面首次加载时也应用动效
  window.addEventListener('load', () => {
    setTimeout(() => {
      applyStagger();
      initRevealObserver();
    }, 100);
  });

  // 暴露给全局，方便调试
  window.Motion = {
    refresh: () => {
      applyStagger();
      initRevealObserver();
    }
  };

})();
