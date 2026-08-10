/*
 * ERP host function helpers.
 * Requires a JSON library. This file uses cJSON (https://github.com/DaveGamble/cJSON).
 * Add cJSON.c + cJSON.h to your project and include them before this header.
 *
 * Example usage:
 *   cJSON *obj = cJSON_Parse(raw_string);
 *   HostResult r = erp_parse_result(obj);
 *   if (r.success) { ... }
 *   cJSON_Delete(obj);
 */

#pragma once
#include <stdint.h>
#include "cJSON.h"

/* ── Standard envelope: {success, data, message} ────────────────────────────
   Used by: read-entity, list-entities, write-entity, delete-entity, emit-event,
            http-request, get-time, random-uuid, cache-get, cache-set, cache-delete */

typedef struct {
    int     success;    /* 1 = true, 0 = false */
    cJSON  *data;       /* may be NULL; owned by the parent cJSON object */
    const char *message;
} HostResult;

static inline HostResult erp_parse_result(cJSON *obj) {
    HostResult r = {0, NULL, ""};
    if (!obj) return r;
    cJSON *s = cJSON_GetObjectItemCaseSensitive(obj, "success");
    cJSON *d = cJSON_GetObjectItemCaseSensitive(obj, "data");
    cJSON *m = cJSON_GetObjectItemCaseSensitive(obj, "message");
    r.success = cJSON_IsTrue(s) ? 1 : 0;
    r.data    = (d && !cJSON_IsNull(d)) ? d : NULL;
    r.message = (cJSON_IsString(m) && m->valuestring) ? m->valuestring : "";
    return r;
}

/* ── Query envelope: {rows} or {error} ──────────────────────────────────────
   Used by: query */

typedef struct {
    cJSON      *rows;   /* cJSON array, may be NULL on error */
    const char *error;  /* NULL when no error */
} QueryResult;

static inline QueryResult erp_parse_query(cJSON *obj) {
    QueryResult r = {NULL, NULL};
    if (!obj) { r.error = "invalid json"; return r; }
    cJSON *e = cJSON_GetObjectItemCaseSensitive(obj, "error");
    if (cJSON_IsString(e) && e->valuestring) { r.error = e->valuestring; return r; }
    r.rows = cJSON_GetObjectItemCaseSensitive(obj, "rows");
    return r;
}

/* ── Execute envelope: {affected} or {error} ────────────────────────────────
   Used by: execute */

typedef struct {
    int64_t     affected;
    const char *error;
} ExecuteResult;

static inline ExecuteResult erp_parse_execute(cJSON *obj) {
    ExecuteResult r = {0, NULL};
    if (!obj) { r.error = "invalid json"; return r; }
    cJSON *e = cJSON_GetObjectItemCaseSensitive(obj, "error");
    if (cJSON_IsString(e) && e->valuestring) { r.error = e->valuestring; return r; }
    cJSON *a = cJSON_GetObjectItemCaseSensitive(obj, "affected");
    if (cJSON_IsNumber(a)) r.affected = (int64_t)a->valuedouble;
    return r;
}

/* ── Quick success check (no JSON library needed) ────────────────────────────
   Use when you only need to know if the call succeeded. */

#include <string.h>
static inline int erp_is_success(const char *raw) {
    return raw && strstr(raw, "\"success\":true") != NULL;
}
