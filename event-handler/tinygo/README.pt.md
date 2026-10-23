# Template de Event Handler ERP — TinyGo (world `event-handler`)

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
make zip       # empacota → my-event-handler.zip
```

## Exportações

- `OnEvent(entity, trigger, data string) → string`
  - valores de `trigger`: `"created"` | `"updated"` | `"deleted"`
