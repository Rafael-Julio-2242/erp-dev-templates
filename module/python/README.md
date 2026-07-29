# ERP Module Template — Python (`module` world)

## Toolchain

```bash
pip install componentize-py
```

## Build

```bash
make bindings  # generates wit_world/ Python bindings
make build     # compiles → module.wasm
make zip       # packages → my-module.zip (upload to ERP Core)
```

> `wit_world/` is gitignored. Always run `make bindings` before `make build`.

## Exports

- `start() → str`
- `stop() → str`
- `call_routine(name, input) → str`
- `call_endpoint(name, method, path, body, headers) → str`
- `call_event(name, trigger, entity, data) → str`
