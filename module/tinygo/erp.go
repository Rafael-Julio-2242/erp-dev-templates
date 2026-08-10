package main

// ERP host function helpers.
// Parse the JSON string returned by any host fn into a typed struct.

import "encoding/json"

// ── Standard envelope: {success, data, message} ───────────────────────────────
// Used by: read-entity, list-entities, write-entity, delete-entity, emit-event,
//          http-request, get-time, random-uuid, cache-get, cache-set, cache-delete

type HostResult struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data"`
	Message string          `json:"message"`
}

func ParseResult(raw string) HostResult {
	var r HostResult
	json.Unmarshal([]byte(raw), &r) //nolint:errcheck
	return r
}

// ── Query envelope: {rows} or {error} ────────────────────────────────────────
// Used by: query

type QueryResult struct {
	Rows  []map[string]any
	Error string
}

func ParseQuery(raw string) QueryResult {
	var v map[string]any
	if json.Unmarshal([]byte(raw), &v) != nil {
		return QueryResult{Error: "invalid json"}
	}
	if e, ok := v["error"].(string); ok {
		return QueryResult{Error: e}
	}
	rows := []map[string]any{}
	if arr, ok := v["rows"].([]any); ok {
		for _, item := range arr {
			if m, ok := item.(map[string]any); ok {
				rows = append(rows, m)
			}
		}
	}
	return QueryResult{Rows: rows}
}

// ── Execute envelope: {affected} or {error} ───────────────────────────────────
// Used by: execute

type ExecuteResult struct {
	Affected int64
	Error    string
}

func ParseExecute(raw string) ExecuteResult {
	var v map[string]any
	if json.Unmarshal([]byte(raw), &v) != nil {
		return ExecuteResult{Error: "invalid json"}
	}
	if e, ok := v["error"].(string); ok {
		return ExecuteResult{Error: e}
	}
	if a, ok := v["affected"].(float64); ok {
		return ExecuteResult{Affected: int64(a)}
	}
	return ExecuteResult{}
}

// ── Response builders ─────────────────────────────────────────────────────────

func Ok(data any) string {
	b, _ := json.Marshal(map[string]any{"success": true, "data": data, "message": ""})
	return string(b)
}

func Err(msg string) string {
	b, _ := json.Marshal(map[string]any{"success": false, "data": nil, "message": msg})
	return string(b)
}
