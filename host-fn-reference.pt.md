# Referência de Funções Host

Todas as 56 funções de `interface host` se comunicam via strings JSON. Este documento cobre os formatos exatos de entrada/saída, requisitos de permissão e pontos de atenção.

---

## Envelopes de Resposta

Cinco formatos distintos existem entre as funções host:

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

## Identidade do Chamador e Auditoria

### `get-caller`
Retorna informações de identidade do contexto de execução WASM atual.

**Entrada:** nenhuma (string vazia ou `""`)

**Saída:**
```json
{
  "user_id":        "uuid",
  "principal_type": "human",
  "is_superuser":   false,
  "agent_id":       null,
  "company_id":     "uuid",
  "company_scope":  "global",
  "on_behalf_of":   null
}
```

| Campo | Notas |
|---|---|
| `principal_type` | `"human"` \| `"agent"` \| `"system"` |
| `agent_id` | Preenchido quando `principal_type == "agent"` |
| `company_scope` | `"global"` ou `["uuid", ...]` lista de empresas permitidas |
| `on_behalf_of` | UUID do usuário humano pelo qual o job atua; `null` se não definido |

---

### `has-permission`
Verifica se o chamador atual possui determinada permissão.

**Entrada:** `{ "resource": "my_module.reports", "action": "export" }`

**Saída:** `{ "has_permission": true }`

---

### `set-audit-context`
Define metadados de auditoria para a execução atual. Campos omitidos preservam o valor herdado (semântica de merge).

**Entrada:**
```json
{
  "on_behalf_of":     "user-uuid",
  "batch_id":         "uuid",
  "triggered_by_job": "uuid"
}
```

**Restrições:**
- Principals sistema (nil `user_id`) não podem definir `on_behalf_of`.
- Humanos: `on_behalf_of` deve ser igual ao próprio `user_id`.
- Agentes em job: `on_behalf_of` deve ser igual ao valor herdado do job; não pode definir um novo quando não há herança.
- Um `on_behalf_of` existente não pode ser alterado para um valor diferente.

**Saída:** `{ "ok": true }` ou `{ "ok": false, "error": "..." }`

---

## Background Jobs

### `register-background-action`
Registra um tipo de ação para execução em background. Chamado em `start()`. Idempotente — reinstalar atualiza o tipo.

**Entrada:**
```json
{
  "name":            "send-report",
  "title":           "Enviar Relatório Semanal",
  "description":     null,
  "max_attempts":    3,
  "timeout_seconds": 300
}
```

**Saída:** `{ "id": "uuid" }` ou `{ "error": "..." }`

---

### `dispatch-background`
Enfileira um job para um tipo de ação registrado. Retorna imediatamente com um `job_id`.

**Entrada:**
```json
{
  "action_name":                "send-report",
  "description":                "Enviar relatório Q1",
  "payload":                    {},
  "run_as":                     null,
  "on_behalf_of":               null,
  "intersect_with_on_behalf_of": false
}
```

**Saída:** `{ "job_id": "uuid" }` ou `{ "error": "..." }`

---

### `job-is-cancelled`
Verifica se o job atual foi solicitado a cancelar. Válido apenas dentro de execução de job.

**Entrada:** nenhuma (string vazia ou `""`)

**Saída:** `{ "cancelled": false }` — verifique em loops longos e retorne cedo quando `true`.

---

### `job-log`
Emite uma linha de log de dentro de um job em execução. Válido apenas durante execução de job.

**Entrada:** `{ "level": "info", "message": "Processando lote 3 de 10" }`

`level`: `"info"` | `"warn"` | `"error"`. Mensagens truncadas em 2048 bytes UTF-8.

**Saída:** `{ "ok": true }`

---

## Secrets

### `get-secret`
Recupera um valor secreto por nome. Secrets têm escopo de módulo.

**Entrada:** `{ "name": "api_key" }`

**Saída:** `{ "value": "secret-string" }` ou `{ "error": "..." }`

---

