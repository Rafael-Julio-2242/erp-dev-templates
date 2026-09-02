# ERP SDK Reference (`window.ERP`)

The `window.ERP` object is injected into every custom page before the page's own scripts run. No `<script src>` required.

---

## Auth

### `ERP.token() → string | null`

Returns the current auth token from `localStorage`. `null` when not authenticated.

```js
const token = ERP.token();
```

### `ERP.user() → object | null`

Returns the decoded JWT payload. `null` when not authenticated or in mock mode.

```js
const user = ERP.user();
// { sub: "uuid", name: "Rafael", email: "...", roles: [...], exp: ... }
```

---

## Data

### `ERP.read(entity, query?, opts?) → Promise<ApiResponse>`

Search records of a custom entity.

```js
const res = await ERP.read('orders', {
  filters: [
    { order: 1, group: 1, field: 'status', op: 'eq', value: 'pending' }
  ],
  sort_by:    'created_at',
  sort_order: 'desc',
  limit:  20,
  offset: 0,
});

if (res.error) { ERP.toast(res.error, 'error'); return; }

const { items, total } = res.data;
// items: array of records
// total: total count (for pagination)
```

`query` defaults: `{ filters: [], limit: 50, offset: 0 }`. See [`../advanced-search.md`](../advanced-search.md) for the full filter reference.

`opts.company_id` — optional company scope override.

---

### `ERP.write(entity, data, companyId?) → Promise<ApiResponse>`

Create a new record.

```js
const res = await ERP.write('orders', {
  product_id: 'uuid',
  quantity:   10,
  notes:      'urgente',
});

if (res.error) { ERP.toast(res.error, 'error'); return; }
const newOrder = res.data; // { id: 'uuid', ... }
```

---

### `ERP.update(entity, id, data, companyId?) → Promise<ApiResponse>`

Update an existing record by ID.

```js
const res = await ERP.update('orders', order.id, { status: 'shipped' });
```

---

### `ERP.delete(entity, id) → Promise<ApiResponse>`

Delete a record by ID. Returns 204 (no body on success).

```js
ERP.confirm('pedido #1234', async () => {
  const res = await ERP.delete('orders', order.id);
  if (res.error) ERP.toast(res.error, 'error');
  else { ERP.toast('Pedido excluído.', 'success'); loadOrders(); }
});
```

---

### `ERP.query(sql, params?) → Promise<ApiResponse>`

Run a parameterized SQL query. Use `$1`, `$2`, ... for parameters.

```js
const res = await ERP.query(
  'SELECT id, name, total FROM mod_sales.orders WHERE status = $1 LIMIT $2',
  ['pending', 50]
);

if (res.error) { ERP.toast(res.error, 'error'); return; }
const rows = res.data.rows; // array of row objects
```

> **Scope:** Queries are limited to allowed schemas. Core and meta schemas are blocked.

---

## Routines

### `ERP.execute(routineId, input?) → Promise<ApiResponse>`

Execute a routine by its UUID.

```js
const res = await ERP.execute('uuid-of-routine', {
  order_id: order.id,
  send_email: true,
});

if (res.error) { ERP.toast(res.error, 'error'); return; }
// Response shape depends on the routine
await ERP.parseDirective(res);
```

---

### `ERP.parseDirective(result, ctx?) → Promise<void>`

Handle a directive response from a routine. Renders the appropriate UI based on the `directive` field.

```js
const res = await ERP.execute(routineId, input);
await ERP.parseDirective(res, {
  // ctx is optional — provide it for two-phase flows
  execute: (extra) => ERP.execute(routineId, { ...input, ...extra }),
  load:    () => loadData(),  // called on "reload" directive
});
```

| `directive` | UI rendered |
|-------------|-------------|
| absent + `success: true` | Toast "Ação executada." |
| absent + `success: false` | Error toast with `message` |
| `toast` | Toast notification |
| `modal` | Info/warning/error dialog |
| `confirm` | Confirm dialog; re-executes with `_confirmed: true` |
| `input_form` | Form modal; re-executes with form values + `_submitted: true` |
| `redirect` | Navigates shell to `slug` |
| `reload` | Calls `ctx.load()` if provided |
| `download` | Triggers file download from base64 content |

Full directive spec: [`../page-action-directives.md`](../page-action-directives.md)

---

## Events

### `ERP.emit(eventType, payload, companyId?) → Promise<ApiResponse>`

Emit an event into the ERP event bus.

```js
await ERP.emit('order.status_changed', { order_id: id, new_status: 'shipped' });
```

---

### `ERP.on(eventType, callback) → { close(), refresh() }`

Subscribe to real-time events via SSE. Returns a handle to close or refresh the connection.

```js
const sub = ERP.on('inventory.updated', (payload, event) => {
  console.log('inventory updated:', payload);
  loadData();
});

// When done (e.g., page unload):
window.addEventListener('unload', () => sub.close());
```

