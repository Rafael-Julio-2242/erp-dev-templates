# ERP Event Handler Template — Python (`event-handler` world)

## Toolchain

```bash
pip install componentize-py
```

## Build

```bash
make bindings  # generates wit_world/ Python bindings
make build     # compiles → module.wasm
make zip       # packages → my-event-handler.zip
```

## Exports

- `on_event(entity: str, trigger: str, data: str) → str`
  - `trigger` values: `"created"` | `"updated"` | `"deleted"`
