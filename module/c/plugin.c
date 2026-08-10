#include "bindings/erp_core.h"
#include "erp_helpers.h"
#include <string.h>

static void set_str(erp_core_string_t *s, const char *lit) {
    s->ptr = (uint8_t *)lit;
    s->len = strlen(lit);
}

void exports_erp_core_component_module_start(erp_core_string_t *ret) {
    erp_core_string_t lvl, msg;
    set_str(&lvl, "info"); set_str(&msg, "module started");
    erp_core_component_host_log(&lvl, &msg);
    set_str(ret, "{\"success\":true,\"data\":null,\"message\":\"ok\"}");
}
void exports_erp_core_component_module_stop(erp_core_string_t *ret) {
    set_str(ret, "{\"success\":true}");
}
void exports_erp_core_component_module_call_routine(
        erp_core_string_t *name, erp_core_string_t *input, erp_core_string_t *ret) {
    set_str(ret, "{\"success\":false,\"message\":\"not implemented\"}");
}
void exports_erp_core_component_module_call_endpoint(
        erp_core_string_t *name, erp_core_string_t *method,
        erp_core_string_t *path, erp_core_string_t *body,
        erp_core_string_t *headers, erp_core_string_t *ret) {
    set_str(ret, "{\"success\":false,\"message\":\"not implemented\"}");
}
void exports_erp_core_component_module_call_event(
        erp_core_string_t *name, erp_core_string_t *trigger,
        erp_core_string_t *entity, erp_core_string_t *data,
        erp_core_string_t *ret) {
    set_str(ret, "{\"success\":false,\"message\":\"not implemented\"}");
}
