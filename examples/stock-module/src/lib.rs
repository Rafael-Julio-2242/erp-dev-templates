// Stock Manager — example ERP module
//
// Demonstrates how to use all major host functions.
// See host-fn-reference.md for the complete JSON contract for each function.
//
// Build: cargo component build --release
// Deploy: cp target/wasm32-wasip2/release/stock_module.wasm module.wasm && make zip

mod bindings;
use bindings::erp_core::component::host;

struct Component;

impl bindings::Guest for Component {
    // Called once when the module is installed or the server restarts.
    // Use this to register endpoints and event handlers.
    // Runs with is_superuser = true (no user context at boot time).
    fn start() -> String {
        host::log("info", "[stock] module starting");

        // Register a custom HTTP endpoint.
        // After registration, POST /api/module/stock/low-stock will invoke call_endpoint("low-stock", ...).
        let endpoint_reg = serde_json::json!({
            "name":        "low-stock",
            "method":      "GET",
            "path":        "/low-stock",
            "description": "Returns all products below their stock threshold"
        });
        host::register_endpoint(&endpoint_reg.to_string());

        // Register an event handler for the "order.created" event.
        // When that event fires, call_event("order.created", ...) will be invoked.
        let event_reg = serde_json::json!({
            "event_type":  "order.created",
            "handler_name": "on_order_created"
        });
        host::register_event_handler(&event_reg.to_string());

        host::log("info", "[stock] module ready");
        r#"{"success":true,"data":null,"message":"ok"}"#.into()
    }

    fn stop() -> String {
        host::log("info", "[stock] module stopped");
        r#"{"success":true,"data":null,"message":"ok"}"#.into()
    }

    // Dispatcher for named routines declared in module.toml.
    // `name` matches the routine's `name` field; `input` is arbitrary JSON.
    fn call_routine(name: String, input: String) -> String {
        match name.as_str() {
            "check_low_stock"  => check_low_stock(&input),
            "restock_product"  => restock_product(&input),
            _ => err_response(&format!("unknown routine: {name}")),
        }
    }

    // Dispatcher for registered HTTP endpoints.
    // `name` is the endpoint name from register_endpoint; `body` and `headers` are JSON strings.
    fn call_endpoint(name: String, method: String, path: String, body: String, headers: String) -> String {
        let _ = (method, path, headers);
        match name.as_str() {
            "low-stock" => endpoint_low_stock(&body),
            _ => err_response(&format!("unknown endpoint: {name}")),
        }
    }

    // Dispatcher for registered event handlers.
    // `name` is the handler_name from register_event_handler; `data` is the event payload JSON.
    fn call_event(name: String, trigger: String, entity: String, data: String) -> String {
        let _ = (trigger, entity);
        match name.as_str() {
            "on_order_created" => on_order_created(&data),
            _ => err_response(&format!("unknown event handler: {name}")),
        }
    }
}

// ── Routines ──────────────────────────────────────────────────────────────────

fn check_low_stock(_input: &str) -> String {
    // query: SELECT — returns { "rows": [...] } or { "error": "..." }
    let q = serde_json::json!({
        "sql":    "SELECT id, name, quantity, threshold FROM mod_stock.products WHERE quantity < threshold",
        "params": []
    });

    let raw = host::query(&q.to_string());
    let result: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v)  => v,
        Err(e) => return err_response(&format!("query parse error: {e}")),
    };

    if let Some(err) = result.get("error") {
        return err_response(&err.as_str().unwrap_or("query failed"));
    }

    let rows = result.get("rows").cloned().unwrap_or(serde_json::json!([]));
    ok_response(rows)
}

