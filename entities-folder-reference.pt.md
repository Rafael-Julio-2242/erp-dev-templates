# Referência da Pasta entities/

A pasta opcional `entities/` dentro de um ZIP de módulo permite declarar tabelas e páginas SchemaForm usando um DSL TOML em vez de escrever migrations SQL manualmente.

Um arquivo `.toml` = uma entidade. O Core processa cada arquivo desta pasta na instalação, após a aplicação de `schema.toml`.

---

## Regras

- **Somente tabela** (`[table]` sem `[form]`): o Core cria a tabela no schema `mod_{slug}`, registra `meta.entity_definitions`, semeia `meta.field_definitions` para cada coluna declarada e insere automaticamente permissões `read/create/update/delete` em `core.permissions`. Nenhuma página de interface é criada.
- **Tabela + formulário** (`[table]` + `[form]`): igual ao acima, mais a criação de uma linha em `meta.page_definitions` para que a entidade apareça como página SchemaForm na navegação.
- **Idempotente**: a instalação é um no-op quando a tabela já corresponde (mesmo hash). Seguro para reinstalar.
- **Permissões**: `read`, `create`, `update`, `delete` são inseridas automaticamente para cada entidade em toda instalação com `ON CONFLICT DO NOTHING`.
- **Desinstalação**: as linhas em `meta.entity_definitions` são removidas (cascade em `field_definitions` e `page_definitions`). Tabelas em `mod_{slug}` **não são removidas**.

---

## Estrutura do ZIP

```
module-zip/
├── module.toml
├── entities/
│   ├── categories.toml   ← [table] apenas
│   └── items.toml        ← [table] + [form]
├── migrations/           ← opcional; executado antes de entities/
└── schema.toml           ← opcional; executado antes de entities/
```

---

## Seção `[table]`

```toml
[table]
name  = "products"     # identificador snake_case — vira mod_{module_slug}.products
label = "Produtos"     # rótulo legível armazenado em entity_definitions
```

### `[[table.columns]]`

Cada coluna é uma entrada `[[table.columns]]`.

```toml
[[table.columns]]
name       = "id"
type       = "uuid"
primary    = true
default    = "gen_random_uuid()"

[[table.columns]]
name     = "name"
type     = "text"
required = true
label    = "Nome"

[[table.columns]]
name       = "category_id"
type       = "uuid"
required   = true
references = "categories.id"
on_delete  = "cascade"
label      = "Categoria"

[[table.columns]]
name     = "price"
type     = "numeric(15,2)"
required = true
default  = "0"
label    = "Preço"

[[table.columns]]
name     = "active"
type     = "boolean"
required = true
default  = "true"
label    = "Ativo"

[[table.columns]]
name     = "created_at"
type     = "timestamptz"
required = true
default  = "NOW()"
```

### Campos de Coluna

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | string | ✅ | Nome da coluna em snake_case. `[a-z_][a-z0-9_]*`, máx. 63 chars. |
| `type` | string | ✅ | Veja a lista de tipos abaixo. |
| `primary` | bool | ❌ | Marca esta coluna como PRIMARY KEY. Se omitido, o Core adiciona automaticamente `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`. |
| `required` | bool | ❌ | `true` → constraint `NOT NULL`. Padrão: `false`. |
| `default` | string | ❌ | Expressão SQL padrão: `"gen_random_uuid()"`, `"NOW()"`, `"true"`, `"0"`, `"'active'"`, etc. |
| `label` | string | ❌ | Rótulo legível armazenado em `field_definitions.label`. Usa `name` como fallback se omitido. |
| `references` | string | ❌ | Alvo da FK. Veja **Referências FK** abaixo. |
| `on_delete` | string | ❌ | Obrigatório quando `references` é definido. Deve ser **minúsculo**: `restrict`, `cascade`, `set_null`, `no_action`. |

### Tipos de Coluna Permitidos

