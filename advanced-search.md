# Advanced Search — Filter Reference

All search endpoints (`POST /api/<domain>/search`) and the `list-entities` WASM host function share the same filter system. This document explains every field, operator, grouping rule, and common mistake.

---

## Request Shape

```json
{
  "filters": [ <FilterClause>, ... ],
  "limit":   50,
  "offset":  0
}
```

`filters` is **required and cannot be empty**. `limit` defaults to 50 (max 500 for HTTP endpoints, max 200 for `list-entities`). `offset` defaults to 0.

---

## FilterClause Fields

```json
{
  "order": 1,
  "group": 1,
  "field": "name",
  "op":    "like",
  "value": "%acme%",
  "logic": "and"
}
```

| Field   | Type    | Required | Notes |
|---------|---------|----------|-------|
| `order` | integer | ✅ | Unique across all filters. Determines evaluation order (lowest first). |
| `group` | integer | ✅ | Filters with the same consecutive `group` are parenthesised together. |
| `field` | string  | ✅ | Column name. Must be in the endpoint's allowlist. |
| `op`    | string  | ✅ | See operators below. |
| `value` | any     | ⚠️ | Required for all ops except `is_null` / `not_null`. Array for `in` / `not_in`. |
| `logic` | string  | ⚠️ | `"and"` or `"or"`. Required on every filter **except the one with the lowest `order`**. |

---

## Operators

| `op`             | SQL produced           | `value` required | `value` shape |
|------------------|------------------------|------------------|---------------|
| `eq`             | `col = $1`             | ✅ | scalar |
| `neq`            | `col <> $1`            | ✅ | scalar |
| `like`           | `col ILIKE $1`         | ✅ | scalar with `%` wildcards |
| `starts_with`    | `col ILIKE $1%`        | ✅ | scalar (no `%` needed) |
| `not_starts_with`| `col NOT ILIKE $1%`    | ✅ | scalar (no `%` needed) |
| `in`             | `col = ANY($1)`        | ✅ | array |
| `not_in`         | `col <> ALL($1)`       | ✅ | array |
| `is_null`        | `col IS NULL`          | ❌ | omit `value` entirely |
| `not_null`       | `col IS NOT NULL`      | ❌ | omit `value` entirely |

**`like` is case-insensitive** (uses `ILIKE`). Use `%` for wildcard:
- `"%acme%"` — contains
- `"acme%"` — starts with (same as `starts_with`)
- `"%acme"` — ends with

**`starts_with` / `not_starts_with`** automatically append `%` — do not include it yourself.

---

## How `order` Works

`order` controls which filter is "first". The filter with the **lowest `order`** never needs `logic` — there is nothing before it to combine with. Every other filter requires `logic`.

Orders must be **unique across all filters**. Non-consecutive values are fine (`1, 10, 20`).

```json
// ✅ correct — order 1 has no logic, order 2 and 3 do
{ "order": 1, "group": 1, "field": "status", "op": "eq", "value": "active" },
{ "order": 2, "group": 1, "field": "role",   "op": "eq", "value": "admin", "logic": "or" },
{ "order": 3, "group": 2, "field": "email",  "op": "like", "value": "%@company.com%", "logic": "and" }
```

```json
// ❌ wrong — duplicate order values
{ "order": 1, ... },
{ "order": 1, ... }   // → 422 validation error
```

```json
// ❌ wrong — missing logic on non-first filter
{ "order": 1, "group": 1, "field": "status", "op": "eq", "value": "active" },
{ "order": 2, "group": 1, "field": "role",   "op": "eq", "value": "admin" }
// → 422: logic is required when order > 1
```

---

## How `group` Works

`group` controls **parenthesisation**. Consecutive filters sharing the same `group` value are wrapped in parentheses and evaluated together. Groups are then connected by the `logic` of the **first filter of the next group**.

### Example — `(A OR B) AND C`

```json
[
  { "order": 1, "group": 1, "field": "status", "op": "eq", "value": "pending" },
  { "order": 2, "group": 1, "field": "status", "op": "eq", "value": "draft",   "logic": "or" },
  { "order": 3, "group": 2, "field": "owner",  "op": "eq", "value": "alice",   "logic": "and" }
]
```

SQL produced:
```sql
WHERE (status = 'pending' OR status = 'draft') AND owner = 'alice'
```

- Group 1 has two filters → parenthesised
- The `logic: "and"` on filter 3 connects group 2 to group 1