fn restock_product(input: &str) -> String {
    let payload: serde_json::Value = match serde_json::from_str(input) {
        Ok(v)  => v,
        Err(e) => return err_response(&format!("invalid input: {e}")),
    };

    let product_id = match payload["product_id"].as_str() {
        Some(id) => id.to_string(),
        None     => return err_response("product_id is required"),
    };

    let delta = match payload["delta"].as_i64() {
        Some(d) if d > 0 => d,
        _ => return err_response("delta must be a positive integer"),
    };

    // read-entity: read current product state
    // entity must use the "schema.table" format (must contain a dot)
    let read_req = serde_json::json!({
        "entity": "mod_stock.products",
        "id":     product_id
    });
    let raw = host::read_entity(&read_req.to_string());
    let read_res: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();

    if !read_res["success"].as_bool().unwrap_or(false) {
        return err_response("product not found");
    }

    let product = &read_res["data"];
    let current_qty = product["quantity"].as_i64().unwrap_or(0);
    let new_qty     = current_qty + delta;

    // write-entity UPDATE: include "id" to update an existing record
    let write_req = serde_json::json!({
        "entity":         "mod_stock.products",
        "schema_version": 1,
        "id":             product_id,
        "data":           { "quantity": new_qty }
    });
    let raw = host::write_entity(&write_req.to_string());
    let write_res: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();

    if !write_res["success"].as_bool().unwrap_or(false) {
        return err_response("failed to update product");
    }

    // execute: INSERT into stock_movements (audit trail of quantity changes)
    // Use execute for operations not tied to a registered entity.
    // Prefer write-entity for registered entities (triggers audit log + outbox).
    let mov_req = serde_json::json!({
        "sql":    "INSERT INTO mod_stock.stock_movements (product_id, company_id, delta, reason) VALUES ($1, $2, $3, $4)",
        "params": [product_id, product["company_id"].as_str().unwrap_or(""), delta.to_string(), "manual restock"]
    });
    host::execute(&mov_req.to_string());

    // emit-event: notify subscribers that stock was replenished
    let event_req = serde_json::json!({
        "event_type": "stock.restocked",
        "payload": {
            "product_id": product_id,
            "old_qty":    current_qty,
            "new_qty":    new_qty,
            "delta":      delta
        }
    });
    host::emit_event(&event_req.to_string());

    ok_response(serde_json::json!({
        "product_id": product_id,
        "old_qty":    current_qty,
        "new_qty":    new_qty
    }))
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

fn endpoint_low_stock(_body: &str) -> String {
    // list-entities with filter: quantity < threshold
    // filter op "neq" / "eq" / "like" / "in" / "is_null" / etc. — see host-fn-reference.md
    let req = serde_json::json!({
        "entity": "mod_stock.products",
        "filters": [
            {
                "order": 1,
                "group": 1,
                "field": "quantity",
                "op":    "neq",
                "value": 0,
                "logic": "and"
            }
        ],
        "sort_by":    "quantity",
        "sort_order": "asc",
        "limit":      100,
        "offset":     0
    });

    let raw = host::list_entities(&req.to_string());
    let res: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();

    if !res["success"].as_bool().unwrap_or(false) {
        return err_response(res["message"].as_str().unwrap_or("list failed"));
    }

    // Endpoint responses are returned directly to the HTTP caller.
    serde_json::json!({
        "products": res["data"],
        "count":    res["data"].as_array().map(|a| a.len()).unwrap_or(0)
    }).to_string()
}

// ── Event handlers ────────────────────────────────────────────────────────────

fn on_order_created(data: &str) -> String {
    // data is the event payload from emit-event's "payload" field
    let payload: serde_json::Value = match serde_json::from_str(data) {
        Ok(v)  => v,
        Err(e) => return err_response(&format!("invalid event data: {e}")),
    };

    let items = match payload["items"].as_array() {
        Some(i) => i.clone(),
        None    => return ok_response(serde_json::json!({"skipped": "no items"})),
    };

    // For each ordered item, decrement stock using execute
    for item in &items {
        let product_id = item["product_id"].as_str().unwrap_or("");
        let qty        = item["quantity"].as_i64().unwrap_or(0);

        if product_id.is_empty() || qty == 0 {
            continue;
        }

        let exec_req = serde_json::json!({
            "sql":    "UPDATE mod_stock.products SET quantity = quantity - $1 WHERE id = $2 AND quantity >= $1",
            "params": [qty.to_string(), product_id]
        });
        let raw = host::execute(&exec_req.to_string());
        let res: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();

        // Check if stock went below threshold and emit alert
        let affected = res.get("affected").and_then(|v| v.as_i64()).unwrap_or(0);
        if affected > 0 {
            check_and_alert_low_stock(product_id);
        }
    }

    ok_response(serde_json::json!({"processed": items.len()}))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn check_and_alert_low_stock(product_id: &str) {
    // read-entity: single record by id
    let req = serde_json::json!({ "entity": "mod_stock.products", "id": product_id });
    let raw = host::read_entity(&req.to_string());
    let res: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();

    if !res["success"].as_bool().unwrap_or(false) {
        return;
    }

    let product   = &res["data"];
    let qty       = product["quantity"].as_i64().unwrap_or(0);
    let threshold = product["threshold"].as_i64().unwrap_or(10);

    if qty < threshold {
        // get-time: no input arg (WIT func() -> string); in Rust bindings called with no args
        let time_raw  = host::get_time();
        let time_res: serde_json::Value = serde_json::from_str(&time_raw).unwrap_or_default();
        let timestamp = time_res["data"]["iso8601"].as_str().unwrap_or("").to_string();

        // random-uuid: no input arg (WIT func() -> string)
        let uuid_raw = host::random_uuid();
        let uuid_res: serde_json::Value = serde_json::from_str(&uuid_raw).unwrap_or_default();
        let alert_id = uuid_res["data"]["uuid"].as_str().unwrap_or("").to_string();

        // cache-set: prevent duplicate alerts within 5 minutes
        let cache_key = format!("stock_alert_{product_id}");
        let get_raw   = host::cache_get(&serde_json::json!({ "key": cache_key }).to_string());
        let get_res: serde_json::Value = serde_json::from_str(&get_raw).unwrap_or_default();

        if get_res["success"].as_bool().unwrap_or(false) {
            return; // alert already sent recently
        }

        // emit-event: notify subscribers
        host::emit_event(&serde_json::json!({
            "event_type": "stock.low",
            "payload": {
                "alert_id":   alert_id,
                "product_id": product_id,
                "quantity":   qty,
                "threshold":  threshold,
                "detected_at": timestamp
            }
        }).to_string());

        // cache-set with 5-minute TTL to suppress duplicate alerts
        host::cache_set(&serde_json::json!({
            "key":         cache_key,
            "value":       alert_id,
            "ttl_seconds": 300
        }).to_string());

        // http-request: notify external webhook (e.g. Slack, PagerDuty)
        let webhook_url = "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK";
        host::http_request(&serde_json::json!({
            "method": "POST",
            "url":    webhook_url,
            "body": {
                "text": format!("⚠️ Low stock alert: product {} has only {} units left (threshold: {})", product_id, qty, threshold)
            }
        }).to_string());

        host::log("warn", &format!("[stock] low stock alert sent for product {product_id} (qty={qty})"));
    }
}

fn ok_response(data: serde_json::Value) -> String {
    serde_json::json!({ "success": true, "data": data, "message": "" }).to_string()
}

fn err_response(msg: &str) -> String {
    host::log("error", &format!("[stock] error: {msg}"));
    serde_json::json!({ "success": false, "data": null, "message": msg }).to_string()
}

bindings::export!(Component with_types_in bindings);
