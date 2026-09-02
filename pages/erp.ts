/**
 * ERP SDK — TypeScript build for local development
 *
 * Generated from erp-core-frontend/src/lib/erp-sdk.ts
 * Check that repo for the latest version before using this file.
 *
 * Usage (bundler — Vite, esbuild, etc.):
 *   import { ERP } from '../erp';
 *
 * When opening the page outside the shell (local development), place an
 * erp.config.json next to your entry file:
 *
 *   { "mode": "mock", "mock_data": { "companies": [...] } }
 *   { "mode": "server", "server": "http://localhost:8080", "token": "..." }
 *
 * Inside the shell, window.ERP is injected before your script runs.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data:   T | null;
  error:  string | null;
  status: number;
}

export interface FilterClause {
  order: number;
  group: number;
  field: string;
  op:    'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'ilike' | 'like' | 'in' | 'not_in' | 'is_null' | 'is_not_null';
  value: string;
}

export interface ReadQuery {
  filters?:    FilterClause[];
  sort_by?:    string | null;
  sort_order?: 'asc' | 'desc' | null;
  limit?:      number;
  offset?:     number;
}

export interface ReadResult<T = Record<string, unknown>> {
  items:     T[];
  total:     number;
  page:      number;
  page_size: number;
}

export interface ReadOptions {
  company_id?: string;
}

export interface NotifyTarget {
  userId?:   string;
  roleSlug?: string;
}

export interface NotifyOptions {
  kind?: 'info' | 'success' | 'warning' | 'error';
  body?: string;
  data?: Record<string, unknown>;
}

export interface EventHandle {
  close():   void;
  refresh(): void;
}

export interface ThemeHandle {
  disconnect(): void;
}

export type Theme = 'dark' | 'light';

export interface ParseDirectiveContext {
  execute?: (extra: Record<string, unknown>) => Promise<ApiResponse>;
  load?:    () => void;
}

export interface DirectiveResult {
  success?:   boolean;
  directive?: string;
  action?:    string;
  message?:   string;
  [key: string]:  unknown;
}

export interface UserPayload {
  sub:    string;
  name:   string;
  email:  string;
  roles:  string[];
  exp:    number;
  [key: string]: unknown;
}

// ── Transport internals ───────────────────────────────────────────────────────

interface Transport {
  request(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<ApiResponse>;
  token(): string | null;
}

interface ErpConfig {
  mode:        'server' | 'mock';
  server?:     string;
  token?:      string;
  mock_data?:  Record<string, Record<string, unknown>[]>;
  mock_query?: Record<string, Record<string, unknown>[]>;
}

const TOKEN_KEY = 'erp_token';

function buildProductionTransport(): Transport {
  function getToken() { return localStorage.getItem(TOKEN_KEY) || null; }

  function buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const token = getToken();
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    return Object.assign(h, extra || {});
  }

  async function request(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<ApiResponse> {
    const opts: RequestInit = { method, headers: buildHeaders(extraHeaders) };
    if (body !== undefined) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(path, opts);
      if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        window.location.replace('/login');
        return { data: null, error: 'unauthorized', status: 401 };
      }
      const text = await res.text();
      let data: unknown = null;
      try { data = JSON.parse(text); } catch { data = text || null; }
      if (!res.ok) return { data: null, error: ((data as Record<string, string>)?.error) || 'request_failed', status: res.status };
      return { data, error: null, status: res.status };
    } catch {
      return { data: null, error: 'network_error', status: 0 };
    }
  }

  return { request, token: getToken };
}

function buildServerTransport(config: ErpConfig): Transport {
  const serverBase = (config.server || '').replace(/\/$/, '');
  const configToken = config.token || null;
  function getToken() { return configToken; }

  function buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (configToken) h['Authorization'] = 'Bearer ' + configToken;
    return Object.assign(h, extra || {});
  }

  async function request(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<ApiResponse> {
    const opts: RequestInit = { method, headers: buildHeaders(extraHeaders) };
    if (body !== undefined) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(serverBase + path, opts);
      const text = await res.text();
      let data: unknown = null;
      try { data = JSON.parse(text); } catch { data = text || null; }
      if (!res.ok) return { data: null, error: ((data as Record<string, string>)?.error) || 'request_failed', status: res.status };
      return { data, error: null, status: res.status };
    } catch {
      return { data: null, error: 'network_error', status: 0 };
    }
  }

  return { request, token: getToken };
}

function buildMockTransport(config: ErpConfig): Transport {
  const store: Record<string, Record<string, unknown>[]> = {};
  const mockQuery = config.mock_query || {};
  const seed = config.mock_data || {};

  for (const k in seed) {
    if (Object.prototype.hasOwnProperty.call(seed, k)) {
      store[k] = seed[k].map(r => Object.assign({}, r));
    }
  }

  function getToken() { return 'mock_token'; }

  function clamp<T>(arr: T[], offset?: number, limit?: number): T[] {
    const o = offset || 0;
    const l = limit != null ? limit : arr.length;
    return arr.slice(o, o + l);
  }

  async function request(method: string, path: string, body?: Record<string, unknown>): Promise<ApiResponse> {
    const readMatch = path.match(/^\/api\/read\/([^/]+)\/search$/);
    if (readMatch && method === 'POST') {
      const entity = readMatch[1];
      const rows = store[entity] || [];
      const b = body || {};
      const items = clamp(rows, b['offset'] as number, b['limit'] as number);
      return { data: { items, total: rows.length, page: 1, page_size: b['limit'] || rows.length }, error: null, status: 200 };
    }

    const writeMatch = path.match(/^\/api\/write\/([^/]+)$/);
    if (writeMatch && method === 'POST') {
      const entity = writeMatch[1];
      const b = body || {};
      if (b['entity_id']) {
        const list = store[entity] || [];
        for (const row of list) {
          if (row['id'] === b['entity_id']) { Object.assign(row, b['data'] || {}); break; }
        }
        return { data: { id: b['entity_id'] }, error: null, status: 200 };
      } else {
        const newId = 'mock-' + Math.random().toString(36).slice(2);
        const record = Object.assign({ id: newId }, b['data'] || {});
        if (!store[entity]) store[entity] = [];
        store[entity].push(record);
        return { data: record, error: null, status: 201 };
      }
    }

    const deleteMatch = path.match(/^\/api\/write\/([^/]+)\/([^/]+)$/);
    if (deleteMatch && method === 'DELETE') {
      const entity = deleteMatch[1], id = deleteMatch[2];
      if (store[entity]) store[entity] = store[entity].filter(r => r['id'] !== id);
      return { data: null, error: null, status: 204 };
    }

    const execMatch = path.match(/^\/api\/routines\/([^/]+)\/execute$/);
    if (execMatch && method === 'POST') {
      return { data: { success: true, data: {}, message: '' }, error: null, status: 200 };
    }

    if (path === '/api/events/emit' && method === 'POST') return { data: null, error: null, status: 202 };
    if (path === '/api/query' && method === 'POST') {
      const sql = (body?.['sql'] as string) || '';
      const rows = mockQuery[sql] || mockQuery['default'] || [];
      return { data: { rows }, error: null, status: 200 };
    }
    if (path === '/api/notifications' && method === 'POST') return { data: null, error: null, status: 201 };
    if (path.startsWith('/api/events/stream') && method === 'GET') return { data: null, error: null, status: 200 };

    return { data: null, error: 'mock_not_found', status: 404 };
  }

  return { request, token: getToken };
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function getTheme(): Theme {
  try {
    const t = (window.parent.document.documentElement as HTMLElement).dataset['theme'];
    if (t) return t as Theme;
  } catch { /* cross-origin fallback */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function syncTheme(): void {
  document.documentElement.dataset['theme'] = getTheme();
}

