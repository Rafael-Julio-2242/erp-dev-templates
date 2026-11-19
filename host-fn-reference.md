# Host Function Reference

All 56 functions from `interface host` communicate via JSON strings. This document covers exact input/output shapes, permission requirements, and gotchas.

---

## Response Envelopes

Five distinct shapes exist across the 23 functions:

### Standard `{success, data, message}`
```json
{ "success": true,  "data": <value|null>, "message": "" }
{ "success": false, "data": null, "message": "error description" }
```
Used by: `read-entity`, `list-entities`, `write-entity`, `delete-entity`, `emit-event`, `http-request`, `get-time`, `random-uuid`, `cache-get`, `cache-set`, `cache-delete`, `vector-upsert`, `vector-search`

### Query `{rows}` or `{error}`
```json
{ "rows": [ {...}, ... ] }
{ "error": "description" }
```
Used by: `query`

### Execute `{affected}` or `{error}`
```json
{ "affected": 3 }
{ "error": "description" }
```
Used by: `execute`

### Introspect `{data}` or `{error}`
```json
{ "data": <value> }
{ "error": "description" }
```
Used by: `describe-entity`, `list-entity-schemas`, `list-modules`

### Pass-through
`call-routine` returns exactly what the called routine returns — no wrapping.

---

## Entity Naming

All entity parameters use `schema.table` format (must contain a dot):

| Entity type     | Format                        | Example                    |
|-----------------|-------------------------------|----------------------------|
| Core            | `core.{table}`                | `core.users`               |
| Module          | `mod_{slug}.{table}`          | `mod_stock.products`       |
| Custom          | `mod_custom.{slug}`           | `mod_custom.clients`       |

---

## Functions

---

### `log`
```
func(level: string, msg: string)  →  (no return value)
```
Writes to server stdout. Not JSON — takes two separate string arguments directly.

```rust
host::log("info",  "module started");
host::log("warn",  "stock below threshold");
host::log("error", &format!("failed to write: {}", msg));
// levels: info | warn | error | debug
```

---

### `read-entity`
Read a single entity record by ID.

**Permission required:** `{entity}:read`

**Input:**
```json
{
  "entity": "mod_stock.products",
  "id":     "550e8400-e29b-41d4-a716-446655440000"
}
```

**Output:**
```json
{ "success": true,  "data": { "id": "...", "name": "Widget A", "quantity": 100 }, "message": "Entity readed successfully" }
{ "success": false, "data": null, "message": "forbidden" }
```

---

### `list-entities`
List entity records with optional filters, sort, and pagination.

**Permission required:** `{entity}:read`

**Input:**
```json
{
  "entity":     "mod_stock.products",
  "filters": [
    { "order": 1, "group": 1, "field": "category", "op": "eq",   "value": "electronics", "logic": "and" },
    { "order": 2, "group": 1, "field": "quantity",  "op": "neq",  "value": 0,             "logic": "and" }
  ],
  "sort_by":    "name",
  "sort_order": "asc",
  "limit":      50,
  "offset":     0
}
```

All fields except `entity` are optional. Defaults: limit=50, offset=0, sort_order="asc", no filters.

**Filter ops:**

| `op`                                      | `value` shape              |
|-------------------------------------------|----------------------------|
| `eq`, `neq`                               | scalar (string/number/bool)|
| `like`, `starts_with`, `not_starts_with`  | string scalar              |
| `in`, `not_in`                            | array `["a", "b"]`         |
| `is_null`, `not_null`                     | omit `value`               |

`logic` field: `"and"` or `"or"`. Required for every clause except the lowest-order one.

`group`: clauses with the same group number are evaluated together before being combined with other groups.

**Output:**
```json
{ "success": true, "data": [ { "id": "...", ... }, { "id": "...", ... } ], "message": "" }
```

---

### `write-entity`
Insert or update an entity record.

**Permission required:** `{entity}:write`

**Input (INSERT — omit `id`):**
```json
{
  "entity":         "mod_stock.products",
  "schema_version": 1,
  "data": {
    "name":     "Widget A",
    "quantity": 100,
    "price":    "29.99"
  }
}
```

**Input (UPDATE — include `id`):**
```json
{
  "entity":         "mod_stock.products",
  "schema_version": 1,
  "id":             "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "quantity": 75
  }
}
```

`schema_version`: the current version of the entity's JSON schema (from `module.toml` or `describe-entity`). Used for write validation.

**Output:**
```json
{ "success": true, "data": { "entity_id": "550e8400-...", "action": "insert" }, "message": "" }
{ "success": true, "data": { "entity_id": "550e8400-...", "action": "update" }, "message": "" }
```

---

### `delete-entity`
Delete a single entity record by ID.

**Permission required:** `{entity}:delete`

**Input:**
```json
{
  "entity": "mod_stock.products",
  "id":     "550e8400-e29b-41d4-a716-446655440000"
}
```

**Output:**
```json
{ "success": true, "data": { "entity_id": "550e8400-...", "action": "delete" }, "message": "" }
```

---

### `emit-event`
Emit an event into the system (written to outbox → NATS → SSE fans out to subscribers).

**Permission required:** `events:emit`

**Input:**
```json
{
  "event_type": "stock.low",
  "payload": {
    "product_id":  "550e8400-e29b-41d4-a716-446655440000",
    "current_qty": 3,
    "threshold":   10
  }
}
```

`event_type` must match a slug registered in `core.event_types`. Event also triggers any WASM event handlers registered via `register-event-handler`.

**Output:**
```json
{ "success": true, "data": null, "message": "" }
```

---

### `call-routine`
Invoke another routine by name. Supports recursive calls up to `max_depth` (default 5).

**Input:**
```json
{
  "name":  "stock:check_low_stock",
  "input": { "product_id": "550e8400-e29b-41d4-a716-446655440000" }
}
```

`name` format:
- Standalone routine (no module): `"routine_slug"`
- Module routine: `"module_slug:routine_name"`

`input` is optional — defaults to `{}`.

**Output:** Pass-through — exactly what the called routine returns.

```json
{ "success": true, "data": { "low": true, "qty": 3 }, "message": "" }
```

---

