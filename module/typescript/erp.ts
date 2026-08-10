// ERP host function helpers.
// Parse the JSON string returned by any host fn into a typed value.

// ── Standard envelope: {success, data, message} ───────────────────────────────
// Used by: read-entity, list-entities, write-entity, delete-entity, emit-event,
//          http-request, get-time, random-uuid, cache-get, cache-set, cache-delete

export interface HostResult<T = unknown> {
    success: boolean;
    data:    T | null;
    message: string;
}

export function parseResult<T = unknown>(raw: string): HostResult<T> {
    try {
        return JSON.parse(raw) as HostResult<T>;
    } catch {
        return { success: false, data: null, message: `invalid json: ${raw}` };
    }
}

// ── Query envelope: {rows} or {error} ────────────────────────────────────────
// Used by: query

export interface QueryResult<T = Record<string, unknown>> {
    rows:  T[];
    error: string | null;
}

export function parseQuery<T = Record<string, unknown>>(raw: string): QueryResult<T> {
    try {
        const v = JSON.parse(raw);
        if (v.error) return { rows: [], error: String(v.error) };
        return { rows: Array.isArray(v.rows) ? (v.rows as T[]) : [], error: null };
    } catch {
        return { rows: [], error: `parse error: ${raw}` };
    }
}

// ── Execute envelope: {affected} or {error} ───────────────────────────────────
// Used by: execute

export interface ExecuteResult {
    affected: number;
    error:    string | null;
}

export function parseExecute(raw: string): ExecuteResult {
    try {
        const v = JSON.parse(raw);
        if (v.error) return { affected: 0, error: String(v.error) };
        return { affected: typeof v.affected === "number" ? v.affected : 0, error: null };
    } catch {
        return { affected: 0, error: `parse error: ${raw}` };
    }
}

// ── Response builders ─────────────────────────────────────────────────────────

export function ok(data: unknown = null): string {
    return JSON.stringify({ success: true, data, message: "" });
}

export function err(message: string): string {
    return JSON.stringify({ success: false, data: null, message });
}
