# Custom Pages

Custom pages are HTML files uploaded to the ERP platform. They run inside a sandboxed iframe with full access to the ERP backend via the `window.ERP` SDK — no authentication wiring required.

---

## How It Works

```
1. Create page via admin UI (Pages → New)
2. Upload your .html file
3. Optionally attach CSS and JS files separately
4. The page appears in the navigation sidebar
5. Users open it as a tab — the ERP.js SDK is auto-injected
```

The shell injects `window.ERP` before your page's own scripts run. You do not need to load any external library.

---

## Quick Start

Save this as `hello.html` and upload it:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: system-ui; padding: 24px; }
    [data-theme="dark"] body { background: #0d0f18; color: #e8eaf0; }
  </style>
</head>
<body>
  <h2>Olá, <span id="name">...</span></h2>
  <button id="btn">Buscar empresas</button>
  <ul id="list"></ul>

  <script>
    const u = ERP.user();
    document.getElementById('name').textContent = u?.name ?? 'visitante';

    document.getElementById('btn').onclick = async () => {
      const res = await ERP.read('companies', { limit: 10 });
      if (res.error) { ERP.toast(res.error, 'error'); return; }
      document.getElementById('list').innerHTML =
        res.data.items.map(c => `<li>${c.name}</li>`).join('');
    };
  </script>
</body>
</html>
```

---

## What You Get

| Feature | Method | Notes |
|---------|--------|-------|
| Authenticated API calls | `ERP.read()` `ERP.write()` `ERP.api()` | Token handled automatically |
| Navigation | `ERP.navigate(slug)` | Opens a tab in the shell |
| Current user | `ERP.user()` | Decoded JWT payload |
| Theme detection | `ERP.theme()` | `'dark'` \| `'light'` |
| Theme change events | `ERP.onThemeChange(cb)` | Auto-synced to `html[data-theme]` |
| Toasts | `ERP.toast(msg, kind)` | `success` `error` `warning` `info` |
| Confirm dialogs | `ERP.confirm(label, cb)` | Destructive action pattern |
| Routine execution | `ERP.execute(routineId, input)` | Calls any active routine |
| SSE events | `ERP.on(eventType, cb)` | Real-time event subscription |

Full SDK reference: [erp-sdk-reference.md](erp-sdk-reference.md)

---

## File Structure

A page can be a single `.html` file, or you can separate concerns:

```
my-page/
├── index.html      ← uploaded as "HTML content"
├── styles.css      ← uploaded as "CSS content" (optional)
└── app.js          ← uploaded as "JS content" (optional)
```

The shell injects CSS and JS into the HTML before rendering, so you can keep them separate in development and combine via the admin form on upload.

---

## Dev Mode (Local Testing Without the Shell)

Create an `erp.config.json` next to your HTML file:

```json
{
  "mode": "server",
  "server": "http://localhost:8080",
  "token": "your-dev-jwt-token"
}
```

Or use mock data:

```json
{
  "mode": "mock",
  "mock_data": {
    "companies": [
      { "id": "1", "name": "Acme Corp", "is_active": true }
    ]
  }
}
```

Open the HTML file directly in a browser (via a local HTTP server, not `file://`). The SDK detects the absence of `window.__ERP_SHELL__` and loads the config automatically.

---

## Page Actions

Pages can have server-side actions (routines) attached to them. The shell renders action buttons above the iframe automatically — the page author does not need to add any buttons for that.

Actions communicate via the [directive system](../page-action-directives.md):
- The routine returns a JSON directive
- The shell renders the appropriate UI (toast, modal, confirm, form)
- On multi-phase flows (`confirm`, `input_form`), the shell re-executes with the collected data

See [`../page-action-directives.md`](../page-action-directives.md) for the full spec.

---

## Examples

| File | What it shows |
|------|---------------|
| [`examples/01-hello-world.html`](examples/01-hello-world.html) | Minimal page: user info + one API call |
| [`examples/02-data-table.html`](examples/02-data-table.html) | Searchable table with pagination |
| [`examples/03-action-form.html`](examples/03-action-form.html) | Form that calls a routine and handles directives |
| [`examples/04-theme-aware.html`](examples/04-theme-aware.html) | Full dark/light theme support |
