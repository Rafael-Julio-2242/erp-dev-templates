# Referência do DSL `schema.toml`

`schema.toml` é um arquivo opcional dentro de um bundle ZIP de módulo. Quando presente, o Core o analisa no momento da instalação, compara as declarações com o banco de dados ativo, aplica apenas o DDL delta e registra automaticamente as linhas em `meta.entity_definitions` e `meta.field_definitions`. Nenhum trabalho adicional é necessário do autor do módulo.

---

## Por que schema.toml vs migrations SQL

| Aspecto | `schema.toml` |
|---------|---------------|
| Requer escrever DDL | Não — declarativo |
| Registro de linhas meta | Automático |
| Seeding de permissões | Automático (read/create/update/delete por entidade) |
| Registro de tipos de evento | Declarativo via `[[event_types]]` |
| Reaplicação idempotente | Rastreado por hash SHA-256 (`schema_state`) |
| Delta de atualização | Gerado por diff — apenas objetos novos aplicados |
| Triggers / funções | Corpo inline ou referência de função |
| Operações destrutivas | Não suportado (somente aditivo) |
| Lógica complexa / backfills de dados | Use a pasta `seeds/` ou host functions no `start()` |

ZIPs de módulos externos **não podem** incluir uma pasta `migrations/` com arquivos SQL.
Use `schema.toml`, `entities/` e `seeds/` em vez disso. O sistema de migrations de
desenvolvimento do Core (arquivos em `migrations/postgres/*.sql`) é separado e não é afetado.

---

## Layout do ZIP

```
module.zip
├── module.toml              (obrigatório)
├── module.wasm              (opcional — omitir para módulos wasm = false)
├── pages/                   (opcional)
├── entities/                (opcional — um .toml por entidade)
│   └── products.toml
├── seeds/                   (opcional — dados INSERT-only)
│   └── categories.toml
└── schema.toml              (opcional — este documento)
```

> **Nota:** `migrations/` não é permitido em ZIPs de módulos externos. Qualquer ZIP com uma
> lista `migrations.files` não vazia será rejeitado com erro `422`.

---

## Referência completa de sintaxe

