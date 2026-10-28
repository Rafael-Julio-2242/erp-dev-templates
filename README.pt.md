# erp-module-templates

Templates WebAssembly Component Model para módulos ERP Core. Escolha linguagem × world, execute `make build` e faça upload do ZIP.

## Worlds

| World | Descrição | Exportações |
|-------|-----------|-------------|
| `module/` | Módulo com ciclo de vida completo | `start`, `stop`, `call-routine`, `call-endpoint`, `call-event` |
| `action/` | Ação avulsa (one-shot) | `execute(input) → string` |
| `event-handler/` | Hook de evento de entidade | `on-event(entity, trigger, data) → string` |

## Linguagens

| Linguagem | Toolchain | Target |
|-----------|-----------|--------|
| Rust | `cargo-component` | wasm32-wasip2 |
| TypeScript | `jco` + `componentize-js` | wasm32-wasip2 |
| TinyGo | `tinygo` + `wit-bindgen-go` | wasip2 |
| Python | `componentize-py` | wasm32 |
| C# | .NET 10 + BA WASM SDK | wasi-wasm |
| C | `wasi-sdk` + `wasm-tools` | wasm32-wasip1 + adapt |

## Início Rápido

```bash
# Exemplo: módulo em Rust
cd module/rust
make build   # → module.wasm
make zip     # → my-module.zip (contém module.toml + module.wasm + schema.toml + pages/)
```

Faça upload de `my-module.zip` para o ERP Core via `/api/modules/install`.

## Navegação na Barra Lateral

As páginas do módulo aparecem na barra lateral quando atribuídas a uma pasta via `module.toml`:

```toml
[[nav.folders]]
slug       = "my-module"
title      = "My Module"
parent     = "core"     # opcional — caminho da pasta pai
sort_order = 10

[[nav.items]]
page       = "my-module-dashboard"  # deve corresponder a um [[pages]] slug
folder     = "my-module"
sort_order = 0
```

As pastas são criadas na instalação e removidas na desinstalação. Páginas não atribuídas a uma pasta permanecem acessíveis, mas não aparecem na árvore da barra lateral.

## Módulos SQL-only

Módulos que não precisam de lógica WASM — apenas esquema de banco e migrations — podem definir `wasm = false` no `module.toml` e omitir `module.wasm` do ZIP:

```toml
[module]
name     = "My Module"
slug     = "mymod"
version  = "01.000.000"
min_core = "01.000.000"
wasm     = false
```

Use `schema.toml` junto com módulos SQL-only para declarar tabelas, estender tabelas do core e registrar entidades automaticamente, sem escrever migrations manuais. Veja [`schema-toml-reference.md`](schema-toml-reference.md). Para a referência completa de todas as seções do `module.toml` (rotinas, endpoints, event handlers, páginas, navegação, behaviors, tipos de documento, dependências e desinstalação), veja [`module-toml-reference.md`](module-toml-reference.md).

## Melhores Práticas

Veja [`operation-driven-modules.md`](operation-driven-modules.md) para o padrão obrigatório ao construir módulos que afetam fluxos de negócio críticos (fiscal, estoque, precificação, impressão, conformidade). A regra central: qualquer configuração que possa diferir entre duas operações na mesma empresa deve ser armazenada por `operation_id`, nunca em uma tabela de configuração global.

## Pasta entities/

A pasta opcional `entities/` (um `.toml` por entidade) é uma alternativa de alto nível ao `schema.toml` para módulos que querem tanto DDL quanto uma página SchemaForm gerada automaticamente por entidade. Arquivos com apenas `[table]` criam a tabela e registram as linhas de meta; arquivos com `[table]` + `[form]` também criam uma página SchemaForm na navegação.

Veja [`entities-folder-reference.md`](entities-folder-reference.md) para a especificação TOML completa.

## Transporte

Todas as funções usam strings JSON. Resposta padrão:

```json
{ "success": bool, "data": string | null, "message": string }
```

## Contrato WIT

`wit/erp-core.wit` — fonte canônica (`erp-core:component@0.1.0`).
Cada template embute uma cópia na própria pasta `wit/`.
