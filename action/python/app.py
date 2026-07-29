import wit_world
from wit_world.imports.host import log

class WitWorld(wit_world.WitWorld):
    def execute(self, input: str) -> str:
        # input = JSON with action params
        return '{"success":true,"data":null}'
