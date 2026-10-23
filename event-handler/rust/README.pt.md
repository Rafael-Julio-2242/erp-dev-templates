# Template de Event Handler ERP — Rust (world `event-handler`)

## Ferramentas

```bash
cargo install cargo-component
```

## Build

```bash
make build   # compila → module.wasm
make zip     # empacota → my-event-handler.zip
```

## Exportações

- `on-event(entity: string, trigger: string, data: string) → string`
  - valores de `trigger`: `"created"` | `"updated"` | `"deleted"`