```toml
# ──────────────────────────────────────────────────────────────────────────────
# [[schema.tables]] — tabelas pertencentes a este módulo
# Armazenadas como mod_{module_slug}.{table_name}
# ──────────────────────────────────────────────────────────────────────────────

[[schema.tables]]
name  = "invoices"          # identificador — [a-z_][a-z0-9_]*, máx. 63 chars
label = "Notas Fiscais"     # escrito em meta.entity_definitions.label

  # Colunas — a ordem determina field_definitions.position
  [[schema.tables.columns]]
  name     = "id"
  type     = "uuid"
  primary  = true           # marca a chave primária; apenas uma coluna pode ser primary
  default  = "gen_random_uuid()"

  [[schema.tables.columns]]
  name       = "partner_id"
  type       = "uuid"
  required   = false        # nullable; padrão é false (nullable)
  references = "core.partners"   # FK — schema deve ser core, meta ou mod_{slug}
  on_delete  = "restrict"        # restrict | cascade | set_null | no_action

  [[schema.tables.columns]]
  name      = "total"
  type      = "numeric(15,2)"
  required  = true
  default   = "0"
  label     = "Total (R$)"  # substituição opcional para field_definitions.label
  meta_type = "numeric"     # substituição opcional para field_definitions.field_type

  # Índices
  [[schema.tables.indexes]]
  columns = ["partner_id"]
  unique  = false

  [[schema.tables.indexes]]
  columns = ["numero"]
  unique  = true
  where   = "status != 'cancelled'"   # predicado de índice parcial

  # Constraints CHECK
  [[schema.tables.constraints]]
  type = "check"                          # apenas "check" é suportado
  name = "invoices_total_non_negative"
  expr = "total >= 0"

  # Trigger — referência de função existente (nenhum corpo gerado)
  [[schema.tables.triggers]]
  name     = "trg_invoices_updated_at"
  timing   = "before"          # before | after
  events   = ["update"]        # insert | update | delete (um ou mais)
  for_each = "row"             # row | statement
  function = "core.fn_set_updated_at"   # função existente — apenas schemas core ou meta

  # Trigger — corpo PL/pgSQL inline
  # O Core gera: mod_{slug}.{trigger_name}_fn() + o próprio trigger
  [[schema.tables.triggers]]
  name     = "trg_after_issue"
  timing   = "after"
  events   = ["update"]
  for_each = "row"
  when     = "NEW.status = 'issued' AND OLD.status != 'issued'"
  body     = """
    INSERT INTO mod_fiscal.emission_queue (invoice_id, queued_at)
    VALUES (NEW.id, NOW())
    ON CONFLICT (invoice_id) DO NOTHING;
    RETURN NEW;
  """

# ──────────────────────────────────────────────────────────────────────────────
# [[schema.extend]] — adicionar colunas a tabelas Core existentes
# Os nomes das colunas são automaticamente prefixados com mod_{module_slug}_ para evitar colisões.
# NÃO inclua o prefixo no name — o Core o adiciona.
# ──────────────────────────────────────────────────────────────────────────────

[[schema.extend]]
table = "core.documents"   # deve estar na lista de permissão de extensão (veja abaixo)

  [[schema.extend.columns]]
  name  = "nfe_chave"      # armazenado como mod_{slug}_nfe_chave no banco
  type  = "text"
  label = "Chave NF-e"

  [[schema.extend.columns]]
  name  = "nfe_numero"
  type  = "integer"
  label = "Número NF-e"

# ──────────────────────────────────────────────────────────────────────────────
# [[schema.functions]] — funções SQL / PL/pgSQL standalone
# Armazenadas como mod_{module_slug}.{function_name}
# ──────────────────────────────────────────────────────────────────────────────

[[schema.functions]]
name     = "validate_cnpj"
returns  = "boolean"
language = "plpgsql"        # plpgsql | sql
args     = [
  { name = "p_cnpj", type = "text" },
]
body = """
DECLARE
  digits text;
BEGIN
  digits := regexp_replace(p_cnpj, '[^0-9]', '', 'g');
  RETURN length(digits) = 14;
END;
"""

# ──────────────────────────────────────────────────────────────────────────────
# [[schema.enums]] — tipos ENUM do PostgreSQL
# Armazenados como mod_{module_slug}.{enum_name}
# ──────────────────────────────────────────────────────────────────────────────

[[schema.enums]]
name   = "invoice_status"
values = ["draft", "issued", "cancelled"]

# ──────────────────────────────────────────────────────────────────────────────
# [[permissions]] — permissões customizadas além das auto-inseridas read/create/update/delete
# Inseridas em core.permissions com ON CONFLICT (resource, action) DO NOTHING
# ──────────────────────────────────────────────────────────────────────────────

[[permissions]]
resource    = "invoices"
action      = "approve"
description = "Permite aprovar notas fiscais para pagamento"    # opcional

[[permissions]]
resource    = "invoices"
action      = "cancel"
description = "Permite cancelar uma nota fiscal emitida"

# ──────────────────────────────────────────────────────────────────────────────
# [[event_types]] — registro de tipos de evento
# Inseridos em core.event_types com ON CONFLICT (slug) DO NOTHING
# ──────────────────────────────────────────────────────────────────────────────

[[event_types]]
slug           = "fiscal.nfe.issued"
name           = "NF-e Emitida"
description    = "Emitido quando uma NF-e é emitida com sucesso"     # opcional
# payload_schema é opcional — JSON Schema descrevendo o payload do evento
payload_schema = { "type" = "object", "properties" = { "nfe_id" = { "type" = "string" } } }

[[event_types]]
slug        = "fiscal.nfe.cancelled"
name        = "NF-e Cancelada"
description = "Emitido quando uma NF-e é cancelada"
```

---

## Tipos de coluna

| Tipo | Notas |
|------|-------|
| `text` | Texto de comprimento variável |
| `integer` | Inteiro de 32 bits |
| `bigint` | Inteiro de 64 bits |
| `boolean` | true / false |
| `uuid` | UUID |
| `date` | Data de calendário (sem hora) |
| `timestamptz` | Timestamp com fuso horário |
| `jsonb` | JSON binário |
| `bytea` | Dados binários |
| `numeric` | Precisão arbitrária |
| `numeric(p,s)` | Precisão + escala — ex.: `numeric(15,2)` |

Qualquer outro tipo é rejeitado com erro 422 antes de qualquer DDL ser executado.

---

## Regras para corpo de triggers

1. **Sem `$$` no corpo.** O Core envolve o corpo em `$$ BEGIN ... END; $$`. O próprio corpo não deve conter `$$`. Validado no momento do parse.
2. **Sempre `RETURN NEW` ou `RETURN NULL`.** Triggers row-level before devem retornar uma linha. Omitir causa erro de runtime quando o trigger dispara.
3. **Sem controle de transação.** Não use `BEGIN`, `COMMIT` ou `ROLLBACK` dentro dos corpos.
4. **Acesso a linhas via `NEW` / `OLD`.** Variáveis padrão de trigger em PL/pgSQL.
5. **Strings multi-linha.** Use strings TOML entre aspas triplas (`"""..."""`).

---

## Lista de permissão de tabelas extensíveis

`[[schema.extend]]` pode ter como alvo apenas:

