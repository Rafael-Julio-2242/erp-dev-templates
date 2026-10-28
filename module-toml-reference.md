# `module.toml` Reference

`module.toml` is the manifest file at the root of every module ZIP. Core reads it at install time to register routines, HTTP endpoints, event handlers, pages, navigation folders, document behaviors, document types, and inter-module dependencies. Fields not present default to empty lists.

---

## ZIP layout

```
module.zip
├── module.toml              ← this document (required)
├── module.wasm              (required when wasm = true)
├── schema.toml              (optional — declarative DDL)
├── entities/                (optional — one .toml per entity)
├── seeds/                   (optional — INSERT-only data)
└── pages/                   (optional — one folder per page)
    └── my-dashboard/
        └── index.html
```

---

## `[module]` — metadata

```toml
[module]
name        = "My Module"
slug        = "my-module"
version     = "01.000.000"
min_core    = "01.000.000"
description = "Short description shown in the module list."
icon        = "box"
author      = "Acme Corp"
wasm        = true
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✅ | Human-readable display name |
| `slug` | string | ✅ | Unique identifier — `[a-z0-9-]+`, max 64 chars. Determines schema prefix `mod_{slug}` |
| `version` | string | ✅ | Zero-padded `MM.mmm.ppp` — e.g. `01.002.003`. Must increase on each re-install that changes something |
| `min_core` | string | ✅ | Minimum Core version required. Same `MM.mmm.ppp` format. Install returns 422 if running Core is older |
| `description` | string | ❌ | Optional short description |
| `icon` | string | ❌ | Icon hint for the UI |
| `author` | string | ✅ | Module author name. Stored in `core.routines.author` for every registered routine |
| `wasm` | bool | ✅ | Set `true` when `module.wasm` is in the ZIP. Set `false` for schema-only modules — routines, endpoints, and event handlers declared in TOML will not be executable |

**Version format rules:**
- Exactly `MM.mmm.ppp` — 2-digit major, 3-digit minor, 3-digit patch, dot-separated
- Zero-pad all parts: `01.000.000`, `01.002.010`, `02.000.000`
- Comparison is lexicographic (works because of zero-padding)

---

## `[[routines]]`

Routines are named WASM functions callable by HTTP endpoints, event handlers, behaviors, or the Core runtime scheduler.

```toml
[[routines]]
name          = "calculate-total"      # relative — stored as my-module.calculate-total
description   = "Calculates order total including taxes."
routine_type  = "function"
param_schema  = { type = "object", properties = { order_id = { type = "string" } } }
return_schema = { type = "object", properties = { total = { type = "number" } } }

[[routines]]
name         = "sync-stock"
routine_type = "procedure"            # no return value
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✅ | Relative name, stored as `{module_slug}.{name}` in `core.routines` |
| `description` | string | ❌ | Human-readable description |
| `routine_type` | string | ✅ | See table below |
| `param_schema` | JSON Schema object | ❌ | Input schema (JSON Schema draft-07) |
| `return_schema` | JSON Schema object | ❌ | Output schema |

**`routine_type` values:**

| Value | Description |
|---|---|
| `function` | Returns a value |
| `procedure` | Side-effectful; no return value |
| `trigger` | Called when a DB/event trigger fires |
| `action` | User-invokable action |
| `interceptor` | Intercepts a pipeline step |
| `scheduled` | Runs on a recurring schedule. **Note:** `cron_expression` is NOT set from module.toml — configure the schedule via Core admin after install |

---

## `[[endpoints]]`

Custom HTTP endpoints dispatched to a WASM routine. Routes are live immediately after install — no Core restart needed.

```toml
[[endpoints]]
path          = "/my-module/calculate"   # full URL path
method        = "POST"
routine_name  = "calculate-total"        # relative — same name as in [[routines]]
auth_required = true

[[endpoints]]
path          = "/my-module/public-status"
method        = "GET"
routine_name  = "get-status"
auth_required = false
```

| Field | Type | Required | Description |
|---|---|---|---|
| `path` | string | ✅ | Full URL path. Must be unique across all installed modules |
| `method` | string | ✅ | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| `routine_name` | string | ✅ | Relative routine name (declared in `[[routines]]`). Stored as `{module_slug}.{routine_name}` |
| `auth_required` | bool | ✅ | Whether the endpoint requires a valid session token |

On reinstall, routes no longer present in the manifest are **deactivated** (not deleted). Deactivated routes return 404.

---

## `[[event_handlers]]`

Subscribe a WASM routine to a published event type. On every matching event, Core invokes the routine asynchronously.

```toml
[[event_handlers]]
event_slug   = "stock.item.reserved"    # must exist in core.event_types
routine_name = "on-item-reserved"       # relative routine name
```

| Field | Type | Required | Description |
|---|---|---|---|
| `event_slug` | string | ✅ | Slug of the event type to subscribe to. Must exist in `core.event_types` before the handler can fire |
| `routine_name` | string | ✅ | Relative routine name (declared in `[[routines]]`) |

On reinstall, handlers no longer in the manifest are removed. Handlers survive module updates as long as they remain in the manifest.

