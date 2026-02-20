(function (global) {
  'use strict';

  function safeTrim(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalizeScriptUrl(url) {
    var raw = safeTrim(url);
    if (!raw) throw new Error('scriptUrl is required');
    return raw;
  }

  function appendQuery(url, params) {
    var out = String(url || '');
    var hasQuery = out.indexOf('?') !== -1;
    for (var key in params) {
      if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
      var value = params[key];
      if (value === undefined || value === null || value === '') continue;
      out += (hasQuery ? '&' : '?') + encodeURIComponent(key) + '=' + encodeURIComponent(String(value));
      hasQuery = true;
    }
    return out;
  }

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch (_e) {
      throw new Error('invalid_json_response');
    }
  }

  function randomDeviceKey() {
    return 'dk_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
  }

  function DocumentControlApi(options) {
    options = options || {};
    this.scriptUrl = normalizeScriptUrl(options.scriptUrl || '');
    this.defaultDeviceKey = safeTrim(options.deviceKey || '') || randomDeviceKey();
    this.defaultIpKey = safeTrim(options.ipKey || '');
    this.timeoutMs = Number(options.timeoutMs || 15000);
  }

  DocumentControlApi.prototype._buildPayload = function (action, payload, opts) {
    var body = {
      action: action,
      payload: payload || {}
    };
    var requestId = safeTrim(opts && opts.requestId ? opts.requestId : '');
    if (requestId) body.requestId = requestId;
    return body;
  };

  DocumentControlApi.prototype._ensureSessionKeys = function (payload) {
    var out = payload && typeof payload === 'object' ? payload : {};
    if (!safeTrim(out.deviceKey)) out.deviceKey = this.defaultDeviceKey;
    if (!safeTrim(out.clientIpKey) && this.defaultIpKey) out.clientIpKey = this.defaultIpKey;
    return out;
  };

  DocumentControlApi.prototype._fetchWithTimeout = function (url, requestInit, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('timeout'));
      }, timeoutMs);

      fetch(url, requestInit)
        .then(function (resp) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(resp);
        })
        .catch(function (err) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(err || new Error('network_error'));
        });
    });
  };

  DocumentControlApi.prototype._callFetch = function (action, payload, opts) {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('fetch_not_supported'));
    }

    var endpoint = appendQuery(this.scriptUrl, { api: '1' });
    var body = this._buildPayload(action, payload, opts);
    var timeoutMs = Number((opts && opts.timeoutMs) || this.timeoutMs || 15000);

    return this._fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(body),
        credentials: 'omit',
        mode: 'cors'
      },
      timeoutMs
    ).then(function (resp) {
      return resp.text().then(function (text) {
        if (!resp || !resp.ok) {
          throw new Error('HTTP_' + (resp ? resp.status : '0'));
        }
        var parsed = parseJson(text);
        if (!parsed || parsed.success === false) {
          throw new Error(parsed && parsed.error ? parsed.error : 'api_error');
        }
        return parsed;
      });
    });
  };

  DocumentControlApi.prototype._callJsonp = function (action, payload, opts) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var callbackName = '__docApiCb_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
      var scriptTag = null;
      var timer = null;
      var timeoutMs = Number((opts && opts.timeoutMs) || self.timeoutMs || 15000);

      function cleanup() {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        try {
          delete global[callbackName];
        } catch (_e1) {
          global[callbackName] = undefined;
        }
        if (scriptTag && scriptTag.parentNode) {
          scriptTag.parentNode.removeChild(scriptTag);
        }
        scriptTag = null;
      }

      global[callbackName] = function (response) {
        cleanup();
        if (!response || response.success === false) {
          reject(new Error(response && response.error ? response.error : 'api_error'));
          return;
        }
        resolve(response);
      };

      var queryPayload = self._buildPayload(action, payload, opts).payload || {};
      var src = appendQuery(self.scriptUrl, {
        api: '1',
        action: action,
        callback: callbackName,
        payload: JSON.stringify(queryPayload)
      });

      scriptTag = document.createElement('script');
      scriptTag.async = true;
      scriptTag.src = src;
      scriptTag.onerror = function () {
        cleanup();
        reject(new Error('jsonp_failed'));
      };

      timer = setTimeout(function () {
        cleanup();
        reject(new Error('jsonp_timeout'));
      }, timeoutMs);

      document.head.appendChild(scriptTag);
    });
  };

  DocumentControlApi.prototype.call = function (action, payload, opts) {
    var requestPayload = this._ensureSessionKeys(payload || {});
    var useJsonpOnly = !!(opts && opts.useJsonpOnly);

    if (useJsonpOnly) {
      return this._callJsonp(action, requestPayload, opts);
    }

    var self = this;
    return this._callFetch(action, requestPayload, opts).catch(function () {
      return self._callJsonp(action, requestPayload, opts);
    });
  };

  DocumentControlApi.prototype.health = function (opts) {
    return this.call('health', { deviceKey: this.defaultDeviceKey }, opts);
  };

  DocumentControlApi.prototype.login = function (username, password, opts) {
    var payload = {
      username: safeTrim(username),
      password: String(password == null ? '' : password),
      deviceKey: (opts && opts.deviceKey) ? safeTrim(opts.deviceKey) : this.defaultDeviceKey,
      clientIpKey: (opts && opts.ipKey) ? safeTrim(opts.ipKey) : this.defaultIpKey
    };
    this.defaultDeviceKey = payload.deviceKey || this.defaultDeviceKey;
    return this.call('auth.login', payload, opts);
  };

  DocumentControlApi.prototype.logout = function (opts) {
    return this.call('auth.logout', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey
    }, opts);
  };

  DocumentControlApi.prototype.me = function (opts) {
    return this.call('auth.me', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey
    }, opts);
  };

  DocumentControlApi.prototype.optionsInfo = function (opts) {
    return this.call('options.info', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey
    }, opts);
  };

  DocumentControlApi.prototype.optionsMembers = function (opts) {
    return this.call('options.members', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey
    }, opts);
  };

  DocumentControlApi.prototype.storageOptions = function (opts) {
    return this.call('storage.options', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey
    }, opts);
  };

  DocumentControlApi.prototype.docsList = function (params, opts) {
    params = params || {};
    return this.call('docs.list', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey,
      page: Number(params.page || 1),
      itemsPerPage: Number(params.itemsPerPage || 20),
      searchQuery: safeTrim(params.searchQuery || ''),
      statusFilter: safeTrim(params.statusFilter || 'all')
    }, opts);
  };

  DocumentControlApi.prototype.docDetail = function (docId, opts) {
    return this.call('doc.detail', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey,
      docId: safeTrim(docId || '')
    }, opts);
  };

  DocumentControlApi.prototype.systemReport = function (opts) {
    return this.call('docs.report_all', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey
    }, opts);
  };

  DocumentControlApi.prototype.docCreate = function (formData, opts) {
    return this.call('doc.create', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey,
      formData: formData || {}
    }, opts);
  };

  DocumentControlApi.prototype.docUpdate = function (docId, formData, opts) {
    return this.call('doc.update', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey,
      docId: safeTrim(docId || ''),
      formData: formData || {}
    }, opts);
  };

  DocumentControlApi.prototype.docUpdateStatus = function (docId, statusData, opts) {
    return this.call('doc.update_status', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey,
      docId: safeTrim(docId || ''),
      statusData: statusData || {}
    }, opts);
  };

  DocumentControlApi.prototype.docChangeMainStatus = function (docId, newStatus, statusRemark, opts) {
    return this.call('doc.change_main_status', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey,
      docId: safeTrim(docId || ''),
      newStatus: safeTrim(newStatus || ''),
      statusRemark: String(statusRemark == null ? '' : statusRemark)
    }, opts);
  };

  DocumentControlApi.prototype.docUpdateField = function (docId, fieldName, fieldValue, opts) {
    return this.call('doc.update_field', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey,
      docId: safeTrim(docId || ''),
      fieldName: safeTrim(fieldName || ''),
      fieldValue: fieldValue
    }, opts);
  };

  DocumentControlApi.prototype.checkStorageEligibility = function (docId, opts) {
    return this.call('storage.check_eligibility', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey,
      docId: safeTrim(docId || '')
    }, opts);
  };

  DocumentControlApi.prototype.saveDocumentsToBox = function (docIds, boxId, userName, opts) {
    return this.call('storage.save_documents', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey,
      docIds: Array.isArray(docIds) ? docIds : [],
      boxId: safeTrim(boxId || ''),
      userName: safeTrim(userName || '')
    }, opts);
  };

  DocumentControlApi.prototype.saveStorageData = function (docId, newLoc, userName, fiscalYear, destroyDate, opts) {
    return this.call('storage.save_data', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey,
      docId: safeTrim(docId || ''),
      newLoc: safeTrim(newLoc || ''),
      userName: safeTrim(userName || ''),
      fiscalYear: safeTrim(fiscalYear || ''),
      destroyDate: safeTrim(destroyDate || '')
    }, opts);
  };

  DocumentControlApi.prototype.boxDetail = function (boxName, opts) {
    return this.call('box.detail', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey,
      boxName: safeTrim(boxName || '')
    }, opts);
  };

  DocumentControlApi.prototype.inspectionReport = function (params, opts) {
    params = params || {};
    return this.call('inspection.report', {
      deviceKey: this.defaultDeviceKey,
      clientIpKey: this.defaultIpKey,
      officerName: safeTrim(params.officerName || ''),
      selectedFiscalYears: Array.isArray(params.selectedFiscalYears) ? params.selectedFiscalYears : [],
      startDate: safeTrim(params.startDate || ''),
      endDate: safeTrim(params.endDate || ''),
      startTime: safeTrim(params.startTime || ''),
      endTime: safeTrim(params.endTime || ''),
      group: safeTrim(params.group || '')
    }, opts);
  };

  global.DocumentControlApi = DocumentControlApi;
})(typeof window !== 'undefined' ? window : this);
