# Referência de Funções Host

Todas as 23 funções de `interface host` se comunicam via strings JSON. Este documento cobre os formatos exatos de entrada/saída, requisitos de permissão e pontos de atenção.

---

## Envelopes de Resposta

Cinco formatos distintos existem entre as 23 funções:

### Padrão `{success, data, message}`
```json
{ "success": true,  "data": <value|null>, "message": "" }
{ "success": false, "data": null, "message": "error description" }
```
Usado por: `read-entity`, `list-entities`, `write-entity`, `delete-entity`, `emit-event`, `http-request`, `get-time`, `random-uuid`, `cache-get`, `cache-set`, `cache-delete`, `vector-upsert`, `vector-search`

### Query `{rows}` ou `{error}`
```json
{ "rows": [ {...}, ... ] }
{ "error": "description" }
```
Usado por: `query`

### Execute `{affected}` ou `{error}`
```json
{ "affected": 3 }
{ "error": "description" }
```
Usado por: `execute`

### Introspecção `{data}` ou `{error}`
```json
{ "data": <value> }
{ "error": "description" }
```
Usado por: `describe-entity`, `list-entity-schemas`, `list-modules`

### Pass-through
`call-routine` retorna exatamente o que a rotina chamada retorna — sem encapsulamento adicional.

---

## Nomenclatura de Entidades

Todos os parâmetros de entidade usam o formato `schema.table` (deve conter um ponto):

| Tipo de entidade | Formato | Exemplo |
|-----------------|---------|---------|
| Core | `core.{table}` | `core.users` |
| Módulo | `mod_{slug}.{table}` | `mod_stock.products` |
| Customizada | `mod_custom.{slug}` | `mod_custom.clients` |

---

## Funções

---

### `log`
```
func(level: string, msg: string)  →  (sem valor de retorno)
```
Escreve no stdout do servidor. Não é JSON — recebe dois argumentos string separados diretamente.

```rust
host::log("info",  "module started");
host::log("warn",  "stock below threshold");
host::log("error", &format!("failed to write: {}", msg));
// levels: info | warn | error | debug
```

---

### `read-entity`
Lê um registro de entidade pelo ID.

**Permissão necessária:** `{entity}:read`

**Entrada:**
```json
{
  "entity": "mod_stock.products",
  "id":     "550e8400-e29b-41d4-a716-446655440000"
}
```

**Saída:**
```json
{ "success": true,  "data": { "id": "...", "name": "Widget A", "quantity": 100 }, "message": "Entity readed successfully" }
{ "success": false, "data": null, "message": "forbidden" }
```

---

### `list-entities`
Lista registros de entidade com filtros, ordenação e paginação opcionais.

**Permissão necessária:** `{entity}:read`

**Entrada:**
```json
{
  "entity":     "mod_stock.products",
  "filters": [
    { "order": 1, "group": 1, "field": "category", "op": "eq",   "value": "electronics", "logic": "and" },
    { "order": 2, "group": 1, "field": "quantity",  "op": "neq",  "value": 0,             "logic": "and" }
  ],
  "sort_by":    "name",
  "sort_order": "asc",
  "limit":      50,
  "offset":     0
}
```

Todos os campos exceto `entity` são opcionais. Padrões: limit=50, offset=0, sort_order="asc", sem filtros.

**Operadores de filtro:**

| `op` | Formato de `value` |
|------|-------------------|
| `eq`, `neq` | escalar (string/número/bool) |
| `like`, `starts_with`, `not_starts_with` | escalar string |
| `in`, `not_in` | array `["a", "b"]` |
| `is_null`, `not_null` | omitir `value` |

Campo `logic`: `"and"` ou `"or"`. Obrigatório para toda cláusula exceto a de menor ordem.

`group`: cláusulas com o mesmo número de grupo são avaliadas juntas antes de ser combinadas com outros grupos.

**Saída:**
```json
{ "success": true, "data": [ { "id": "...", ... }, { "id": "...", ... } ], "message": "" }
```

---

### `write-entity`
Insere ou atualiza um registro de entidade.

**Permissão necessária:** `{entity}:write`

**Entrada (INSERT — omitir `id`):**
```json
{
  "entity":         "mod_stock.products",
  "schema_version": 1,
  "data": {
    "name":     "Widget A",
    "quantity": 100,
    "price":    "29.99"
  }
}
```

