# ERP Event Handler Template — Rust (`event-handler` world)

## Toolchain

```bash
cargo install cargo-component
```

## Build

```bash
make build   # compiles → module.wasm
make zip     # packages → my-event-handler.zip
```

## Exports

- `on-event(entity: string, trigger: string, data: string) → string`
  - `trigger` values: `"created"` | `"updated"` | `"deleted"`
