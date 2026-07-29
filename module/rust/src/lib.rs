mod bindings;
use bindings::erp_core::component::host;

struct Component;
impl bindings::Guest for Component {
    fn start() -> String {
        host::log("info", "module started");
        r#"{"success":true,"data":null,"message":"ok"}"#.into()
    }
    fn stop() -> String { r#"{"success":true}"#.into() }
    fn call_routine(_name: String, _input: String) -> String {
        r#"{"success":false,"message":"not implemented"}"#.into()
    }
    fn call_endpoint(_name: String, _method: String, _path: String, _body: String, _headers: String) -> String {
        r#"{"success":false,"message":"not implemented"}"#.into()
    }
    fn call_event(_name: String, _trigger: String, _entity: String, _data: String) -> String {
        r#"{"success":false,"message":"not implemented"}"#.into()
    }
}
bindings::export!(Component with_types_in bindings);
