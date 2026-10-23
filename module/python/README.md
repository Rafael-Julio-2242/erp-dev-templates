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

## module.toml

Edit `module.toml` before packaging:

- `[[pages]]` — HTML files shipped in the ZIP
- `[[nav.folders]]` / `[[nav.items]]` — register pages in the sidebar
- `[[routines]]` — callable server-side routines
- `[migrations]` — SQL files to run on install (`mod_{slug}` schema)

Full reference: [`../../erp-dev-templates.md`](../../erp-dev-templates.md)
