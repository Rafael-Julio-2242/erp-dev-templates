import wit_world

class WitWorld(wit_world.WitWorld):
    def on_event(self, entity: str, trigger: str, data: str) -> str:
        # trigger = "created" | "updated" | "deleted"
        return '{"success":true}'
