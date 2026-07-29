mod bindings;
use bindings::erp_core::component::host;

struct Component;
impl bindings::Guest for Component {
    fn on_event(entity: String, trigger: String, data: String) -> String {
        // trigger = "created" | "updated" | "deleted"
        r#"{"success":true}"#.into()
    }
}
bindings::export!(Component with_types_in bindings);
