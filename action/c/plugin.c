#include "bindings/erp_core.h"
#include <string.h>

static void set_str(erp_core_string_t *s, const char *lit) {
    s->ptr = (uint8_t *)lit;
    s->len = strlen(lit);
}

void exports_erp_core_component_action_execute(erp_core_string_t *input, erp_core_string_t *ret) {
    set_str(ret, "{\"success\":true,\"data\":null}");
}
