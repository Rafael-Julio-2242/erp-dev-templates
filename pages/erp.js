/**
 * ERP SDK — standalone build for local development
 *
 * Generated from erp-core-frontend/src/lib/erp-sdk.ts
 * Check that repo for the latest version before using this file.
 *
 * Usage (plain HTML page):
 *   <script src="../erp.js"></script>
 *
 * When opening the page locally (outside the shell), place an erp.config.json
 * next to your HTML file:
 *
 *   { "mode": "mock", "mock_data": { "companies": [...] } }
 *   { "mode": "server", "server": "http://localhost:8080", "token": "..." }
 *
 * The SDK detects the absence of window.__ERP_SHELL__ and loads the config
 * automatically. Inside the shell, window.ERP is injected before your script
 * runs and this file is not needed.
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'erp_token';

  // ── Transports ──────────────────────────────────────────────────────────────

  function ProductionTransport() {
    function getToken() { return localStorage.getItem(TOKEN_KEY) || null; }

    function headers(extra) {
      var token = getToken();
      var h = { 'Content-Type': 'application/json' };
      if (token) h['Authorization'] = 'Bearer ' + token;
      return Object.assign(h, extra || {});
    }

    async function request(method, path, body, extraHeaders) {
      var opts = { method: method, headers: headers(extraHeaders) };
      if (body !== undefined) opts.body = JSON.stringify(body);
      try {
        var res = await fetch(path, opts);
        if (res.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          window.location.replace('/login');
          return { data: null, error: 'unauthorized', status: 401 };
        }
        var text = await res.text();
        var data = null;
        try { data = JSON.parse(text); } catch (_) { data = text || null; }
        if (!res.ok) {
          return { data: null, error: (data && data.error) || 'request_failed', status: res.status };
        }
        return { data: data, error: null, status: res.status };
      } catch (_) {
        return { data: null, error: 'network_error', status: 0 };
      }
    }

    return { request: request, token: getToken };
  }

  function ServerTransport(config) {
    var serverBase = (config.server || '').replace(/\/$/, '');
    var configToken = config.token || null;
    function getToken() { return configToken; }
    function headers(extra) {
      var h = { 'Content-Type': 'application/json' };
      if (configToken) h['Authorization'] = 'Bearer ' + configToken;
      return Object.assign(h, extra || {});
    }
    async function request(method, path, body, extraHeaders) {
      var opts = { method: method, headers: headers(extraHeaders) };
      if (body !== undefined) opts.body = JSON.stringify(body);
      try {
        var res = await fetch(serverBase + path, opts);
        var text = await res.text();
        var data = null;
        try { data = JSON.parse(text); } catch (_) { data = text || null; }
        if (!res.ok) return { data: null, error: (data && data.error) || 'request_failed', status: res.status };
        return { data: data, error: null, status: res.status };
      } catch (_) {
        return { data: null, error: 'network_error', status: 0 };
      }
    }
    return { request: request, token: getToken };
  }

  function MockTransport(config) {
    var store = {};
    var mockQuery = (config && config.mock_query) || {};
    var seed = (config && config.mock_data) || {};
    for (var k in seed) {
      if (Object.prototype.hasOwnProperty.call(seed, k)) {
        store[k] = seed[k].map(function (r) { return Object.assign({}, r); });
      }
    }
    function getToken() { return 'mock_token'; }
    function clamp(arr, offset, limit) {
      var o = offset || 0;
      var l = limit != null ? limit : arr.length;
      return arr.slice(o, o + l);
    }
    async function request(method, path, body) {
      var readMatch = path.match(/^\/api\/read\/([^\/]+)\/search$/);
      if (readMatch && method === 'POST') {
        var entity = readMatch[1];
        var rows = store[entity] || [];
        var b = body || {};
        var items = clamp(rows, b.offset, b.limit);
        return { data: { items: items, total: rows.length, page: 1, page_size: b.limit || rows.length }, error: null, status: 200 };
      }
      var writeMatch = path.match(/^\/api\/write\/([^\/]+)$/);
      if (writeMatch && method === 'POST') {
        var entity = writeMatch[1];
        var b = body || {};
        if (b.entity_id) {
          var list = store[entity] || [];
          for (var i = 0; i < list.length; i++) {
            if (list[i].id === b.entity_id) { Object.assign(list[i], b.data || {}); break; }
          }
          return { data: { id: b.entity_id }, error: null, status: 200 };
        } else {
          var newId = 'mock-' + Math.random().toString(36).slice(2);
          var record = Object.assign({ id: newId }, b.data || {});
          if (!store[entity]) store[entity] = [];
          store[entity].push(record);
          return { data: record, error: null, status: 201 };
        }
      }
      var deleteMatch = path.match(/^\/api\/write\/([^\/]+)\/([^\/]+)$/);
      if (deleteMatch && method === 'DELETE') {
        var entity = deleteMatch[1], id = deleteMatch[2];
        if (store[entity]) store[entity] = store[entity].filter(function (r) { return r.id !== id; });
        return { data: null, error: null, status: 204 };
      }
      var execMatch = path.match(/^\/api\/routines\/([^\/]+)\/execute$/);
      if (execMatch && method === 'POST') {
        return { data: { success: true, data: {}, message: '' }, error: null, status: 200 };
      }
      if (path === '/api/events/emit' && method === 'POST') return { data: null, error: null, status: 202 };
      if (path === '/api/query' && method === 'POST') {
        var sql = (body && body.sql) || '';
        var rows = mockQuery[sql] || mockQuery['default'] || [];
        return { data: { rows: rows }, error: null, status: 200 };
      }
      if (path === '/api/notifications' && method === 'POST') return { data: null, error: null, status: 201 };
      if (path.startsWith('/api/events/stream') && method === 'GET') return { data: null, error: null, status: 200 };
      return { data: null, error: 'mock_not_found', status: 404 };
    }
    return { request: request, token: getToken };
  }

  // ── Theme sync ──────────────────────────────────────────────────────────────

  function _getTheme() {
    try {
      var t = window.parent.document.documentElement.dataset.theme;
      if (t) return t;
    } catch (_) {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function _syncTheme() {
    document.documentElement.dataset.theme = _getTheme();
  }

  function _setupThemeSync() {
    try {
      var obs = new MutationObserver(_syncTheme);
      obs.observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } catch (_) {}
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', _syncTheme);
    } catch (_) {}
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  var _transport = null;
  var _ready = false;
  var _queue = [];

  function dispatch(method, path, body, extraHeaders) {
    if (_ready) return _transport.request(method, path, body, extraHeaders);
    return new Promise(function (resolve) {
      _queue.push(function () { resolve(_transport.request(method, path, body, extraHeaders)); });
    });
  }

  function flushQueue() {
    _ready = true;
    for (var i = 0; i < _queue.length; i++) { _queue[i](); }
    _queue = [];
  }

  async function _init() {
    if (typeof window.__ERP_SHELL__ !== 'undefined') {
      _transport = ProductionTransport();
      flushQueue();
      _syncTheme();
      _setupThemeSync();
      return;
    }
    try {
      var res = await fetch('./erp.config.json');
      if (!res.ok) throw new Error('no config');
      var cfg = await res.json();
      if (cfg.mode === 'server') {
        _transport = ServerTransport(cfg);
      } else {
        _transport = MockTransport(cfg);
      }
    } catch (_) {
      _transport = ProductionTransport();
    }
    flushQueue();
    _syncTheme();
    _setupThemeSync();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  window.ERP = {
    token: function () {
      if (_transport) return _transport.token();
      return localStorage.getItem(TOKEN_KEY) || null;
    },

    theme: function () {
      return _getTheme();
    },

    onThemeChange: function (callback) {
      var last = _getTheme();
      function check() {
        var t = _getTheme();
        if (t !== last) { last = t; callback(t); }
      }
      var observer = null;
      try {
        observer = new MutationObserver(check);
        observer.observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      } catch (_) {}
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', check);
      } catch (_) {}
      return {
        disconnect: function () { if (observer) observer.disconnect(); },
      };
    },

    user: function () {
      var token = this.token();
      if (!token || token === 'mock_token') return null;
      try {
        var payload = token.split('.')[1];
        return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      } catch (_) { return null; }
    },

    navigate: function (slug) {
      window.parent.postMessage({ type: 'erp:navigate', slug: slug }, '*');
    },

    api: async function (path, options) {
      var opts = options || {};
      var method = (opts.method || 'GET').toUpperCase();
      var body;
      if (opts.body !== undefined) {
        try { body = JSON.parse(opts.body); } catch (_) { body = opts.body; }
      }
      return dispatch(method, path, body, opts.headers);
    },

    read: async function (entity, query, opts) {
      var q = query || {};
      var body = {
        filters:    q.filters    || [],
        sort_by:    q.sort_by    || null,
        sort_order: q.sort_order || null,
        limit:      q.limit  != null ? q.limit  : 50,
        offset:     q.offset != null ? q.offset : 0,
      };
      if ((opts || {}).company_id) body.company_id = opts.company_id;
      return dispatch('POST', '/api/read/' + entity + '/search', body);
    },

    write: async function (entity, data, companyId) {
      var body = { data: data };
      if (companyId) body.company_id = companyId;
      return dispatch('POST', '/api/write/' + entity, body);
    },

    update: async function (entity, id, data, companyId) {
      var body = { entity_id: id, data: data };
      if (companyId) body.company_id = companyId;
      return dispatch('POST', '/api/write/' + entity, body);
    },

    delete: async function (entity, id) {
      return dispatch('DELETE', '/api/write/' + entity + '/' + id);
    },

    execute: async function (routineId, input) {
      return dispatch('POST', '/api/routines/' + routineId + '/execute', { input: input || {} });
    },

    emit: async function (eventType, payload, companyId) {
      var body = { event_type: eventType, payload: payload || {} };
      if (companyId) body.company_id = companyId;
      return dispatch('POST', '/api/events/emit', body);
    },

    query: async function (sql, params) {
      return dispatch('POST', '/api/query', { sql: sql, params: params || [] });
    },

    notify: async function (target, title, opts) {
      var o = opts || {};
      var body = { title: title };
      if (target.userId)   body.target_user_id   = target.userId;
      if (target.roleSlug) body.target_role_slug = target.roleSlug;
      if (o.kind) body.kind = o.kind;
      if (o.body) body.body = o.body;
      if (o.data) body.data = o.data;
      return dispatch('POST', '/api/notifications', body);
    },

    on: function (eventType, callback) {
      var self = this;
      var es = null;
      var closed = false;
      function doConnect() {
        if (es) es.close();
        if (closed) return;
        var token = self.token() || '';
        var url = '/api/events/stream?token=' + encodeURIComponent(token);
        es = new EventSource(url);
        es.addEventListener(eventType, function (e) {
          try { callback(JSON.parse(e.data), e); } catch (_) { callback(e.data, e); }
        });
      }
      doConnect();
      return {
        close:   function () { closed = true; if (es) { es.close(); es = null; } },
        refresh: function () { doConnect(); },
      };
    },

    // ── UI utilities ─────────────────────────────────────────────────────────

    toast: function (message, kind) {
      var colors = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
      var t = document.createElement('div');
      t.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);border-left:3px solid ' + (colors[kind] || colors.info) + ';border-radius:6px;padding:10px 16px;font-size:.8125rem;color:var(--text,#e8eaf0);box-shadow:0 4px 16px rgba(0,0,0,.3);z-index:9999;max-width:320px;word-break:break-word;';
      t.textContent = message;
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.remove(); }, 3500);
    },

    esc: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    confirm: function (label, callback) {
      var o = document.createElement('div');
      o.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center;';
      o.innerHTML = '<div style="background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);border-radius:10px;width:360px;max-width:calc(100vw - 32px);box-shadow:0 20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column">'
        + '<div style="padding:20px 24px;font-size:.875rem;color:var(--text,#e8eaf0)">Excluir <strong>' + ERP.esc(label) + '</strong>? Esta ação não pode ser desfeita.</div>'
        + '<div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--border,#2a2d3a)">'
        + '<button id="_erp_cc" style="display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);color:var(--text,#e8eaf0)">Cancelar</button>'
        + '<button id="_erp_co" style="display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;background:none;color:#ef4444;border:1px solid #ef4444">Excluir</button>'
        + '</div></div>';
      document.body.appendChild(o);
      o.querySelector('#_erp_cc').onclick = function () { o.remove(); };
      o.querySelector('#_erp_co').onclick = function () { o.remove(); callback(); };
    },

    parseDirective: async function (result, ctx) {
      var d = (result && result.data != null) ? result.data : result;
      if (!d) { ERP.toast('Ação executada.', 'success'); return; }

      var key = d.directive || d.action;

      if (!key) {
        if (d.success === false) { ERP.toast(d.message || 'Erro.', 'error'); }
        else { ERP.toast(d.message || 'Ação executada.', 'success'); }
        return;
      }

      if (key === 'navigate') key = 'redirect';
      if (key === 'form')     key = 'input_form';

      if (key === 'toast') {
        var kind = d.variant || d.kind || 'info';
        ERP.toast((d.description ? d.message + ' — ' + d.description : d.message) || '', kind);

      } else if (key === 'reload') {
        if (ctx && ctx.load) ctx.load();

      } else if (key === 'redirect') {
        ERP.navigate(d.slug);

      } else if (key === 'modal') {
        var colors = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
        var mo = document.createElement('div');
        mo.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center;';
        mo.innerHTML = '<div style="background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);border-top:3px solid ' + (colors[d.variant || d.kind] || colors.info) + ';border-radius:10px;width:480px;max-width:calc(100vw - 32px);box-shadow:0 20px 60px rgba(0,0,0,.4);">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border,#2a2d3a)">'
          + '<span style="font-size:.9375rem;font-weight:600;color:var(--text,#e8eaf0)">' + ERP.esc(d.title || '') + '</span>'
          + '<button id="_erp_mc" style="background:none;border:none;cursor:pointer;font-size:1.25rem;color:var(--text-muted,#6b7280)">&#215;</button></div>'
          + '<div style="padding:20px;font-size:.875rem;color:var(--text,#e8eaf0);white-space:pre-wrap">' + ERP.esc(d.body || '') + '</div>'
          + '<div style="display:flex;justify-content:flex-end;padding:12px 20px;border-top:1px solid var(--border,#2a2d3a)">'
          + '<button id="_erp_mcl" style="display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);color:var(--text,#e8eaf0)">' + ERP.esc(d.close_label || 'Fechar') + '</button>'
          + '</div></div>';
        document.body.appendChild(mo);
        mo.querySelector('#_erp_mc').onclick = function () { mo.remove(); };
        mo.querySelector('#_erp_mcl').onclick = function () { mo.remove(); };
        mo.addEventListener('click', function (e) { if (e.target === mo) mo.remove(); });

      } else if (key === 'confirm') {
        var co = document.createElement('div');
        co.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center;';
        co.innerHTML = '<div style="background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);border-radius:10px;width:400px;max-width:calc(100vw - 32px);box-shadow:0 20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column">'
          + '<div style="padding:20px 24px;font-size:.875rem;color:var(--text,#e8eaf0)">' + ERP.esc(d.message || '') + '</div>'
          + '<div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--border,#2a2d3a)">'
          + '<button id="_erp_coc" style="display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);color:var(--text,#e8eaf0)">' + ERP.esc(d.cancel_label || 'Cancelar') + '</button>'
          + '<button id="_erp_coo" style="display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;background:var(--accent,#7c6af5);color:#fff;border:none">' + ERP.esc(d.confirm_label || 'Confirmar') + '</button>'
          + '</div></div>';
        document.body.appendChild(co);
        co.querySelector('#_erp_coc').onclick = function () { co.remove(); };
        co.querySelector('#_erp_coo').onclick = async function () {
          co.remove();
          if (ctx && ctx.execute) {
            var r = await ctx.execute({ _confirmed: true });
            if (r && r.data) await ERP.parseDirective(r, ctx);
          } else if (d.on_confirm) {
            await ERP.parseDirective({ data: d.on_confirm }, ctx);
          }
        };

      } else if (key === 'input_form') {
        var fields = d.fields || [];
        var errors = d.errors || {};
        var fHtml = fields.map(function (f) {
          var fid = 'erp_ff_' + f.name;
          var inp;
          if (f.type === 'textarea') {
            inp = '<textarea id="' + fid + '" placeholder="' + ERP.esc(f.placeholder || '') + '" style="width:100%;min-height:80px;padding:8px 10px;background:var(--bg,#0d0f18);border:1px solid var(--border,#2a2d3a);border-radius:6px;color:var(--text,#e8eaf0);font-size:.8rem;font-family:inherit;outline:none;resize:vertical;box-sizing:border-box"></textarea>';
          } else if (f.type === 'select') {
            var sopts = (f.options || []).map(function (op) {
              var v = typeof op === 'object' ? op.value : op;
              var l = typeof op === 'object' ? (op.label || op.value) : op;
              return '<option value="' + ERP.esc(v) + '">' + ERP.esc(l) + '</option>';
            }).join('');
            inp = '<select id="' + fid + '" style="width:100%;height:34px;padding:0 10px;background:var(--bg,#0d0f18);border:1px solid var(--border,#2a2d3a);border-radius:6px;color:var(--text,#e8eaf0);font-size:.8rem;font-family:inherit;outline:none"><option value="">Selecione...</option>' + sopts + '</select>';
          } else if (f.type === 'multiselect') {
            var mopts = (f.options || []).map(function (op) {
              var v = typeof op === 'object' ? op.value : op;
              var l = typeof op === 'object' ? (op.label || op.value) : op;
              return '<option value="' + ERP.esc(v) + '">' + ERP.esc(l) + '</option>';
            }).join('');
            inp = '<select id="' + fid + '" multiple style="width:100%;padding:8px 10px;background:var(--bg,#0d0f18);border:1px solid var(--border,#2a2d3a);border-radius:6px;color:var(--text,#e8eaf0);font-size:.8rem;font-family:inherit;outline:none">' + mopts + '</select>';
          } else if (f.type === 'checkbox') {
            inp = '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.8rem;color:var(--text,#e8eaf0)"><input type="checkbox" id="' + fid + '"> ' + ERP.esc(f.label || f.name) + '</label>';
            var errHtml = errors[f.name] ? '<span style="font-size:.72rem;color:#ef4444">' + ERP.esc(errors[f.name]) + '</span>' : '';
            return '<div>' + inp + errHtml + '</div>';
          } else {
            var itype = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text';
            inp = '<input type="' + itype + '" id="' + fid + '" placeholder="' + ERP.esc(f.placeholder || '') + '" style="width:100%;height:34px;padding:0 10px;background:var(--bg,#0d0f18);border:1px solid var(--border,#2a2d3a);border-radius:6px;color:var(--text,#e8eaf0);font-size:.8rem;font-family:inherit;outline:none;box-sizing:border-box">';
          }
          var errHtml = errors[f.name] ? '<span style="font-size:.72rem;color:#ef4444">' + ERP.esc(errors[f.name]) + '</span>' : '<span id="erp_fe_' + f.name + '" style="font-size:.72rem;color:#ef4444;display:none"></span>';
          return '<div style="display:flex;flex-direction:column;gap:4px">'
            + '<label for="' + fid + '" style="font-size:.72rem;font-weight:600;color:var(--text-muted,#6b7280)">'
            + (f.required ? '<span style="color:#ef4444">* </span>' : '') + ERP.esc(f.label || f.name) + '</label>'
            + inp + errHtml + '</div>';
        }).join('');

        var fo = document.createElement('div');
        fo.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center;';
        fo.innerHTML = '<div style="background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);border-radius:10px;width:480px;max-width:calc(100vw - 32px);max-height:calc(100vh - 64px);box-shadow:0 20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border,#2a2d3a);flex-shrink:0">'
          + '<span style="font-size:.9375rem;font-weight:600;color:var(--text,#e8eaf0)">' + ERP.esc(d.title || 'Preencher formulário') + '</span>'
          + '<button id="erp_fc" style="background:none;border:none;cursor:pointer;font-size:1.25rem;color:var(--text-muted,#6b7280)">&#215;</button></div>'
          + (d.description ? '<div style="padding:12px 20px 0;font-size:.8125rem;color:var(--text-muted,#6b7280)">' + ERP.esc(d.description) + '</div>' : '')
          + '<div style="padding:20px;overflow-y:auto;display:flex;flex-direction:column;gap:12px">' + fHtml + '</div>'
          + '<div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--border,#2a2d3a);flex-shrink:0">'
          + '<button id="erp_fcc" style="display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);color:var(--text,#e8eaf0)">Cancelar</button>'
          + '<button id="erp_fs" style="display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;background:var(--accent,#7c6af5);color:#fff;border:none">' + ERP.esc(d.submit_label || 'Enviar') + '</button>'
          + '</div></div>';
        document.body.appendChild(fo);
        fo.querySelector('#erp_fc').onclick = fo.querySelector('#erp_fcc').onclick = function () { fo.remove(); };
        fo.querySelector('#erp_fs').onclick = async function () {
          var extra = {}, valid = true;
          fields.forEach(function (f) {
            var el = document.getElementById('erp_ff_' + f.name);
            if (!el) return;
            var val;
            if (f.type === 'checkbox') {
              val = el.checked;
            } else if (f.type === 'multiselect') {
              val = Array.from(el.selectedOptions).map(function (o) { return o.value; }).join(',');
            } else {
              val = el.value;
            }
            extra[f.name] = val;
            var errEl = document.getElementById('erp_fe_' + f.name);
            if (f.required && (val === '' || val === null || val === undefined || val === false)) {
              if (errEl) { errEl.textContent = 'Campo obrigatório.'; errEl.style.display = 'block'; }
              valid = false;
            } else if (errEl) {
              errEl.style.display = 'none';
            }
          });
          if (!valid) return;
          fo.remove();
          extra._submitted = true;
          if (ctx && ctx.execute) {
            var r = await ctx.execute(extra);
            if (r && r.data) await ERP.parseDirective(r, ctx);
          }
        };

      } else if (key === 'download') {
        var bytes = atob(d.content_base64 || '');
        var arr = new Uint8Array(bytes.length);
        for (var i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        var blob = new Blob([arr], { type: d.mime || 'application/octet-stream' });
        var url = URL.createObjectURL(blob);
        var anchor = document.createElement('a');
        anchor.href = url; anchor.download = d.filename || 'download'; anchor.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }
    },

    // ── Saved filters ─────────────────────────────────────────────────────────

    loadSavedFilters: async function (entitySlug, onApply) {
      var btn = document.getElementById('sf-btn');
      var menu = document.getElementById('sf-menu');
      if (!btn || !menu) return;
      btn.onclick = async function (e) {
        e.stopPropagation();
        var open = menu.style.display !== 'block';
        menu.style.display = open ? 'block' : 'none';
        if (!open) return;
        menu.innerHTML = '<div style="padding:10px 14px;font-size:.75rem;color:var(--text-muted,#6b7280)">Carregando...</div>';
        var res = await ERP.api('/api/saved-filters?entity=' + encodeURIComponent(entitySlug), { method: 'GET' });
        var items = Array.isArray(res.data) ? res.data : [];
        menu.innerHTML = '';
        items.forEach(function (f) {
          var item = document.createElement('div');
          item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 14px;font-size:.8125rem;color:var(--text,#e8eaf0);cursor:pointer;white-space:nowrap;gap:8px;';
          item.innerHTML = '<span>' + ERP.esc(f.name) + '</span>' + (f.is_mine ? '' : '<span style="font-size:.7rem;color:var(--text-muted,#6b7280)">&#128279;</span>');
          item.onmouseover = function () { this.style.background = 'var(--hover,rgba(255,255,255,.04))'; };
          item.onmouseout  = function () { this.style.background = ''; };
          item.onclick = function () { menu.style.display = 'none'; if (onApply) onApply(f.filters); };
          menu.appendChild(item);
        });
        if (items.length) {
          var sep = document.createElement('div');
          sep.style.cssText = 'height:1px;background:var(--border,#2a2d3a);margin:4px 0;';
          menu.appendChild(sep);
        }
        var saveItem = document.createElement('div');
        saveItem.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px 14px;font-size:.8125rem;color:var(--accent,#7c6af5);cursor:pointer;white-space:nowrap;';
        saveItem.textContent = '+ Salvar filtro atual';
        saveItem.onmouseover = function () { this.style.background = 'var(--hover,rgba(255,255,255,.04))'; };
        saveItem.onmouseout  = function () { this.style.background = ''; };
        saveItem.onclick = function () { menu.style.display = 'none'; ERP._saveFilterModal(entitySlug); };
        menu.appendChild(saveItem);
      };
      document.addEventListener('click', function () { menu.style.display = 'none'; });
    },

    _saveFilterModal: function (entitySlug) {
      var o = document.createElement('div');
      o.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center;';
      o.innerHTML = '<div style="background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);border-radius:10px;width:380px;max-width:calc(100vw - 32px);box-shadow:0 20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border,#2a2d3a)">'
        + '<span style="font-size:.9375rem;font-weight:600;color:var(--text,#e8eaf0)">Salvar filtro atual</span>'
        + '<button id="erp_sfmc" style="background:none;border:none;cursor:pointer;font-size:1.25rem;color:var(--text-muted,#6b7280)">&#215;</button></div>'
        + '<div style="padding:20px;display:flex;flex-direction:column;gap:12px">'
        + '<div style="display:flex;flex-direction:column;gap:4px">'
        + '<label for="erp_sfmn" style="font-size:.72rem;font-weight:600;color:var(--text-muted,#6b7280)"><span style="color:#ef4444">* </span>Nome</label>'
        + '<input id="erp_sfmn" style="width:100%;height:34px;padding:0 10px;background:var(--bg,#0d0f18);border:1px solid var(--border,#2a2d3a);border-radius:6px;color:var(--text,#e8eaf0);font-size:.8rem;font-family:inherit;outline:none;box-sizing:border-box" placeholder="Ex: Empresas ativas">'
        + '</div>'
        + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.8125rem;color:var(--text,#e8eaf0)">'
        + '<input type="checkbox" id="erp_sfms"> Compartilhar com todos</label>'
        + '</div>'
        + '<div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--border,#2a2d3a)">'
        + '<button id="erp_sfmcc" style="display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);color:var(--text,#e8eaf0)">Cancelar</button>'
        + '<button id="erp_sfmsv" style="display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;background:var(--accent,#7c6af5);color:#fff;border:none">Salvar</button>'
        + '</div></div>';
      document.body.appendChild(o);
      o.querySelector('#erp_sfmc').onclick = o.querySelector('#erp_sfmcc').onclick = function () { o.remove(); };
      o.querySelector('#erp_sfmsv').onclick = async function () {
        var name = document.getElementById('erp_sfmn').value.trim();
        if (!name) return;
        var isShared = document.getElementById('erp_sfms').checked;
        var res = await ERP.api('/api/saved-filters', { method: 'POST', body: JSON.stringify({ name: name, entity_slug: entitySlug, filters: [], is_shared: isShared }) });
        o.remove();
        if (res.error) { ERP.toast(res.error, 'error'); return; }
        ERP.toast('Filtro salvo.', 'success');
      };
    },
  };

  _init();
})();
