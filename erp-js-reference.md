# ERP.js SDK Reference

`window.ERP` is injected automatically into every custom HTML page served by the ERP Core shell. It gives your page authenticated access to the platform's data, routines, events, and UI utilities without any extra setup.

---

## Overview

Custom pages are rendered inside an `<iframe srcDoc>`. The SDK is inlined into the document before your code runs, so `window.ERP` is available immediately — no import, no `<script>` tag needed.

```html
<!doctype html>
<html>
<head><title>My Page</title></head>
<body>
  <div id="app"></div>
  <script>
    // window.ERP is ready here
    const user = ERP.user();
    document.getElementById('app').textContent = 'Hello, ' + user.name;
  </script>
</body>
</html>
```

---

## Transport Modes

The SDK selects a transport automatically:

| Mode | When | How |
|------|------|-----|
| **Production** | Running inside the ERP shell | Reads JWT from `localStorage`; API calls go to the same origin |
| **Server** | `erp.config.json` with `"mode": "server"` | Calls a remote ERP instance; useful for integration tests |
| **Mock** | `erp.config.json` with `"mode": "mock"` | In-memory store; no network; useful for local UI development |

### `erp.config.json` — Server mode

```json
{
  "mode": "server",
  "server": "http://localhost:3001",
  "token": "<a valid JWT>"
}
```

### `erp.config.json` — Mock mode

```json
{
  "mode": "mock",
  "mock_data": {
    "order": [
      { "id": "1", "status": "pending", "total": 150.00 }
    ]
  },
  "mock_query": {
    "SELECT COUNT(*) FROM orders": [{ "count": 1 }]
  }
}
```

Place `erp.config.json` next to your HTML file when developing outside the shell.

---

## Response Shape

Every async method (`api`, `read`, `write`, `update`, `delete`, `execute`, `emit`, `query`, `notify`) returns the same envelope:

```js
{
  data:   any | null,   // parsed response body
  error:  string | null, // error code string, or null on success
  status: number         // HTTP status code (0 = network failure)
}
```

Always check `error` before using `data`:

```js
const res = await ERP.read('order', { limit: 10 });
if (res.error) {
  ERP.toast('Erro ao carregar pedidos.', 'error');
  return;
}
const orders = res.data.items;
```

---

## Authentication

### `ERP.token()` → `string | null`

Returns the raw JWT string from `localStorage`. `null` if not authenticated.

### `ERP.user()` → `object | null`

Returns the decoded JWT payload. Fields present in the token:

| Field | Type | Description |
|-------|------|-------------|
| `sub` | string | User UUID |
| `name` | string | Display name |
| `sid` | string | Session ID |
| `exp` | number | Expiry timestamp (Unix seconds) |
| `iat` | number | Issued-at timestamp (Unix seconds) |

Returns `null` in mock mode (no real JWT).

```js
const user = ERP.user();
if (user) {
  console.log('Logged in as:', user.name, '(', user.sub, ')');
}
```

---

## Theme

### `ERP.theme()` → `'dark' | 'light'`

Returns the shell's current theme. Falls back to `prefers-color-scheme` when running outside the shell.

### `ERP.onThemeChange(callback)` → `{ disconnect() }`

Calls `callback(theme)` whenever the shell theme changes. Returns a handle with a `disconnect()` method to stop listening.

```js
document.documentElement.dataset.theme = ERP.theme();

const handle = ERP.onThemeChange(theme => {
  document.documentElement.dataset.theme = theme;
});

// Later, to stop:
handle.disconnect();
```

---

## Navigation

### `ERP.navigate(slug)` → `void`

Asks the shell to open a page by slug. Opens in a new tab inside the ERP tab system.

```js
ERP.navigate('orders');          // open the "orders" page
ERP.navigate('customer-detail'); // open any registered page
```

---

## Raw API

### `ERP.api(path, options?)` → `Promise<Response>`

Low-level fetch wrapper. Auth header is added automatically.

| Option | Type | Description |
|--------|------|-------------|
| `method` | string | HTTP method (default: `'GET'`) |
| `body` | string | JSON-encoded request body |
| `headers` | object | Extra headers to merge |

```js
// GET
const res = await ERP.api('/api/custom/my-endpoint');

// POST
const res = await ERP.api('/api/custom/my-endpoint', {
  method: 'POST',
  body: JSON.stringify({ foo: 'bar' }),
});
```

---

## Data Gateway

