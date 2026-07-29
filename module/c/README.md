# ERP Module Template — C (`module` world)

## Toolchain

```bash
# 1. wasi-sdk: https://github.com/WebAssembly/wasi-sdk/releases
#    Set environment variable:
export WASI_SDK=/path/to/wasi-sdk

# 2. wit-bindgen and wasm-tools:
cargo install wit-bindgen-cli
cargo install wasm-tools

# 3. WASI adapter — download from wasmtime releases:
mkdir -p adapters
# Replace vX.Y.Z with latest wasmtime version:
# https://github.com/bytecodealliance/wasmtime/releases
# Download: wasi_snapshot_preview1.reactor.wasm → adapters/
```

## Build

```bash
make bindings  # generates bindings/ from wit/
make build     # compiles wasm32-wasip1 core → adapts to Component → module.wasm
make zip       # packages → my-module.zip (upload to ERP Core)
```

> `bindings/` is gitignored. Always run `make bindings` before `make build`.
> Build is two steps: compile to wasm32-wasip1 core, then adapt to Component Model via `wasm-tools`.

## Exports

- `start() → string`
- `stop() → string`
- `call-routine(name, input) → string`
- `call-endpoint(name, method, path, body, headers) → string`
- `call-event(name, trigger, entity, data) → string`

## Imports

`erp-core:component/host` + `erp-core:component/module-host`