### `query`
Execute a SELECT statement. DML statements are rejected.

**Blocked schemas (always):** `core`, `meta`, `information_schema`, `pg_catalog`, `mod_custom`

Access to `mod_*` schemas is gated by the calling user's RBAC. The exception is during `start()` — which runs with `is_superuser: true` and can read any `mod_*` schema.

**Input:**
```json
{
  "sql":    "SELECT id, name, quantity FROM mod_stock.products WHERE quantity < $1 AND company_id = $2",
  "params": ["10", "company-uuid-here"]
}
```

All params are strings. Bound as `$1`, `$2`, etc. No named params.

**Output (query envelope):**
```json
{ "rows": [ { "id": "...", "name": "Widget A", "quantity": 5 } ] }
{ "error": "blocked schema: core" }
```

---

### `execute`
Execute a DML statement (INSERT / UPDATE / DELETE). SELECT is rejected.

**Same schema restrictions as `query`.**

**Input:**
```json
{
  "sql":    "UPDATE mod_stock.products SET quantity = $1 WHERE id = $2",
  "params": ["75", "550e8400-e29b-41d4-a716-446655440000"]
}
```

**Output (execute envelope):**
```json
{ "affected": 1 }
{ "error": "description" }
```

> Prefer `write-entity` over `execute` when writing to registered entities — it triggers audit logs, schema validation, and outbox events. Use `execute` only for bulk ops or tables not registered as entities.

---

### `describe-entity`
Get the full schema definition for a registered entity.

**Permission required:** `db_struct:read`

**Input:**
```json
{ "slug": "mod_stock.products" }
```

`slug` matches `meta.entity_definitions.slug` — the same value used as `entity` in read/write/list/delete calls.

**Output (introspect envelope):**
```json
{
  "data": {
    "slug":      "mod_stock.products",
    "table_ref": "mod_stock.products",
    "is_system": false,
    "is_custom": false,
    "schema": {
      "type": "object",
      "properties": {
        "name":     { "type": "string" },
        "quantity": { "type": "integer" }
      }
    }
  }
}
```

---

### `list-entity-schemas`
List all entity definitions registered by a specific module.

**Permission required:** `db_struct:read`

**Input:**
```json
{ "module_slug": "stock" }
```

Returns all entities whose `table_ref` starts with `mod_stock.`.

**Output (introspect envelope):**
```json
{
  "data": [
    { "slug": "mod_stock.products",   "table_ref": "mod_stock.products",   "is_system": false, "is_custom": false, "schema": { ... } },
    { "slug": "mod_stock.categories", "table_ref": "mod_stock.categories", "is_system": false, "is_custom": false, "schema": { ... } }
  ]
}
```

---

### `list-modules`
List all installed modules.

**Permission required:** `db_struct:read`

**Input:** `""` (ignored — this function takes no meaningful input)

**Output (introspect envelope):**
```json
{
  "data": [
    { "id": "...", "name": "Stock Manager", "slug": "stock", "version": "001.000.000", "active": true },
    { "id": "...", "name": "HR Module",     "slug": "hr",    "version": "001.002.000", "active": true }
  ]
}
```

---

### `http-request`
Make an outbound HTTP request.

**SSRF guard (always enforced unless disabled by server config):**
Blocks `localhost`, loopback IPs, `*.local`, `*.internal`, and all RFC-1918 / ULA private ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x, fc00::/7, ::1).

**Timeout:** Default 10s, max 30s. Response body limit: 10 MB.

**Input (JSON body):**
```json
{
  "method":  "POST",
  "url":     "https://api.example.com/webhook",
  "headers": {
    "Authorization": "Bearer token123"
  },
  "body":       { "event": "stock_low", "product_id": "..." },
  "timeout_ms": 5000
}
```

**Input (plain text body):**
```json
{
  "method":    "POST",
  "url":       "https://api.example.com/data",
  "body_text": "raw text content"
}
```

**Input (binary body — base64 encoded):**
```json
{
  "method":        "POST",
  "url":           "https://api.example.com/upload",
  "body_bytes_b64": "SGVsbG8gV29ybGQ="
}
```

**Input (multipart/form-data):**
```json
{
  "method": "POST",
  "url":    "https://api.example.com/files",
  "form_data": [
    { "name": "file",        "bytes_b64": "SGVsbG8=", "filename": "report.pdf", "content_type": "application/pdf" },
    { "name": "description", "value":     "Q3 Report" }
  ]
}
```

Body priority (mutually exclusive): `form_data` > `body_bytes_b64` > `body_text` > `body`

**Output:**
```json
{
  "success": true,
  "data": {
    "status":   200,
    "headers":  { "content-type": "application/json", "x-request-id": "abc" },
    "body":     { "ok": true },
    "body_b64": null
  },
  "message": ""
}
```

`body` is set when the response is `application/json` or `text/*`.
`body_b64` is set (base64) when the response is binary; `body` will be `null` in that case.

---

### `get-time`
Get current UTC time. Takes no input.

**Input:** *(WIT: `func() -> string` — pass an empty string `""` in languages that need a value)*

**Output:**
```json
{
  "success": true,
  "data": {
    "unix_ms":     1720000000000,
    "iso8601":     "2024-07-03T12:00:00Z",
    "weekday":     "Wednesday",
    "weekday_num": 3
  },
  "message": ""
}
```

`weekday_num`: 1=Monday … 7=Sunday (ISO 8601).

---

### `random-uuid`
Generate a UUIDv4. Takes no input.

**Input:** *(WIT: `func() -> string` — pass an empty string `""` in languages that need a value)*

**Output:**
```json
{
  "success": true,
  "data": { "uuid": "550e8400-e29b-41d4-a716-446655440000" },
  "message": ""
}
```

---

### `cache-get`
Read a value from the in-process key-value cache.

**Cache scope:** keys are isolated per `company_id`. The same key in two different companies never conflicts.

**Input:**
```json
{ "key": "last_sync_at" }
```

**Output:**
```json
{ "success": true,  "data": { "value": "2026-08-10T12:00:00Z" }, "message": "" }
{ "success": false, "data": null, "message": "not found" }
```

