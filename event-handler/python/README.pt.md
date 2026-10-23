# Template de Event Handler ERP — Python (world `event-handler`)

## Ferramentas

```bash
pip install componentize-py
```

## Build

```bash
make bindings  # gera bindings Python em wit_world/
make build     # compila → module.wasm
make zip       # empacota → my-event-handler.zip
```

## Exportações

- `on_event(entity: str, trigger: str, data: str) → str`
  - valores de `trigger`: `"created"` | `"updated"` | `"deleted"`
