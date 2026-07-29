#include "bindings/erp_core.h"
#include <string.h>

static void set_str(erp_core_string_t *s, const char *lit) {
    s->ptr = (uint8_t *)lit;
    s->len = strlen(lit);
}

void exports_erp_core_component_event_handler_on_event(
        erp_core_string_t *entity, erp_core_string_t *trigger,
        erp_core_string_t *data, erp_core_string_t *ret) {
    // trigger->ptr contains "created", "updated", or "deleted"
    set_str(ret, "{\"success\":true}");
}