---

## `[[pages]]`

Custom UI pages backed by static HTML/CSS/JS assets in the ZIP. Pages are content-hashed — reinstall skips pages whose assets have not changed.

```toml
[[pages]]
slug        = "my-dashboard"          # must match pages/my-dashboard/index.html in the ZIP
title       = "Dashboard"
permissions = ["my-module.dashboard:read"]

  [[pages.sections]]
  slug                = "summary"
  title               = "Summary"
  sort_order          = 0

  [[pages.sections]]
  slug                = "details"
  title               = "Details"
  required_permission = "my-module.dashboard:admin"
  sort_order          = 1
```

| Field | Type | Required | Description |
|---|---|---|---|
| `slug` | string | ✅ | Page identifier. A ZIP asset must exist at `pages/{slug}/index.html` — 422 if missing |
| `title` | string | ✅ | Display title |
| `permissions` | string array | ❌ | Permission slugs required to access this page |
| `sections` | array | ❌ | Named sub-sections within the page |

**Section fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `slug` | string | ✅ | Section identifier |
| `title` | string | ✅ | Section display title |
| `required_permission` | string | ❌ | If set, the section is hidden for users without this permission |
| `sort_order` | integer | ❌ | Display order; defaults to 0 |

**Difference from entities/ pages:** `[[pages]]` require physical HTML assets in the ZIP and render arbitrary frontends. Entity `[form]` pages are auto-generated SchemaForm UIs — no HTML required.

On reinstall, pages no longer in the manifest are deactivated.

---

## `[nav]`

Assigns pages to sidebar navigation folders. Folders are created on install and removed on uninstall.

```toml
[[nav.folders]]
slug       = "my-module"
title      = "My Module"
sort_order = 10

[[nav.folders]]
slug       = "reports"
title      = "Reports"
parent     = "my-module"   # creates my-module/reports — parent must exist first
sort_order = 0

[[nav.items]]
page       = "my-dashboard"        # slug from [[pages]]
folder     = "my-module"           # full path (e.g. "my-module/reports" for nested)
sort_order = 0
```

**`[[nav.folders]]` fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `slug` | string | ✅ | Folder identifier (last segment of the path) |
| `title` | string | ✅ | Display label in the sidebar |
| `parent` | string | ❌ | Full path of the parent folder (e.g. `"finance"` or `"finance/reports"`). Omit for root folders |
| `sort_order` | integer | ❌ | Sort position; defaults to 0 |

**`[[nav.items]]` fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `page` | string | ✅ | Page slug — must be declared in `[[pages]]` of this module |
| `folder` | string | ✅ | Full folder path. Must be declared in `[[nav.folders]]` above, OR already exist in Core as a system folder |
| `sort_order` | integer | ❌ | Sort position within the folder; defaults to 0 |

**Rules:**
- Folders are processed depth-first: parents before children. Declare parent folders before their children in the TOML array.
- Modules may assign pages to pre-existing Core system folders (e.g. `"settings"`) without declaring them in `[[nav.folders]]`.
- Install validates all `nav.items[].page` and `nav.items[].folder` references before writing anything — a bad reference returns 422.

---

## `[[behaviors]]`

Document lifecycle hooks. Behaviors fire when a document transitions state (approve, issue, cancel).

```toml
[[behaviors]]
slug         = "my-module.notify-on-approve"
label        = "Notify team on approval"
trigger      = "after_approve"
handler_type = "emit_event"
handler_config = { event_type = "my-module.document.approved" }
position     = 0

[[behaviors]]
slug         = "my-module.validate-before-issue"
label        = "Validate items before issue"
trigger      = "before_issue"
handler_type = "call_routine"
handler_config = { routine_slug = "my-module.validate-issue" }
position     = 10
```

| Field | Type | Required | Description |
|---|---|---|---|
| `slug` | string | ✅ | Unique behavior identifier across all modules |
| `label` | string | ✅ | Human-readable description |
| `trigger` | string | ✅ | Lifecycle event that fires this behavior (see below) |
| `handler_type` | string | ✅ | Dispatch strategy (see below) |
| `handler_config` | object | ✅ | Type-specific configuration |
| `position` | integer | ❌ | Execution order among behaviors on the same trigger; defaults to 0 |

**`trigger` values:**

| Value | When it fires | Error behavior |
|---|---|---|
| `before_approve` | Before approve transition | Error aborts the transition |
| `after_approve` | After approve transition | Error logged only |
| `before_issue` | Before issue transition | Error aborts the transition |
| `after_issue` | After issue transition | Error logged only |
| `before_cancel` | Before cancel transition | Error aborts the transition |
| `after_cancel` | After cancel transition | Error logged only |

**`handler_type` values:**

| Value | `handler_config` shape | Description |
|---|---|---|
| `emit_event` | `{ event_type: "my.event.slug" }` | Publishes the event slug to the outbox |
| `call_routine` | `{ routine_slug: "my-module.my-routine" }` | Fires the routine asynchronously via the outbox |
| `call_module_function` | `{}` | Dispatches to the module WASM (async; no return value used) |

