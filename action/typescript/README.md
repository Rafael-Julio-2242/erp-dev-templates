# ERP Action Template — TypeScript (`action` world)

## Toolchain

```bash
npm install
```

## Build

```bash
make build   # compiles → module.wasm
make zip     # packages → my-action.zip
```

## Exports

- `execute(input: string) → string` — input/output are JSON strings
