# Event Emission Guide

Any operation that mutates state — creating, updating, or deleting a record —
must emit an event. This is not optional. Without events, other modules cannot
react to changes, the audit trail is incomplete, and the system becomes a
tightly-coupled monolith where every integration requires direct code changes.

---

## The rule

> **Every write, every delete → one event.**

Read-only operations (queries, searches, lookups) do not emit events.
Events are only for state that changed and that other parts of the system
might care about.

---

## Event naming convention

Use dot-separated segments: `{module}.{entity}.{verb}` (past tense).

```
stock.product.created
stock.product.updated
stock.product.deleted
stock.movement.created
fiscal.nfe.issued
fiscal.nfe.cancelled
purchasing.order.approved
```

Avoid generic verbs like `changed` or `modified`. Use the most specific past-tense
verb that accurately describes what happened: `created`, `updated`, `deleted`,
`approved`, `issued`, `cancelled`, `transferred`, `reserved`.

---

## What to include in the payload

Always include:

| Field | Why |
|---|---|
| `{entity}_id` | Lets subscribers fetch the full record if needed |
| `entity_slug` | Makes generic event consumers work without hardcoding |
| `occurred_at` | When the change happened (use `get-time`) |
| `performed_by` | Who triggered it — pass through from the request context |

Include before/after values for updates whenever the old state matters:

```json
{
  "product_id":   "550e8400-...",
  "entity_slug":  "mod_stock.products",
  "old_quantity": 15,
  "new_quantity": 8,
  "delta":        -7,
  "occurred_at":  "2025-10-23T14:32:00Z",
  "performed_by": "user-uuid"
}
```

For creates and deletes, include a snapshot of the relevant fields so
subscribers do not need to query back:

```json
{
  "product_id":  "550e8400-...",
  "sku":         "PROD-001",
  "name":        "Widget A",
  "company_id":  "company-uuid",
  "occurred_at": "2025-10-23T14:32:00Z"
}
```

---

## Pattern: emit after the write succeeds

Always emit **after** the write, never before. If the write fails, no event
should fire. If the event emission fails, log a warning but do not roll back
the write — the event system is eventually consistent, not transactional.

```rust
fn create_product(input: &str) -> String {
    let payload: serde_json::Value = match serde_json::from_str(input) {
        Ok(v)  => v,
        Err(e) => return err_response(&format!("invalid input: {e}")),
    };

    // 1. Write first
    let write_req = serde_json::json!({
        "entity":         "mod_stock.products",
        "schema_version": 1,
        "data": {
            "name":       payload["name"],
            "sku":        payload["sku"],
            "quantity":   0,
            "threshold":  payload["threshold"].as_i64().unwrap_or(10)
        }
    });
    let raw = host::write_entity(&write_req.to_string());
    let res: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();

    if !res["success"].as_bool().unwrap_or(false) {
        return err_response("failed to create product");
    }

    let product_id = res["data"]["entity_id"].as_str().unwrap_or("");
    let occurred_at = {
        let t: serde_json::Value = serde_json::from_str(&host::get_time()).unwrap_or_default();
        t["data"]["iso8601"].as_str().unwrap_or("").to_string()
    };

    // 2. Emit after success — failure here is non-fatal
    let emit_res = host::emit_event(&serde_json::json!({
        "event_type": "stock.product.created",
        "payload": {
            "product_id":  product_id,
            "entity_slug": "mod_stock.products",
            "sku":         payload["sku"],
            "name":        payload["name"],
            "occurred_at": occurred_at
        }
    }).to_string());
    let emit: serde_json::Value = serde_json::from_str(&emit_res).unwrap_or_default();
    if !emit["success"].as_bool().unwrap_or(false) {
        host::log("warn", &format!("[stock] emit stock.product.created failed: {}", emit["message"]));
    }

    ok_response(serde_json::json!({ "product_id": product_id }))
}
```

---

## Pattern: emit for bulk operations

For bulk operations, emit one summary event — not one event per row. Emitting
N events for N rows floods subscribers and degrades performance.

```rust
// ✅ one summary event for a bulk stock adjustment
host::emit_event(&serde_json::json!({
    "event_type": "stock.adjustment.completed",
    "payload": {
        "batch_id":    batch_id,
        "item_count":  affected_count,
        "occurred_at": occurred_at
    }
}).to_string());

// ❌ never do this inside a loop
for item in &items {
    host::emit_event(&serde_json::json!({
        "event_type": "stock.product.updated",
        "payload": { "product_id": item["id"] }
    }).to_string());
}
```

---

## Event types must be registered

`emit-event` requires the `event_type` slug to exist in `meta.event_types`.
Register your module's event types in a migration:

```sql
-- migrations/0002_register_event_types.sql
INSERT INTO meta.event_types (slug, label, description, schema_version)
VALUES
    ('stock.product.created',  'Produto criado',   'Emitido quando um produto é cadastrado', 1),
    ('stock.product.updated',  'Produto atualizado', 'Emitido quando um produto é alterado',  1),
    ('stock.product.deleted',  'Produto removido', 'Emitido quando um produto é excluído',   1),
    ('stock.movement.created', 'Movimentação de estoque', 'Emitido a cada entrada ou saída de estoque', 1)
ON CONFLICT (slug) DO NOTHING;
```

If you skip this, `emit-event` will return `success: false` and the event
will be silently dropped.

---

## Consuming events from another module

Any module can listen to events emitted by other modules. Register the handler
in `start()` and handle in `call_event`:

```rust
fn start() -> String {
    // Listen to stock events from the stock module
    host::register_event_handler(&serde_json::json!({
        "event_type":   "stock.product.created",
        "handler_name": "on_product_created"
    }).to_string());
    r#"{"success":true,"data":null,"message":"ok"}"#.into()
}

fn call_event(name: String, _trigger: String, _entity: String, data: String) -> String {
    match name.as_str() {
        "on_product_created" => handle_product_created(&data),
        _ => err_response(&format!("unknown handler: {name}")),
    }
}

fn handle_product_created(data: &str) -> String {
    let payload: serde_json::Value = serde_json::from_str(data).unwrap_or_default();
    let product_id = payload["product_id"].as_str().unwrap_or("");
    // ... react to the new product
    ok_response(serde_json::json!({ "processed": product_id }))
}
```

---

## Summary

| Situation | Emit? |
|---|---|
| Record created via `write-entity` | Yes — `{module}.{entity}.created` |
| Record updated via `write-entity` | Yes — `{module}.{entity}.updated` |
| Record deleted via `delete-entity` or `execute` | Yes — `{module}.{entity}.deleted` |
| Bulk operation completed | Yes — one summary event |
| Query / search / read | No |
| Internal intermediate state (rolled back) | No |
| Operation step triggered (document lifecycle) | Usually no — the operation step itself is already the event |

Emit after the write. Never before. Log failures, never abort for them.
Register all event types in a migration before first use.
