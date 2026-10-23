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
make zip     # → my-module.zip (contains module.toml + module.wasm + migrations/ + schema.toml)
```

Upload `my-module.zip` to ERP Core via `/api/modules/install`.

## Sidebar Navigation

Module pages appear in the sidebar when assigned to a folder via `module.toml`:

```toml
[[nav.folders]]
slug       = "my-module"
title      = "My Module"
parent     = "core"     # optional — path of parent folder
sort_order = 10

[[nav.items]]
page       = "my-module-dashboard"  # must match a [[pages]] slug
folder     = "my-module"
sort_order = 0
```

Folders are created on install and deleted on uninstall. Pages not assigned to a folder remain accessible but don't appear in the sidebar tree.

## SQL-only modules

Modules that need no WASM logic — only database schema and migrations — can set `wasm = false` in `module.toml` and omit `module.wasm` from the ZIP:

```toml
[module]
name     = "My Module"
slug     = "mymod"
version  = "01.000.000"
min_core = "01.000.000"
wasm     = false
```

Use `schema.toml` alongside SQL-only modules to declare tables, extend core tables, and register entities automatically without writing manual migrations. See [`schema-toml-reference.md`](schema-toml-reference.md).

## entities/ Folder

The optional `entities/` folder (one `.toml` per entity) is a higher-level alternative to `schema.toml` for modules that want both DDL and an auto-generated SchemaForm UI page per entity. Files with only `[table]` create the table and register meta rows; files with `[table]` + `[form]` also create a SchemaForm page in the navigation.

See [`entities-folder-reference.md`](entities-folder-reference.md) for the full TOML spec.

## Transport

All functions use JSON strings. Standard response:

```json
{ "success": bool, "data": string | null, "message": string }
```

## WIT Contract

`wit/erp-core.wit` — canonical source (`erp-core:component@0.1.0`).
Each template embeds a copy under its own `wit/` folder.
