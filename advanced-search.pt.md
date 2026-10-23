# Busca Avançada — Referência de Filtros

Todos os endpoints de busca (`POST /api/<domain>/search`) e a função host WASM `list-entities` compartilham o mesmo sistema de filtros. Este documento explica cada campo, operador, regra de agrupamento e erro comum.

---

## Formato da Requisição

```json
{
  "filters": [ <FilterClause>, ... ],
  "limit":   50,
  "offset":  0
}
```

`filters` é **obrigatório e não pode estar vazio**. `limit` padrão é 50 (máx. 500 para endpoints HTTP, máx. 200 para `list-entities`). `offset` padrão é 0.

---

## Campos do FilterClause

```json
{
  "order": 1,
  "group": 1,
  "field": "name",
  "op":    "like",
  "value": "%acme%",
  "logic": "and"
}
```

| Campo | Tipo | Obrigatório | Notas |
|-------|------|-------------|-------|
| `order` | integer | ✅ | Único entre todos os filtros. Determina a ordem de avaliação (menor primeiro). |
| `group` | integer | ✅ | Filtros com o mesmo `group` consecutivo são agrupados com parênteses. |
| `field` | string | ✅ | Nome da coluna. Deve estar na lista de permissão do endpoint. |
| `op` | string | ✅ | Veja operadores abaixo. |
| `value` | qualquer | ⚠️ | Obrigatório para todos os ops exceto `is_null` / `not_null`. Array para `in` / `not_in`. |
| `logic` | string | ⚠️ | `"and"` ou `"or"`. Obrigatório em todo filtro **exceto no de menor `order`**. |
| `is_variable` | bool | ❌ | Quando `true`, marca esta cláusula como variável de runtime em templates de filtros salvos. O `value` funciona como nome de placeholder. Padrão: `false`. Relevante apenas ao construir conjuntos de filtros salvos/reutilizáveis — ignore para consultas normais. |

---

## Operadores

| `op` | SQL gerado | `value` obrigatório | Formato de `value` |
|------|-----------|---------------------|-------------------|
| `eq` | `col = $1` | ✅ | escalar |
| `neq` | `col <> $1` | ✅ | escalar |
| `like` | `col ILIKE $1` | ✅ | escalar com wildcards `%` |
| `starts_with` | `col ILIKE $1%` | ✅ | escalar (sem `%`) |
| `not_starts_with` | `col NOT ILIKE $1%` | ✅ | escalar (sem `%`) |
| `in` | `col = ANY($1)` | ✅ | array |
| `not_in` | `col <> ALL($1)` | ✅ | array |
| `is_null` | `col IS NULL` | ❌ | omitir `value` |
| `not_null` | `col IS NOT NULL` | ❌ | omitir `value` |

**`like` não diferencia maiúsculas de minúsculas** (usa `ILIKE`). Use `%` para wildcard:
- `"%acme%"` — contém
- `"acme%"` — começa com (equivale a `starts_with`)
- `"%acme"` — termina com

**`starts_with` / `not_starts_with`** acrescentam `%` automaticamente — não inclua você mesmo.

---

## Como `order` Funciona

`order` controla qual filtro é o "primeiro". O filtro com o **menor `order`** nunca precisa de `logic` — não há nada antes dele para combinar. Todos os outros filtros exigem `logic`.

Os valores de `order` devem ser **únicos entre todos os filtros**. Valores não consecutivos são válidos (`1, 10, 20`).

```json
// ✅ correct — order 1 has no logic, order 2 and 3 do
{ "order": 1, "group": 1, "field": "status", "op": "eq", "value": "active" },
{ "order": 2, "group": 1, "field": "role",   "op": "eq", "value": "admin", "logic": "or" },
{ "order": 3, "group": 2, "field": "email",  "op": "like", "value": "%@company.com%", "logic": "and" }
```

```json
// ❌ wrong — duplicate order values
{ "order": 1, ... },
{ "order": 1, ... }   // → 422 validation error
```

```json
// ❌ wrong — missing logic on non-first filter
{ "order": 1, "group": 1, "field": "status", "op": "eq", "value": "active" },
{ "order": 2, "group": 1, "field": "role",   "op": "eq", "value": "admin" }
// → 422: logic is required when order > 1
```

---

## Como `group` Funciona

`group` controla o **agrupamento com parênteses**. Filtros consecutivos com o mesmo valor de `group` são envolvidos em parênteses e avaliados juntos. Os grupos são então conectados pelo `logic` do **primeiro filtro do próximo grupo**.

### Exemplo — `(A OR B) AND C`

```json
[
  { "order": 1, "group": 1, "field": "status", "op": "eq", "value": "pending" },
  { "order": 2, "group": 1, "field": "status", "op": "eq", "value": "draft",   "logic": "or" },
  { "order": 3, "group": 2, "field": "owner",  "op": "eq", "value": "alice",   "logic": "and" }
]
```