---

## API (raw)

### `ERP.api(path, options?) → Promise<ApiResponse>`

Make a raw authenticated request to any ERP endpoint.

```js
const res = await ERP.api('/api/pages', { method: 'GET' });
const res = await ERP.api('/api/routines/search', {
  method: 'POST',
  body: JSON.stringify({ filters: [...], limit: 50, offset: 0 }),
});
```

---

## Notifications

### `ERP.notify(target, title, opts?) → Promise<ApiResponse>`

Send a notification to a user or role.

```js
// To a specific user
await ERP.notify({ userId: 'uuid' }, 'Pedido aprovado', {
  kind: 'success',
  body: 'O pedido #1234 foi aprovado e está em separação.',
});

// To all users with a role
await ERP.notify({ roleSlug: 'estoque' }, 'Estoque crítico', {
  kind: 'warning',
  body: 'O produto X atingiu o nível mínimo.',
});
```

---

## Navigation

### `ERP.navigate(slug) → void`

Open another ERP page as a new tab in the shell.

```js
ERP.navigate('orders');        // native system page
ERP.navigate('my-dashboard'); // custom page by slug
```

> This uses `postMessage` to the parent shell — the iframe itself is not redirected.

---

## Theme

### `ERP.theme() → 'dark' | 'light'`

Returns the current shell theme.

```js
const theme = ERP.theme();
document.body.classList.toggle('dark', theme === 'dark');
```

### `ERP.onThemeChange(callback) → { disconnect() }`

Subscribe to theme changes. The SDK also automatically syncs `html[data-theme]` on init and on every change, so you can use CSS selectors directly without calling this method.

```js
ERP.onThemeChange((theme) => {
  document.body.classList.toggle('dark', theme === 'dark');
});
```

**CSS approach (recommended):**

The `html` element already has `data-theme="dark"` or `data-theme="light"` set by the SDK. Use it in CSS directly:

```css
body { background: #fff; color: #000; }
[data-theme="dark"] body { background: #0d0f18; color: #e8eaf0; }
```

---

## UI Utilities

### `ERP.toast(message, kind?)`

Show a toast notification inside the iframe.

```js
ERP.toast('Salvo com sucesso.', 'success');
ERP.toast('Campo obrigatório.', 'error');
ERP.toast('Sincronizando...', 'info');
ERP.toast('Atenção: estoque baixo.', 'warning');
```

`kind`: `'success'` `'error'` `'info'` `'warning'` (default: `'info'`)

---

### `ERP.confirm(label, callback)`

Show a destructive action confirmation dialog.

```js
ERP.confirm('empresa Acme Corp', async () => {
  const res = await ERP.delete('companies', company.id);
  if (res.error) ERP.toast(res.error, 'error');
  else ERP.toast('Empresa excluída.', 'success');
});
```

The dialog reads: "Excluir **[label]**? Esta ação não pode ser desfeita."

---

### `ERP.esc(value) → string`

HTML-escape a value. Use this whenever rendering user-provided data into HTML strings.

```js
el.innerHTML = `<span>${ERP.esc(user.name)}</span>`;
```

---

## Saved Filters

### `ERP.loadSavedFilters(entitySlug, onApply)`

Load saved filter presets for an entity. Requires two elements with `id="sf-btn"` and `id="sf-menu"` in the DOM.

```html
<button id="sf-btn">Filtros salvos</button>
<div id="sf-menu" style="position:relative"></div>

<script>
  ERP.loadSavedFilters('orders', (filters) => {
    activeFilters = filters;
    loadData();
  });
</script>
```

---

## ApiResponse Shape

All data methods return a consistent shape:

```js
{
  data:   <T> | null,  // response body (null on error)
  error:  string | null,  // error code (null on success)
  status: number,         // HTTP status code
}
```

Always check `res.error` before using `res.data`:

```js
const res = await ERP.read('orders', { limit: 10 });
if (res.error) {
  ERP.toast('Erro ao carregar pedidos.', 'error');
  return;
}
const { items, total } = res.data;
```

---

## Dev Config (`erp.config.json`)

When opening the page outside the shell (local development), the SDK looks for `./erp.config.json`:

**Server mode** — proxies to a real backend:

```json
{
  "mode":   "server",
  "server": "http://localhost:8080",
  "token":  "eyJhbGci..."
}
```

**Mock mode** — in-memory data, no backend needed:

```json
{
  "mode": "mock",
  "mock_data": {
    "companies": [
      { "id": "1", "name": "Acme",  "is_active": true  },
      { "id": "2", "name": "Globex","is_active": false }
    ],
    "orders": []
  },
  "mock_query": {
    "SELECT count(*) FROM mod_sales.orders": [{ "count": 42 }]
  }
}
```

> `mock_data` keys are the entity slugs passed to `ERP.read()`.
> `mock_query` keys are the exact SQL strings passed to `ERP.query()`.
