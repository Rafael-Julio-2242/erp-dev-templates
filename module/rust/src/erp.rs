// ERP host function helpers.
// Parse the JSON string returned by any host fn into a typed struct.

use serde_json::Value;

// ── Standard envelope: {success, data, message} ───────────────────────────────
// Used by: read-entity, list-entities, write-entity, delete-entity, emit-event,
//          http-request, get-time, random-uuid, cache-get, cache-set, cache-delete

pub struct HostResult {
    pub success: bool,
    pub data:    Option<Value>,
    pub message: String,
}

pub fn parse_result(raw: &str) -> HostResult {
    let v: Value = serde_json::from_str(raw).unwrap_or_default();
    HostResult {
        success: v["success"].as_bool().unwrap_or(false),
        data:    v.get("data").cloned().and_then(|d| if d.is_null() { None } else { Some(d) }),
        message: v["message"].as_str().unwrap_or("").to_string(),
    }
}

// ── Query envelope: {rows} or {error} ────────────────────────────────────────
// Used by: query

pub struct QueryResult {
    pub rows:  Vec<Value>,
    pub error: Option<String>,
}

pub fn parse_query(raw: &str) -> QueryResult {
    let v: Value = serde_json::from_str(raw).unwrap_or_default();
    if let Some(e) = v.get("error") {
        return QueryResult { rows: vec![], error: Some(e.as_str().unwrap_or("unknown error").to_string()) };
    }
    QueryResult {
        rows:  v["rows"].as_array().cloned().unwrap_or_default(),
        error: None,
    }
}

// ── Execute envelope: {affected} or {error} ───────────────────────────────────
// Used by: execute

pub struct ExecuteResult {
    pub affected: i64,
    pub error:    Option<String>,
}

pub fn parse_execute(raw: &str) -> ExecuteResult {
    let v: Value = serde_json::from_str(raw).unwrap_or_default();
    if let Some(e) = v.get("error") {
        return ExecuteResult { affected: 0, error: Some(e.as_str().unwrap_or("unknown error").to_string()) };
    }
    ExecuteResult {
        affected: v["affected"].as_i64().unwrap_or(0),
        error:    None,
    }
}

// ── Response builders ─────────────────────────────────────────────────────────

pub fn ok(data: Value) -> String {
    serde_json::json!({ "success": true, "data": data, "message": "" }).to_string()
}

pub fn ok_null() -> String {
    r#"{"success":true,"data":null,"message":""}"#.to_string()
}

pub fn err(msg: &str) -> String {
    serde_json::json!({ "success": false, "data": null, "message": msg }).to_string()
}