### Example — `A AND (B OR C)`

```json
[
  { "order": 1, "group": 1, "field": "is_active", "op": "eq",   "value": "true" },
  { "order": 2, "group": 2, "field": "role",       "op": "eq",   "value": "admin", "logic": "and" },
  { "order": 3, "group": 2, "field": "role",       "op": "eq",   "value": "owner", "logic": "or" }
]
```

SQL produced:
```sql
WHERE is_active = 'true' AND (role = 'admin' OR role = 'owner')
```

### Groups must be consecutive

**Non-consecutive group numbers create separate groups**, even if they share the same number. The grouping is based on runs of equal values in order-sorted position, not on the number itself.

```json
// These three filters produce THREE groups, not two:
{ "order": 1, "group": 1, ... },
{ "order": 2, "group": 2, ..., "logic": "and" },
{ "order": 3, "group": 1, ..., "logic": "and" }   // new run of group 1 — treated as a new group
```

To avoid confusion, use **sequential group numbers** and keep all filters of the same group adjacent in the array.

---

## Single-Filter Requests

A request with a single filter is valid. No `logic` needed.

```json
{
  "filters": [
    { "order": 1, "group": 1, "field": "name", "op": "like", "value": "%invoice%" }
  ],
  "limit": 50,
  "offset": 0
}
```

---

## Common Examples

### Search by name (contains)

```json
{
  "filters": [
    { "order": 1, "group": 1, "field": "name", "op": "like", "value": "%acme%" }
  ]
}
```

### Filter by list of values

```json
{
  "filters": [
    { "order": 1, "group": 1, "field": "status", "op": "in", "value": ["active", "pending"] }
  ]
}
```

### Exclude nulls

```json
{
  "filters": [
    { "order": 1, "group": 1, "field": "deleted_at", "op": "is_null" }
  ]
}
```

### Active users named "João" or with admin role

```json
{
  "filters": [
    { "order": 1, "group": 1, "field": "is_active", "op": "eq",   "value": "true" },
    { "order": 2, "group": 2, "field": "name",       "op": "like", "value": "%João%", "logic": "and" },
    { "order": 3, "group": 2, "field": "role",       "op": "eq",   "value": "admin",  "logic": "or" }
  ]
}
```

SQL: `WHERE is_active = 'true' AND (name ILIKE '%João%' OR role = 'admin')`

### Pagination

```json
{
  "filters": [
    { "order": 1, "group": 1, "field": "is_active", "op": "eq", "value": "true" }
  ],
  "limit":  20,
  "offset": 40
}
```

---

## In WASM Modules (`list-entities`)

The filter shape is identical. Pass it inside the `list-entities` host function payload:

```rust
// Rust example
let input = serde_json::json!({
    "entity": "custom.orders",
    "filters": [
        {
            "order": 1,
            "group": 1,
            "field": "status",
            "op":    "in",
            "value": ["pending", "processing"]
        }
    ],
    "sort_by":    "created_at",
    "sort_order": "desc",
    "limit":  50,
    "offset": 0
});
let raw = host::list_entities(&input.to_string());
let resp: serde_json::Value = serde_json::from_str(&raw).unwrap();
// resp.success, resp.data → array of records
```

**`list-entities` limits:** `limit` max 200 (not 500). Same filter rules apply.

**Field names** must be in the entity's field allowlist. For custom entities, use the slug defined in the schema (e.g., `status`, `total`, `created_at`). Built-in fields like `id`, `company_id`, `created_at`, `updated_at` are always available.

---

## Validation Errors

The server returns `422` with a `fields` array describing exactly what is wrong:

```json
{
  "error":  "request.validation_failed",
  "status": 422,
  "fields": [
    { "field": "filters[order=2].logic", "message": "logic is required when order > 1" },
    { "field": "filters[order=3].value", "message": "op 'like' requires a value" }
  ]
}
```

Common mistakes and their error messages:

| Mistake | Error |
|---------|-------|
| Duplicate `order` values | `order values must be unique` |
| Missing `logic` on non-first filter | `logic is required when order > 1` |
| `in` / `not_in` with scalar `value` | `in/not_in require an array value` |
| `like` / `eq` / etc. without `value` | `op 'X' requires a value` |
| `limit` > 500 | `limit cannot exceed 500` |
| Empty `filters` array | `filters cannot be empty` |
| Field not in allowlist | `unknown field: X` |