SQL gerado:
```sql
WHERE (status = 'pending' OR status = 'draft') AND owner = 'alice'
```

- Grupo 1 tem dois filtros → agrupados com parênteses
- O `logic: "and"` no filtro 3 conecta o grupo 2 ao grupo 1

### Exemplo — `A AND (B OR C)`

```json
[
  { "order": 1, "group": 1, "field": "is_active", "op": "eq",   "value": "true" },
  { "order": 2, "group": 2, "field": "role",       "op": "eq",   "value": "admin", "logic": "and" },
  { "order": 3, "group": 2, "field": "role",       "op": "eq",   "value": "owner", "logic": "or" }
]
```

SQL gerado:
```sql
WHERE is_active = 'true' AND (role = 'admin' OR role = 'owner')
```

### Grupos devem ser consecutivos

**Números de grupo não consecutivos criam grupos separados**, mesmo que compartilhem o mesmo número. O agrupamento é baseado em sequências de valores iguais na posição ordenada, não no número em si.

```json
// These three filters produce THREE groups, not two:
{ "order": 1, "group": 1, ... },
{ "order": 2, "group": 2, ..., "logic": "and" },
{ "order": 3, "group": 1, ..., "logic": "and" }   // new run of group 1 — treated as a new group
```

Para evitar confusão, use **números de grupo sequenciais** e mantenha todos os filtros do mesmo grupo adjacentes no array.

---

## Requisições com Filtro Único

Uma requisição com um único filtro é válida. Nenhum `logic` é necessário.

```json
{
  "filters": [
    { "order": 1, "group": 1, "field": "name", "op": "like", "value": "%invoice%" }
  ],
  "limit": 50,
  "offset": 0
}
```

---

## Exemplos Comuns

### Buscar por nome (contém)

```json
{
  "filters": [
    { "order": 1, "group": 1, "field": "name", "op": "like", "value": "%acme%" }
  ]
}
```

### Filtrar por lista de valores

```json
{
  "filters": [
    { "order": 1, "group": 1, "field": "status", "op": "in", "value": ["active", "pending"] }
  ]
}
```

### Excluir nulos

```json
{
  "filters": [
    { "order": 1, "group": 1, "field": "deleted_at", "op": "is_null" }
  ]
}
```

### Usuários ativos chamados "João" ou com papel admin

```json
{
  "filters": [
    { "order": 1, "group": 1, "field": "is_active", "op": "eq",   "value": "true" },
    { "order": 2, "group": 2, "field": "name",       "op": "like", "value": "%João%", "logic": "and" },
    { "order": 3, "group": 2, "field": "role",       "op": "eq",   "value": "admin",  "logic": "or" }
  ]
}
```

SQL: `WHERE is_active = 'true' AND (name ILIKE '%João%' OR role = 'admin')`

### Paginação

```json
{
  "filters": [
    { "order": 1, "group": 1, "field": "is_active", "op": "eq", "value": "true" }
  ],
  "limit":  20,
  "offset": 40
}
```

---

## Em Módulos WASM (`list-entities`)

O formato dos filtros é idêntico. Passe dentro do payload da função host `list-entities`:

```rust
// Rust example
let input = serde_json::json!({
    "entity": "custom.orders",
    "filters": [
        {
            "order": 1,
            "group": 1,
            "field": "status",
            "op":    "in",
            "value": ["pending", "processing"]
        }
    ],
    "sort_by":    "created_at",
    "sort_order": "desc",
    "limit":  50,
    "offset": 0
});
let raw = host::list_entities(&input.to_string());
let resp: serde_json::Value = serde_json::from_str(&raw).unwrap();
// resp.success, resp.data → array of records
```

**Limites do `list-entities`:** máx. `limit` 200 (não 500). As mesmas regras de filtro se aplicam.

**Nomes de campo** devem estar na lista de permissão da entidade. Para entidades customizadas, use o slug definido no schema (ex.: `status`, `total`, `created_at`). Campos nativos como `id`, `company_id`, `created_at`, `updated_at` estão sempre disponíveis.

---

## Erros de Validação

O servidor retorna `422` com um array `fields` descrevendo exatamente o que está errado:

```json
{
  "error":  "request.validation_failed",
  "status": 422,
  "fields": [
    { "field": "filters[order=2].logic", "message": "logic is required when order > 1" },
    { "field": "filters[order=3].value", "message": "op 'like' requires a value" }
  ]
}
```

Erros comuns e suas mensagens:

| Erro | Mensagem |
|------|----------|
| Valores `order` duplicados | `order values must be unique` |
| `logic` ausente em filtro não-inicial | `logic is required when order > 1` |
| `in` / `not_in` com `value` escalar | `in/not_in require an array value` |
| `like` / `eq` / etc. sem `value` | `op 'X' requires a value` |
| `limit` > 500 | `limit cannot exceed 500` |
| Array `filters` vazio | `filters cannot be empty` |
| Campo não está na lista de permissão | `unknown field: X` |
