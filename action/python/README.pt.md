# Template de Action ERP — Python (world `action`)

## Ferramentas

```bash
pip install componentize-py
```

## Build

```bash
make bindings  # gera bindings Python em wit_world/
make build     # compila → module.wasm
make zip       # empacota → my-action.zip
```

## Exportações

- `execute(input: str) → str` — entrada/saída são strings JSON