### `set-secret`
Cria ou atualiza um secret.

**Entrada:** `{ "name": "api_key", "value": "secret-string" }`

**Saída:** `{ "ok": true }` ou `{ "error": "..." }`

---

### `has-secret`
Verifica se um secret existe (sem revelar o valor).

**Entrada:** `{ "name": "api_key" }`

**Saída:** `{ "exists": true }`

---

### `delete-secret`
Exclui um secret.

**Entrada:** `{ "name": "api_key" }`

**Saída:** `{ "ok": true }` ou `{ "error": "..." }`

---

## Agentes

### `create-agent-principal`
Cria um usuário agente pertencente a este módulo.

**Entrada:** `{ "name": "report-agent", "description": "Enviador automático de relatórios" }`

**Saída:** `{ "id": "uuid" }` ou `{ "error": "..." }`

---

### `deactivate-agent-principal`
Desativa um agente pertencente a este módulo.

**Entrada:** `{ "agent_id": "uuid" }`

**Saída:** `{ "ok": true }` ou `{ "error": "..." }`

---

### `activate-agent-principal`
Reativa um agente desativado pertencente a este módulo.

**Entrada:** `{ "agent_id": "uuid" }`

**Saída:** `{ "ok": true }` ou `{ "error": "..." }`

---

### `grant-agent-permission`
Concede uma permissão a um agente pertencente a este módulo. Forneça `permission_id` ou `resource`+`action`.

**Entrada:**
```json
{
  "agent_id":      "uuid",
  "permission_id": "uuid",
  "scope":         "global",
  "is_deny":       false,
  "can_delegate":  false,
  "company_id":    null,
  "grant_depth":   0
}
```

**Regras por tipo de chamador:**

| Chamador | Regras |
|---|---|
| superuser / sistema | Ignora todas as verificações |
| humano | 1. Linha `is_deny=true` → erro imediato (deny-wins). 2. Deve possuir a permissão (direta ou por role). 3. Se via linha direta: `can_delegate` obrigatório; `scope` alvo deve ser ⊆ scope do grantor. 4. Se apenas por role: `grant_depth` deve ser `0`. |
| agente | `resource` deve começar com `{module_slug}_` ou `{module_slug}.`; deve ter linha direta; `grant_depth` < max(grant_depth) do grantor |

**Saída:** `{ "id": "uuid" }` ou `{ "error": "..." }`

---

### `revoke-agent-permission`
Remove uma concessão de permissão de um agente pertencente a este módulo.

**Entrada:** `{ "agent_id": "uuid", "permission_id": "uuid" }`

**Saída:** `{ "ok": true }` ou `{ "error": "..." }`

---

## Gerenciamento de Permissões

### `create-permission`
Cria uma nova permissão com escopo neste módulo. `resource` deve começar com `{module_slug}_` ou `{module_slug}.`. Idempotente (`ON CONFLICT DO NOTHING`).

**Entrada:**
```json
{
  "resource":       "my_module.reports",
  "action":         "export",
  "description":    "Exportar relatórios",
  "agent_batch_id": "uuid (opcional)"
}
```

**Saída:** `{ "id": "uuid", "resource": "...", "action": "..." }` ou `{ "error": "..." }`

**Notas:** `description` é obrigatório (string não vazia). `agent_batch_id` armazenado em `core.permissions.agent_batch_id` — identifica permissões criadas em um batch de rastreamento de mudanças.

---

### `delete-permission`
Exclui uma permissão com escopo de módulo e faz cascade para todas as concessões.

**Entrada:** `{ "resource": "my_module.reports", "action": "export" }`

**Saída:** `{ "deleted": true, "cascade_count": 3 }` ou `{ "error": "..." }`

---

## Notificações

### `send-notification`
Insere uma notificação em `core.notifications` para um usuário específico ou para todos os membros de um papel. Não exige permissão interna — o módulo chamador já deve ter a concessão adequada.