| `type` no TOML | DDL PostgreSQL | `field_type` em field_definitions |
|----------------|----------------|-----------------------------------|
| `text` | `TEXT` | `text` |
| `integer` | `INTEGER` | `integer` |
| `bigint` | `BIGINT` | `integer` |
| `boolean` | `BOOLEAN` | `boolean` |
| `uuid` (sem FK) | `UUID` | `text` |
| `uuid` (com FK) | `UUID` + constraint FK | `select` |
| `date` | `DATE` | `date` |
| `timestamptz` | `TIMESTAMPTZ` | `datetime` |
| `jsonb` | `JSONB` | `json` |
| `numeric` | `NUMERIC` | `decimal` |
| `numeric(p,s)` | `NUMERIC(p, s)` | `decimal` |
| `bytea` | `BYTEA` | `text` |

### Referências FK

`references` recebe um caminho separado por pontos:

| Formato | Escopo | Exemplo |
|---------|--------|---------|
| `table.column` | Mesmo schema do módulo | `"categories.id"` |
| `schema.table.column` | Outro módulo ou core | `"mod_stock.categories.id"` |

A constraint FK é adicionada como `REFERENCES mod_{slug}.{table}({column})` (ou o caminho completo para refs de 3 segmentos).

`on_delete` deve ser minúsculo — validação rejeita `CASCADE`, `RESTRICT`, etc.

---

## Seção `[form]` (opcional)

Adicionar `[form]` a um arquivo de entidade registra uma página SchemaForm em `meta.page_definitions`. Usuários abrem essa página para criar e editar registros da entidade.

```toml
[form]
title = "Produtos"   # título da página exibido no cabeçalho da interface
```

### `[[form.tabs]]`

Agrupamento opcional. Se omitido, todos os campos são renderizados em uma única aba padrão.

```toml
[[form.tabs]]
key      = "general"
label    = "Geral"
position = 0

[[form.tabs]]
key      = "pricing"
label    = "Preços"
position = 1
```

| Campo | Obrigatório | Notas |
|-------|-------------|-------|
| `key` | ✅ | Identificador referenciado por `[[form.fields]].tab` |
| `label` | ✅ | Rótulo da aba exibido na interface |
| `position` | ❌ | Ordem de exibição (menor primeiro). Padrão: 0. |

### `[[form.fields]]`

Uma entrada por campo visível no formulário.

```toml
[[form.fields]]
column      = "category_id"
label       = "Categoria"
tab         = "general"
position    = 0
required    = true
fk_entity   = "categories"

[[form.fields]]
column      = "name"
label       = "Nome"
tab         = "general"
position    = 1
required    = true
show_mode   = "always"
placeholder = "Digite o nome do produto..."

[[form.fields]]
column    = "price"
label     = "Preço"
tab       = "pricing"
position  = 0
required  = true
show_mode = "always"

[[form.fields]]
column    = "active"
label     = "Ativo"
tab       = "general"
position  = 2
show_mode = "always"
```

### Campos do Form Field

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `column` | string | ✅ | Deve corresponder ao `name` de um `[[table.columns]]`. |
| `label` | string | ❌ | Sobrescreve o rótulo da coluna para este formulário. |
| `tab` | string | ❌ | `key` de uma entrada `[[form.tabs]]`. Omitir se não usar abas. |
| `position` | integer | ❌ | Ordem de exibição dentro da aba (menor primeiro). |
| `required` | bool | ❌ | Validação de obrigatório no lado do cliente. |
| `show_mode` | string | ❌ | `always` \| `create_only` \| `edit_only`. Padrão: `always`. |
| `placeholder` | string | ❌ | Texto placeholder exibido dentro do campo. |
| `fk_entity` | string | ❌ | **Slug** da entidade (não o nome da tabela) para dropdown de FK. Obrigatório em colunas `uuid` com `references`. O formulário renderiza um select com busca que consulta `POST /api/read/{fk_entity}/search`. |

---

## Exemplo Completo — Duas Entidades

### `entities/categories.toml` (somente tabela)

