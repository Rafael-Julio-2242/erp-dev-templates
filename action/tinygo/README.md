# ERP Action Template — TinyGo (`action` world)

## Toolchain

```bash
# TinyGo >= 0.33: https://tinygo.org/getting-started/install/
go install go.bytecodealliance.org/cmd/wit-bindgen-go@latest
cargo install wasm-tools
go mod download
```

## Build

```bash
make bindings  # generates gen/ from wit/
make build     # compiles → module.wasm
make zip       # packages → my-action.zip
```

## Exports

- `Execute(input string) → string` — input/output are JSON strings
