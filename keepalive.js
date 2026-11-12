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
    // Priority 1: sessionStorage (strictly scoped to this single tab)
    try {
      const sessionUrl = sessionStorage.getItem('box_tab_deep_url');
      if (isDeepBoxUrl(sessionUrl)) return sessionUrl;
    } catch (e) {}

    // Priority 2: window.name (persists across same-site navigations within this tab)
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

    // Save to this tab's sessionStorage
    try {
      sessionStorage.setItem('box_tab_deep_url', url);
    } catch (e) {}

    // Save to this tab's window.name
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
    if (isDeepBoxUrl(current)) {
      saveTabUrl(current);
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

  // 2. TAB-ISOLATED BOUNCE PREVENTION
  // If Box drops THIS specific tab at root /folder/0 right after login, restore THIS tab's folder
  (function handleRootBounce() {
    const current = window.location.href;
    if (/\/folder\/0\/?(\?.*)?$/.test(current) || current.endsWith('app.box.com/')) {
      const mySavedUrl = getTabStoredUrl();
      if (mySavedUrl) {
        console.log('[Box Auto-Login] Restoring this tab to its own folder:', mySavedUrl);
        window.location.replace(mySavedUrl);
      }
    }
  })();

  // 3. DRAG-AND-DROP & UPLOAD PROTECTION
  // Pause any background activity while user is dragging files into the browser
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
  // Never, EVER call window.location.reload() from background fetch responses!
  function silentHeartbeat() {
    if (!isExtensionValid()) return;
    if (isDraggingOrUploading) return;

    chrome.storage.local.get(['boxEnabled'], (cfg) => {
      if (!isExtensionValid() || cfg.boxEnabled === false) return;

      // HEAD request to Box Web index keeps cookies and session timer alive
      fetch('/index.php', {
        method: 'HEAD',
        credentials: 'include',
        headers: { 'Cache-Control': 'no-cache' }
      })
      .then(() => {
        console.log('[Box Auto-Login] Heartbeat refreshed session timer.');
      })
      .catch(() => {
        // Silently ignore network hiccups; never reload the user's active page!
      });
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
      // Only do a silent background ping without reload triggers
      silentHeartbeat();
    }
  });

  console.log('[Box Auto-Login] Keep-Alive active (Tab-Isolated & Drag-and-Drop Protected).');
})();
