# ERP Event Handler Template — TypeScript (`event-handler` world)

## Toolchain

```bash
npm install
```

## Build

```bash
make build   # compiles → module.wasm
make zip     # packages → my-event-handler.zip
```

## Exports

- `onEvent(entity: string, trigger: string, data: string) → string`
  - `trigger` values: `"created"` | `"updated"` | `"deleted"`
