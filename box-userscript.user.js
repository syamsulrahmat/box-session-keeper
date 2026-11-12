// ==UserScript==
// @name         Box Session Keeper & Auto-Login
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Keeps Box sessions awake, isolates tab URLs, and protects drag-and-drop uploads
// @match        https://*.box.com/*
// @match        https://account.box.com/*
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ==========================================
  // CONFIGURE CREDENTIALS HERE
  // ==========================================
  const BOX_EMAIL = "your-office-email@example.com";
  const BOX_PASSWORD = "your-office-password";
  const SCRIPT_ENABLED = true;
  // ==========================================

  if (!SCRIPT_ENABLED || !BOX_EMAIL || !BOX_PASSWORD) return;

  const isLoginPage = window.location.pathname.includes('/login') || window.location.hostname === 'account.box.com';

  function isDeepBoxUrl(url) {
    if (!url) return false;
    const isRoot = /\/folder\/0\/?(\?.*)?$/.test(url) || /\/app\.box\.com\/?$/.test(url);
    const isDeep = /\/(folder\/(?!0\b)\d+|file\/\d+|notes\/\d+)/.test(url);
    return isDeep && !isRoot;
  }

  function getTabStoredUrl() {
    try {
      const s = sessionStorage.getItem('box_tab_deep_url');
      if (isDeepBoxUrl(s)) return s;
    } catch (e) {}

    try {
      if (window.name && window.name.includes('boxTabUrl')) {
        const data = JSON.parse(window.name);
        if (isDeepBoxUrl(data.boxTabUrl)) return data.boxTabUrl;
      }
    } catch (e) {}
    return null;
  }

  function saveTabUrl(url) {
    if (!isDeepBoxUrl(url)) return;
    try { sessionStorage.setItem('box_tab_deep_url', url); } catch (e) {}
    try {
      let data = {};
      if (window.name) {
        try { data = JSON.parse(window.name); } catch (e) { data = { origName: window.name }; }
      }
      if (typeof data !== 'object' || data === null) data = {};
      data.boxTabUrl = url;
      window.name = JSON.stringify(data);
    } catch (e) {}
  }

  // ==========================================
  // MODE A: LOGIN SCREEN
  // ==========================================
  if (isLoginPage) {
    let attempts = 0;
    const MAX_ATTEMPTS = 2;
    let isSubmitting = false;
    let challengeHalted = false;
    let overlayEl = null;

    function showOverlay() {
      if (challengeHalted || overlayEl || !document.documentElement) return;
      overlayEl = document.createElement('div');
      overlayEl.id = 'box-tm-overlay';
      overlayEl.innerHTML = `
        <style>
          #box-tm-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: #ffffff; z-index: 2147483647;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #1e293b;
          }
          .tm-spinner {
            width: 40px; height: 40px;
            border: 4px solid #e2e8f0; border-top: 4px solid #0061d5;
            border-radius: 50%; animation: tm-spin 0.8s linear infinite; margin-bottom: 16px;
          }
          @keyframes tm-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          .tm-btn {
            display: none; margin-top: 18px; background: #f8fafc; border: 1px solid #cbd5e1;
            border-radius: 6px; padding: 7px 14px; font-size: 12px; font-weight: 500;
            color: #475569; cursor: pointer;
          }
        </style>
        <div class="tm-spinner"></div>
        <div style="font-size:16px; font-weight:600; color:#0f172a; margin-bottom:6px;">Resuming Box Session...</div>
        <div style="font-size:13px; color:#64748b;">Restoring your folder and files</div>
        <button type="button" class="tm-btn" id="box-tm-retry">Taking longer than usual? Click to reload</button>
      `;
      document.documentElement.appendChild(overlayEl);

      setTimeout(() => {
        const btn = document.getElementById('box-tm-retry');
        if (btn) {
          btn.style.display = 'inline-block';
          btn.onclick = () => { navigateTarget(true); };
        }
      }, 3000);
    }

    function hideOverlay() {
      if (overlayEl && overlayEl.parentNode) {
        overlayEl.parentNode.removeChild(overlayEl);
        overlayEl = null;
      }
    }

    function is2FARequired() {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('/2fa') || path.includes('/mfa') || path.includes('/verification')) return true;
      const ci = document.querySelector('input[name*="2fa"], input[name*="totp"], input[name*="otp"], input[autocomplete="one-time-code"], .two-factor-input');
      if (ci && ci.offsetParent !== null) return true;
      const cap = document.querySelector('#arkose, .arkose-box, iframe[src*="arkose"], iframe[src*="recaptcha"]');
      if (cap && cap.offsetParent !== null) return true;
      return false;
    }

    function hasLoginError() {
      if (attempts === 0) return false;
      const errors = document.querySelectorAll('.login-error, .alert-error, .notification-bar.error, .form-error');
      for (const el of errors) {
        if (el && el.offsetParent !== null) {
          const text = (el.textContent || '').toLowerCase();
          if (text.includes('logged out') || text.includes('session')) continue;
          if (text.includes('invalid') || text.includes('incorrect') || text.includes('failed') || text.includes('wrong')) return true;
        }
      }
      return false;
    }

    function getTargetUrl() {
      const params = new URLSearchParams(window.location.search);
      let redirectUrl = params.get('redirect_url');
      if (redirectUrl) {
        try { redirectUrl = decodeURIComponent(redirectUrl); } catch (e) {}
      }
      if (isDeepBoxUrl(redirectUrl)) return redirectUrl;

      const tabUrl = getTabStoredUrl();
      if (tabUrl) return tabUrl;

      if (redirectUrl && !/\/folder\/0\/?$/.test(redirectUrl)) return redirectUrl;
      return 'https://app.box.com/';
    }

    function navigateTarget(forceReload) {
      const target = getTargetUrl();
      saveTabUrl(target);
      if (forceReload) {
        window.location.replace(target);
        setTimeout(() => window.location.reload(), 600);
      } else {
        window.location.replace(target);
      }
    }

    function triggerSubmit(btn) {
      if (!btn) return;
      try {
        if (btn.form && typeof btn.form.requestSubmit === 'function') {
          btn.form.requestSubmit(btn);
        } else {
          btn.click();
        }
      } catch (e) {
        btn.click();
      }
    }

    function runLogin() {
      if (challengeHalted || isSubmitting || attempts >= MAX_ATTEMPTS) return;
      if (is2FARequired()) { challengeHalted = true; hideOverlay(); return; }
      if (hasLoginError()) { hideOverlay(); return; }

      showOverlay();

      const emailInput = document.querySelector('input[type="email"], input[name="login"], #login-email');
      const passInput = document.querySelector('input[type="password"], input[name="password"], #password-login');

      const remember = document.querySelector('input[type="checkbox"][name="remember_me"], #remember-me');
      if (remember && !remember.checked) remember.click();

      // Step 1: Email
      const isEmailStep = emailInput && emailInput.offsetParent !== null && (!passInput || passInput.offsetParent === null);
      if (isEmailStep) {
        isSubmitting = true;
        if (emailInput.value !== BOX_EMAIL) {
          emailInput.value = BOX_EMAIL;
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          emailInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        setTimeout(() => {
          const btn = document.querySelector('button[type="submit"], #login-submit-box-login, button.login-submit');
          triggerSubmit(btn);
          setTimeout(() => { isSubmitting = false; }, 400);
        }, 150);
        return;
      }

      // Step 2: Password
      const isPassStep = passInput && passInput.offsetParent !== null;
      if (isPassStep && !passInput.value) {
        isSubmitting = true;
        attempts++;
        passInput.value = BOX_PASSWORD;
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
        passInput.dispatchEvent(new Event('change', { bubbles: true }));

        setTimeout(() => {
          const btn = document.querySelector('button[type="submit"], #login-submit-box-login, button.login-submit');
          triggerSubmit(btn);

          setTimeout(() => {
            if (is2FARequired() || hasLoginError()) {
              challengeHalted = true;
              hideOverlay();
              return;
            }
            navigateTarget(false);
          }, 1400);

          setTimeout(() => {
            if (window.location.pathname.includes('/login') && !is2FARequired() && !hasLoginError()) {
              navigateTarget(true);
            }
          }, 3200);

          setTimeout(() => {
            if (window.location.pathname.includes('/login') && !is2FARequired() && !hasLoginError()) {
              window.location.reload();
            }
          }, 5200);

        }, 150);
      }
    }

    showOverlay();
    const observer = new MutationObserver(() => runLogin());
    if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { hideOverlay(); }, 6500);
    runLogin();
  }

  // ==========================================
  // MODE B: KEEP-ALIVE (app.box.com)
  // ==========================================
  if (!isLoginPage) {
    let isDragging = false;

    function track() {
      const href = window.location.href;
      if (isDeepBoxUrl(href)) saveTabUrl(href);
    }

    track();
    setInterval(track, 2000);

    const origPush = history.pushState;
    history.pushState = function () { origPush.apply(this, arguments); setTimeout(track, 100); };
    const origReplace = history.replaceState;
    history.replaceState = function () { origReplace.apply(this, arguments); setTimeout(track, 100); };
    window.addEventListener('popstate', () => setTimeout(track, 100));

    // Restore this tab's own folder if landed on root
    const current = window.location.href;
    if (/\/folder\/0\/?(\?.*)?$/.test(current) || current.endsWith('app.box.com/')) {
      const mySavedUrl = getTabStoredUrl();
      if (mySavedUrl) {
        window.location.replace(mySavedUrl);
      }
    }

    // Drag and drop shield
    window.addEventListener('dragenter', () => { isDragging = true; }, true);
    window.addEventListener('dragover', () => { isDragging = true; }, true);
    window.addEventListener('drop', () => { setTimeout(() => { isDragging = false; }, 8000); }, true);

    // Silent background ping (Never reloads the page!)
    function ping() {
      if (isDragging) return;
      fetch('/index.php', { method: 'HEAD', credentials: 'include' }).catch(() => {});
    }

    setInterval(ping, 3 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { track(); ping(); }
    });
  }
})();