`value` can be any JSON type stored by `cache-set`.

Expired entries are evicted lazily on `cache-get` and by a background sweep every 60 seconds.

---

### `cache-set`
Store a value in the cache.

**Input:**
```json
{
  "key":         "last_sync_at",
  "value":       "2026-08-10T12:00:00Z",
  "ttl_seconds": 300
}
```

`ttl_seconds` is optional. Omitting it uses the server default (`ERP__WASM__CACHE_DEFAULT_TTL_SECONDS`, default 3600s).

`value` accepts any JSON value — string, number, boolean, object, array, or null.

**Output:**
```json
{ "success": true, "data": null, "message": "" }
```

---

### `cache-delete`
Remove a key from the cache immediately.

**Input:**
```json
{ "key": "last_sync_at" }
```

**Output:**
```json
{ "success": true, "data": null, "message": "" }
```

---

### `storage-upload`
Upload a file to object storage (MinIO/S3).

**Permission required:** `storage:write`

**Input:**
```json
{
  "filename":     "report.pdf",
  "content_type": "application/pdf",
  "purpose":      "attachment",
  "bytes_base64": "<standard base64-encoded file bytes>"
}
```

`purpose` is optional. `content_type` must be a valid MIME type.

**Output (success):**
```json
{ "success": true, "id": "uuid", "path": "uploads/2026/uuid.pdf" }
```

**Output (failure):**
```json
{ "success": false, "message": "upload failed: ..." }
```

---

### `storage-get-url`
Get a presigned (time-limited) download URL for a stored file.

**Permission required:** `storage:read`

**Input:**
```json
{ "media_id": "uuid" }
```

**Output (success):**
```json
{ "success": true, "url": "https://minio:9000/erp-core/uploads/2026/uuid.pdf?X-Amz-...", "expires_in": 3600 }
```

`expires_in` is the TTL in seconds, controlled by server config.

---

### `storage-delete`
Delete a stored file from object storage.

**Permission required:** `storage:write`

**Input:**
```json
{ "media_id": "uuid" }
```

**Output (success):**
```json
{ "success": true }
```

---

### `vector-upsert`
Store or update a vector embedding in the vector store. Scoped to the caller's `company_id`.

**Permission required:** `vector:write`

