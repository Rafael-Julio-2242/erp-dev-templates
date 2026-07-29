# ERP Event Handler Template — C (`event-handler` world)

## Toolchain

```bash
# wasi-sdk: https://github.com/WebAssembly/wasi-sdk/releases
export WASI_SDK=/path/to/wasi-sdk

cargo install wit-bindgen-cli
cargo install wasm-tools

# Download wasi_snapshot_preview1.reactor.wasm → adapters/ (from wasmtime releases)
# https://github.com/bytecodealliance/wasmtime/releases
mkdir -p adapters
```

## Build

```bash
make bindings  # generates bindings/ from wit/
make build     # compiles → module.wasm
make zip       # packages → my-event-handler.zip
```

> `bindings/` is gitignored. Always run `make bindings` before `make build`.
> Build is two steps: compile to wasm32-wasip1 core, then adapt to Component Model via `wasm-tools`.

## Exports

- `on-event(entity: string, trigger: string, data: string) → string`
  - `trigger` values: `"created"` | `"updated"` | `"deleted"`

## Response format

```json
{ "success": true }
```
