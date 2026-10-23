# ERP Module Template — TypeScript (`module` world)

## Toolchain

```bash
npm install
```

Or globally:

```bash
npm install -g @bytecodealliance/jco @bytecodealliance/componentize-js
```

## Build

```bash
make build   # compiles → module.wasm
make zip     # packages → my-module.zip (upload to ERP Core)
```

## Exports

- `start() → string`
- `stop() → string`
- `callRoutine(name, input) → string`
- `callEndpoint(name, method, path, body, headers) → string`
- `callEvent(name, trigger, entity, data) → string`

## Imports

`erp-core:component/host` + `erp-core:component/module-host`

## module.toml

Edit `module.toml` before packaging:

- `[[pages]]` — HTML files shipped in the ZIP
- `[[nav.folders]]` / `[[nav.items]]` — register pages in the sidebar
- `[[routines]]` — callable server-side routines
- `[migrations]` — SQL files to run on install (`mod_{slug}` schema)

Full reference: [`../../erp-dev-templates.md`](../../erp-dev-templates.md)
