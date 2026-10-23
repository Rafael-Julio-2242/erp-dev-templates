# Template de Event Handler ERP — TypeScript (world `event-handler`)

## Ferramentas

```bash
npm install
```

## Build

```bash
make build   # compila → module.wasm
make zip     # empacota → my-event-handler.zip
```

## Exportações

- `onEvent(entity: string, trigger: string, data: string) → string`
  - valores de `trigger`: `"created"` | `"updated"` | `"deleted"`
