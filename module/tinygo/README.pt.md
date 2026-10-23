# Template de Módulo ERP — TinyGo (world `module`)

## Ferramentas

```bash
# TinyGo >= 0.33: https://tinygo.org/getting-started/install/
go install go.bytecodealliance.org/cmd/wit-bindgen-go@latest
cargo install wasm-tools
go mod download
```

## Build

```bash
make bindings  # gera gen/ a partir de wit/
make build     # compila → module.wasm
make zip       # empacota → my-module.zip (envie ao ERP Core)
```

> `gen/` é ignorado pelo git. Sempre execute `make bindings` antes de `make build`.

## Exportações

- `Start() → string`
- `Stop() → string`
- `CallRoutine(name, input string) → string`
- `CallEndpoint(name, method, path, body, headers string) → string`
- `CallEvent(name, trigger, entity, data string) → string`

## module.toml

Edite `module.toml` antes de empacotar:

- `[[pages]]` — arquivos HTML incluídos no ZIP
- `[[nav.folders]]` / `[[nav.items]]` — registra páginas na barra lateral
- `[[routines]]` — rotinas chamáveis no servidor
- `[migrations]` — arquivos SQL executados na instalação (schema `mod_{slug}`)

Referência completa: [`../../erp-dev-templates.md`](../../erp-dev-templates.md)