These methods wrap the platform's data gateway. They work with any entity registered in the schema, including core entities and module-defined entities.

### `ERP.read(entity, query?, opts?)` → `Promise<Response>`

Search and paginate entity records.

```js
ERP.read(
  'order',           // entity slug
  {
    filters:    [],  // see advanced-search.md for filter format
    sort_by:    'created_at',
    sort_order: 'desc',
    limit:      25,
    offset:     0,
  }
)
```

`data` shape on success:

```json
{
  "items": [...],
  "total": 142,
  "page": 1,
  "page_size": 25
}
```

Optional third argument `opts`:

| Field | Type | Description |
|-------|------|-------------|
| `company_id` | string | Scope results to a specific company |

### `ERP.write(entity, data, companyId?)` → `Promise<Response>`

Create a new record.

```js
const res = await ERP.write('order', { customer_id: 'uuid', total: 99.90 });
if (!res.error) {
  console.log('Created:', res.data.id);
}
```

### `ERP.update(entity, id, data, companyId?)` → `Promise<Response>`

Update an existing record by ID.

```js
await ERP.update('order', 'order-uuid', { status: 'completed' });
```

### `ERP.delete(entity, id)` → `Promise<Response>`

Delete a record by ID.

```js
await ERP.delete('order', 'order-uuid');
```

---

## Routines

### `ERP.execute(routineId, input?)` → `Promise<Response>`

Execute a WASM routine by its UUID. `input` is passed as the routine's `input` field.

```js
const res = await ERP.execute('routine-uuid', { order_id: 'uuid' });

// The response follows the directive convention — use parseDirective to handle it:
await ERP.parseDirective(res, {
  execute: (extra) => ERP.execute('routine-uuid', { order_id: 'uuid', ...extra }),
});
```

`data` shape on success (before directives):

```json
{ "success": true, "data": {}, "message": "" }
```

---

## Events

### `ERP.emit(eventType, payload?, companyId?)` → `Promise<Response>`

Emit a domain event. Use the `{module}.{entity}.{verb}` naming convention.

```js
await ERP.emit('mymod.order.archived', { order_id: 'uuid' });
```

### `ERP.on(eventType, callback)` → `{ close(), refresh() }`

Subscribe to real-time events via SSE. The callback receives the parsed event payload.

```js
const sub = ERP.on('mymod.order.created', (payload, event) => {
  console.log('New order:', payload.order_id);
  renderOrder(payload);
});

// Stop listening:
sub.close();

// Reconnect (e.g. after a network hiccup):
sub.refresh();
```

---

## SQL Query

### `ERP.query(sql, params?)` → `Promise<Response>`

Execute a raw SQL `SELECT` against the platform database. Write operations are rejected.

```js
const res = await ERP.query(
  'SELECT id, total FROM orders WHERE status = $1 LIMIT $2',
  ['pending', 10]
);
if (!res.error) {
  const rows = res.data.rows;
}
```

`data` shape: `{ "rows": [...] }`

> Use `ERP.read()` when possible — it respects company scoping and column-level permissions. Fall back to `ERP.query()` only for aggregations or JOINs that `read` cannot express.

---

## Notifications

### `ERP.notify(target, title, opts?)` → `Promise<Response>`

Send an in-app notification to a user or role.

| `target` field | Type | Description |
|----------------|------|-------------|
| `userId` | string | Target user UUID |
| `roleSlug` | string | Fan out to all users with this role |

| `opts` field | Type | Description |
|--------------|------|-------------|
| `kind` | string | `'info'` \| `'success'` \| `'warning'` \| `'error'` |
| `body` | string | Optional notification body text |
| `data` | object | Arbitrary JSON attached to the notification |

```js
// Notify a specific user
await ERP.notify({ userId: 'user-uuid' }, 'Pedido aprovado', {
  kind: 'success',
  body: 'O pedido #1042 foi aprovado.',
});

// Notify all users with a role
await ERP.notify({ roleSlug: 'supervisor' }, 'Nova solicitação pendente');
```

---

## Saved Filters

### `ERP.loadSavedFilters(entitySlug, onApply)` → `Promise<void>`

Wires up the saved-filter dropdown for a list page. Requires two elements in the DOM:

| ID | Role |
|----|------|
| `sf-btn` | Button that opens the dropdown |
| `sf-menu` | Container `<div>` for the dropdown items |