**Entrada (UPDATE — incluir `id`):**
```json
{
  "entity":         "mod_stock.products",
  "schema_version": 1,
  "id":             "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "quantity": 75
  }
}
```

`schema_version`: a versão atual do JSON schema da entidade (de `module.toml` ou `describe-entity`). Usado para validação de escrita.

**Saída:**
```json
{ "success": true, "data": { "entity_id": "550e8400-...", "action": "insert" }, "message": "" }
{ "success": true, "data": { "entity_id": "550e8400-...", "action": "update" }, "message": "" }
```

---

### `delete-entity`
Remove um registro de entidade pelo ID.

**Permissão necessária:** `{entity}:delete`

**Entrada:**
```json
{
  "entity": "mod_stock.products",
  "id":     "550e8400-e29b-41d4-a716-446655440000"
}
```

**Saída:**
```json
{ "success": true, "data": { "entity_id": "550e8400-...", "action": "delete" }, "message": "" }
```

---

### `emit-event`
Emite um evento no sistema (gravado na outbox → NATS → SSE propaga para assinantes).

**Permissão necessária:** `events:emit`

**Entrada:**
```json
{
  "event_type": "stock.low",
  "payload": {
    "product_id":  "550e8400-e29b-41d4-a716-446655440000",
    "current_qty": 3,
    "threshold":   10
  }
}
```

`event_type` deve corresponder a um slug registrado em `core.event_types`. O evento também aciona quaisquer event handlers WASM registrados via `register-event-handler`.

**Saída:**
```json
{ "success": true, "data": null, "message": "" }
```

---

### `call-routine`
Invoca outra rotina pelo nome. Suporta chamadas recursivas até `max_depth` (padrão 5).

**Entrada:**
```json
{
  "name":  "stock:check_low_stock",
  "input": { "product_id": "550e8400-e29b-41d4-a716-446655440000" }
}
```

Formato de `name`:
- Rotina standalone (sem módulo): `"routine_slug"`
- Rotina de módulo: `"module_slug:routine_name"`

`input` é opcional — padrão é `{}`.

**Saída:** Pass-through — exatamente o que a rotina chamada retorna.

```json
{ "success": true, "data": { "low": true, "qty": 3 }, "message": "" }
```

---

### `query`
Executa um SELECT. Instruções DML são rejeitadas.

**Schemas bloqueados (sempre):** `core`, `meta`, `information_schema`, `pg_catalog`, `mod_custom`

O acesso a schemas `mod_*` é controlado pelo RBAC do usuário que chama. A exceção é durante `start()` — que executa com `is_superuser: true` e pode ler qualquer schema `mod_*`.

**Entrada:**
```json
{
  "sql":    "SELECT id, name, quantity FROM mod_stock.products WHERE quantity < $1 AND company_id = $2",
  "params": ["10", "company-uuid-here"]
}
```

Todos os parâmetros são strings. Vinculados como `$1`, `$2`, etc. Sem parâmetros nomeados.

**Saída (envelope query):**
```json
{ "rows": [ { "id": "...", "name": "Widget A", "quantity": 5 } ] }
{ "error": "blocked schema: core" }
```

---

### `execute`
Executa uma instrução DML (INSERT / UPDATE / DELETE). SELECT é rejeitado.

**Mesmas restrições de schema que `query`.**

**Entrada:**
```json
{
  "sql":    "UPDATE mod_stock.products SET quantity = $1 WHERE id = $2",
  "params": ["75", "550e8400-e29b-41d4-a716-446655440000"]
}
```

**Saída (envelope execute):**
```json
{ "affected": 1 }
{ "error": "description" }
```

> Prefira `write-entity` em vez de `execute` ao gravar em entidades registradas — ele aciona logs de auditoria, validação de schema e eventos de outbox. Use `execute` apenas para operações em massa ou tabelas não registradas como entidades.

---

### `describe-entity`
Obtém a definição completa de schema para uma entidade registrada.

**Permissão necessária:** `db_struct:read`

**Entrada:**
```json
{ "slug": "mod_stock.products" }
```

`slug` corresponde a `meta.entity_definitions.slug` — o mesmo valor usado como `entity` em chamadas de leitura/escrita/listagem/exclusão.

**Saída (envelope introspecção):**
```json
{
  "data": {
    "slug":      "mod_stock.products",
    "table_ref": "mod_stock.products",
    "is_system": false,
    "is_custom": false,
    "schema": {
      "type": "object",
      "properties": {
        "name":     { "type": "string" },
        "quantity": { "type": "integer" }
      }
    }
  }
}
```

