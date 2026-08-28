# Page Action Directives

When a page action executes a WASM routine, the routine's return value is passed directly to the frontend. By following the directive convention below, the routine can trigger UI responses (toasts, modals, form dialogs, redirects) rather than just returning raw data.

---

## Response Envelope

Every routine executing as a page action should return at minimum:

```json
{
  "success": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `success` | bool | ✅ | `true` = completed (or requesting more input). `false` = error. |
| `refetch` | bool | ❌ | When `true`, the frontend re-fetches the page's record list after handling the directive. Default: `false`. |
| `directive` | string | ❌ | One of: `toast`, `modal`, `confirm`, `input_form`, `redirect`. Absent = generic success toast. |

### Default behaviour (no `directive`)

- `success: true` → frontend shows generic "Ação executada com sucesso." toast.
- `success: false` → frontend shows error toast with `message` field value.

```json
{ "success": false, "message": "Não foi possível arquivar: existem pedidos pendentes." }
```

---

## Directives

### `toast`

Show a notification. No follow-up action.

```json
{
  "success":     true,
  "directive":   "toast",
  "variant":     "success",
  "message":     "Exportação concluída.",
  "description": "Arquivo disponível por 24h.",
  "refetch":     false
}
```

| Field | Type | Values |
|-------|------|--------|
| `variant` | string | `success` `error` `info` `warning` |
| `message` | string | Main notification text |
| `description` | string | Optional subtitle |

---

### `modal`

Show an informational dialog. No re-execution.

```json
{
  "success":     true,
  "directive":   "modal",
  "variant":     "warning",
  "title":       "Atenção",
  "body":        "Não é possível excluir registros com pedidos ativos.",
  "close_label": "Entendido"
}
```

| Field | Type | Values |
|-------|------|--------|
| `variant` | string | `info` `warning` `error` |
| `title` | string | Dialog title |
| `body` | string | Dialog body text |
| `close_label` | string | Button label (default: "Fechar") |

---

### `confirm`

Ask the user for runtime confirmation before proceeding. The frontend will show a confirm dialog and — if the user accepts — re-call the same execute endpoint with `extra._confirmed = true`.

**Phase 1 — routine returns `confirm`:**

```json
{
  "success":       true,
  "directive":     "confirm",
  "title":         "Confirmar arquivamento",
  "message":       "Você está prestes a arquivar 47 registros. Esta ação não pode ser desfeita.",
  "confirm_label": "Arquivar",
  "cancel_label":  "Cancelar"
}
```

**Phase 2 — frontend re-executes with confirmation flag:**

```json
{
  "extra": { "_confirmed": true }
}
```

**Routine behaviour in phase 2:**

```rust
let confirmed = ctx.extra.get("_confirmed")
    .and_then(|v| v.as_bool())
    .unwrap_or(false);

if !confirmed {
    // Return the confirm directive
    return json!({ "success": true, "directive": "confirm", ... });
}

// Execute the real action
```

The routine can return any directive after the user confirms — typically `toast` or `modal`.

> **Static confirmation:** If the same text can be shown without runtime data, use `requires_confirmation: true` and `confirmation_message` on the page action configuration instead. The frontend shows the confirm dialog before even calling execute, so the routine does not need to handle `_confirmed`.

---

### `input_form`

Open a form modal to collect extra input, then re-execute with that data.

**Phase 1 — routine requests form input:**

```json
{
  "success":      true,
  "directive":    "input_form",
  "title":        "Configurar relatório",
  "description":  "Informe o período desejado.",
  "submit_label": "Gerar",
  "fields": [
    {
      "name":        "date_from",
      "label":       "Data inicial",
      "type":        "date",
      "required":    true,
      "placeholder": null,
      "options":     null
    },
    {
      "name":     "date_to",
      "label":    "Data final",
      "type":     "date",
      "required": true
    },
    {
      "name":     "format",
      "label":    "Formato",
      "type":     "select",
      "required": true,
      "options":  [
        { "value": "pdf",  "label": "PDF" },
        { "value": "xlsx", "label": "Excel" }
      ]
    },
    {
      "name":     "notes",
      "label":    "Observações",
      "type":     "textarea",
      "required": false
    }
  ]
}
```

**Field types:**

| `type` | Component | Needs `options` |
|--------|-----------|-----------------|
| `text` | Text input | No |
| `number` | Numeric input | No |
| `textarea` | Multi-line text | No |
| `date` | Date picker | No |
| `select` | Single-select dropdown | Yes |
| `multiselect` | Multi-select dropdown | Yes |
| `checkbox` | Boolean toggle | No |

**Phase 2 — frontend re-executes with form data:**

```json
{
  "extra": {
    "date_from": "2025-01-01",
    "date_to":   "2025-06-30",
    "format":    "pdf",
    "notes":     "",
    "_submitted": true
  }
}
```

The frontend validates `required` fields client-side before submitting. The routine can also validate server-side.

**Routine behaviour:**

```rust
let submitted = ctx.extra.get("_submitted")
    .and_then(|v| v.as_bool())
    .unwrap_or(false);

if !submitted {
    // Return the input_form directive
    return json!({ "success": true, "directive": "input_form", ... });
}

let date_from = ctx.extra.get("date_from").and_then(|v| v.as_str());
// ... validate and execute
```

**Server-side validation failure (phase 2):**

If the submitted data is invalid, return the form again with per-field errors. The frontend re-renders the form with errors shown under each field.

```json
{
  "success":   false,
  "directive": "input_form",
  "title":     "Configurar relatório",
  "fields":    [ ... same fields ... ],
  "errors": {
    "date_from": "Data inicial é obrigatória.",
    "date_to":   "Data final deve ser posterior à data inicial."
  }
}
```

---

### `redirect`

Navigate the SPA to another page. The frontend opens the target as a new tab using the tab shell.

```json
{
  "success":   true,
  "directive": "redirect",
  "slug":      "orders"
}
```

`slug` must be a valid page slug registered in the system (either a native platform page or a custom page stored in the DB).

---

## Static Confirmation

For confirmation dialogs whose text does not depend on runtime data, configure `requires_confirmation` and `confirmation_message` directly on the page action:

```json
POST /api/pages/{id}/actions
{
  "routine_id":            "uuid",
  "label":                 "Excluir selecionados",
  "requires_confirmation": true,
  "confirmation_message":  "Esta ação não pode ser desfeita. Deseja continuar?"
}
```

The frontend shows the confirmation dialog **before** calling execute. The routine receives a normal call with no `_confirmed` flag and can assume the user already confirmed.

Use the runtime `confirm` directive when the confirmation text must include dynamic data (e.g., record count) that the routine needs to compute.

---

## `refetch` flag

Any directive can include `"refetch": true` to tell the frontend to reload the page's record list after handling the directive:

```json
{
  "success":   true,
  "directive": "toast",
  "variant":   "success",
  "message":   "3 registros arquivados.",
  "refetch":   true
}
```

---

## Execution Context

The routine receives this context when called from a page action:

```json
{
  "page_id":        "uuid",
  "page_slug":      "orders",
  "selected_ids":   ["uuid", "uuid"],
  "page_records":   [{ "id": "uuid", "status": "pending" }],
  "active_filters": { "filters": [{ "order": 1, "group": 1, "field": "status", "op": "eq", "value": "pending" }] },
  "extra":          {}
}
```

- `selected_ids` — UUIDs of records the user selected in the list
- `page_records` — full record objects for selected rows
- `active_filters` — the current filter state (see `advanced-search.md`)
- `extra` — additional client-side payload, including `_confirmed` and `_submitted` for two-phase flows
