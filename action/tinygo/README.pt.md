# Template de Action ERP — TinyGo (world `action`)

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
make zip       # empacota → my-action.zip
```

## Exportações

- `Execute(input string) → string` — entrada/saída são strings JSON