**Important:** behaviors installed by a module are marked `is_locked = true`. They are **not removed on uninstall** — they survive module removal and must be manually cleaned up if no longer needed.

---

## `[[document_type_groups]]` + `[[document_types]]`

Register document types and their groups. Document types appear in the document creation flow. Install automatically seeds `read`, `create`, `update`, and `delete` permissions for each type under the `documents.<slug>` resource.

```toml
[[document_type_groups]]
slug     = "my-module-docs"
label    = "My Module Documents"
position = 10

[[document_types]]
slug       = "purchase-order"
label      = "Purchase Order"
group_slug = "my-module-docs"   # must match a [[document_type_groups]] slug above
position   = 0

[[document_types]]
slug       = "goods-receipt"
label      = "Goods Receipt"
group_slug = "my-module-docs"
position   = 1
```

**`[[document_type_groups]]` fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `slug` | string | ✅ | Unique group identifier |
| `label` | string | ✅ | Display label |
| `position` | integer | ❌ | Sort position; defaults to 0 |

**`[[document_types]]` fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `slug` | string | ✅ | Unique document type identifier |
| `label` | string | ✅ | Display label |
| `group_slug` | string | ✅ | Parent group — must be declared in `[[document_type_groups]]` in this manifest |
| `position` | integer | ❌ | Sort position within the group; defaults to 0 |

**Important:** document types and groups are **not removed on uninstall**. They persist until manually deleted.

---

## `[dependencies]`

Declare other modules that must be installed before this one.

```toml
[dependencies]

[[dependencies.required]]
slug       = "fiscal"
version    = ">=01.002.000"    # semver constraint against MM.mmm.ppp
marketplace_id = "fiscal-br"   # optional — for marketplace resolution

[[dependencies.optional]]
slug    = "crm"
version = "^01.000.000"
```

**Dependency fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `slug` | string | ✅ | Slug of the required module |
| `version` | string | ✅ | Semver constraint against `MM.mmm.ppp`. Supports `>=`, `^`, `~`, `=` operators |
| `marketplace_id` | string | ❌ | Marketplace identifier for automated resolution |

**Behavior at install time:**
- `required` dependencies: 422 if the module is not installed, or installed version does not satisfy the constraint
- `optional` dependencies: no check — silently skipped if not installed

---

## MCP tools (WASM-registered)

MCP tools are **not declared in module.toml**. They are registered at WASM runtime by calling the `register_mcp_tool` host function from the module's `start()` export:

```rust
// Inside module start()
register_mcp_tool(RegisterMcpToolInput {
    name:         "search-products",
    description:  "Search the product catalog",
    input_schema: json!({ "type": "object", "properties": { "q": { "type": "string" } } }),
    routine_name: "search-products",
});
```

Registered tools appear in `tools/list` as `module__{slug}__{tool_name}` and are callable via the standard MCP tool-call protocol. See [`host-fn-reference.md`](host-fn-reference.md) for the full host function signature.

---

## Uninstall

```
DELETE /api/modules/{slug}?drop_schema=false
DELETE /api/modules/{slug}?drop_schema=true
```

**What is always removed:**

| Resource | What is deleted |
|---|---|
| Routines | All `core.routines` rows for this module |
| Pages | `meta.page_definitions` rows → reloads page cache |
| Page folders | `meta.page_folders` rows owned by this module |
| Routes | `sys.route_definitions` rows → reloads route registry |
| Event handlers | `core.module_event_handlers` rows |
| Entity definitions | `meta.entity_definitions` and cascade-deleted `field_definitions` |
| WASM artifact | Binary removed from artifact store |

**Only with `drop_schema=true`:**

`DROP SCHEMA IF EXISTS mod_{slug} CASCADE` — drops all tables, sequences, and views in the module's schema. **Irreversible.**

**What is NOT removed on uninstall:**

| Resource | Reason |
|---|---|
| `[[behaviors]]` | Marked `is_locked = true` — survive for auditability |
| `[[document_types]]` and `[[document_type_groups]]` | Documents that reference these types must remain resolvable |
| MCP tools in `sys.mcp_tool_definitions` | Cleaned up on next start() if module is gone |

After uninstall, `wasm_status` is set to `"uninstalled"` and a `module.uninstalled` event is published.

---

## Error codes

| Code | HTTP | When |
|---|---|---|
| `module.invalid_manifest` | 422 | Bad `module.toml`, missing page asset, invalid nav reference, non-empty `migrations.files` |
| `module.version_incompatible` | 422 | `min_core` is higher than the running Core version |
| `module.dependency_not_met` | 422 | A `required` dependency module is not installed |
| `module.dependency_version_mismatch` | 422 | A `required` dependency is installed but its version does not satisfy the constraint |
| `module.artifact_not_found` | 404 | Module not found during uninstall or capability registration |
| `module.schema_validation` | 422 | `schema.toml` references an invalid type or an un-whitelisted extend target |
| `module.schema_ddl_failed` | 500 | DDL statement failed during schema apply |
