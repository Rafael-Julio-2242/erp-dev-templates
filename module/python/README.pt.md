# Template de Módulo ERP — Python (world `module`)

## Ferramentas

```bash
pip install componentize-py
```

## Build

```bash
make bindings  # gera bindings Python em wit_world/
make build     # compila → module.wasm
make zip       # empacota → my-module.zip (envie ao ERP Core)
```

> `wit_world/` é ignorado pelo git. Sempre execute `make bindings` antes de `make build`.

## Exportações

- `start() → str`
- `stop() → str`
- `call_routine(name, input) → str`
- `call_endpoint(name, method, path, body, headers) → str`
- `call_event(name, trigger, entity, data) → str`

## module.toml

Edite `module.toml` antes de empacotar:

- `[[pages]]` — arquivos HTML incluídos no ZIP
- `[[nav.folders]]` / `[[nav.items]]` — registra páginas na barra lateral
- `[[routines]]` — rotinas chamáveis no servidor
- `[migrations]` — arquivos SQL executados na instalação (schema `mod_{slug}`)

Referência completa: [`../../erp-dev-templates.md`](../../erp-dev-templates.md)
