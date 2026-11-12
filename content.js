// Box Auto-Login Content Script with Tab-Isolated Folder Memory, Progressive Watchdog & 2FA Guard
(function () {
  'use strict';

  function isExtensionValid() {
    return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
  }

  let attempts = 0;
  const MAX_ATTEMPTS = 2;
  let isSubmitting = false;
  let challengeHalted = false;
  let overlayEl = null;

  function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function showSeamlessOverlay() {
    if (challengeHalted || overlayEl || !document.documentElement) return;

    overlayEl = document.createElement('div');
    overlayEl.id = 'box-autologin-overlay';
    overlayEl.innerHTML = `
      <style>
        #box-autologin-overlay {
          position: fixed;
          top: 0; left: 0; width: 100vw; height: 100vh;
          background: #ffffff;
          z-index: 2147483647;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1e293b;
        }
        .box-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #e2e8f0;
          border-top: 4px solid #0061d5;
          border-radius: 50%;
          animation: box-spin 0.8s linear infinite;
          margin-bottom: 16px;
        }
        @keyframes box-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .box-title {
          font-size: 16px;
          font-weight: 600;
          color: #0f172a;
          margin-bottom: 6px;
        }
        .box-subtitle {
          font-size: 13px;
          color: #64748b;
        }
        .box-retry-btn {
          display: none;
          margin-top: 18px;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 7px 14px;
          font-size: 12px;
          font-weight: 500;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s;
        }
        .box-retry-btn:hover {
          background: #e2e8f0;
          color: #0f172a;
        }
      </style>
      <div class="box-spinner"></div>
      <div class="box-title">Resuming Box Session...</div>
      <div class="box-subtitle">Restoring your folder and files</div>
      <button type="button" class="box-retry-btn" id="box-autologin-retry">Taking longer than usual? Click to reload</button>
    `;

    document.documentElement.appendChild(overlayEl);

    setTimeout(() => {
      const retryBtn = document.getElementById('box-autologin-retry');
      if (retryBtn) {
        retryBtn.style.display = 'inline-block';
        retryBtn.addEventListener('click', () => {
          navigateToDestination(true);
        });
      }
    }, 3000);
  }

  function hideOverlay() {
    if (overlayEl && overlayEl.parentNode) {
      overlayEl.parentNode.removeChild(overlayEl);
      overlayEl = null;
    }
  }

  function isAuthChallengePresent() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/2fa') || path.includes('/mfa') || path.includes('/verification') || path.includes('/challenge')) {
      return true;
    }

    const challengeInputSelectors = [
      'input[name*="2fa"]',
      'input[name*="totp"]',
      'input[name*="otp"]',
      'input[name*="sms_code"]',
      'input[name*="verification_code"]',
      'input[id*="2fa"]',
      'input[id*="totp"]',
      'input[id*="otp"]',
      'input[id*="verification"]',
      'input[autocomplete="one-time-code"]',
      'input.two-factor-input'
    ];
    for (const sel of challengeInputSelectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        return true;
      }
    }

    const captchaSelectors = [
      '#arkose',
      '.arkose-box',
      'iframe[src*="arkose"]',
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      '.g-recaptcha'
    ];
    for (const sel of captchaSelectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        return true;
      }
    }

    const textContainers = document.querySelectorAll('h1, h2, h3, .heading, .title, [role="heading"], p');
    for (const el of textContainers) {
      if (el && el.offsetParent !== null) {
        const text = (el.textContent || '').toLowerCase();
        if (
          text.includes('two-factor') ||
          text.includes('verification code') ||
          text.includes('authentication required') ||
          text.includes('authenticate your account') ||
          text.includes('check your email for a code') ||
          text.includes('security code sent')
        ) {
          return true;
        }
      }
    }

    return false;
  }

  function hasLoginError() {
    if (attempts === 0) return false;

    const errorSelectors = [
      '.login-error',
      '.alert-error',
      '.notification-bar.error',
      '.form-error'
    ];

    for (const sel of errorSelectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        const text = (el.textContent || '').toLowerCase();
        if (text.includes('logged out') || text.includes('session') || text.includes('timed out')) {
          continue;
        }
        if (text.includes('invalid') || text.includes('incorrect') || text.includes('failed') || text.includes('wrong') || text.includes('lock')) {
          return true;
        }
      }
    }
    return false;
  }

  function isDeepUrl(url) {
    if (!url) return false;
    const isRoot = /\/folder\/0\/?(\?.*)?$/.test(url) || /\/app\.box\.com\/?$/.test(url);
    const isDeep = /\/(folder\/(?!0\b)\d+|file\/\d+|notes\/\d+)/.test(url);
    return isDeep && !isRoot;
  }

  // Strictly prioritize TAB-ISOLATED destinations
  function getTargetRedirectUrl(callback) {
    // 1. Tab-specific query string (explicit navigation)
    const params = new URLSearchParams(window.location.search);
    let redirectUrl = params.get('redirect_url');
    if (redirectUrl) {
      try { redirectUrl = decodeURIComponent(redirectUrl); } catch (e) {}
    }
    if (isDeepUrl(redirectUrl)) {
      callback(redirectUrl);
      return;
    }

    // 2. Tab-specific window.name (isolated to this exact browser tab)
    try {
      if (window.name && window.name.includes('boxTabUrl')) {
        const data = JSON.parse(window.name);
        if (isDeepUrl(data.boxTabUrl)) {
          callback(data.boxTabUrl);
          return;
        }
      }
    } catch (e) {}

    // 3. Tab-specific sessionStorage
    try {
      const sessionUrl = sessionStorage.getItem('box_tab_deep_url');
      if (isDeepUrl(sessionUrl)) {
        callback(sessionUrl);
        return;
      }
    } catch (e) {}

    // 4. Fallback if redirectUrl is something generic but not root
    if (redirectUrl && !/\/folder\/0\/?$/.test(redirectUrl)) {
      callback(redirectUrl);
      return;
    }

    callback('https://app.box.com/');
  }

  function performNavigation(target, forceReload) {
    console.log('[Box Auto-Login] Tab navigating to target:', target);

    // Save destination to this tab's window.name so app.box.com knows where to bounce if needed
    try {
      let data = {};
      if (window.name) {
        try { data = JSON.parse(window.name); } catch (e) { data = { origName: window.name }; }
      }
      if (typeof data !== 'object' || data === null) data = {};
      data.boxTabUrl = target;
      data.boxTabTime = Date.now();
      window.name = JSON.stringify(data);
    } catch (e) {}

    if (forceReload) {
      window.location.replace(target);
      setTimeout(() => { window.location.reload(); }, 600);
    } else {
      window.location.replace(target);
    }
  }

  function navigateToDestination(forceReload) {
    getTargetRedirectUrl((target) => {
      performNavigation(target, forceReload);
    });
  }

  function triggerSubmit(button) {
    if (!button) return;
    try {
      if (button.form && typeof button.form.requestSubmit === 'function') {
        button.form.requestSubmit(button);
      } else {
        button.click();
      }
    } catch (e) {
      button.click();
    }
  }

  function runAutoLogin() {
    if (!isExtensionValid()) return;
    if (challengeHalted) return;
    if (isSubmitting || attempts >= MAX_ATTEMPTS) return;

    if (isAuthChallengePresent()) {
      challengeHalted = true;
      console.warn('[Box Auto-Login] Authentication challenge / 2FA detected. Halting auto-login.');
      hideOverlay();
      return;
    }

    if (hasLoginError()) {
      console.warn('[Box Auto-Login] Incorrect credentials error detected. Revealing page.');
      hideOverlay();
      return;
    }

    chrome.storage.local.get(['boxEmail', 'boxPassword', 'boxEnabled'], (config) => {
      if (!isExtensionValid()) return;
      if (challengeHalted) return;
      if (config.boxEnabled === false || !config.boxEmail || !config.boxPassword) {
        hideOverlay();
        return;
      }

      showSeamlessOverlay();

      const emailInput = document.querySelector('input[type="email"], input[name="login"], #login-email');
      const passInput = document.querySelector('input[type="password"], input[name="password"], #password-login');

      // Check "Remember Me" if present
      const rememberCheckbox = document.querySelector('input[type="checkbox"][name="remember_me"], #remember-me');
      if (rememberCheckbox && !rememberCheckbox.checked) {
        rememberCheckbox.click();
      }

      // Step 1: Email Form
      const isEmailStep = emailInput && emailInput.offsetParent !== null && (!passInput || passInput.offsetParent === null);
      if (isEmailStep) {
        isSubmitting = true;
        if (emailInput.value !== config.boxEmail) {
          setNativeValue(emailInput, config.boxEmail);
        }

        setTimeout(() => {
          const submitBtn = document.querySelector('button[type="submit"], #login-submit-box-login, button.login-submit');
          triggerSubmit(submitBtn);
          setTimeout(() => { isSubmitting = false; }, 400);
        }, 150);
        return;
      }

      // Step 2: Password Form
      const isPassStep = passInput && passInput.offsetParent !== null;
      if (isPassStep && !passInput.value) {
        isSubmitting = true;
        attempts++;
        setNativeValue(passInput, config.boxPassword);

        setTimeout(() => {
          const submitBtn = document.querySelector('button[type="submit"], #login-submit-box-login, button.login-submit');
          triggerSubmit(submitBtn);

          // Standard redirect at 1.4s
          setTimeout(() => {
            if (isAuthChallengePresent()) {
              challengeHalted = true;
              hideOverlay();
              return;
            }
            if (hasLoginError()) {
              hideOverlay();
              return;
            }
            navigateToDestination(false);
          }, 1400);

          // Progressive Watchdog Stage 1 (3.2s)
          setTimeout(() => {
            if (window.location.pathname.includes('/login') && !isAuthChallengePresent() && !hasLoginError()) {
              console.log('[Box Auto-Login] Watchdog Stage 1: Force-redirecting...');
              navigateToDestination(true);
            }
          }, 3200);

          // Progressive Watchdog Stage 2 (5.2s)
          setTimeout(() => {
            if (window.location.pathname.includes('/login') && !isAuthChallengePresent() && !hasLoginError()) {
              console.log('[Box Auto-Login] Watchdog Stage 2: Triggering hard reload...');
              window.location.reload();
            }
          }, 5200);

        }, 150);
      }
    });
  }

  if (isExtensionValid()) {
    chrome.storage.local.get(['boxEnabled', 'boxEmail'], (cfg) => {
      if (cfg && cfg.boxEnabled !== false && cfg.boxEmail && !isAuthChallengePresent()) {
        showSeamlessOverlay();
      }
    });
  }

  const observer = new MutationObserver(() => {
    runAutoLogin();
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Absolute Unconditional Failsafe Watchdog:
  setTimeout(() => {
    if (overlayEl) {
      console.warn('[Box Auto-Login] Absolute failsafe timer reached. Dismissing overlay.');
      hideOverlay();
    }
  }, 6500);

  runAutoLogin();
})();