Quando `target_user_id` é informado, o core publica o evento `notification.received` no NATS imediatamente após o INSERT. Qualquer conexão SSE aberta sob aquele usuário recebe o evento em tempo real (ignora assinaturas por papel; só o destinatário recebe). A linha de notificação persiste em qualquer caso; clientes sem SSE aberto podem usar polling em `GET /api/notifications`.

**Entrada:**
```json
{
  "target_user_id":   "uuid (mutuamente exclusivo com target_role_slug)",
  "target_role_slug": "string (mutuamente exclusivo com target_user_id)",
  "kind":             "info | warning | error | success  (padrão: info)",
  "title":            "string (obrigatório)",
  "body":             "string | null",
  "data":             "object | null"
}
```

Exatamente um entre `target_user_id` e `target_role_slug` deve ser informado.

**Saída:** `{ "success": true, "data": { "count": 3 } }` — `count` é o número de linhas inseridas.

**Evento SSE (somente caminho de usuário):** tipo `notification.received`, payload `{ "user_id", "title", "body", "kind" }`. O stream SSE entrega apenas ao usuário correspondente; nenhuma assinatura por papel é necessária.

**Erros:** `{ "success": false, "message": "target_user_id or target_role_slug is required" }` / `"only one of target_user_id or target_role_slug may be set"` / `"title is required"`

---

## Ponte MCP

Essas duas host fns expõem a mesma tabela de dispatch MCP disponível em `POST /mcp` ao contexto de execução WASM, permitindo que um módulo chame ferramentas MCP de outro módulo sem round-trip HTTP.

### `mcp-list-tools`
Retorna todas as ferramentas MCP que o chamador tem permissão para executar.

**Entrada:** *(nenhuma)*

**Saída:**
```json
{
  "success": true,
  "data": [
    { "name": "entity__list" },
    { "name": "entity__read" },
    { "name": "entity__write" },
    { "name": "entity__delete" },
    { "name": "entity__describe" },
    { "name": "entity__list_schemas" },
    { "name": "routine__execute" },
    { "name": "custom__minha_ferramenta", "description": "...", "input_schema": {} },
    { "name": "module__outro_slug__ferramenta", "description": "...", "input_schema": {} }
  ],
  "message": ""
}
```

**Filtragem por permissão:**
- Ferramentas de entidade e rotina sempre são incluídas.
- Ferramentas customizadas requerem `mcp_tool:{nome}` ou `mcp_tool:all`.
- Ferramentas de módulo requerem `{module_slug}_mcp:{nome}` ou `{module_slug}_mcp:all`.

---

### `mcp-call-tool`
Despacha uma única chamada de ferramenta MCP e retorna o resultado.

**Entrada:**
```json
{ "name": "module__outro_slug__ferramenta", "arguments": { "chave": "valor" } }
```

**Prefixos de nome:**

| Prefixo | Exemplo | Dispatch |
|---|---|---|
| `custom__` | `custom__minha_ferramenta` | Consulta `core.mcp_tools`, executa a rotina vinculada |
| `module__` | `module__billing__create_invoice` | Busca artefato do módulo, chama rotina definida em `sys.mcp_tool_definitions` |

**Saída:** `{ "success": true, "data": { ... } }` — `data` é o valor de retorno da rotina.

**Verificação de permissão:**
- `custom__foo` → requer `mcp_tool:foo` ou `mcp_tool:all`.
- `module__slug__bar` → requer `{slug}_mcp:bar` ou `{slug}_mcp:all`.
- Retorna `{ "success": false, "message": "forbidden" }` em falha de RBAC.

**Guarda de profundidade:** retorna `{ "success": false, "message": "max recursion depth exceeded" }` se a profundidade de execução atingir 32.

> Ferramentas `entity__*` são listadas por `mcp-list-tools` mas **não** são despachadas por `mcp-call-tool`. Use as host fns `read-entity`, `list-entities`, `write-entity`, `delete-entity` diretamente.

---

## Rastreamento de Mudanças