---

### `list-entity-schemas`
Lista todas as definições de entidade registradas por um módulo específico.

**Permissão necessária:** `db_struct:read`

**Entrada:**
```json
{ "module_slug": "stock" }
```

Retorna todas as entidades cujo `table_ref` começa com `mod_stock.`.

**Saída (envelope introspecção):**
```json
{
  "data": [
    { "slug": "mod_stock.products",   "table_ref": "mod_stock.products",   "is_system": false, "is_custom": false, "schema": { ... } },
    { "slug": "mod_stock.categories", "table_ref": "mod_stock.categories", "is_system": false, "is_custom": false, "schema": { ... } }
  ]
}
```

---

### `list-modules`
Lista todos os módulos instalados.

**Permissão necessária:** `db_struct:read`

**Entrada:** `""` (ignorado — esta função não recebe entrada significativa)

**Saída (envelope introspecção):**
```json
{
  "data": [
    { "id": "...", "name": "Stock Manager", "slug": "stock", "version": "001.000.000", "active": true },
    { "id": "...", "name": "HR Module",     "slug": "hr",    "version": "001.002.000", "active": true }
  ]
}
```

---

### `http-request`
Realiza uma requisição HTTP de saída.

**Proteção SSRF (sempre aplicada, salvo desativação via config do servidor):**
Bloqueia `localhost`, IPs de loopback, `*.local`, `*.internal` e todos os intervalos privados RFC-1918 / ULA (10.x, 172.16-31.x, 192.168.x, 169.254.x, fc00::/7, ::1).

**Timeout:** Padrão 10s, máx. 30s. Limite do corpo da resposta: 10 MB.

**Entrada (corpo JSON):**
```json
{
  "method":  "POST",
  "url":     "https://api.example.com/webhook",
  "headers": {
    "Authorization": "Bearer token123"
  },
  "body":       { "event": "stock_low", "product_id": "..." },
  "timeout_ms": 5000
}
```

**Entrada (corpo texto simples):**
```json
{
  "method":    "POST",
  "url":       "https://api.example.com/data",
  "body_text": "raw text content"
}
```

**Entrada (corpo binário — base64):**
```json
{
  "method":        "POST",
  "url":           "https://api.example.com/upload",
  "body_bytes_b64": "SGVsbG8gV29ybGQ="
}
```

**Entrada (multipart/form-data):**
```json
{
  "method": "POST",
  "url":    "https://api.example.com/files",
  "form_data": [
    { "name": "file",        "bytes_b64": "SGVsbG8=", "filename": "report.pdf", "content_type": "application/pdf" },
    { "name": "description", "value":     "Q3 Report" }
  ]
}
```

Prioridade do corpo (mutuamente exclusivos): `form_data` > `body_bytes_b64` > `body_text` > `body`

**Saída:**
```json
{
  "success": true,
  "data": {
    "status":   200,
    "headers":  { "content-type": "application/json", "x-request-id": "abc" },
    "body":     { "ok": true },
    "body_b64": null
  },
  "message": ""
}
```

`body` é preenchido quando a resposta é `application/json` ou `text/*`.
`body_b64` é preenchido (base64) quando a resposta é binária; `body` será `null` nesse caso.

---

### `get-time`
Obtém a hora UTC atual. Não recebe entrada.

**Entrada:** *(WIT: `func() -> string` — passe uma string vazia `""` em linguagens que exigem um valor)*

**Saída:**
```json
{
  "success": true,
  "data": {
    "unix_ms":     1720000000000,
    "iso8601":     "2024-07-03T12:00:00Z",
    "weekday":     "Wednesday",
    "weekday_num": 3
  },
  "message": ""
}
```

`weekday_num`: 1=Segunda … 7=Domingo (ISO 8601).

---

### `random-uuid`
Gera um UUIDv4. Não recebe entrada.

**Entrada:** *(WIT: `func() -> string` — passe uma string vazia `""` em linguagens que exigem um valor)*

**Saída:**
```json
{
  "success": true,
  "data": { "uuid": "550e8400-e29b-41d4-a716-446655440000" },
  "message": ""
}
```

---

### `cache-get`
Lê um valor do cache de chave-valor em processo.

**Escopo do cache:** as chaves são isoladas por `company_id`. A mesma chave em duas empresas diferentes nunca conflita.

**Entrada:**
```json
{ "key": "last_sync_at" }
```

