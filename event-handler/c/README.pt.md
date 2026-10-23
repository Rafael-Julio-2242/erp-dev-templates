# Template de Event Handler ERP — C (world `event-handler`)

## Ferramentas

```bash
# wasi-sdk: https://github.com/WebAssembly/wasi-sdk/releases
export WASI_SDK=/path/to/wasi-sdk

cargo install wit-bindgen-cli
cargo install wasm-tools

# Baixe wasi_snapshot_preview1.reactor.wasm → adapters/ (dos releases do wasmtime)
# https://github.com/bytecodealliance/wasmtime/releases
mkdir -p adapters
```

## Build

```bash
make bindings  # gera bindings/ a partir de wit/
make build     # compila → module.wasm
make zip       # empacota → my-event-handler.zip
```

> `bindings/` é ignorado pelo git. Sempre execute `make bindings` antes de `make build`.
> O build é feito em duas etapas: compilar para o core wasm32-wasip1, depois adaptar para o Component Model via `wasm-tools`.

## Exportações

- `on-event(entity: string, trigger: string, data: string) → string`
  - valores de `trigger`: `"created"` | `"updated"` | `"deleted"`

## Formato de resposta

```json
{ "success": true }
```
