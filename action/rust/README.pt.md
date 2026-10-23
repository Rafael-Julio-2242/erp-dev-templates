# Template de Action ERP — Rust (world `action`)

## Ferramentas

```bash
cargo install cargo-component
```

## Build

```bash
make build   # compila → module.wasm
make zip     # empacota → my-action.zip
```

## Exportações

- `execute(input: string) → string` — entrada/saída são strings JSON
