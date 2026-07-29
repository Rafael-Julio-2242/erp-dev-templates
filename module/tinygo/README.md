# ERP Module Template — TinyGo (`module` world)

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
make zip       # packages → my-module.zip (upload to ERP Core)
```

> `gen/` is gitignored. Always run `make bindings` before `make build`.

## Exports

- `Start() → string`
- `Stop() → string`
- `CallRoutine(name, input string) → string`
- `CallEndpoint(name, method, path, body, headers string) → string`
- `CallEvent(name, trigger, entity, data string) → string`
