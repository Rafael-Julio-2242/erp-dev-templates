# Template de Módulo ERP — C (world `module`)

## Ferramentas

```bash
# 1. wasi-sdk: https://github.com/WebAssembly/wasi-sdk/releases
#    Defina a variável de ambiente:
export WASI_SDK=/path/to/wasi-sdk

# 2. wit-bindgen e wasm-tools:
cargo install wit-bindgen-cli
cargo install wasm-tools

# 3. Adapter WASI — baixe dos releases do wasmtime:
mkdir -p adapters
# Substitua vX.Y.Z pela versão mais recente do wasmtime:
# https://github.com/bytecodealliance/wasmtime/releases
# Baixe: wasi_snapshot_preview1.reactor.wasm → adapters/
```

## Build

```bash
make bindings  # gera bindings/ a partir de wit/
make build     # compila wasm32-wasip1 core → adapta para Component → module.wasm
make zip       # empacota → my-module.zip (envie ao ERP Core)
```

> `bindings/` é ignorado pelo git. Sempre execute `make bindings` antes de `make build`.
> O build é feito em duas etapas: compilar para o core wasm32-wasip1, depois adaptar para o Component Model via `wasm-tools`.

## Exportações

- `start() → string`
- `stop() → string`
- `call-routine(name, input) → string`
- `call-endpoint(name, method, path, body, headers) → string`
- `call-event(name, trigger, entity, data) → string`

## Importações

`erp-core:component/host` + `erp-core:component/module-host`

## module.toml

Edite `module.toml` antes de empacotar:

- `[[pages]]` — arquivos HTML incluídos no ZIP
- `[[nav.folders]]` / `[[nav.items]]` — registra páginas na barra lateral
- `[[routines]]` — rotinas chamáveis no servidor
- `[migrations]` — arquivos SQL executados na instalação (schema `mod_{slug}`)

Referência completa: [`../../erp-dev-templates.md`](../../erp-dev-templates.md)
