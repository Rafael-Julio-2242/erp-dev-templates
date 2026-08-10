# ERP host function helpers.
# Parse the JSON string returned by any host fn into a typed dataclass.

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Optional

# ── Standard envelope: {success, data, message} ───────────────────────────────
# Used by: read-entity, list-entities, write-entity, delete-entity, emit-event,
#          http-request, get-time, random-uuid, cache-get, cache-set, cache-delete

@dataclass
class HostResult:
    success: bool
    data:    Optional[Any]
    message: str

def parse_result(raw: str) -> HostResult:
    try:
        v = json.loads(raw)
        return HostResult(
            success=bool(v.get("success", False)),
            data=v.get("data"),
            message=str(v.get("message", "")),
        )
    except json.JSONDecodeError as e:
        return HostResult(success=False, data=None, message=f"invalid json: {e}")

# ── Query envelope: {rows} or {error} ────────────────────────────────────────
# Used by: query

@dataclass
class QueryResult:
    rows:  list[dict[str, Any]] = field(default_factory=list)
    error: Optional[str]        = None

def parse_query(raw: str) -> QueryResult:
    try:
        v = json.loads(raw)
        if "error" in v:
            return QueryResult(error=str(v["error"]))
        return QueryResult(rows=v.get("rows", []))
    except json.JSONDecodeError as e:
        return QueryResult(error=f"parse error: {e}")

# ── Execute envelope: {affected} or {error} ───────────────────────────────────
# Used by: execute

@dataclass
class ExecuteResult:
    affected: int          = 0
    error:    Optional[str] = None

def parse_execute(raw: str) -> ExecuteResult:
    try:
        v = json.loads(raw)
        if "error" in v:
            return ExecuteResult(error=str(v["error"]))
        return ExecuteResult(affected=int(v.get("affected", 0)))
    except json.JSONDecodeError as e:
        return ExecuteResult(error=f"parse error: {e}")

# ── Response builders ─────────────────────────────────────────────────────────

def ok(data: Any = None) -> str:
    return json.dumps({"success": True, "data": data, "message": ""})

def err(message: str) -> str:
    return json.dumps({"success": False, "data": None, "message": message})