**Saída:**
```json
{ "success": true,  "data": { "value": "2026-08-10T12:00:00Z" }, "message": "" }
{ "success": false, "data": null, "message": "not found" }
```

`value` pode ser qualquer tipo JSON armazenado por `cache-set`.

Entradas expiradas são removidas de forma lazy no `cache-get` e por uma varredura em background a cada 60 segundos.

---

### `cache-set`
Armazena um valor no cache.

**Entrada:**
```json
{
  "key":         "last_sync_at",
  "value":       "2026-08-10T12:00:00Z",
  "ttl_seconds": 300
}
```

`ttl_seconds` é opcional. Omitir usa o padrão do servidor (`ERP__WASM__CACHE_DEFAULT_TTL_SECONDS`, padrão 3600s).

`value` aceita qualquer valor JSON — string, número, booleano, objeto, array ou null.

**Saída:**
```json
{ "success": true, "data": null, "message": "" }
```

---

### `cache-delete`
Remove uma chave do cache imediatamente.

**Entrada:**
```json
{ "key": "last_sync_at" }
```

**Saída:**
```json
{ "success": true, "data": null, "message": "" }
```

---

### `storage-upload`
Faz upload de um arquivo para armazenamento de objetos (MinIO/S3).

**Permissão necessária:** `storage:write`

**Entrada:**
```json
{
  "filename":     "report.pdf",
  "content_type": "application/pdf",
  "purpose":      "attachment",
  "bytes_base64": "<bytes do arquivo em base64 padrão>"
}
```

`purpose` é opcional. `content_type` deve ser um tipo MIME válido.

**Saída (sucesso):**
```json
{ "success": true, "id": "uuid", "path": "uploads/2026/uuid.pdf" }
```

**Saída (falha):**
```json
{ "success": false, "message": "upload failed: ..." }
```

---

### `storage-get-url`
Obtém uma URL de download assinada (com tempo limitado) para um arquivo armazenado.

**Permissão necessária:** `storage:read`

**Entrada:**
```json
{ "media_id": "uuid" }
```

**Saída (sucesso):**
```json
{ "success": true, "url": "https://minio:9000/erp-core/uploads/2026/uuid.pdf?X-Amz-...", "expires_in": 3600 }
```

`expires_in` é o TTL em segundos, controlado pela configuração do servidor.

---

### `storage-delete`
Remove um arquivo do armazenamento de objetos.

**Permissão necessária:** `storage:write`

**Entrada:**
```json
{ "media_id": "uuid" }
```

**Saída (sucesso):**
```json
{ "success": true }
```

---

### `vector-upsert`
Armazena ou atualiza um embedding vetorial no vector store. Com escopo por `company_id` do chamador.

**Permissão necessária:** `vector:write`

**Entrada:**
```json
{
  "collection": "product_embeddings",
  "id":         "product_001",
  "embedding":  [0.1, 0.8, -0.3, 0.5],
  "metadata":   { "name": "Widget A", "category": "tools" }
}
```

| Campo | Tipo | Obrigatório | Notas |
|-------|------|-------------|-------|
| `collection` | string | sim | Namespace lógico para agrupar embeddings |
| `id` | string | sim | Seu identificador para este embedding; aplicado como upsert em conflito |
| `embedding` | `[f32]` | sim | Vetor de floats — todos os vetores em uma coleção devem ter a mesma dimensão |
| `metadata` | object | não | JSON arbitrário armazenado junto com o embedding; padrão é `{}` |

**Saída (sucesso):**
```json
{ "success": true }
```

**Saída (falha):**
```json
{ "success": false, "message": "error description" }
```

---

### `vector-search`
Busca os vizinhos mais próximos usando similaridade de cosseno. Com escopo por `company_id` do chamador.

**Permissão necessária:** `vector:read`

**Entrada:**
```json
{
  "collection":      "product_embeddings",
  "query_embedding": [0.1, 0.8, -0.3, 0.5],
  "top_k":           10
}
```

| Campo | Tipo | Obrigatório | Notas |
|-------|------|-------------|-------|
| `collection` | string | sim | Coleção para buscar |
| `query_embedding` | `[f32]` | sim | Vetor de consulta — deve ter a mesma dimensão dos vetores armazenados |
| `top_k` | integer | não | Número de resultados a retornar (padrão 10, máx. 100) |

**Score:** `1.0 - cosine_distance`. Vetores idênticos pontuam `1.0`; ortogonais pontuam `0.5`; opostos pontuam `0.0`.

