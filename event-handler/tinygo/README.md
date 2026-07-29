# ERP Event Handler Template — TinyGo (`event-handler` world)

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
make zip       # packages → my-event-handler.zip
```

## Exports

- `OnEvent(entity, trigger, data string) → string`
  - `trigger` values: `"created"` | `"updated"` | `"deleted"`
