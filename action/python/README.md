# ERP Action Template — Python (`action` world)

## Toolchain

```bash
pip install componentize-py
```

## Build

```bash
make bindings  # generates wit_world/ Python bindings
make build     # compiles → module.wasm
make zip       # packages → my-action.zip
```

## Exports

- `execute(input: str) → str` — input/output are JSON strings