**Saída (sucesso):**
```json
{
  "success": true,
  "data": [
    { "id": "product_001", "score": 0.9987, "metadata": { "name": "Widget A", "category": "tools" } },
    { "id": "product_002", "score": 0.8412, "metadata": { "name": "Widget B", "category": "tools" } }
  ]
}
```

Resultados ordenados por score decrescente (mais similar primeiro).

**Saída (falha):**
```json
{ "success": false, "message": "error description" }
```

---

## Tabela de Referência Rápida

| Função | Campos de entrada (obrigatórios*) | Permissão | Envelope |
|--------|----------------------------------|-----------|----------|
| `log` | `level`, `msg` (args diretos, não JSON) | nenhuma | nenhum |
| `read-entity` | `entity*`, `id*` | `{entity}:read` | padrão |
| `list-entities` | `entity*`, `filters`, `sort_by`, `sort_order`, `limit`, `offset` | `{entity}:read` | padrão |
| `write-entity` | `entity*`, `schema_version*`, `data*`, `id` | `{entity}:write` | padrão |
| `delete-entity` | `entity*`, `id*` | `{entity}:delete` | padrão |
| `emit-event` | `event_type*`, `payload` | `events:emit` | padrão |
| `call-routine` | `name*`, `input` | `{routine}:execute` | pass-through |
| `query` | `sql*`, `params` | (RBAC por schema) | `{rows}` |
| `execute` | `sql*`, `params` | (RBAC por schema) | `{affected}` |
| `describe-entity` | `slug*` | `db_struct:read` | `{data}` |
| `list-entity-schemas` | `module_slug*` | `db_struct:read` | `{data}` |
| `list-modules` | *(nenhum)* | `db_struct:read` | `{data}` |
| `http-request` | `method*`, `url*`, `headers`, `body`/`body_text`/`body_bytes_b64`/`form_data`, `timeout_ms` | nenhuma | padrão |
| `get-time` | *(nenhum)* | nenhuma | padrão |
| `random-uuid` | *(nenhum)* | nenhuma | padrão |
| `cache-get` | `key*` | nenhuma | padrão |
| `cache-set` | `key*`, `value*`, `ttl_seconds` | nenhuma | padrão |
| `cache-delete` | `key*` | nenhuma | padrão |
| `storage-upload` | `filename*`, `content_type*`, `bytes_base64*`, `purpose` | `storage:write` | `{success, id, path}` |
| `storage-get-url` | `media_id*` | `storage:read` | `{success, url, expires_in}` |
| `storage-delete` | `media_id*` | `storage:write` | `{success}` |
| `vector-upsert` | `collection*`, `id*`, `embedding*`, `metadata` | `vector:write` | `{success}` |
| `vector-search` | `collection*`, `query_embedding*`, `top_k` | `vector:read` | `{success, data[]}` |

---

## interface module-host

Funções em `erp-core:component/module-host@0.1.0`. Chamadas em `start()` durante a inicialização do módulo — **não** durante execução de rotinas ou endpoints.

Todas as sete funções:
- Retornam `{ "ok": true }` em sucesso ou `{ "error": "..." }` em falha
- Exigem contexto de módulo (`module_id` presente); retornam `"no module context"` se chamadas fora de `start()`

---

### `register-endpoint`

Registra dinamicamente uma rota HTTP vinculada a uma rotina WASM. Mesmo efeito que `[[endpoints]]` no `module.toml`, mas feito em tempo de execução via `start()`. A rota fica ativa imediatamente — sem necessidade de reinicialização.

**Entrada:**
```json
{
  "path":          "/items",
  "method":        "POST",
  "routine_name":  "create_item",
  "auth_required": true
}
```

`auth_required` assume `true` se omitido. `path` + `method` deve ser único para este módulo.

**Saída:**
```json
{ "ok": true }
{ "error": "..." }
```

---

### `register-event-handler`

Registra uma rotina WASM para disparar quando um tipo de evento específico for emitido. `event_slug` deve existir previamente em `core.event_types`. Quando o evento ocorrer, o Core chama `call-event(routine_name, trigger, entity, data)`.

**Entrada:**
```json
{
  "event_slug":   "stock.product.updated",
  "routine_name": "on_product_updated"
}
```

**Saída:**
```json
{ "ok": true }
{ "error": "..." }
```

---

### `register-mcp-tool`