```html
<button id="sf-btn">Filtros salvos ▾</button>
<div id="sf-menu" style="display:none; position:absolute; ..."></div>

<script>
  let currentFilters = [];

  ERP.loadSavedFilters('order', (filters) => {
    currentFilters = filters;
    applyFilters(filters);
  });
</script>
```

When the user selects a saved filter, `onApply` is called with the filter array. Use that array in your `ERP.read()` call. The dropdown also includes a "Salvar filtro atual" option that saves the current filter state via a built-in modal.

For the filter array format, see [`advanced-search.md`](advanced-search.md).

---

## UI Utilities

### `ERP.toast(message, kind?)` → `void`

Show a transient notification in the bottom-right corner. Auto-dismisses after 3.5 s.

| `kind` | Color |
|--------|-------|
| `'success'` | Green |
| `'error'` | Red |
| `'warning'` | Amber |
| `'info'` (default) | Blue |

```js
ERP.toast('Salvo com sucesso.', 'success');
ERP.toast('Falha ao conectar.', 'error');
```

### `ERP.esc(value)` → `string`

HTML-escapes a value. Always use this when inserting user or API data into `innerHTML`.

```js
el.innerHTML = '<span>' + ERP.esc(record.name) + '</span>';
```

Converts `&`, `<`, `>`, `"` to their entity equivalents. `null` / `undefined` become `''`.

### `ERP.confirm(label, callback)` → `void`

Show a destructive-action confirmation dialog. The dialog is hardcoded for delete flows.

```js
ERP.confirm(record.name, async () => {
  await ERP.delete('order', record.id);
  ERP.toast('Registro excluído.', 'success');
  load();
});
```

> For general-purpose confirmations with custom labels and messages, use a routine that returns the `confirm` directive and handle it with `ERP.parseDirective`. See [`page-action-directives.md`](page-action-directives.md).

---

## Directive Handling

### `ERP.parseDirective(result, ctx?)` → `Promise<void>`

Handles the standard directive response returned by a page action routine. See [`page-action-directives.md`](page-action-directives.md) for the full directive contract.

| `ctx` field | Type | Description |
|-------------|------|-------------|
| `execute` | `(extra) => Promise` | Re-execute the routine with extra data (used by `confirm` and `input_form` two-phase flows) |
| `load` | `() => void` | Reload the page's record list (used by the `reload` directive) |

```js
async function runAction(extra = {}) {
  const res = await ERP.execute('routine-uuid', { record_id: 'uuid', ...extra });
  await ERP.parseDirective(res, {
    execute: runAction,
    load: loadRecords,
  });
}
```

Supported directives: `toast`, `modal`, `confirm`, `input_form`, `redirect`, `reload`, `download`.

---

## Complete Example

```html
<!doctype html>
<html>
<head>
  <title>Orders</title>
  <style>
    :root { font-family: system-ui; }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: 8px 12px; border-bottom: 1px solid #eee; text-align: left; }
  </style>
</head>
<body>
  <h2>Pending Orders</h2>
  <button id="sf-btn">Filtros salvos ▾</button>
  <div id="sf-menu" style="display:none;position:absolute;background:#fff;border:1px solid #ccc;min-width:200px"></div>
  <table id="tbl"><thead><tr><th>ID</th><th>Total</th><th>Action</th></tr></thead><tbody></tbody></table>

  <script>
    let filters = [{ order: 1, group: 1, field: 'status', op: 'eq', value: 'pending' }];
    const tbody = document.querySelector('#tbl tbody');

    async function load() {
      const res = await ERP.read('order', { filters, sort_by: 'created_at', sort_order: 'desc', limit: 50 });
      if (res.error) { ERP.toast('Erro ao carregar.', 'error'); return; }
      tbody.innerHTML = res.data.items.map(o =>
        '<tr>'
        + '<td>' + ERP.esc(o.id) + '</td>'
        + '<td>R$ ' + ERP.esc(String(o.total)) + '</td>'
        + '<td><button onclick="archive(' + ERP.esc(JSON.stringify(o.id)) + ')">Archive</button></td>'
        + '</tr>'
      ).join('');
    }

    async function archive(id) {
      const res = await ERP.execute('archive-order-routine-uuid', { order_id: id });
      await ERP.parseDirective(res, { execute: (e) => ERP.execute('archive-order-routine-uuid', { order_id: id, ...e }), load });
    }

    ERP.loadSavedFilters('order', f => { filters = f; load(); });
    load();
  </script>
</body>
</html>
```