- `core.documents`
- `core.document_items`
- `core.partners`
- `core.users`

Estender qualquer outra tabela retorna 422 `module.schema_validation`.

Os nomes das colunas são automaticamente prefixados com `mod_{module_slug}_`. **Não inclua o prefixo você mesmo** — declare `name = "nfe_chave"` e o Core armazena como `mod_fiscal_nfe_chave`.

---

## Garantia de somente adição

| Operação | Suportada |
|----------|-----------|
| Criar tabela | Sim |
| Adicionar coluna | Sim |
| Criar índice | Sim |
| Adicionar constraint CHECK | Sim |
| Criar / substituir trigger | Sim |
| Criar / substituir função | Sim |
| Criar enum | Sim |
| Adicionar valor ao enum | Sim |
| Remover tabela | **Não** |
| Remover coluna | **Não** |
| Renomear coluna / tabela | **Não** |
| Alterar tipo de coluna | **Não** |
| Remover índice / constraint | **Não** |

Operações destrutivas não são suportadas para módulos externos. Se uma alteração destrutiva for necessária, o módulo deve ser desinstalado e reinstalado com o schema atualizado.

---

## Semântica do diff

### Primeira instalação

O Core inspeciona o schema do módulo (ainda não existe) → delta "criar tudo" aplicado.

### Atualização de módulo (reinstalação com novo schema.toml)

O Core calcula o SHA-256 dos bytes de `schema.toml`. Se o hash corresponder ao armazenado em `mod_{slug}.schema_state`, o motor é ignorado por completo (caminho rápido, 0 DDL). Se o hash diferir, o Core inspeciona o schema ativo e aplica apenas o que é novo — novas tabelas, novas colunas em tabelas existentes, novos índices, novos valores de enum, etc.

---

## Registro automático de linhas meta

Após o DDL, o Core registra os objetos de schema na camada meta automaticamente:

### Para cada `[[schema.tables]]`

| Tabela | O que é escrito |
|--------|----------------|
| `meta.entity_definitions` | `slug`, `table_ref = mod_{slug}.{name}`, `label`, `is_system = false`, `is_custom = false` |
| `meta.entity_tab_definitions` | Aba padrão `general` |
| `meta.field_definitions` | Uma linha por coluna não-primária |
| `core.permissions` | `read`, `create`, `update`, `delete` para o slug da entidade (ON CONFLICT DO NOTHING) |

`field_type` é derivado automaticamente do tipo da coluna:

| Tipo da coluna | `field_type` |
|----------------|-------------|
| `text`, `bytea` | `text` |
| `integer`, `bigint` | `integer` |
| `boolean` | `boolean` |
| `uuid` | `uuid` |
| `date` | `date` |
| `timestamptz` | `timestamptz` |
| `jsonb` | `jsonb` |
| `numeric`, `numeric(p,s)` | `numeric` |

Substitua com `meta_type` na coluna quando precisar de um valor diferente (ex.: `meta_type = "select"` para uma coluna FK que deve ser renderizada como dropdown).

### Para cada coluna de `[[schema.extend]]`

O Core encontra a linha de `entity_definitions` para a tabela alvo e faz upsert de uma linha em `field_definitions`:
- `slug = mod_{slug}_{col_name}` (o nome prefixado)
- `label` de `col.label` ou `col.name`
- `is_custom = false`

Uma vez registrado, o gateway de leitura serve a entidade imediatamente sem reiniciar o servidor:

```
POST /api/read/{table_name}/search
GET  /api/read/{table_name}/{id}
```

---

## Códigos de erro

| Código | HTTP | Quando |
|--------|------|--------|
| `module.schema_toml` | 422 | `schema.toml` não é UTF-8 válido ou TOML inválido |
| `module.schema_validation` | 422 | Identificador falha no regex, tipo não está na lista de permissão, `$$` no corpo, timing/eventos de trigger inválidos, alvo de extend não está na lista |
| `module.schema_ddl_failed` | 500 | Falha na execução do DDL; `message` contém a instrução e o erro do PG |
| `module.invalid_manifest` | 422 | ZIP contém uma lista `migrations.files` não vazia (migrations SQL brutas não são permitidas em ZIPs externos) |

Erros de validação incluem um caminho `field` (ex.: `tables[0].columns[1].name`) para identificar o problema.

---

## Pasta seeds/ — dados INSERT-only

Coloque arquivos `.toml` ou `.json` em `seeds/` para inserir dados de referência durante a instalação.

**Formato TOML:**
```toml
entity = "categories"   # slug da entidade (deve pertencer a este módulo)

[[rows]]
name = "Eletrônicos"
code = "ELEC"

[[rows]]
name = "Móveis"
code = "FURN"
```