Host fns para criar, inspecionar e reverter mudanças estruturais. Todas as fns estruturais rejeitam chamadas onde `principal_type == "agent"` (agent guard). `field-stats` é somente leitura e não tem guard.

### Agent guard

Toda fn estrutural verifica:
```
if ctx.principal_type == "agent" {
    return err_json("agents cannot modify structure")
}
```
O módulo de IA não pode chamar essas fns rodando como principal agente. Deve rodar como principal humano ou via rotina disparada por humano.

### `register-entity`
Cria entidade customizada em runtime (DDL + meta + página).

**Permissão:** `db_struct:write` | **Agent guard:** sim

**Entrada:**
```json
{
  "name":           "minha_entidade",
  "label":          "Minha Entidade",
  "module_slug":    "opcional",
  "fields":         [{ "name": "titulo", "label": "Título", "field_type": "text", "required": false }],
  "agent_batch_id": "uuid (opcional)"
}
```

**Saída:** `{ "success": true, "data": { "entity_id": "uuid", "entity_slug": "custom.minha_entidade", "page_id": "uuid" } }`

**Notas:**
- `entity_slug` tem prefixo `custom.` — use para `add-entity-field` e `write-entity`.
- `permission_ids` não estão no retorno. Recupere via `query`: `SELECT id, resource, action FROM core.permissions WHERE resource LIKE 'custom.{name}%'`.
- `agent_batch_id` armazenado em `meta.entity_definitions.agent_batch_id`. Retorna erro se UPDATE falhar.
- Não é idempotente — retorna erro se entidade com mesmo nome já existe.

---

### `add-entity-field`
Adiciona campo a entidade customizada existente em runtime (ALTER TABLE + meta).

**Permissão:** `db_struct:write` | **Agent guard:** sim

**Entrada:**
```json
{
  "entity_slug":    "custom.minha_entidade",
  "name":           "observacoes",
  "label":          "Observações",
  "field_type":     "text",
  "required":       false,
  "agent_batch_id": "uuid (opcional)"
}
```

**Tipos válidos de `field_type`:** `text`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `select`, `uuid`, `json`

**Saída:** `{ "success": true, "data": { "field_id": "uuid", "slug": "observacoes" } }`

**Notas:** Incrementa `schema_version` da entidade — clientes write devem passar a versão atualizada.

---

### `deactivate-field`
Desativa campo. Writes ao campo retornam 422; schema e reads omitem o campo.

**Permissão:** `db_struct:write` | **Agent guard:** sim

**Entrada:** `{ "field_id": "uuid" }`  
**Saída:** `{ "success": true }`

**Notas:**
- Define `deactivated_at = NOW()` e `deactivated_by = caller_user_id`.
- Campo não é removido — apenas bloqueado no write gateway e omitido nos reads.
- Schema (`GET /api/schema/entities/{slug}`) e allowlist de filtros excluem o campo enquanto desativado.
- Reverter com `activate-field`.

---

### `activate-field`
Reativa campo desativado. Campo reaparece no schema, reads e allowlist de filtros.

**Permissão:** `db_struct:write` | **Agent guard:** sim

**Entrada:** `{ "field_id": "uuid" }`  
**Saída:** `{ "success": true }`

---

### `field-stats`
Retorna estatísticas de preenchimento do campo.

**Permissão:** `db_struct:read` | **Agent guard:** nenhum (agentes podem chamar)

**Entrada:** `{ "field_id": "uuid" }`

**Saída:**
```json
{
  "success": true,
  "data": {
    "total_rows":     1000,
    "non_null_count": 750,
    "null_count":     250,
    "null_pct":       25.0
  }
}
```

**Notas:** Uso típico: verificar antes de desativar — se `null_pct ≈ 100`, campo está vazio e é seguro desativar.

---

### `deactivate-entity`
Desativa entidade customizada. Bloqueia writes; reads continuam. Cascateia para páginas.

**Permissão:** `db_struct:write` | **Agent guard:** sim

**Entrada:** `{ "entity_id": "uuid" }`  
**Saída:** `{ "success": true }`

