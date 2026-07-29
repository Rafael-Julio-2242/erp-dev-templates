mod bindings;
use bindings::erp_core::component::host;

struct Component;
impl bindings::Guest for Component {
    fn execute(input: String) -> String {
        // input = JSON with action params
        r#"{"success":true,"data":null}"#.into()
    }
}
bindings::export!(Component with_types_in bindings);