**Input:**
```json
{
  "collection": "product_embeddings",
  "id":         "product_001",
  "embedding":  [0.1, 0.8, -0.3, 0.5],
  "metadata":   { "name": "Widget A", "category": "tools" }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `collection` | string | yes | Logical namespace for grouping embeddings |
| `id` | string | yes | Your identifier for this embedding; upserted on conflict |
| `embedding` | `[f32]` | yes | Vector of floats — all vectors in a collection must have the same dimension |
| `metadata` | object | no | Arbitrary JSON stored alongside the embedding; defaults to `{}` |

**Output (success):**
```json
{ "success": true }
```

**Output (failure):**
```json
{ "success": false, "message": "error description" }
```

---

### `vector-search`
Search for nearest neighbors using cosine similarity. Scoped to the caller's `company_id`.

**Permission required:** `vector:read`

**Input:**
```json
{
  "collection":      "product_embeddings",
  "query_embedding": [0.1, 0.8, -0.3, 0.5],
  "top_k":           10
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `collection` | string | yes | Collection to search within |
| `query_embedding` | `[f32]` | yes | Query vector — must match the dimension of stored vectors |
| `top_k` | integer | no | Number of results to return (default 10, max 100) |

**Score:** `1.0 - cosine_distance`. Identical vectors score `1.0`; orthogonal vectors score `0.5`; opposite vectors score `0.0`.

**Output (success):**
```json
{
  "success": true,
  "data": [
    { "id": "product_001", "score": 0.9987, "metadata": { "name": "Widget A", "category": "tools" } },
    { "id": "product_002", "score": 0.8412, "metadata": { "name": "Widget B", "category": "tools" } }
  ]
}
```

Results are ordered by score descending (most similar first).

**Output (failure):**
```json
{ "success": false, "message": "error description" }
```

---

## Caller Identity & Audit

### `get-caller`
Returns identity information about the current WASM execution context.

**Input:** none (empty string or `""`)

**Output:**
```json
{
  "user_id":        "uuid",
  "principal_type": "human",
  "is_superuser":   false,
  "agent_id":       null,
  "company_id":     "uuid",
  "company_scope":  "global",
  "on_behalf_of":   null
}
```

| Field | Notes |
|---|---|
| `principal_type` | `"human"` \| `"agent"` \| `"system"` |
| `agent_id` | Populated when `principal_type == "agent"` |
| `company_scope` | `"global"` or `["uuid", ...]` array of allowed company UUIDs |
| `on_behalf_of` | UUID of human user this job acts on behalf of; `null` if not set |

---

### `has-permission`
Checks whether the current caller holds a given permission.

**Input:**
```json
{ "resource": "my_module.reports", "action": "export" }
```

**Output:**
```json
{ "has_permission": true }
```

---

### `set-audit-context`
Sets audit metadata for the current execution. All fields are optional — omitted fields keep their current value (merge semantics).

**Input:**
```json
{
  "on_behalf_of":     "user-uuid",
  "batch_id":         "uuid",
  "triggered_by_job": "uuid"
}
```

**Restrictions:**
- System principals (nil `user_id`) cannot set `on_behalf_of`.
- Human callers: `on_behalf_of` must equal own `user_id`.
- Agent callers in a job: `on_behalf_of` must equal the job's inherited value; cannot set a new one when none was inherited.
- An existing `on_behalf_of` cannot be changed to a different value.

**Output:** `{ "ok": true }` or `{ "ok": false, "error": "..." }`

---

## Background Jobs

### `register-background-action`
Registers an action type for background execution. Called from `start()`. Idempotent — reinstall updates the action type.

**Input:**
```json
{
  "name":            "send-report",
  "title":           "Send Weekly Report",
  "description":     null,
  "max_attempts":    3,
  "timeout_seconds": 300
}
```

**Output:** `{ "id": "uuid" }` or `{ "error": "..." }`

---

### `dispatch-background`
Enqueues a background job for a registered action type. Returns immediately with a `job_id`.

**Input:**
```json
{
  "action_name":                "send-report",
  "description":                "Send Q1 report",
  "payload":                    {},
  "run_as":                     null,
  "on_behalf_of":               null,
  "intersect_with_on_behalf_of": false
}
```

| Field | Notes |
|---|---|
| `action_name` | Must match a registered action name for this module |
| `run_as` | Agent principal UUID to run the job as (must be owned by this module) |
| `on_behalf_of` | Human callers: must equal own `user_id`. Agents: must equal inherited `on_behalf_of`. |
| `intersect_with_on_behalf_of` | Defaults to `true` when `on_behalf_of` is set |

**Output:** `{ "job_id": "uuid" }` or `{ "error": "..." }`

---

### `job-is-cancelled`
Checks whether the current background job has been cancel-requested. Valid only inside a background job execution.

**Input:** none (empty string or `""`)

**Output:** `{ "cancelled": false }` — poll this in long-running loops and return early when `true`.

---

### `job-log`
Emits a user-defined log line from inside a running background job. Valid only during job execution. Buffered and flushed after the job exits.

**Input:**
```json
{ "level": "info", "message": "Processing batch 3 of 10" }
```

`level`: `"info"` | `"warn"` | `"error"`. Messages truncated to 2048 UTF-8 bytes. Buffer limit: 1000 lines per job.

**Output:** `{ "ok": true }` (or `{ "ok": true, "dropped": true }` when buffer full)

---

## Secrets

### `get-secret`
Retrieves a secret value by name. Secrets are scoped to the calling module.

**Input:** `{ "name": "api_key" }`

**Output:** `{ "value": "secret-string" }` or `{ "error": "..." }`

---

### `set-secret`
Creates or updates a secret.

**Input:** `{ "name": "api_key", "value": "secret-string" }`

**Output:** `{ "ok": true }` or `{ "error": "..." }`

---

### `has-secret`
Checks whether a secret exists (without revealing its value).

**Input:** `{ "name": "api_key" }`

**Output:** `{ "exists": true }`

---

### `delete-secret`
Deletes a secret.

**Input:** `{ "name": "api_key" }`

**Output:** `{ "ok": true }` or `{ "error": "..." }`

---

## Agent Principals

### `create-agent-principal`
Creates an agent user owned by this module.

**Input:**
```json
{ "name": "report-agent", "description": "Automated report sender" }
```

**Output:** `{ "id": "uuid" }` or `{ "error": "..." }`

---

### `deactivate-agent-principal`
Deactivates an agent owned by this module. Active jobs continue; new dispatches as this agent will fail.

**Input:** `{ "agent_id": "uuid" }`

**Output:** `{ "ok": true }` or `{ "error": "..." }`

---

### `activate-agent-principal`
Re-activates a previously deactivated agent owned by this module.

**Input:** `{ "agent_id": "uuid" }`

**Output:** `{ "ok": true }` or `{ "error": "..." }`

---

### `grant-agent-permission`
Grants a permission to an agent owned by this module. Provide either `permission_id` or `resource`+`action`.

**Input:**
```json
{
  "agent_id":      "uuid",
  "permission_id": "uuid",
  "scope":         "global",
  "is_deny":       false,
  "can_delegate":  false,
  "company_id":    null,
  "grant_depth":   0
}
```

**Caller type rules:**

| Caller | Rules |
|---|---|
| superuser / system | Bypass all checks |
| human | 1. Explicit `is_deny=true` row for caller → immediate error (deny-wins). 2. Must hold permission (direct or role). 3. If via direct row: `can_delegate` required; target `scope` must be ⊆ granter's scope (global ≥ company ≥ own). 4. If role-only: `grant_depth` must be `0`. |
| agent | `resource` must start with `{module_slug}_` or `{module_slug}.`; must hold a direct row; `grant_depth` must be `< granter's max(grant_depth)` |

**Output:** `{ "id": "uuid" }` or `{ "error": "..." }`

---

### `revoke-agent-permission`
Removes a permission grant from an agent owned by this module.

**Input:** `{ "agent_id": "uuid", "permission_id": "uuid" }`

**Output:** `{ "ok": true }` or `{ "error": "..." }`

---

## Permission Management

### `create-permission`
Creates a new permission scoped to this module. `resource` must start with `{module_slug}_` or `{module_slug}.`. Idempotent (`ON CONFLICT DO NOTHING`).

**Input:**
```json
{
  "resource":       "my_module.reports",
  "action":         "export",
  "description":    "Export reports",
  "agent_batch_id": "uuid (optional)"
}
```

**Output:** `{ "id": "uuid", "resource": "...", "action": "..." }` or `{ "error": "..." }`

**Notes:** `description` is required (non-empty string). `agent_batch_id` stored in `core.permissions.agent_batch_id` — used to identify permissions created as part of a change-tracking batch.

---

### `delete-permission`
Deletes a module-scoped permission and cascades to all grants. Rejects system permissions.

**Input:** `{ "resource": "my_module.reports", "action": "export" }`

**Output:** `{ "deleted": true, "cascade_count": 3 }` or `{ "error": "..." }`

---

## Notifications

### `send-notification`
Writes one notification row to `core.notifications` for a specific user or every member of a role. No RBAC check inside the host fn — the calling module is assumed to already have the appropriate grant.

**Input:**
```json
{
  "target_user_id":   "uuid (mutually exclusive with target_role_slug)",
  "target_role_slug": "string (mutually exclusive with target_user_id)",
  "kind":             "info | warning | error | success  (default: info)",
  "title":            "string (required)",
  "body":             "string | null",
  "data":             "object | null"
}
```

Exactly one of `target_user_id` or `target_role_slug` must be set; supplying both or neither returns an error.

**Output:** `{ "success": true, "data": { "count": 3 } }` — `count` is number of rows inserted (1 for user path, N for role path).

**Errors:** `{ "success": false, "message": "target_user_id or target_role_slug is required" }` / `"only one of target_user_id or target_role_slug may be set"` / `"title is required"`

---

## MCP Tool Bridge

These two host fns expose the same MCP dispatch table available at `POST /mcp` to the WASM execution context, letting one module call another module's MCP tools (or custom tools) without an HTTP round-trip.

### `mcp-list-tools`
Returns all MCP tools the current caller has permission to call.

**Input:** *(none)*

**Output:**
```json
{
  "success": true,
  "data": [
    { "name": "entity__list" },
    { "name": "entity__read" },
    { "name": "entity__write" },
    { "name": "entity__delete" },
    { "name": "entity__describe" },
    { "name": "entity__list_schemas" },
    { "name": "routine__execute" },
    { "name": "custom__my_tool", "description": "...", "input_schema": {} },
    { "name": "module__other_slug__tool_name", "description": "...", "input_schema": {} }
  ],
  "message": ""
}
```

**Permission filtering:**
- Entity and routine tools are always included.
- Custom tools require `mcp_tool:{tool_name}` or `mcp_tool:all`.
- Module tools require `{module_slug}_mcp:{tool_name}` or `{module_slug}_mcp:all`.

---

### `mcp-call-tool`
Dispatches a single MCP tool call and returns its result.

**Input:**
```json
{ "name": "module__other_slug__some_tool", "arguments": { "key": "value" } }
```

**Tool name prefixes:**

| Prefix | Example | Dispatch |
|---|---|---|
| `custom__` | `custom__my_tool` | Looks up `core.mcp_tools`, executes its linked routine |
| `module__` | `module__billing__create_invoice` | Fetches module artifact, calls the routine defined in `sys.mcp_tool_definitions` |

**Output:** `{ "success": true, "data": { ... } }` — `data` is the routine's return value.

**Permission enforcement:**
- `custom__foo` → requires `mcp_tool:foo` or `mcp_tool:all`.
- `module__slug__bar` → requires `{slug}_mcp:bar` or `{slug}_mcp:all`.
- Returns `{ "success": false, "message": "forbidden" }` on RBAC failure (no exception, safe to ignore in workflows).

**Depth guard:** returns `{ "success": false, "message": "max recursion depth exceeded" }` if the execution depth reaches 32. This prevents infinite mutual recursion between modules.

> `entity__*` tools are listed by `mcp-list-tools` but are **not** dispatched by `mcp-call-tool`. Use the dedicated `read-entity`, `list-entities`, `write-entity`, `delete-entity` host fns instead.

---

## Change Tracking

Host fns for creating, inspecting, and reversing structural changes. All structural fns reject calls where `principal_type == "agent"` (agent guard). `field-stats` is read-only and has no agent guard.

### Agent guard

Every structural fn checks:
```
if ctx.principal_type == "agent" {
    return err_json("agents cannot modify structure")
}
```
The AI module cannot call these fns running as an agent principal. It must run as a human principal or via a routine triggered by a human.

### `register-entity`
Creates a custom entity at runtime (DDL + meta + page).

**Permission:** `db_struct:write` | **Agent guard:** yes

**Input:**
```json
{
  "name":           "my_entity",
  "label":          "My Entity",
  "module_slug":    "optional",
  "fields":         [{ "name": "title", "label": "Title", "field_type": "text", "required": false }],
  "agent_batch_id": "uuid (optional)"
}
```

**Output:** `{ "success": true, "data": { "entity_id": "uuid", "entity_slug": "custom.my_entity", "page_id": "uuid" } }`

**Notes:**
- `entity_slug` has `custom.` prefix — use it for `add-entity-field` and `write-entity`.
- `permission_ids` not in response. Retrieve via `query`: `SELECT id, resource, action FROM core.permissions WHERE resource LIKE 'custom.{name}%'`.
- `agent_batch_id` stored in `meta.entity_definitions.agent_batch_id`. Returns error if UPDATE fails.
- Not idempotent — returns error if entity with same name already exists.

---

### `add-entity-field`
Adds a field to an existing custom entity at runtime (ALTER TABLE + meta).

**Permission:** `db_struct:write` | **Agent guard:** yes

**Input:**
```json
{
  "entity_slug":    "custom.my_entity",
  "name":           "notes",
  "label":          "Notes",
  "field_type":     "text",
  "required":       false,
  "agent_batch_id": "uuid (optional)"
}
```

**Valid `field_type` values:** `text`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `select`, `uuid`, `json`

**Output:** `{ "success": true, "data": { "field_id": "uuid", "slug": "notes" } }`

**Notes:** Increments the entity's `schema_version` — write clients must pass the updated version.

---

### `deactivate-field`
Deactivates a field. Writes to it return 422; schema endpoint and reads omit it.

**Permission:** `db_struct:write` | **Agent guard:** yes

**Input:** `{ "field_id": "uuid" }`  
**Output:** `{ "success": true }`

**Notes:**
- Sets `deactivated_at = NOW()` and `deactivated_by = caller_user_id`.
- Field is NOT dropped — only blocked in write gateway and hidden from reads.
- Schema (`GET /api/schema/entities/{slug}`) and filter allowlist exclude it while deactivated.
- Reverse with `activate-field`.

---

### `activate-field`
Reactivates a deactivated field. Field reappears in schema, reads, and filter allowlist.

**Permission:** `db_struct:write` | **Agent guard:** yes

**Input:** `{ "field_id": "uuid" }`  
**Output:** `{ "success": true }`

---

### `field-stats`
Returns fill statistics for a field.

**Permission:** `db_struct:read` | **Agent guard:** none (agents may call)

**Input:** `{ "field_id": "uuid" }`

**Output:**
```json
{
  "success": true,
  "data": {
    "total_rows":     1000,
    "non_null_count": 750,
    "null_count":     250,
    "null_pct":       25.0
  }
}
```

**Notes:** Typical use: check before deactivating — if `null_pct ≈ 100`, field is empty and safe to deactivate.

---

### `deactivate-entity`
Deactivates a custom entity. Blocks writes; reads continue. Cascades to pages.

**Permission:** `db_struct:write` | **Agent guard:** yes

**Input:** `{ "entity_id": "uuid" }`  
**Output:** `{ "success": true }`

**Notes:**
- Only works on entities with `is_custom = true`.
- Write gateway returns HTTP 422 (`write.deactivated_entity`) on any write to a deactivated entity.
- Reads continue working normally.
- Cascades: pages in `meta.page_definitions` with matching `entity_slug` get `is_active = false`.

---

### `activate-entity`
Reactivates a deactivated entity. Writes resume. Cascades to pages.

**Permission:** `db_struct:write` | **Agent guard:** yes

**Input:** `{ "entity_id": "uuid" }`  
**Output:** `{ "success": true }`

---

### `toggle-routine`
Activates or deactivates a routine.

**Permission:** `routines:update` | **Agent guard:** yes

**Input:** `{ "routine_id": "uuid", "is_active": false }`

**Output:** `{ "success": true, "data": { "routine_id": "uuid", "is_active": false } }`

**Notes:** Emits `routine.toggled` event to outbox (soft failure — does not fail the call).

---

### `register-event-type`
Registers a custom event type.

**Permission:** `db_struct:write` | **Agent guard:** yes

**Input:**
```json
{
  "slug":           "my.module.event",
  "name":           "My Event",
  "description":    "optional",
  "payload_schema": {},
  "agent_batch_id": "uuid (optional)"
}
```

**Output:** `{ "success": true, "data": { "event_type_id": "uuid | null", "slug": "my.module.event" } }`

**Notes:** `ON CONFLICT (slug) DO NOTHING` — idempotent. On conflict, `event_type_id` is `null` and nothing is modified.

---

### `deactivate-event-type`
Deactivates an event type (`is_active = false`). Does not work on system event types.

**Permission:** `db_struct:write` | **Agent guard:** yes

**Input:** `{ "event_type_id": "uuid" }`  
**Output:** `{ "success": true }`

---

### `register-nav-folder`
Registers a navigation folder in the sidebar menu.

**Permission:** `db_struct:write` | **Agent guard:** yes

**Input:**
```json
{
  "slug":           "my-folder",
  "title":          "My Folder",
  "parent_id":      "uuid (optional)",
  "sort_order":     10,
  "agent_batch_id": "uuid (optional)"
}
```

**Output (folder created):** `{ "success": true, "data": { "folder_id": "uuid", "path": "/my-folder", "created": true } }`

**Output (conflict — folder already existed, nothing changed):** `{ "success": true, "data": { "folder_id": null, "path": "/my-folder", "created": false } }`

**Notes:**
- `ON CONFLICT (path) DO NOTHING` — never overwrites a folder created by a human or another module.
- `agent_batch_id` stored only when `created: true`. When `created: false`, `folder_id` is `null` — do not pass it to `deactivate-nav-folder`.

---

### `deactivate-nav-folder`
Deactivates a navigation folder (`is_active = false`).

**Permission:** `db_struct:write` | **Agent guard:** yes

**Input:** `{ "folder_id": "uuid" }`  
**Output:** `{ "success": true }`

---

### Change Tracking — `agent_batch_id`

Columns `agent_batch_id UUID NULL` added to:

| Table | Fn that populates |
|-------|------------------|
| `meta.field_definitions` | `add-entity-field`, `register-entity-field` |
| `meta.entity_definitions` | `register-entity` |
| `core.permissions` | `create-permission` |
| `core.event_types` | `register-event-type` |
| `meta.page_folders` | `register-nav-folder` (only when `created: true`) |

**Rollback query by batch:**
```sql
SELECT 'field'       AS type, id, slug             FROM meta.field_definitions   WHERE agent_batch_id = $1
UNION ALL
SELECT 'entity',             id, slug             FROM meta.entity_definitions  WHERE agent_batch_id = $1
UNION ALL
SELECT 'permission',         id, resource||'.'||action FROM core.permissions    WHERE agent_batch_id = $1
UNION ALL
SELECT 'event_type',         id, slug             FROM core.event_types         WHERE agent_batch_id = $1
UNION ALL
SELECT 'nav_folder',         id, slug             FROM meta.page_folders        WHERE agent_batch_id = $1
```

---

## Quick Reference Table

| Function            | Input fields (required*)                               | Permission          | Envelope     |
|---------------------|--------------------------------------------------------|---------------------|--------------|
| `log`               | `level`, `msg` (direct args, not JSON)                 | none                | none         |
| `read-entity`       | `entity*`, `id*`                                       | `{entity}:read`     | standard     |
| `list-entities`     | `entity*`, `filters`, `sort_by`, `sort_order`, `limit`, `offset` | `{entity}:read` | standard |
| `write-entity`      | `entity*`, `schema_version*`, `data*`, `id`            | `{entity}:write`    | standard     |
| `delete-entity`     | `entity*`, `id*`                                       | `{entity}:delete`   | standard     |
| `emit-event`        | `event_type*`, `payload`                               | `events:emit`       | standard     |
| `call-routine`      | `name*`, `input`                                       | `{routine}:execute` | pass-through |
| `query`             | `sql*`, `params`                                       | (RBAC per schema)   | `{rows}`     |
| `execute`           | `sql*`, `params`                                       | (RBAC per schema)   | `{affected}` |
| `describe-entity`   | `slug*`                                                | `db_struct:read`    | `{data}`     |
| `list-entity-schemas` | `module_slug*`                                       | `db_struct:read`    | `{data}`     |
| `list-modules`      | *(none)*                                               | `db_struct:read`    | `{data}`     |
| `http-request`      | `method*`, `url*`, `headers`, `body`/`body_text`/`body_bytes_b64`/`form_data`, `timeout_ms` | none | standard |
| `get-time`          | *(none)*                                               | none                | standard     |
| `random-uuid`       | *(none)*                                               | none                | standard     |
| `cache-get`         | `key*`                                                 | none                | standard     |
| `cache-set`         | `key*`, `value*`, `ttl_seconds`                        | none                | standard     |
| `cache-delete`      | `key*`                                                 | none                | standard     |
| `storage-upload`    | `filename*`, `content_type*`, `bytes_base64*`, `purpose` | `storage:write`   | `{success, id, path}` |
| `storage-get-url`   | `media_id*`                                            | `storage:read`      | `{success, url, expires_in}` |
| `storage-delete`    | `media_id*`                                            | `storage:write`     | `{success}`  |
| `vector-upsert`     | `collection*`, `id*`, `embedding*`, `metadata`         | `vector:write`      | `{success}`  |
| `vector-search`     | `collection*`, `query_embedding*`, `top_k`             | `vector:read`       | `{success, data[]}` |
| `get-caller`        | *(none)*                                               | none                | `{user_id, principal_type, ...}` |
| `has-permission`    | `resource*`, `action*`                                 | none                | `{has_permission}` |
| `set-audit-context` | `on_behalf_of`, `batch_id`, `triggered_by_job`         | none                | `{ok}`       |
| `dispatch-background` | `action_name*`, `description*`, `payload`, `run_as`, `on_behalf_of` | module ctx | `{job_id}` |
| `job-is-cancelled`  | *(none)*                                               | job ctx             | `{cancelled}` |
| `register-background-action` | `name*`, `title*`, `description`, `max_attempts`, `timeout_seconds` | module ctx | `{id}` |
| `get-secret`        | `name*`                                                | module ctx          | `{value}`    |
| `set-secret`        | `name*`, `value*`                                      | module ctx          | `{ok}`       |
| `has-secret`        | `name*`                                                | module ctx          | `{exists}`   |
| `delete-secret`     | `name*`                                                | module ctx          | `{ok}`       |
| `create-agent-principal` | `name*`, `description`                           | module ctx          | `{id}`       |
| `deactivate-agent-principal` | `agent_id*`                                  | module ctx          | `{ok}`       |
| `activate-agent-principal` | `agent_id*`                                    | module ctx          | `{ok}`       |
| `grant-agent-permission` | `agent_id*`, `permission_id` or `resource*`+`action*`, `scope`, `is_deny`, `grant_depth` | module ctx | `{id}` |
| `revoke-agent-permission` | `agent_id*`, `permission_id*`                   | module ctx          | `{ok}`       |
| `job-log`           | `level*`, `message*`                                   | job ctx             | `{ok}`       |
| `create-permission` | `resource*`, `action*`, `description`                  | module ctx          | `{id, resource, action}` |
| `delete-permission` | `resource*`, `action*`                                 | module ctx          | `{deleted, cascade_count}` |
| `send-notification` | `title*`, `target_user_id` or `target_role_slug` (one required), `kind`, `body`, `data` | none | `{success, data.count}` |
| `mcp-list-tools`    | *(none)*                                               | filtered by RBAC    | `{success, data[]}` |
| `mcp-call-tool`     | `name*`, `arguments`                                   | `mcp_tool:{name}` or `{slug}_mcp:{name}` | `{success, data}` |
| `register-entity`   | `name*`, `label*`, `fields`, `module_slug`, `agent_batch_id` | `db_struct:write` | `{success, data{entity_id,entity_slug,page_id}}` |
| `add-entity-field`  | `entity_slug*`, `name*`, `label*`, `field_type*`, `required`, `agent_batch_id` | `db_struct:write` | `{success, data{field_id,slug}}` |
| `deactivate-field`  | `field_id*`                                            | `db_struct:write`   | `{success}` |
| `activate-field`    | `field_id*`                                            | `db_struct:write`   | `{success}` |
| `field-stats`       | `field_id*`                                            | `db_struct:read`    | `{success, data{total_rows,non_null_count,null_count,null_pct}}` |
| `deactivate-entity` | `entity_id*`                                           | `db_struct:write`   | `{success}` |
| `activate-entity`   | `entity_id*`                                           | `db_struct:write`   | `{success}` |
| `toggle-routine`    | `routine_id*`, `is_active*`                            | `routines:update`   | `{success, data{routine_id,is_active}}` |
| `register-event-type` | `slug*`, `name*`, `description`, `payload_schema`, `agent_batch_id` | `db_struct:write` | `{success, data{event_type_id,slug}}` |
| `deactivate-event-type` | `event_type_id*`                                   | `db_struct:write`   | `{success}` |
| `register-nav-folder` | `slug*`, `title*`, `parent_id`, `sort_order`, `agent_batch_id` | `db_struct:write` | `{success, data{folder_id,path,created}}` |
| `deactivate-nav-folder` | `folder_id*`                                       | `db_struct:write`   | `{success}` |

---

## interface module-host

Functions in `erp-core:component/module-host@0.1.0`. Called from `start()` during module initialization — **not** during routine or endpoint execution.

All eight functions:
- Return `{ "ok": true }` on success or `{ "error": "..." }` on failure
- Require a module context (`module_id` present); return `"no module context"` if called outside `start()`

---

### `register-endpoint`

Dynamically registers an HTTP route backed by a WASM routine. Same effect as `[[endpoints]]` in `module.toml`, but done at runtime from `start()`. Route is live immediately — no restart needed.

**Input:**
```json
{
  "path":          "/items",
  "method":        "POST",
  "routine_name":  "create_item",
  "auth_required": true
}
```

`auth_required` defaults to `true` if omitted. `path` + `method` must be unique for this module.

**Output:**
```json
{ "ok": true }
{ "error": "..." }
```

---

### `register-event-handler`

Subscribes a WASM routine to fire when a specific event type is emitted. `event_slug` must already exist in `core.event_types`. When the event fires, Core calls `call-event(routine_name, trigger, entity, data)`.

**Input:**
```json
{
  "event_slug":   "stock.product.updated",
  "routine_name": "on_product_updated"
}
```

**Output:**
```json
{ "ok": true }
{ "error": "..." }
```

---

### `register-mcp-tool`

Registers a WASM routine as an MCP (Model Context Protocol) tool, making it callable by AI models. The tool appears in `tools/list` as `module__{slug}__{name}`.

**Input:**
```json
{
  "name":         "search_products",
  "description":  "Search the product catalog by keyword",
  "input_schema": {
    "type": "object",
    "properties": { "q": { "type": "string" } },
    "required": ["q"]
  },
  "routine_name": "search_products_routine"
}
```

`input_schema` defaults to `{}` (any input accepted) if omitted. Both `name` and `routine_name` are required.

**Output:**
```json
{ "ok": true }
{ "error": "..." }
```

---

### `register-partner-type`

Registers a partner type classification string (e.g., `"supplier"`, `"carrier"`). Extends the system's partner classification taxonomy. Does not require a module context — can be called from any WASM context.

**Input:**
```json
{ "partner_type": "supplier" }
```

**Output:**
```json
{ "ok": true }
{ "error": "..." }
```

---

### `register-entity-field`

Adds a field to an existing entity's SchemaForm definition. Does **not** alter the database table — the column must already exist (declared via `schema.toml` or `entities/`).

**Input:**
```json
{
  "entity_slug":    "mod_stock.products",
  "field_slug":     "supplier_id",
  "label":          "Supplier",
  "field_type":     "select",
  "required":       false,
  "tab_key":        "general",
  "tab_label":      "General",
  "position":       5,
  "fk_entity_slug": "mod_suppliers.suppliers"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `entity_slug` | ✅ | Target entity in `schema.table` format |
| `field_slug` | ✅ | Column name in the entity's table |
| `label` | ✅ | Human-readable label for the UI |
| `field_type` | ✅ | `text`, `integer`, `boolean`, `date`, `datetime`, `decimal`, `select`, `json` |
| `required` | ❌ | Client-side required validation. Default: `false` |
| `tab_key` | ❌ | Tab key from the entity's `[form]` tabs |
| `tab_label` | ❌ | Tab label (only used if `tab_key` is new) |
| `position` | ❌ | Sort order within the tab. Default: `0` |
| `fk_entity_slug` | ❌ | FK lookup entity for `select` fields |

**Output:**
```json
{ "ok": true }
{ "error": "..." }
```

---

### `create-document-type-group`

Creates a document type group — a container that organizes document types. Idempotent if the slug already exists with the same module owner.

**Input:**
```json
{
  "slug":     "fiscal",
  "label":    "Fiscal",
  "position": 0
}
```

`position` defaults to `0` if omitted.

**Output:**
```json
{ "ok": true }
{ "error": "..." }
```

---

### `create-document-type`

Creates a document type inside an existing group. `group_slug` must have been created earlier in `start()` via `create-document-type-group`, or already exist in the database.

**Input:**
```json
{
  "slug":       "nfe",
  "label":      "NF-e",
  "group_slug": "fiscal",
  "position":   0
}
```

`position` defaults to `0` if omitted.

**Output:**
```json
{ "ok": true }
{ "error": "..." }
```

---

## module-host Quick Reference

| Function | Input fields (required*) | Context | Output |
|----------|--------------------------|---------|--------|
| `register-endpoint` | `path*`, `method*`, `routine_name*`, `auth_required` | module | `{ok}` |
| `register-event-handler` | `event_slug*`, `routine_name*` | module | `{ok}` |
| `register-mcp-tool` | `name*`, `description*`, `routine_name*`, `input_schema` | module | `{ok}` |
| `register-partner-type` | `partner_type*` | any | `{ok}` |
| `register-entity-field` | `entity_slug*`, `field_slug*`, `label*`, `field_type*`, `required`, `tab_key`, `tab_label`, `position`, `fk_entity_slug` | module | `{ok}` |
| `create-document-type-group` | `slug*`, `label*`, `position` | module | `{ok}` |
| `create-document-type` | `slug*`, `label*`, `group_slug*`, `position` | module | `{ok}` |

---

## Patterns

### Validate-Before-Write (Dry-Run)

WASM host functions have no explicit rollback primitive. Each `write-entity` or `execute` call commits immediately. To implement a dry-run or preflight check, perform all validation first — before any mutating calls — and only proceed when every check passes.

```rust
// 1. Validate: check existence, business rules, quota, etc.
let existing = serde_json::from_str::<serde_json::Value>(
    &host::read_entity(r#"{"entity":"core.products","id":"..."}"#)
).unwrap();
if existing["success"] != true {
    return Err("product not found".into());
}

// 2. Only if all checks pass, mutate.
host::write_entity(r#"{"entity":"core.products","schema_version":1,"data":{...}}"#);
```

For expensive multi-step operations, structure as: validate-all → mutate-all. Any error returned before the first `write-entity` or `execute` call leaves no side effects.

---

### Atomic Multi-Row Write

Multiple sequential `write-entity` calls are **not atomic** — if call 3 fails, calls 1 and 2 have already committed. For true atomicity across several rows, use a single `execute` call with a CTE:

```rust
let sql = r#"
    WITH ins_a AS (
        INSERT INTO mod_mymodule.orders (id, customer_id)
        VALUES (gen_random_uuid(), $1)
        RETURNING id
    )
    INSERT INTO mod_mymodule.order_items (order_id, product_id, qty)
    SELECT ins_a.id, $2, $3 FROM ins_a
"#;
let params = serde_json::json!(["customer-uuid", "product-uuid", 2]).to_string();
let result = host::execute(&serde_json::json!({"sql": sql, "params": params}).to_string());
// Either both rows are inserted or neither is.
```

Limit: `execute` can only write to tables in your module's own schema (`mod_{slug}`) or schemas your module has been explicitly granted. It cannot call `write-entity` or trigger Core side-effects (audit log, event outbox) — use `write-entity` for Core entities.

---

### Testing Security Boundaries

The host fn runtime enforces security rules that WASM code cannot bypass. When writing integration tests, verify rejection paths explicitly:

**System principal cannot set `on_behalf_of`**

```bash
# Dispatch a job that calls set-audit-context with on_behalf_of set.
# The worker runs the job as a system principal (nil user_id).
# Expected: { "ok": false, "error": "system principal cannot set on_behalf_of" }
```

**Human caller scope containment (`grant-agent-permission`)**

A human caller with an `own`-scoped direct grant cannot re-grant at `company` or `global` scope. Test by dispatching a module action that calls `grant-agent-permission` with `scope="global"` from a user who only holds an `own`-scoped row for that permission. Expected: error response.

**Deny-wins override**

Insert an `is_deny=true` row for a permission, then attempt an action that requires it. The deny row must block the action even when a role-based grant also exists.

> These are E2E concerns — WASM unit tests (native Rust `#[test]` with mocked host fns) can verify your module's internal logic, but security boundary enforcement requires a live Core instance.
