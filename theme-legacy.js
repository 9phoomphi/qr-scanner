(function (global) {
  'use strict';

  var pageLeaveTimer = null;

  function prefersReducedMotion() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_err) {
      return false;
    }
  }

  function markPageReady() {
    if (!document.body) return;
    document.body.classList.remove('page-leaving');

    if (prefersReducedMotion()) {
      document.body.classList.add('page-ready');
      return;
    }

    document.body.classList.remove('page-ready');
    if (typeof global.requestAnimationFrame === 'function') {
      global.requestAnimationFrame(function () {
        global.requestAnimationFrame(function () {
          if (document.body) document.body.classList.add('page-ready');
        });
      });
      return;
    }

    setTimeout(function () {
      if (document.body) document.body.classList.add('page-ready');
    }, 24);
  }

  function beginPageLeave(done) {
    if (typeof done !== 'function') return;
    if (!document.body || prefersReducedMotion()) {
      done();
      return;
    }

    if (document.body.classList.contains('page-leaving')) {
      setTimeout(done, 30);
      return;
    }

    document.body.classList.add('page-leaving');
    document.body.classList.remove('page-ready');
    if (pageLeaveTimer) clearTimeout(pageLeaveTimer);

    pageLeaveTimer = setTimeout(function () {
      pageLeaveTimer = null;
      done();
    }, 170);
  }

  function normalizeDeviceKeyClient(value) {
    var key = String(value || '').trim();
    if (!key) return '';
    key = key.replace(/[^A-Za-z0-9._:-]/g, '');
    if (key.length > 96) key = key.substring(0, 96);
    return key;
  }

  function normalizeIpKeyClient(value) {
    var key = String(value || '').trim().toLowerCase();
    if (!key) return '';
    key = key.replace(/[^a-z0-9_-]/g, '');
    if (key.length > 128) key = key.substring(0, 128);
    return key;
  }

  function getStoredIpAuthState() {
    try {
      var raw = localStorage.getItem('docControlIpAuthStateV1') || '';
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      parsed.deviceKey = normalizeDeviceKeyClient(parsed.deviceKey || '');
      parsed.ipKey = normalizeIpKeyClient(parsed.ipKey || '');
      if (!parsed.deviceKey || !parsed.ipKey) return null;
      return parsed;
    } catch (_err) {
      return null;
    }
  }

  function getStoredIpKey() {
    var state = getStoredIpAuthState();
    return normalizeIpKeyClient(state && state.ipKey || '');
  }

  function ensureDeviceKey() {
    var storageKey = 'docControlDeviceKeyV1';
    var fallbackLocalStorageKey = 'docControlDeviceKeyV3';
    var key = '';
    var urlKey = '';

    try {
      var u = new URL(global.location.href);
      urlKey = normalizeDeviceKeyClient(u.searchParams.get('dk') || '');
    } catch (_e0) {
      var m = String(global.location.search || '').match(/[?&]dk=([^&#]+)/);
      if (m && m[1]) {
        try {
          urlKey = normalizeDeviceKeyClient(decodeURIComponent(m[1]));
        } catch (_e1) {
          urlKey = normalizeDeviceKeyClient(m[1]);
        }
      }
    }

    try {
      key = normalizeDeviceKeyClient(sessionStorage.getItem(storageKey) || '');
    } catch (_e2) {}

    if (!key) {
      try {
        key = normalizeDeviceKeyClient(localStorage.getItem(fallbackLocalStorageKey) || '');
      } catch (_e3) {}
    }

    if (urlKey) key = urlKey;
    if (!key) key = normalizeDeviceKeyClient(global.__docControlDeviceKey || '');
    if (!key) key = 'dk_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);

    if (key) {
      try { sessionStorage.setItem(storageKey, key); } catch (_e4) {}
      try { localStorage.setItem(fallbackLocalStorageKey, key); } catch (_e5) {}
      global.__docControlDeviceKey = key;
    }

    return key;
  }

  function getDeviceKey() {
    return ensureDeviceKey();
  }

  function appendDeviceKeyToUrl(url) {
    if (!url) return url;
    var key = getDeviceKey();
    if (!key) return url;

    try {
      var u = new URL(url, global.location.href);
      u.searchParams.set('dk', key);
      return u.toString();
    } catch (_e0) {
      var hashIdx = url.indexOf('#');
      var hashPart = hashIdx >= 0 ? url.substring(hashIdx) : '';
      var base = hashIdx >= 0 ? url.substring(0, hashIdx) : url;
      var cleaned = base.replace(/([?&])dk=[^&#]*/g, '$1').replace(/[?&]$/, '');
      var joiner = cleaned.indexOf('?') === -1 ? '?' : '&';
      return cleaned + joiner + 'dk=' + encodeURIComponent(key) + hashPart;
    }
  }

  function appendIpKeyToUrl(url) {
    if (!url) return url;
    var ipKey = getStoredIpKey();
    if (!ipKey) return url;

    try {
      var u = new URL(url, global.location.href);
      u.searchParams.set('ipk', ipKey);
      return u.toString();
    } catch (_e0) {
      var hashIdx = url.indexOf('#');
      var hashPart = hashIdx >= 0 ? url.substring(hashIdx) : '';
      var base = hashIdx >= 0 ? url.substring(0, hashIdx) : url;
      var cleaned = base.replace(/([?&])ipk=[^&#]*/g, '$1').replace(/[?&]$/, '');
      var joiner = cleaned.indexOf('?') === -1 ? '?' : '&';
      return cleaned + joiner + 'ipk=' + encodeURIComponent(ipKey) + hashPart;
    }
  }

  function appendSessionKeysToUrl(url) {
    return appendIpKeyToUrl(appendDeviceKeyToUrl(url));
  }

  function syncCurrentUrlSessionKeys() {
    try {
      var next = appendSessionKeysToUrl(global.location.href);
      if (next && next !== global.location.href) {
        global.history.replaceState(null, '', next);
      }
    } catch (_err) {}
  }

  function ensurePageLoader() {
    var el = document.getElementById('pageLoader');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'pageLoader';
    el.className = 'page-loader';
    el.innerHTML = '<div class="page-loader-card"><div class="page-loader-spinner"></div><div class="page-loader-text" id="pageLoaderText">กำลังโหลด...</div></div>';
    document.body.appendChild(el);
    return el;
  }

  function showPageLoader(message, isNav) {
    var el = ensurePageLoader();
    var text = document.getElementById('pageLoaderText');
    if (text) text.textContent = message || 'กำลังโหลด...';
    el.setAttribute('data-nav', isNav ? '1' : '0');
    el.classList.add('show');
  }

  function hidePageLoader() {
    var el = document.getElementById('pageLoader');
    if (el) el.classList.remove('show');
  }

  function navigateWithLoader(url, message) {
    if (!url) return;
    showPageLoader(message || 'กำลังเปลี่ยนหน้า...', true);
    var dest = appendSessionKeysToUrl(url) || url;

    try {
      dest = new URL(dest, global.location.href).toString();
    } catch (_e0) {}

    beginPageLeave(function () {
      try {
        global.top.location.href = dest;
      } catch (_e1) {
        try {
          global.location.href = dest;
        } catch (_e2) {
          hidePageLoader();
          if (document.body) {
            document.body.classList.remove('page-leaving');
            document.body.classList.add('page-ready');
          }
        }
      }
    });
  }

  function bindPageLoaderLinks() {
    document.addEventListener('click', function (e) {
      if (!e || e.defaultPrevented) return;
      if (typeof e.button === 'number' && e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      var a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (!a || a.hasAttribute('data-no-loader')) return;
      if (a.hasAttribute('download')) return;

      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return;
      if (a.getAttribute('target') === '_blank') return;

      var resolved = '';
      try {
        resolved = a.href || href;
      } catch (_err0) {
        resolved = href;
      }

      try {
        var nextUrl = new URL(resolved, global.location.href);
        var current = new URL(global.location.href);
        if (nextUrl.origin !== current.origin) return;

        e.preventDefault();
        navigateWithLoader(nextUrl.toString(), 'กำลังเปลี่ยนหน้า...');
      } catch (_err1) {
        try { a.setAttribute('href', appendSessionKeysToUrl(href)); } catch (_err2) {}
        showPageLoader('กำลังเปลี่ยนหน้า...', true);
      }
    });
  }

  function bindPageTransitionLifecycle() {
    markPageReady();
    global.addEventListener('pageshow', function () {
      markPageReady();
      hidePageLoader();
    });
  }

  function initTheme() {
    var icon = document.getElementById('theme-icon');
    try {
      var saved = localStorage.getItem('appTheme');
      if (saved === 'dark') {
        document.body.classList.add('dark-mode');
        if (icon) icon.className = 'bi bi-sun-fill';
      } else {
        document.body.classList.remove('dark-mode');
        if (icon) icon.className = 'bi bi-moon-stars';
      }
    } catch (_err) {}
  }

  function toggleTheme() {
    var icon = document.getElementById('theme-icon');
    try {
      document.body.classList.toggle('dark-mode');
      var isDark = document.body.classList.contains('dark-mode');
      localStorage.setItem('appTheme', isDark ? 'dark' : 'light');
      if (icon) icon.className = isDark ? 'bi bi-sun-fill' : 'bi bi-moon-stars';
    } catch (_err) {}
  }

  function ensureThemeToggleButton() {
    if (document.getElementById('themeToggleBtn')) return;
    var btn = document.createElement('button');
    btn.id = 'themeToggleBtn';
    btn.className = 'theme-toggle-btn';
    btn.title = 'สลับโหมดมืด/สว่าง';
    btn.innerHTML = '<i id="theme-icon" class="bi bi-moon-stars"></i>';
    btn.addEventListener('click', toggleTheme);
    document.body.appendChild(btn);
  }

  function bootstrapLegacyTheme() {
    ensureThemeToggleButton();
    initTheme();
    ensureDeviceKey();
    syncCurrentUrlSessionKeys();
    bindPageLoaderLinks();
    bindPageTransitionLifecycle();
    ensurePageLoader();
    hidePageLoader();
  }

  global.normalizeDeviceKeyClient = normalizeDeviceKeyClient;
  global.normalizeIpKeyClient = normalizeIpKeyClient;
  global.getStoredIpAuthState = getStoredIpAuthState;
  global.getStoredIpKey = getStoredIpKey;
  global.ensureDeviceKey = ensureDeviceKey;
  global.getDeviceKey = getDeviceKey;
  global.appendDeviceKeyToUrl = appendDeviceKeyToUrl;
  global.appendIpKeyToUrl = appendIpKeyToUrl;
  global.appendSessionKeysToUrl = appendSessionKeysToUrl;
  global.syncCurrentUrlSessionKeys = syncCurrentUrlSessionKeys;
  global.syncCurrentUrlDeviceKey = syncCurrentUrlSessionKeys;
  global.showPageLoader = showPageLoader;
  global.hidePageLoader = hidePageLoader;
  global.navigateWithLoader = navigateWithLoader;
  global.initTheme = initTheme;
  global.toggleTheme = toggleTheme;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapLegacyTheme);
  } else {
    bootstrapLegacyTheme();
  }
})(typeof window !== 'undefined' ? window : this);
