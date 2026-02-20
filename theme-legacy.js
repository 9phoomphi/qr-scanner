(function (global) {
  'use strict';

  var pageLeaveTimer = null;
  var pageLoadBusyCount = 0;

  function getLoaderMessage(message) {
    var text = String(message == null ? '' : message).trim();
    return text || 'กำลังโหลดข้อมูล...';
  }

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
    el.innerHTML = '<div class="page-loader-card"><div class="page-loader-spinner"></div><div class="page-loader-text" id="pageLoaderText">กำลังโหลดข้อมูล...</div></div>';
    document.body.appendChild(el);
    return el;
  }

  function showPageLoader(message, isNav) {
    var el = ensurePageLoader();
    var text = document.getElementById('pageLoaderText');
    if (text) text.textContent = getLoaderMessage(message);
    el.setAttribute('data-nav', isNav ? '1' : '0');
    el.setAttribute('aria-busy', 'true');
    el.classList.add('show');
  }

  function hidePageLoader(force) {
    var el = document.getElementById('pageLoader');
    if (!el) return;
    if (!force && el.getAttribute('data-nav') === '1') return;
    el.classList.remove('show');
    el.removeAttribute('aria-busy');
    el.setAttribute('data-nav', '0');
  }

  function beginPageLoading(message) {
    pageLoadBusyCount += 1;
    showPageLoader(getLoaderMessage(message), false);
    return { _active: true };
  }

  function endPageLoading(ticket) {
    if (ticket && ticket._active === false) return;
    if (ticket && typeof ticket === 'object') ticket._active = false;
    if (pageLoadBusyCount > 0) pageLoadBusyCount -= 1;
    if (pageLoadBusyCount <= 0) {
      pageLoadBusyCount = 0;
      hidePageLoader(false);
    }
  }

  function resetPageLoading() {
    pageLoadBusyCount = 0;
    hidePageLoader(true);
  }

  function navigateWithLoader(url, message) {
    if (!url) return;
    showPageLoader(getLoaderMessage(message), true);
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
          hidePageLoader(true);
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
        navigateWithLoader(nextUrl.toString(), 'กำลังโหลดข้อมูล...');
      } catch (_err1) {
        try { a.setAttribute('href', appendSessionKeysToUrl(href)); } catch (_err2) {}
        showPageLoader('กำลังโหลดข้อมูล...', true);
      }
    });
  }

  function bindPageLoaderForms() {
    document.addEventListener('submit', function (e) {
      var form = e && e.target ? e.target : null;
      if (!form || form.nodeName !== 'FORM') return;
      if (form.hasAttribute('data-no-loader')) return;
      var target = String(form.getAttribute('target') || '').trim().toLowerCase();
      if (target === '_blank') return;

      try {
        var method = String(form.getAttribute('method') || form.method || 'get').toLowerCase();
        if (method === 'get') {
          var action = form.getAttribute('action') || global.location.href;
          form.setAttribute('action', appendSessionKeysToUrl(action));
        }
      } catch (_err0) {}

      showPageLoader('กำลังโหลดข้อมูล...', true);
      if (document.body) {
        document.body.classList.add('page-leaving');
        document.body.classList.remove('page-ready');
      }
    });
  }

  function bindPageTransitionLifecycle() {
    markPageReady();
    global.addEventListener('pageshow', function () {
      markPageReady();
      resetPageLoading();
    });
    global.addEventListener('beforeunload', function () {
      showPageLoader('กำลังโหลดข้อมูล...', true);
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

  var THAI_M = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var THAI_MS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var calYear;
  var calMonth;
  var calTarget;
  var calView = 'day';

  function ensureCalendarDom() {
    if (document.getElementById('calOverlay') && document.getElementById('calPopup')) return;

    var wrap = document.createElement('div');
    wrap.innerHTML = '<div class=\"thai-cal-overlay\" id=\"calOverlay\"></div>' +
      '<div class=\"thai-cal-popup\" id=\"calPopup\">' +
      '<div class=\"thai-cal-header\"><div class=\"thai-cal-nav\">' +
      '<button id=\"btnCalPrev\" type=\"button\"><i class=\"bi bi-chevron-left\"></i></button>' +
      '<span class=\"thai-cal-title\" id=\"calTitle\"></span>' +
      '<button id=\"btnCalNext\" type=\"button\"><i class=\"bi bi-chevron-right\"></i></button>' +
      '</div></div>' +
      '<div id=\"calMonthView\" style=\"display:none\"></div>' +
      '<div id=\"calDayView\">' +
      '<div class=\"thai-cal-weekdays\"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span></div>' +
      '<div class=\"thai-cal-days\" id=\"calDays\"></div>' +
      '</div>' +
      '<div class=\"thai-cal-footer\">' +
      '<button class=\"thai-cal-btn-clear\" id=\"btnCalClear\" type=\"button\">ล้าง</button>' +
      '<button class=\"thai-cal-btn-today\" id=\"btnCalToday\" type=\"button\">วันนี้</button>' +
      '</div>' +
      '</div>';

    while (wrap.firstChild) {
      document.body.appendChild(wrap.firstChild);
    }

    var overlay = document.getElementById('calOverlay');
    var title = document.getElementById('calTitle');
    var btnPrev = document.getElementById('btnCalPrev');
    var btnNext = document.getElementById('btnCalNext');
    var btnToday = document.getElementById('btnCalToday');
    var btnClear = document.getElementById('btnCalClear');

    if (overlay) overlay.addEventListener('click', closeCalendar);
    if (title) title.addEventListener('click', toggleMonthView);
    if (btnPrev) btnPrev.addEventListener('click', calPrev);
    if (btnNext) btnNext.addEventListener('click', calNext);
    if (btnToday) btnToday.addEventListener('click', calToday);
    if (btnClear) btnClear.addEventListener('click', calClear);
  }

  function setCalView(view) {
    calView = view;
    var monthView = document.getElementById('calMonthView');
    var dayView = document.getElementById('calDayView');
    if (monthView) monthView.style.display = view === 'day' ? 'none' : 'block';
    if (dayView) dayView.style.display = view === 'day' ? 'block' : 'none';
    if (view === 'day') renderCal();
    else if (view === 'month') renderMonthView();
    else renderYearView();
  }

  function openCalendar(inputId) {
    ensureCalendarDom();
    calTarget = inputId;
    var input = document.getElementById(inputId);
    if (!input) return;

    var value = String(input.value || '');
    var now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();

    if (value) {
      var parts = value.split('-');
      if (parts.length === 3) {
        var yy = parseInt(parts[0], 10);
        if (yy > 2400) yy -= 543;
        if (!isNaN(yy)) calYear = yy;
        var mm = parseInt(parts[1], 10) - 1;
        if (!isNaN(mm) && mm >= 0 && mm <= 11) calMonth = mm;
      }
    }

    setCalView('day');

    var overlay = document.getElementById('calOverlay');
    var popup = document.getElementById('calPopup');
    if (overlay) overlay.style.display = 'block';
    if (popup) popup.style.display = 'block';
  }

  function closeCalendar() {
    var overlay = document.getElementById('calOverlay');
    var popup = document.getElementById('calPopup');
    if (overlay) overlay.style.display = 'none';
    if (popup) popup.style.display = 'none';
  }

  function renderCal() {
    var title = document.getElementById('calTitle');
    var days = document.getElementById('calDays');
    if (!title || !days) return;

    var thaiY = calYear < 2400 ? calYear + 543 : calYear;
    title.textContent = THAI_M[calMonth] + ' ' + thaiY;

    var firstDay = new Date(calYear, calMonth, 1).getDay();
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var prevDays = new Date(calYear, calMonth, 0).getDate();
    var html = '';
    var today = new Date();
    var selectedVal = '';
    var targetEl = document.getElementById(calTarget);
    if (targetEl) selectedVal = String(targetEl.value || '');
    var sp = selectedVal.split('-');
    if (sp.length === 3 && parseInt(sp[0], 10) > 2400) {
      selectedVal = (parseInt(sp[0], 10) - 543) + '-' + sp[1] + '-' + sp[2];
    }

    var i;
    for (i = firstDay - 1; i >= 0; i--) {
      var prevDate = prevDays - i;
      html += '<div class=\"thai-cal-day other-month\" onclick=\"pickDay(' + (calMonth - 1) + ',' + prevDate + ')\">' + prevDate + '</div>';
    }
    for (var d = 1; d <= daysInMonth; d++) {
      var cls = 'thai-cal-day';
      if (d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear()) cls += ' today';
      var cv = calYear + '-' + ('0' + (calMonth + 1)).slice(-2) + '-' + ('0' + d).slice(-2);
      if (selectedVal === cv) cls += ' selected';
      html += '<div class=\"' + cls + '\" onclick=\"pickDay(' + calMonth + ',' + d + ')\">' + d + '</div>';
    }

    var totalCells = firstDay + daysInMonth;
    var remain = 7 - (totalCells % 7);
    if (remain < 7) {
      for (var r = 1; r <= remain; r++) {
        html += '<div class=\"thai-cal-day other-month\" onclick=\"pickDay(' + (calMonth + 1) + ',' + r + ')\">' + r + '</div>';
      }
    }

    days.innerHTML = html;
  }

  function pickDay(monthValue, dayValue) {
    if (monthValue < 0) {
      calMonth = 11;
      calYear -= 1;
    } else if (monthValue > 11) {
      calMonth = 0;
      calYear += 1;
    } else {
      calMonth = monthValue;
    }

    var val = calYear + '-' + ('0' + (calMonth + 1)).slice(-2) + '-' + ('0' + dayValue).slice(-2);
    var targetEl = document.getElementById(calTarget);
    if (targetEl) targetEl.value = val;
    updDD(calTarget);
    closeCalendar();
  }

  function calPrev() {
    if (calView === 'year') {
      calYear -= 12;
      renderYearView();
      return;
    }
    if (calView === 'month') {
      calYear -= 1;
      renderMonthView();
      return;
    }
    calMonth -= 1;
    if (calMonth < 0) {
      calMonth = 11;
      calYear -= 1;
    }
    renderCal();
  }

  function calNext() {
    if (calView === 'year') {
      calYear += 12;
      renderYearView();
      return;
    }
    if (calView === 'month') {
      calYear += 1;
      renderMonthView();
      return;
    }
    calMonth += 1;
    if (calMonth > 11) {
      calMonth = 0;
      calYear += 1;
    }
    renderCal();
  }

  function calToday() {
    var now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    var val = calYear + '-' + ('0' + (calMonth + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
    var targetEl = document.getElementById(calTarget);
    if (targetEl) targetEl.value = val;
    updDD(calTarget);
    closeCalendar();
  }

  function calClear() {
    var targetEl = document.getElementById(calTarget);
    if (targetEl) targetEl.value = '';
    updDD(calTarget);
    closeCalendar();
  }

  function toggleMonthView() {
    if (calView === 'day') setCalView('month');
    else if (calView === 'month') setCalView('year');
    else setCalView('day');
  }

  function renderMonthView() {
    var title = document.getElementById('calTitle');
    var monthView = document.getElementById('calMonthView');
    if (!title || !monthView) return;
    var thaiY = calYear < 2400 ? calYear + 543 : calYear;
    title.textContent = 'พ.ศ. ' + thaiY + ' (เลือกเดือน)';
    var html = '';
    THAI_MS.forEach(function (m, i) {
      var cls = 'thai-cal-month';
      if (i === calMonth) cls += ' active';
      html += '<div class=\"' + cls + '\" onclick=\"pickMon(' + i + ')\">' + m + '</div>';
    });
    monthView.innerHTML = '<div class=\"thai-cal-months\">' + html + '</div>';
  }

  function renderYearView() {
    var title = document.getElementById('calTitle');
    var monthView = document.getElementById('calMonthView');
    if (!title || !monthView) return;
    title.textContent = 'เลือกปี พ.ศ.';
    var start = calYear - 6;
    var html = '';
    for (var y = start; y < start + 12; y++) {
      var cls = 'thai-cal-year';
      if (y === calYear) cls += ' active';
      html += '<div class=\"' + cls + '\" onclick=\"pickYear(' + y + ')\">' + (y + 543) + '</div>';
    }
    monthView.innerHTML = '<div class=\"thai-cal-year-head\">ช่วงปี พ.ศ. ' + (start + 543) + ' - ' + (start + 554) + '</div><div class=\"thai-cal-years\">' + html + '</div>';
  }

  function pickMon(m) {
    calMonth = m;
    setCalView('day');
  }

  function pickYear(y) {
    calYear = y;
    setCalView('month');
  }

  function updDD(inputId) {
    if (!inputId) return;
    var el = document.getElementById(inputId);
    var disp = document.getElementById(inputId + 'Display');
    if (!disp) return;
    if (!el || !el.value) {
      disp.textContent = 'เลือกวันที่...';
      disp.style.color = 'var(--text-muted)';
      return;
    }
    var p = String(el.value).split('-');
    var y = parseInt(p[0], 10);
    var m = parseInt(p[1], 10) - 1;
    var d = parseInt(p[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d) || m < 0 || m > 11) {
      disp.textContent = 'เลือกวันที่...';
      disp.style.color = 'var(--text-muted)';
      return;
    }
    var ty = y < 2400 ? y + 543 : y;
    disp.textContent = ('0' + d).slice(-2) + ' ' + THAI_M[m] + ' ' + ty;
    disp.style.color = 'var(--text-main)';
  }

  function initDateDisplays() {
    var dateInputs = document.querySelectorAll('.thai-date-input input[type=hidden]');
    for (var i = 0; i < dateInputs.length; i++) {
      updDD(dateInputs[i].id);
    }
  }

  function bootstrapLegacyTheme() {
    ensureCalendarDom();
    ensureThemeToggleButton();
    initTheme();
    ensureDeviceKey();
    syncCurrentUrlSessionKeys();
    bindPageLoaderLinks();
    bindPageLoaderForms();
    bindPageTransitionLifecycle();
    ensurePageLoader();
    initDateDisplays();
    resetPageLoading();
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
  global.beginPageLoading = beginPageLoading;
  global.endPageLoading = endPageLoading;
  global.resetPageLoading = resetPageLoading;
  global.showPageLoader = showPageLoader;
  global.hidePageLoader = hidePageLoader;
  global.navigateWithLoader = navigateWithLoader;
  global.initTheme = initTheme;
  global.toggleTheme = toggleTheme;
  global.openCalendar = openCalendar;
  global.closeCalendar = closeCalendar;
  global.calPrev = calPrev;
  global.calNext = calNext;
  global.calToday = calToday;
  global.calClear = calClear;
  global.toggleMonthView = toggleMonthView;
  global.pickDay = pickDay;
  global.pickMon = pickMon;
  global.pickYear = pickYear;
  global.updDD = updDD;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapLegacyTheme);
  } else {
    bootstrapLegacyTheme();
  }
})(typeof window !== 'undefined' ? window : this);
