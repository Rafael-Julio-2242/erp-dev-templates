# Template de Módulo ERP — Rust (world `module`)

## Ferramentas

```bash
cargo install cargo-component
```

## Build

```bash
make build   # compila → module.wasm
make zip     # empacota → my-module.zip (envie ao ERP Core)
```

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