**Notas:**
- Funciona apenas em entidades com `is_custom = true`.
- Write gateway retorna HTTP 422 (`write.deactivated_entity`) em qualquer write à entidade desativada.
- Reads continuam funcionando normalmente.
- Cascateia: páginas em `meta.page_definitions` com `entity_slug` correspondente recebem `is_active = false`.

---

### `activate-entity`
Reativa entidade desativada. Writes voltam a funcionar. Cascateia para páginas.

**Permissão:** `db_struct:write` | **Agent guard:** sim

**Entrada:** `{ "entity_id": "uuid" }`  
**Saída:** `{ "success": true }`

---

### `toggle-routine`
Ativa ou desativa uma rotina.

**Permissão:** `routines:update` | **Agent guard:** sim

**Entrada:** `{ "routine_id": "uuid", "is_active": false }`

**Saída:** `{ "success": true, "data": { "routine_id": "uuid", "is_active": false } }`

**Notas:** Emite evento `routine.toggled` para o outbox (soft failure — não falha a chamada).

---

### `register-event-type`
Registra tipo de evento customizado.

**Permissão:** `db_struct:write` | **Agent guard:** sim

**Entrada:**
```json
{
  "slug":           "meu.modulo.evento",
  "name":           "Meu Evento",
  "description":    "opcional",
  "payload_schema": {},
  "agent_batch_id": "uuid (opcional)"
}
```

**Saída:** `{ "success": true, "data": { "event_type_id": "uuid | null", "slug": "meu.modulo.evento" } }`

**Notas:** `ON CONFLICT (slug) DO NOTHING` — idempotente. Em conflito, `event_type_id` é `null` e nada é alterado.

---

### `deactivate-event-type`
Desativa tipo de evento (`is_active = false`). Não funciona em event types de sistema.

**Permissão:** `db_struct:write` | **Agent guard:** sim

**Entrada:** `{ "event_type_id": "uuid" }`  
**Saída:** `{ "success": true }`

---

### `register-nav-folder`
Registra pasta de navegação no menu lateral.

**Permissão:** `db_struct:write` | **Agent guard:** sim

**Entrada:**
```json
{
  "slug":           "minha-pasta",
  "title":          "Minha Pasta",
  "parent_id":      "uuid (opcional)",
  "sort_order":     10,
  "agent_batch_id": "uuid (opcional)"
}
```

**Saída (pasta criada):** `{ "success": true, "data": { "folder_id": "uuid", "path": "/minha-pasta", "created": true } }`

**Saída (conflito — pasta já existia, nada alterado):** `{ "success": true, "data": { "folder_id": null, "path": "/minha-pasta", "created": false } }`

**Notas:**
- `ON CONFLICT (path) DO NOTHING` — nunca sobrescreve pasta criada por humano ou outro módulo.
- `agent_batch_id` armazenado apenas quando `created: true`. Quando `created: false`, `folder_id` é `null` — não passar para `deactivate-nav-folder`.

---

### `deactivate-nav-folder`
Desativa pasta de navegação (`is_active = false`).

**Permissão:** `db_struct:write` | **Agent guard:** sim

**Entrada:** `{ "folder_id": "uuid" }`  
**Saída:** `{ "success": true }`

---

### Rastreamento — `agent_batch_id`

Colunas `agent_batch_id UUID NULL` adicionadas em:

| Tabela | Fn que popula |
|--------|---------------|
| `meta.field_definitions` | `add-entity-field`, `register-entity-field` |
| `meta.entity_definitions` | `register-entity` |
| `core.permissions` | `create-permission` |
| `core.event_types` | `register-event-type` |
| `meta.page_folders` | `register-nav-folder` (só quando `created: true`) |

