import wit_world
from wit_world.imports.host import log
from erp import parse_result, parse_query, parse_execute, ok, err

class WitWorld(wit_world.WitWorld):
    def start(self) -> str:
        log("info", "module started")
        return '{"success":true,"data":null,"message":"ok"}'
    def stop(self) -> str:
        return '{"success":true}'
    def call_routine(self, name: str, input: str) -> str:
        return '{"success":false,"message":"not implemented"}'
    def call_endpoint(self, name: str, method: str, path: str, body: str, headers: str) -> str:
        return '{"success":false,"message":"not implemented"}'
    def call_event(self, name: str, trigger: str, entity: str, data: str) -> str:
        return '{"success":false,"message":"not implemented"}'