```toml
[table]
name  = "categories"
label = "Categorias"

  [[table.columns]]
  name    = "id"
  type    = "uuid"
  primary = true
  default = "gen_random_uuid()"

  [[table.columns]]
  name     = "name"
  type     = "text"
  required = true
  label    = "Nome"

  [[table.columns]]
  name     = "active"
  type     = "boolean"
  required = true
  default  = "true"
  label    = "Ativo"

  [[table.columns]]
  name     = "created_at"
  type     = "timestamptz"
  required = true
  default  = "NOW()"
```

Sem seção `[form]` → nenhuma página SchemaForm é criada para `categories`. A entidade é acessível via os gateways de leitura/escrita, mas não possui interface gerada automaticamente.

### `entities/items.toml` (tabela + formulário)

```toml
[table]
name  = "items"
label = "Itens"

  [[table.columns]]
  name    = "id"
  type    = "uuid"
  primary = true
  default = "gen_random_uuid()"

  [[table.columns]]
  name       = "category_id"
  type       = "uuid"
  required   = true
  references = "categories.id"
  on_delete  = "cascade"
  label      = "Categoria"

  [[table.columns]]
  name     = "name"
  type     = "text"
  required = true
  label    = "Nome"

  [[table.columns]]
  name     = "price"
  type     = "numeric(15,2)"
  required = true
  default  = "0"
  label    = "Preço"

  [[table.columns]]
  name     = "created_at"
  type     = "timestamptz"
  required = true
  default  = "NOW()"

[form]
title = "Itens"

  [[form.tabs]]
  key      = "general"
  label    = "Geral"
  position = 0

  [[form.fields]]
  column    = "category_id"
  label     = "Categoria"
  tab       = "general"
  position  = 0
  required  = true
  fk_entity = "categories"

  [[form.fields]]
  column      = "name"
  label       = "Nome"
  tab         = "general"
  position    = 1
  required    = true
  show_mode   = "always"
  placeholder = "Digite o nome do item..."

  [[form.fields]]
  column    = "price"
  label     = "Preço"
  tab       = "general"
  position  = 2
  required  = true
  show_mode = "always"
```

`[form]` presente → o Core registra uma página SchemaForm para `items`. O campo `category_id` é renderizado como um dropdown FK com busca, alimentado por `POST /api/read/categories/search`.

---

## O que o Core Registra na Instalação

Para cada arquivo de entidade:

| Tabela | Linha criada |
|--------|-------------|
| `meta.entity_definitions` | Uma linha com `slug`, `module_id`, `table_ref = "mod_{slug}.{name}"`, `label` |
| `meta.field_definitions` | Uma linha por entrada `[[table.columns]]` (excluindo PK `id` e timestamps automáticos) |
| `meta.page_definitions` | Uma linha **somente se** a seção `[form]` estiver presente |

Colunas FK recebem `fk_entity_slug` na linha de `field_definitions`, que o frontend usa para acionar dropdowns de lookup de FK.

---

## Interação com `schema.toml` e `migrations/`

O Core aplica na seguinte ordem:

1. Arquivos SQL em `migrations/` (na ordem declarada em `module.toml`)
2. `schema.toml` (motor DDL declarativo)
3. Arquivos em `entities/` (DDL + registro de meta)

`entities/` é executado por último, portanto migrations e schema.toml podem configurar pré-requisitos (extensões, dados iniciais, tabelas referenciadas de outros módulos) antes de entities/ criar tabelas que dependem deles.

---

## Códigos de Erro

| Código | HTTP | Quando |
|--------|------|--------|
| `module.entities_toml` | 422 | Arquivo não é UTF-8 válido ou TOML inválido |
| `module.schema_validation` | 422 | `on_delete` não minúsculo, tipo de coluna desconhecido, formato FK inválido |
| `module.schema_ddl_failed` | 500 | Falha na execução do DDL; `message` contém o prefixo da instrução e o erro do Postgres |