**Query de rollback por batch:**
```sql
SELECT 'field'       AS tipo, id, slug                  FROM meta.field_definitions   WHERE agent_batch_id = $1
UNION ALL
SELECT 'entity',             id, slug                  FROM meta.entity_definitions  WHERE agent_batch_id = $1
UNION ALL
SELECT 'permission',         id, resource||'.'||action FROM core.permissions         WHERE agent_batch_id = $1
UNION ALL
SELECT 'event_type',         id, slug                  FROM core.event_types         WHERE agent_batch_id = $1
UNION ALL
SELECT 'nav_folder',         id, slug                  FROM meta.page_folders        WHERE agent_batch_id = $1
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
| `get-caller` | *(nenhum)* | nenhuma | `{user_id, principal_type, ...}` |
| `has-permission` | `resource*`, `action*` | nenhuma | `{has_permission}` |
| `set-audit-context` | `on_behalf_of`, `batch_id`, `triggered_by_job` | nenhuma | `{ok}` |
| `dispatch-background` | `action_name*`, `description*`, `payload`, `run_as`, `on_behalf_of` | ctx módulo | `{job_id}` |
| `job-is-cancelled` | *(nenhum)* | ctx job | `{cancelled}` |
| `register-background-action` | `name*`, `title*`, `description`, `max_attempts`, `timeout_seconds` | ctx módulo | `{id}` |
| `get-secret` | `name*` | ctx módulo | `{value}` |
| `set-secret` | `name*`, `value*` | ctx módulo | `{ok}` |
| `has-secret` | `name*` | ctx módulo | `{exists}` |
| `delete-secret` | `name*` | ctx módulo | `{ok}` |
| `create-agent-principal` | `name*`, `description` | ctx módulo | `{id}` |
| `deactivate-agent-principal` | `agent_id*` | ctx módulo | `{ok}` |
| `activate-agent-principal` | `agent_id*` | ctx módulo | `{ok}` |
| `grant-agent-permission` | `agent_id*`, `permission_id` ou `resource*`+`action*`, `scope`, `is_deny`, `grant_depth` | ctx módulo | `{id}` |
| `revoke-agent-permission` | `agent_id*`, `permission_id*` | ctx módulo | `{ok}` |
| `job-log` | `level*`, `message*` | ctx job | `{ok}` |
| `create-permission` | `resource*`, `action*`, `description` | ctx módulo | `{id, resource, action}` |
| `delete-permission` | `resource*`, `action*` | ctx módulo | `{deleted, cascade_count}` |
| `send-notification` | `title*`, `target_user_id` ou `target_role_slug` (um obrigatório), `kind`, `body`, `data` | nenhuma | `{success, data.count}` |
| `mcp-list-tools`    | *(nenhuma)*                                   | filtrado por RBAC | `{success, data[]}` |
| `mcp-call-tool`     | `name*`, `arguments`                          | `mcp_tool:{nome}` ou `{slug}_mcp:{nome}` | `{success, data}` |
| `register-entity`   | `name*`, `label*`, `fields`, `module_slug`, `agent_batch_id` | `db_struct:write` | `{success, data{entity_id,entity_slug,page_id}}` |
| `add-entity-field`  | `entity_slug*`, `name*`, `label*`, `field_type*`, `required`, `agent_batch_id` | `db_struct:write` | `{success, data{field_id,slug}}` |
| `deactivate-field`  | `field_id*`                                   | `db_struct:write` | `{success}` |
| `activate-field`    | `field_id*`                                   | `db_struct:write` | `{success}` |
| `field-stats`       | `field_id*`                                   | `db_struct:read`  | `{success, data{total_rows,non_null_count,null_count,null_pct}}` |
| `deactivate-entity` | `entity_id*`                                  | `db_struct:write` | `{success}` |
| `activate-entity`   | `entity_id*`                                  | `db_struct:write` | `{success}` |
| `toggle-routine`    | `routine_id*`, `is_active*`                   | `routines:update` | `{success, data{routine_id,is_active}}` |
| `register-event-type` | `slug*`, `name*`, `description`, `payload_schema`, `agent_batch_id` | `db_struct:write` | `{success, data{event_type_id,slug}}` |
| `deactivate-event-type` | `event_type_id*`                          | `db_struct:write` | `{success}` |
| `register-nav-folder` | `slug*`, `title*`, `parent_id`, `sort_order`, `agent_batch_id` | `db_struct:write` | `{success, data{folder_id,path,created}}` |
| `deactivate-nav-folder` | `folder_id*`                              | `db_struct:write` | `{success}` |

---

## interface module-host

Funções em `erp-core:component/module-host@0.1.0`. Chamadas em `start()` durante a inicialização do módulo — **não** durante execução de rotinas ou endpoints.

Todas as oito funções:
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

---

## Padrões

### Validar-Antes-de-Escrever (Dry-Run)

As host functions WASM não possuem rollback explícito. Cada chamada a `write-entity` ou `execute` confirma imediatamente. Para implementar um preflight ou dry-run, realize todas as validações primeiro — antes de qualquer chamada mutante — e prossiga somente se todas passarem.

```rust
// 1. Validar: checar existência, regras de negócio, quota, etc.
let existing = serde_json::from_str::<serde_json::Value>(
    &host::read_entity(r#"{"entity":"core.products","id":"..."}"#)
).unwrap();
if existing["success"] != true {
    return Err("product not found".into());
}

// 2. Somente após todas as validações, mutar.
host::write_entity(r#"{"entity":"core.products","schema_version":1,"data":{...}}"#);
```

Para operações multi-etapa custosas, estruture como: validar-tudo → mutar-tudo. Qualquer erro retornado antes da primeira chamada a `write-entity` ou `execute` não deixa efeitos colaterais.

---

### Escrita Atômica em Múltiplas Linhas

Múltiplas chamadas sequenciais a `write-entity` **não são atômicas** — se a terceira falhar, as duas primeiras já foram confirmadas. Para atomicidade real entre várias linhas, use uma única chamada a `execute` com CTE:

```rust
let sql = r#"
    WITH ins_a AS (
        INSERT INTO mod_meumodulo.pedidos (id, cliente_id)
        VALUES (gen_random_uuid(), $1)
        RETURNING id
    )
    INSERT INTO mod_meumodulo.itens_pedido (pedido_id, produto_id, qty)
    SELECT ins_a.id, $2, $3 FROM ins_a
"#;
let params = serde_json::json!(["cliente-uuid", "produto-uuid", 2]).to_string();
let result = host::execute(&serde_json::json!({"sql": sql, "params": params}).to_string());
// Ambas as linhas são inseridas ou nenhuma.
```

Restrição: `execute` só pode escrever em tabelas do próprio schema do módulo (`mod_{slug}`) ou em schemas com permissão explícita. Não aciona o log de auditoria nem o outbox de eventos do Core — use `write-entity` para entidades Core.

---

### Testando Fronteiras de Segurança

O runtime das host fns aplica regras de segurança que o código WASM não pode contornar. Em testes de integração, verifique explicitamente os caminhos de rejeição:

**Principal system não pode definir `on_behalf_of`**

```bash
# Despache um job que chama set-audit-context com on_behalf_of definido.
# O worker executa o job como principal system (user_id nulo).
# Esperado: { "ok": false, "error": "system principal cannot set on_behalf_of" }
```

**Contenção de escopo para caller humano (`grant-agent-permission`)**

Caller humano com grant direto de escopo `own` não pode re-delegar em escopo `company` ou `global`. Teste despachando uma action que chame `grant-agent-permission` com `scope="global"` a partir de um usuário que só tem uma linha de escopo `own`. Esperado: resposta de erro.

**Deny-wins sobrepõe grant**

Insira uma linha `is_deny=true` para uma permissão, depois tente uma ação que a exija. A linha de deny deve bloquear a ação mesmo que exista um grant via role.

> Estes são cenários de E2E — testes unitários WASM nativos (Rust `#[test]` com mocks das host fns) verificam a lógica interna do módulo, mas a aplicação das fronteiras de segurança exige uma instância Core real.
