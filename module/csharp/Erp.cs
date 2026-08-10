// ERP host function helpers.
// Parse the JSON string returned by any host fn into a typed record.

using System.Text.Json;
using System.Text.Json.Nodes;

namespace MyModule;

// ── Standard envelope: {success, data, message} ───────────────────────────────
// Used by: read-entity, list-entities, write-entity, delete-entity, emit-event,
//          http-request, get-time, random-uuid, cache-get, cache-set, cache-delete

public record HostResult(bool Success, JsonNode? Data, string Message);

// ── Query envelope: {rows} or {error} ────────────────────────────────────────
// Used by: query

public record QueryResult(JsonArray Rows, string? Error);

// ── Execute envelope: {affected} or {error} ───────────────────────────────────
// Used by: execute

public record ExecuteResult(long Affected, string? Error);

public static class Erp
{
    public static HostResult ParseResult(string raw)
    {
        try
        {
            var obj = JsonNode.Parse(raw);
            return new HostResult(
                Success: obj?["success"]?.GetValue<bool>() ?? false,
                Data:    obj?["data"],
                Message: obj?["message"]?.GetValue<string>() ?? string.Empty
            );
        }
        catch
        {
            return new HostResult(false, null, $"invalid json: {raw}");
        }
    }

    public static QueryResult ParseQuery(string raw)
    {
        try
        {
            var obj = JsonNode.Parse(raw);
            if (obj?["error"] is JsonNode e)
                return new QueryResult([], e.GetValue<string>());
            return new QueryResult(obj?["rows"]?.AsArray() ?? [], null);
        }
        catch (Exception e)
        {
            return new QueryResult([], e.Message);
        }
    }

    public static ExecuteResult ParseExecute(string raw)
    {
        try
        {
            var obj = JsonNode.Parse(raw);
            if (obj?["error"] is JsonNode e)
                return new ExecuteResult(0, e.GetValue<string>());
            return new ExecuteResult(obj?["affected"]?.GetValue<long>() ?? 0, null);
        }
        catch (Exception e)
        {
            return new ExecuteResult(0, e.Message);
        }
    }

    // ── Response builders ─────────────────────────────────────────────────────

    public static string Ok(object? data = null) =>
        JsonSerializer.Serialize(new { success = true, data, message = "" });

    public static string Err(string message) =>
        JsonSerializer.Serialize(new { success = false, data = (object?)null, message });
}
