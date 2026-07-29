# erp-module-templates

WebAssembly Component Model templates for ERP Core modules. Pick language × world, run `make build`, upload ZIP.

## Worlds

| World | Description | Exports |
|-------|-------------|---------|
| `module/` | Full lifecycle module | `start`, `stop`, `call-routine`, `call-endpoint`, `call-event` |
| `action/` | Single-shot action | `execute(input) → string` |
| `event-handler/` | Entity event hook | `on-event(entity, trigger, data) → string` |

## Languages

| Language | Toolchain | Target |
|----------|-----------|--------|
| Rust | `cargo-component` | wasm32-wasip2 |
| TypeScript | `jco` + `componentize-js` | wasm32-wasip2 |
| TinyGo | `tinygo` + `wit-bindgen-go` | wasip2 |
| Python | `componentize-py` | wasm32 |
| C# | .NET 10 + BA WASM SDK | wasi-wasm |
| C | `wasi-sdk` + `wasm-tools` | wasm32-wasip1 + adapt |

## Quick Start

```bash
# Example: Rust module
cd module/rust
make build   # → module.wasm
make zip     # → my-module.zip
```

Upload `my-module.zip` to ERP Core via `/api/modules/install`.

## Transport

All functions use JSON strings. Standard response:

```json
{ "success": bool, "data": string | null, "message": string }
```

## WIT Contract

`wit/erp-core.wit` — canonical source (`erp-core:component@0.1.0`).
Each template embeds a copy under its own `wit/` folder.
