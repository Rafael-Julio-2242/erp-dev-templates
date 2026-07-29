# ERP Action Template — Rust (`action` world)

## Toolchain

```bash
cargo install cargo-component
```

## Build

```bash
make build   # compiles → module.wasm
make zip     # packages → my-action.zip
```

## Exports

- `execute(input: string) → string` — input/output are JSON strings