**Formato JSON:**
```json
{
  "entity": "categories",
  "rows": [
    { "name": "Eletrônicos", "code": "ELEC" },
    { "name": "Móveis",      "code": "FURN" }
  ]
}
```

Regras:
- Todas as linhas usam `ON CONFLICT DO NOTHING`. A deduplicação só funciona quando a tabela possui uma unique constraint que a linha do seed violaria — tabelas sem uma acumularão linhas duplicadas a cada re-instalação. Adicione uma entrada `[[schema.tables.indexes]]` com `unique = true` em qualquer chave natural que queira deduplicar.
- A entidade deve ser declarada no `schema.toml` ou na pasta `entities/` do mesmo módulo.
- Seeding entre módulos não é permitido; o instalador rejeita seeds direcionados a tabelas de outro módulo.
- A lista de colunas é derivada da primeira linha; todas as linhas devem ter as mesmas chaves.
- Para lógica de seed condicional ou complexa (`INSERT ... WHERE NOT EXISTS`, joins), use `start()` via host functions.

---

## Regras de identificadores

- Padrão: `[a-z_][a-z0-9_]*`
- Comprimento máximo: 63 caracteres
- Caso: apenas minúsculas (o PostgreSQL converte identificadores para minúsculo de qualquer forma)

Nomes que falham na validação retornam 422 antes de qualquer DDL ser gerado.

---

## Exemplo completo — módulo fiscal

```toml
[[schema.tables]]
name  = "nfe_documents"
label = "Documentos NF-e"

  [[schema.tables.columns]]
  name    = "id"
  type    = "uuid"
  primary = true
  default = "gen_random_uuid()"

  [[schema.tables.columns]]
  name       = "document_id"
  type       = "uuid"
  required   = true
  references = "core.documents"
  on_delete  = "cascade"

  [[schema.tables.columns]]
  name     = "chave_acesso"
  type     = "text"
  required = false
  label    = "Chave de Acesso"

  [[schema.tables.columns]]
  name     = "numero"
  type     = "integer"
  required = false
  label    = "Número"

  [[schema.tables.columns]]
  name     = "status"
  type     = "text"
  required = true
  default  = "'pendente'"
  label    = "Status"

  [[schema.tables.columns]]
  name     = "emitido_em"
  type     = "timestamptz"
  required = false
  label    = "Emitido em"

  [[schema.tables.indexes]]
  columns = ["document_id"]
  unique  = true

  [[schema.tables.indexes]]
  columns = ["chave_acesso"]
  unique  = true
  where   = "chave_acesso IS NOT NULL"

  [[schema.tables.constraints]]
  type = "check"
  name = "nfe_status_valid"
  expr = "status IN ('pendente', 'emitido', 'cancelado', 'rejeitado')"

  [[schema.tables.triggers]]
  name     = "trg_nfe_updated_at"
  timing   = "before"
  events   = ["update"]
  for_each = "row"
  function = "core.fn_set_updated_at"

[[schema.extend]]
table = "core.documents"

  [[schema.extend.columns]]
  name  = "nfe_chave"
  type  = "text"
  label = "Chave NF-e"

  [[schema.extend.columns]]
  name  = "nfe_numero"
  type  = "integer"
  label = "Número NF-e"

[[schema.functions]]
name     = "validate_cnpj"
returns  = "boolean"
language = "plpgsql"
args     = [
  { name = "p_cnpj", type = "text" },
]
body = """
DECLARE
  digits text;
BEGIN
  digits := regexp_replace(p_cnpj, '[^0-9]', '', 'g');
  RETURN length(digits) = 14;
END;
"""

[[schema.enums]]
name   = "nfe_status"
values = ["pendente", "emitido", "cancelado", "rejeitado"]
```

Após instalar este módulo, o Core produz:

- Tabela `mod_fiscal.nfe_documents` com todas as colunas, índices, constraint e trigger declarados.
- Colunas `mod_fiscal_nfe_chave` e `mod_fiscal_nfe_numero` adicionadas a `core.documents`.
- Função `mod_fiscal.validate_cnpj(text) RETURNS boolean`.
- Enum `mod_fiscal.nfe_status`.
- Linha em `meta.entity_definitions`: `nfe_documents` → `mod_fiscal.nfe_documents`.
- Linhas em `meta.field_definitions` para `document_id`, `chave_acesso`, `numero`, `status`, `emitido_em`.
- Linhas em `meta.field_definitions` na entidade `documents` para `mod_fiscal_nfe_chave` e `mod_fiscal_nfe_numero`.

Gateway de leitura disponível imediatamente (sem reiniciar o servidor):
```
POST /api/read/nfe_documents/search
GET  /api/read/nfe_documents/{id}
```