function setupThemeSync(): void {
  try {
    const obs = new MutationObserver(syncTheme);
    obs.observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  } catch { /* cross-origin */ }
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);
  } catch { /* unsupported */ }
}

// ── Init queue ────────────────────────────────────────────────────────────────

let _transport: Transport | null = null;
let _ready = false;
const _queue: Array<() => void> = [];

function dispatch(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<ApiResponse> {
  if (_ready && _transport) return _transport.request(method, path, body, extraHeaders);
  return new Promise(resolve => {
    _queue.push(() => resolve(_transport!.request(method, path, body, extraHeaders)));
  });
}

function flushQueue(): void {
  _ready = true;
  for (const fn of _queue) fn();
  _queue.length = 0;
}

async function init(): Promise<void> {
  if (typeof (window as Window & { __ERP_SHELL__?: unknown }).__ERP_SHELL__ !== 'undefined') {
    _transport = buildProductionTransport();
    flushQueue();
    syncTheme();
    setupThemeSync();
    return;
  }
  try {
    const res = await fetch('./erp.config.json');
    if (!res.ok) throw new Error('no config');
    const cfg: ErpConfig = await res.json();
    _transport = cfg.mode === 'server' ? buildServerTransport(cfg) : buildMockTransport(cfg);
  } catch {
    _transport = buildProductionTransport();
  }
  flushQueue();
  syncTheme();
  setupThemeSync();
}

// ── Public API ────────────────────────────────────────────────────────────────

export const ERP = {
  token(): string | null {
    if (_transport) return _transport.token();
    return localStorage.getItem(TOKEN_KEY) || null;
  },

  theme(): Theme {
    return getTheme();
  },

  onThemeChange(callback: (theme: Theme) => void): ThemeHandle {
    let last = getTheme();
    function check() {
      const t = getTheme();
      if (t !== last) { last = t; callback(t); }
    }
    let observer: MutationObserver | null = null;
    try {
      observer = new MutationObserver(check);
      observer.observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } catch { /* cross-origin */ }
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', check);
    } catch { /* unsupported */ }
    return { disconnect() { if (observer) observer.disconnect(); } };
  },

  user(): UserPayload | null {
    const token = this.token();
    if (!token || token === 'mock_token') return null;
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as UserPayload;
    } catch { return null; }
  },

  navigate(slug: string): void {
    window.parent.postMessage({ type: 'erp:navigate', slug }, '*');
  },

  async api(path: string, options?: RequestInit): Promise<ApiResponse> {
    const opts = options || {};
    const method = ((opts.method || 'GET') as string).toUpperCase();
    let body: unknown;
    if (opts.body !== undefined) {
      try { body = JSON.parse(opts.body as string); } catch { body = opts.body; }
    }
    return dispatch(method, path, body, opts.headers as Record<string, string>);
  },

  async read<T = Record<string, unknown>>(entity: string, query?: ReadQuery, opts?: ReadOptions): Promise<ApiResponse<ReadResult<T>>> {
    const q = query || {};
    const body = {
      filters:    q.filters    || [],
      sort_by:    q.sort_by    ?? null,
      sort_order: q.sort_order ?? null,
      limit:      q.limit  ?? 50,
      offset:     q.offset ?? 0,
      ...(opts?.company_id ? { company_id: opts.company_id } : {}),
    };
    return dispatch('POST', `/api/read/${entity}/search`, body) as Promise<ApiResponse<ReadResult<T>>>;
  },

  async write<T = Record<string, unknown>>(entity: string, data: Record<string, unknown>, companyId?: string): Promise<ApiResponse<T>> {
    const body: Record<string, unknown> = { data };
    if (companyId) body['company_id'] = companyId;
    return dispatch('POST', `/api/write/${entity}`, body) as Promise<ApiResponse<T>>;
  },

  async update<T = Record<string, unknown>>(entity: string, id: string, data: Record<string, unknown>, companyId?: string): Promise<ApiResponse<T>> {
    const body: Record<string, unknown> = { entity_id: id, data };
    if (companyId) body['company_id'] = companyId;
    return dispatch('POST', `/api/write/${entity}`, body) as Promise<ApiResponse<T>>;
  },

  async delete(entity: string, id: string): Promise<ApiResponse<null>> {
    return dispatch('DELETE', `/api/write/${entity}/${id}`) as Promise<ApiResponse<null>>;
  },

  async execute<T = DirectiveResult>(routineId: string, input?: Record<string, unknown>): Promise<ApiResponse<T>> {
    return dispatch('POST', `/api/routines/${routineId}/execute`, { input: input || {} }) as Promise<ApiResponse<T>>;
  },

  async emit(eventType: string, payload?: Record<string, unknown>, companyId?: string): Promise<ApiResponse<null>> {
    const body: Record<string, unknown> = { event_type: eventType, payload: payload || {} };
    if (companyId) body['company_id'] = companyId;
    return dispatch('POST', '/api/events/emit', body) as Promise<ApiResponse<null>>;
  },

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<ApiResponse<{ rows: T[] }>> {
    return dispatch('POST', '/api/query', { sql, params: params || [] }) as Promise<ApiResponse<{ rows: T[] }>>;
  },

  async notify(target: NotifyTarget, title: string, opts?: NotifyOptions): Promise<ApiResponse<null>> {
    const o = opts || {};
    const body: Record<string, unknown> = { title };
    if (target.userId)   body['target_user_id']   = target.userId;
    if (target.roleSlug) body['target_role_slug'] = target.roleSlug;
    if (o.kind) body['kind'] = o.kind;
    if (o.body) body['body'] = o.body;
    if (o.data) body['data'] = o.data;
    return dispatch('POST', '/api/notifications', body) as Promise<ApiResponse<null>>;
  },

  on(eventType: string, callback: (payload: unknown, event: MessageEvent) => void): EventHandle {
    let es: EventSource | null = null;
    let closed = false;
    const doConnect = () => {
      if (es) es.close();
      if (closed) return;
      const token = this.token() || '';
      const url = '/api/events/stream?token=' + encodeURIComponent(token);
      es = new EventSource(url);
      es.addEventListener(eventType, (e: MessageEvent) => {
        try { callback(JSON.parse(e.data), e); } catch { callback(e.data, e); }
      });
    };
    doConnect();
    return {
      close()   { closed = true; if (es) { es.close(); es = null; } },
      refresh() { doConnect(); },
    };
  },

  // ── UI utilities ─────────────────────────────────────────────────────────

  toast(message: string, kind?: 'success' | 'error' | 'warning' | 'info'): void {
    const colors: Record<string, string> = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:20px;right:20px;background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);border-left:3px solid ${colors[kind || ''] || colors['info']};border-radius:6px;padding:10px 16px;font-size:.8125rem;color:var(--text,#e8eaf0);box-shadow:0 4px 16px rgba(0,0,0,.3);z-index:9999;max-width:320px;word-break:break-word;`;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 3500);
  },

  esc(s: unknown): string {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  confirm(label: string, callback: () => void): void {
    const o = document.createElement('div');
    o.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center;';
    o.innerHTML = `<div style="background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);border-radius:10px;width:360px;max-width:calc(100vw - 32px);box-shadow:0 20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column">
      <div style="padding:20px 24px;font-size:.875rem;color:var(--text,#e8eaf0)">Excluir <strong>${this.esc(label)}</strong>? Esta ação não pode ser desfeita.</div>
      <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--border,#2a2d3a)">
        <button id="_erp_cc" style="display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);color:var(--text,#e8eaf0)">Cancelar</button>
        <button id="_erp_co" style="display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;background:none;color:#ef4444;border:1px solid #ef4444">Excluir</button>
      </div></div>`;
    document.body.appendChild(o);
    (o.querySelector('#_erp_cc') as HTMLElement).onclick = () => o.remove();
    (o.querySelector('#_erp_co') as HTMLElement).onclick = () => { o.remove(); callback(); };
  },

  async parseDirective(result: ApiResponse<DirectiveResult> | DirectiveResult, ctx?: ParseDirectiveContext): Promise<void> {
    const d: DirectiveResult | null = (result && 'data' in result && result.data != null)
      ? (result as ApiResponse<DirectiveResult>).data
      : result as DirectiveResult;

    if (!d) { this.toast('Ação executada.', 'success'); return; }

    let key = d['directive'] as string || d['action'] as string;

    if (!key) {
      if (d['success'] === false) this.toast((d['message'] as string) || 'Erro.', 'error');
      else this.toast((d['message'] as string) || 'Ação executada.', 'success');
      return;
    }

    if (key === 'navigate') key = 'redirect';
    if (key === 'form')     key = 'input_form';

    if (key === 'toast') {
      const kind = (d['variant'] || d['kind'] || 'info') as 'success' | 'error' | 'warning' | 'info';
      this.toast(d['description'] ? `${d['message']} — ${d['description']}` : (d['message'] as string) || '', kind);

    } else if (key === 'reload') {
      ctx?.load?.();

    } else if (key === 'redirect') {
      this.navigate(d['slug'] as string);

    } else if (key === 'modal') {
      const colors: Record<string, string> = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
      const mo = document.createElement('div');
      mo.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center;';
      mo.innerHTML = `<div style="background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);border-top:3px solid ${colors[(d['variant'] || d['kind']) as string] || colors['info']};border-radius:10px;width:480px;max-width:calc(100vw - 32px);box-shadow:0 20px 60px rgba(0,0,0,.4);">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border,#2a2d3a)">
          <span style="font-size:.9375rem;font-weight:600;color:var(--text,#e8eaf0)">${this.esc(d['title'] || '')}</span>
          <button id="_erp_mc" style="background:none;border:none;cursor:pointer;font-size:1.25rem;color:var(--text-muted,#6b7280)">&#215;</button></div>
        <div style="padding:20px;font-size:.875rem;color:var(--text,#e8eaf0);white-space:pre-wrap">${this.esc(d['body'] || '')}</div>
        <div style="display:flex;justify-content:flex-end;padding:12px 20px;border-top:1px solid var(--border,#2a2d3a)">
          <button id="_erp_mcl" style="display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);color:var(--text,#e8eaf0)">${this.esc((d['close_label'] as string) || 'Fechar')}</button>
        </div></div>`;
      document.body.appendChild(mo);
      const close = () => mo.remove();
      (mo.querySelector('#_erp_mc') as HTMLElement).onclick = close;
      (mo.querySelector('#_erp_mcl') as HTMLElement).onclick = close;
      mo.addEventListener('click', (e) => { if (e.target === mo) mo.remove(); });

    } else if (key === 'confirm') {
      const co = document.createElement('div');
      co.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center;';
      co.innerHTML = `<div style="background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);border-radius:10px;width:400px;max-width:calc(100vw - 32px);box-shadow:0 20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column">
        <div style="padding:20px 24px;font-size:.875rem;color:var(--text,#e8eaf0)">${this.esc(d['message'] || '')}</div>
        <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--border,#2a2d3a)">
          <button id="_erp_coc" style="display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);color:var(--text,#e8eaf0)">${this.esc((d['cancel_label'] as string) || 'Cancelar')}</button>
          <button id="_erp_coo" style="display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;background:var(--accent,#7c6af5);color:#fff;border:none">${this.esc((d['confirm_label'] as string) || 'Confirmar')}</button>
        </div></div>`;
      document.body.appendChild(co);
      (co.querySelector('#_erp_coc') as HTMLElement).onclick = () => co.remove();
      (co.querySelector('#_erp_coo') as HTMLElement).onclick = async () => {
        co.remove();
        if (ctx?.execute) {
          const r = await ctx.execute({ _confirmed: true });
          if (r?.data) await this.parseDirective(r, ctx);
        }
      };

    } else if (key === 'input_form') {
      const fields = (d['fields'] as Array<Record<string, unknown>>) || [];
      const errors = (d['errors'] as Record<string, string>) || {};

      const fHtml = fields.map(f => {
        const fid = 'erp_ff_' + f['name'];
        let inp = '';
        if (f['type'] === 'textarea') {
          inp = `<textarea id="${fid}" placeholder="${this.esc(f['placeholder'] || '')}" style="width:100%;min-height:80px;padding:8px 10px;background:var(--bg,#0d0f18);border:1px solid var(--border,#2a2d3a);border-radius:6px;color:var(--text,#e8eaf0);font-size:.8rem;font-family:inherit;outline:none;resize:vertical;box-sizing:border-box"></textarea>`;
        } else if (f['type'] === 'select') {
          const sopts = ((f['options'] as Array<{ value: string; label: string }>) || []).map(op =>
            `<option value="${this.esc(op.value)}">${this.esc(op.label || op.value)}</option>`
          ).join('');
          inp = `<select id="${fid}" style="width:100%;height:34px;padding:0 10px;background:var(--bg,#0d0f18);border:1px solid var(--border,#2a2d3a);border-radius:6px;color:var(--text,#e8eaf0);font-size:.8rem;font-family:inherit;outline:none"><option value="">Selecione...</option>${sopts}</select>`;
        } else if (f['type'] === 'checkbox') {
          const errH = errors[f['name'] as string] ? `<span style="font-size:.72rem;color:#ef4444">${this.esc(errors[f['name'] as string])}</span>` : '';
          return `<div><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.8rem;color:var(--text,#e8eaf0)"><input type="checkbox" id="${fid}"> ${this.esc(f['label'] || f['name'])}</label>${errH}</div>`;
        } else {
          const itype = f['type'] === 'number' ? 'number' : f['type'] === 'date' ? 'date' : 'text';
          inp = `<input type="${itype}" id="${fid}" placeholder="${this.esc(f['placeholder'] || '')}" style="width:100%;height:34px;padding:0 10px;background:var(--bg,#0d0f18);border:1px solid var(--border,#2a2d3a);border-radius:6px;color:var(--text,#e8eaf0);font-size:.8rem;font-family:inherit;outline:none;box-sizing:border-box">`;
        }
        const errH = errors[f['name'] as string]
          ? `<span style="font-size:.72rem;color:#ef4444">${this.esc(errors[f['name'] as string])}</span>`
          : `<span id="erp_fe_${f['name']}" style="font-size:.72rem;color:#ef4444;display:none"></span>`;
        return `<div style="display:flex;flex-direction:column;gap:4px">
          <label for="${fid}" style="font-size:.72rem;font-weight:600;color:var(--text-muted,#6b7280)">${f['required'] ? '<span style="color:#ef4444">* </span>' : ''}${this.esc(f['label'] || f['name'])}</label>
          ${inp}${errH}</div>`;
      }).join('');

      const fo = document.createElement('div');
      fo.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center;';
      fo.innerHTML = `<div style="background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);border-radius:10px;width:480px;max-width:calc(100vw - 32px);max-height:calc(100vh - 64px);box-shadow:0 20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border,#2a2d3a);flex-shrink:0">
          <span style="font-size:.9375rem;font-weight:600;color:var(--text,#e8eaf0)">${this.esc(d['title'] || 'Preencher formulário')}</span>
          <button id="erp_fc" style="background:none;border:none;cursor:pointer;font-size:1.25rem;color:var(--text-muted,#6b7280)">&#215;</button></div>
        ${d['description'] ? `<div style="padding:12px 20px 0;font-size:.8125rem;color:var(--text-muted,#6b7280)">${this.esc(d['description'])}</div>` : ''}
        <div style="padding:20px;overflow-y:auto;display:flex;flex-direction:column;gap:12px">${fHtml}</div>
        <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--border,#2a2d3a);flex-shrink:0">
          <button id="erp_fcc" style="display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;background:var(--surface,#1a1d27);border:1px solid var(--border,#2a2d3a);color:var(--text,#e8eaf0)">Cancelar</button>
          <button id="erp_fs" style="display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;background:var(--accent,#7c6af5);color:#fff;border:none">${this.esc((d['submit_label'] as string) || 'Enviar')}</button>
        </div></div>`;
      document.body.appendChild(fo);
      const closeForm = () => fo.remove();
      (fo.querySelector('#erp_fc') as HTMLElement).onclick = closeForm;
      (fo.querySelector('#erp_fcc') as HTMLElement).onclick = closeForm;
      (fo.querySelector('#erp_fs') as HTMLElement).onclick = async () => {
        const extra: Record<string, unknown> = {};
        let valid = true;
        for (const f of fields) {
          const el = document.getElementById('erp_ff_' + f['name']) as HTMLInputElement | HTMLSelectElement | null;
          if (!el) continue;
          const val = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : (el as HTMLInputElement).value;
          extra[f['name'] as string] = val;
          const errEl = document.getElementById('erp_fe_' + f['name']);
          if (f['required'] && (val === '' || val === false)) {
            if (errEl) { errEl.textContent = 'Campo obrigatório.'; (errEl as HTMLElement).style.display = 'block'; }
            valid = false;
          } else if (errEl) {
            (errEl as HTMLElement).style.display = 'none';
          }
        }
        if (!valid) return;
        fo.remove();
        extra['_submitted'] = true;
        if (ctx?.execute) {
          const r = await ctx.execute(extra);
          if (r?.data) await this.parseDirective(r, ctx);
        }
      };

    } else if (key === 'download') {
      const bytes = atob((d['content_base64'] as string) || '');
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: (d['mime'] as string) || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = (d['filename'] as string) || 'download';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  },
};

// Side effect: set window.ERP so plain-JS code in the same bundle can access it
(window as Window & { ERP?: typeof ERP }).ERP = ERP;

init();
