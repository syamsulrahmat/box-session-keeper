// Box Keep-Alive & URL Tracker Script (Tab-Isolated & Drag-and-Drop Protected)
(function () {
  'use strict';

  function isExtensionValid() {
    return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
  }

  const path = window.location.pathname;
  if (path.includes('/login') || path.includes('/logout')) {
    return;
  }

  const PING_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
  let isDraggingOrUploading = false;

  // 1. TAB-ISOLATED URL HELPERS
  function isDeepBoxUrl(url) {
    if (!url) return false;
    const isRoot = /\/folder\/0\/?(\?.*)?$/.test(url) || /\/app\.box\.com\/?$/.test(url);
    const isDeep = /\/(folder\/(?!0\b)\d+|file\/\d+|notes\/\d+)/.test(url);
    return isDeep && !isRoot;
  }

  function getTabStoredUrl() {
    try {
      const sessionUrl = sessionStorage.getItem('box_tab_deep_url');
      if (isDeepBoxUrl(sessionUrl)) return sessionUrl;
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

    try {
      sessionStorage.setItem('box_tab_deep_url', url);
    } catch (e) {}

    try {
      let data = {};
      if (window.name) {
        try { data = JSON.parse(window.name); } catch (e) { data = { origName: window.name }; }
      }
      if (typeof data !== 'object' || data === null) data = {};
      data.boxTabUrl = url;
      data.boxTabTime = Date.now();
      window.name = JSON.stringify(data);
    } catch (e) {}
  }

  function trackCurrentTab() {
    const current = window.location.href;
    const isRoot = /\/folder\/0\/?(\?.*)?$/.test(current) || current.endsWith('app.box.com/') || window.location.pathname === '/';

    if (isDeepBoxUrl(current)) {
      saveTabUrl(current);
    } else if (isRoot) {
      // If user intentionally navigated to the root or homepage, clear the old deep URL so they aren't trapped
      try {
        sessionStorage.removeItem('box_tab_deep_url');
        if (window.name && window.name.includes('boxTabUrl')) {
          const data = JSON.parse(window.name);
          delete data.boxTabUrl;
          window.name = JSON.stringify(data);
        }
      } catch (e) {}
    }
  }

  // Initial and client-side SPA navigation tracking
  trackCurrentTab();
  const trackingInterval = setInterval(() => {
    if (!isExtensionValid()) {
      clearInterval(trackingInterval);
      return;
    }
    trackCurrentTab();
  }, 2000);

  const origPushState = history.pushState;
  history.pushState = function () {
    origPushState.apply(this, arguments);
    setTimeout(trackCurrentTab, 100);
  };
  const origReplaceState = history.replaceState;
  history.replaceState = function () {
    origReplaceState.apply(this, arguments);
    setTimeout(trackCurrentTab, 100);
  };
  window.addEventListener('popstate', () => setTimeout(trackCurrentTab, 100));

  // 2. STRICT ONE-TIME BOUNCE RESTORE (ONLY RIGHT AFTER AUTO-LOGIN)
  // If Box dropped user at /folder/0 as a login artifact, restore the deep folder ONCE.
  // Never blocks intentional user navigation to the homepage or /folder/0!
  (function handlePostLoginBounce() {
    const current = window.location.href;
    const isRoot = /\/folder\/0\/?(\?.*)?$/.test(current) || current.endsWith('app.box.com/') || window.location.pathname === '/';

    if (isRoot) {
      try {
        if (window.name && window.name.includes('justLoggedIn')) {
          const data = JSON.parse(window.name);
          const elapsed = Date.now() - (data.loginTime || 0);

          // Clear the one-time flag immediately so future navigation to root is free
          delete data.justLoggedIn;
          delete data.loginTime;
          window.name = JSON.stringify(data);

          if (elapsed < 15000 && isDeepBoxUrl(data.boxTabUrl)) {
            console.log('[Box Auto-Login] Post-login root bounce intercepted. Restoring:', data.boxTabUrl);
            window.location.replace(data.boxTabUrl);
          }
        }
      } catch (e) {}
    }
  })();

  // 3. DRAG-AND-DROP & UPLOAD PROTECTION
  window.addEventListener('dragenter', () => { isDraggingOrUploading = true; }, true);
  window.addEventListener('dragover', () => { isDraggingOrUploading = true; }, true);
  window.addEventListener('drop', () => {
    setTimeout(() => { isDraggingOrUploading = false; }, 8000);
  }, true);
  window.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) {
      setTimeout(() => { isDraggingOrUploading = false; }, 3000);
    }
  }, true);

  // 4. SILENT, NON-DESTRUCTIVE SESSION HEARTBEAT
  function silentHeartbeat() {
    if (!isExtensionValid()) return;
    if (isDraggingOrUploading) return;

    chrome.storage.local.get(['boxEnabled'], (cfg) => {
      if (!isExtensionValid() || cfg.boxEnabled === false) return;

      fetch('/index.php', {
        method: 'HEAD',
        credentials: 'include',
        headers: { 'Cache-Control': 'no-cache' }
      })
      .then(() => {
        console.log('[Box Auto-Login] Heartbeat refreshed session timer.');
      })
      .catch(() => {});
    });
  }

  const pingInterval = setInterval(() => {
    if (!isExtensionValid()) {
      clearInterval(pingInterval);
      return;
    }
    silentHeartbeat();
  }, PING_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      trackCurrentTab();
      silentHeartbeat();
    }
  });

  console.log('[Box Auto-Login] Keep-Alive active (Clean Root Navigation & Upload Protected).');
})();
