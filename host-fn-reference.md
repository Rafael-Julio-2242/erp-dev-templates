# Host Function Reference

All 23 functions from `interface host` communicate via JSON strings. This document covers exact input/output shapes, permission requirements, and gotchas.

---

## Response Envelopes

Four distinct shapes exist across the 18 functions:

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

`event_type` must match a slug registered in `meta.event_types`. Event also triggers any WASM event handlers registered via `register-event-handler`.

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