Registra uma rotina WASM como ferramenta MCP (Model Context Protocol), tornando-a chamável por modelos de IA. A ferramenta aparece em `tools/list` como `module__{slug}__{name}`.

**Entrada:**
```json
{
  "name":         "search_products",
  "description":  "Busca o catálogo de produtos por palavra-chave",
  "input_schema": {
    "type": "object",
    "properties": { "q": { "type": "string" } },
    "required": ["q"]
  },
  "routine_name": "search_products_routine"
}
```

`input_schema` assume `{}` (qualquer entrada aceita) se omitido. `name` e `routine_name` são obrigatórios.

**Saída:**
```json
{ "ok": true }
{ "error": "..." }
```

---

### `register-partner-type`

Registra uma classificação de tipo de parceiro (ex.: `"supplier"`, `"carrier"`). Estende a taxonomia de classificação de parceiros do sistema. Não exige contexto de módulo — pode ser chamada de qualquer contexto WASM.

**Entrada:**
```json
{ "partner_type": "supplier" }
```

**Saída:**
```json
{ "ok": true }
{ "error": "..." }
```

---

### `register-entity-field`

Adiciona um campo à definição SchemaForm de uma entidade existente. **Não altera a tabela no banco de dados** — a coluna já deve existir (declarada via `schema.toml` ou `entities/`).

**Entrada:**
```json
{
  "entity_slug":    "mod_stock.products",
  "field_slug":     "supplier_id",
  "label":          "Fornecedor",
  "field_type":     "select",
  "required":       false,
  "tab_key":        "general",
  "tab_label":      "Geral",
  "position":       5,
  "fk_entity_slug": "mod_suppliers.suppliers"
}
```

| Campo | Obrigatório | Notas |
|-------|-------------|-------|
| `entity_slug` | ✅ | Entidade alvo no formato `schema.tabela` |
| `field_slug` | ✅ | Nome da coluna na tabela da entidade |
| `label` | ✅ | Rótulo legível exibido na interface |
| `field_type` | ✅ | `text`, `integer`, `boolean`, `date`, `datetime`, `decimal`, `select`, `json` |
| `required` | ❌ | Validação de obrigatório no cliente. Padrão: `false` |
| `tab_key` | ❌ | Chave da aba do `[form]` da entidade |
| `tab_label` | ❌ | Rótulo da aba (usado apenas se `tab_key` for novo) |
| `position` | ❌ | Ordem dentro da aba. Padrão: `0` |
| `fk_entity_slug` | ❌ | Entidade de lookup FK para campos `select` |

**Saída:**
```json
{ "ok": true }
{ "error": "..." }
```

---

### `create-document-type-group`

Cria um grupo de tipos de documento — um container que organiza tipos de documento. Idempotente se o slug já existir com o mesmo módulo proprietário.

**Entrada:**
```json
{
  "slug":     "fiscal",
  "label":    "Fiscal",
  "position": 0
}
```

`position` assume `0` se omitido.

**Saída:**
```json
{ "ok": true }
{ "error": "..." }
```

---

### `create-document-type`

Cria um tipo de documento dentro de um grupo existente. `group_slug` deve ter sido criado antes em `start()` via `create-document-type-group`, ou já existir no banco de dados.

**Entrada:**
```json
{
  "slug":       "nfe",
  "label":      "NF-e",
  "group_slug": "fiscal",
  "position":   0
}
```

`position` assume `0` se omitido.

**Saída:**
```json
{ "ok": true }
{ "error": "..." }
```

---

## Referência Rápida — module-host

| Função | Campos de entrada (obrigatórios*) | Contexto | Saída |
|--------|----------------------------------|----------|-------|
| `register-endpoint` | `path*`, `method*`, `routine_name*`, `auth_required` | módulo | `{ok}` |
| `register-event-handler` | `event_slug*`, `routine_name*` | módulo | `{ok}` |
| `register-mcp-tool` | `name*`, `description*`, `routine_name*`, `input_schema` | módulo | `{ok}` |
| `register-partner-type` | `partner_type*` | qualquer | `{ok}` |
| `register-entity-field` | `entity_slug*`, `field_slug*`, `label*`, `field_type*`, `required`, `tab_key`, `tab_label`, `position`, `fk_entity_slug` | módulo | `{ok}` |
| `create-document-type-group` | `slug*`, `label*`, `position` | módulo | `{ok}` |
| `create-document-type` | `slug*`, `label*`, `group_slug*`, `position` | módulo | `{ok}` |
