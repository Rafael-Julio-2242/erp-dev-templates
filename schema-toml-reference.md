# `schema.toml` DSL Reference

`schema.toml` is an optional file inside a module ZIP bundle. When present, Core parses it at install
time, diffs the declarations against the live database, applies only the delta DDL, and automatically
registers `meta.entity_definitions` and `meta.field_definitions` rows. No extra work needed from the
module author.

---

## Why schema.toml vs SQL migrations

| Concern | SQL migrations | `schema.toml` |
|---|---|---|
| Requires writing DDL | Yes | No |
| Meta row registration | Manual | Automatic |
| Idempotent re-apply | Tracked by `schema_migrations` | Tracked by SHA-256 hash (`schema_state`) |
| Update delta | Full migration per change | Diff-generated — only new objects |
| Triggers / functions | Full DDL | Inline body or function reference |
| Destructive operations | Opt-in via `migrations.destructive` | Not supported (additive-only) |
| Complex logic / data backfills | Best fit | Use SQL migration instead |

Use `schema.toml` for everything a new module needs on day one. Add SQL migrations for destructive
changes (renames, type changes, drops) or data backfills. Both can coexist in the same ZIP — Core
applies SQL migrations first, then `schema.toml`.

---

## ZIP layout

```
module.zip
├── module.toml          (required)
├── module.wasm          (optional — omit for wasm = false modules)
├── migrations/          (optional)
│   └── 0001_init.sql
├── pages/               (optional)
└── schema.toml          (optional — this document)
```

---

## Full syntax reference

```toml
# ──────────────────────────────────────────────────────────────────────────────
# [[schema.tables]] — tables owned by this module
# Stored as mod_{module_slug}.{table_name}
# ──────────────────────────────────────────────────────────────────────────────

[[schema.tables]]
name  = "invoices"          # identifier — [a-z_][a-z0-9_]*, max 63 chars
label = "Notas Fiscais"     # written to meta.entity_definitions.label

  # Columns — order determines field_definitions.position
  [[schema.tables.columns]]
  name     = "id"
  type     = "uuid"
  primary  = true           # marks the primary key; only one column may be primary
  default  = "gen_random_uuid()"

  [[schema.tables.columns]]
  name       = "partner_id"
  type       = "uuid"
  required   = false        # nullable; default is false (nullable)
  references = "core.partners"   # FK — schema must be core, meta, or mod_{slug}
  on_delete  = "restrict"        # restrict | cascade | set_null | no_action

  [[schema.tables.columns]]
  name      = "total"
  type      = "numeric(15,2)"
  required  = true
  default   = "0"
  label     = "Total (R$)"  # optional override for field_definitions.label
  meta_type = "numeric"     # optional override for field_definitions.field_type

  # Indexes
  [[schema.tables.indexes]]
  columns = ["partner_id"]
  unique  = false

  [[schema.tables.indexes]]
  columns = ["numero"]
  unique  = true
  where   = "status != 'cancelled'"   # partial index predicate

  # CHECK constraints
  [[schema.tables.constraints]]
  type = "check"                          # only "check" is supported
  name = "invoices_total_non_negative"
  expr = "total >= 0"

  # Trigger — reference an existing function (no body generated)
  [[schema.tables.triggers]]
  name     = "trg_invoices_updated_at"
  timing   = "before"          # before | after
  events   = ["update"]        # insert | update | delete (one or more)
  for_each = "row"             # row | statement
  function = "core.fn_set_updated_at"   # existing fn — only core or meta schemas

  # Trigger — inline PL/pgSQL body
  # Core generates: mod_{slug}.{trigger_name}_fn() + the trigger itself
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
# [[schema.extend]] — add columns to existing Core tables
# Column names are automatically prefixed mod_{module_slug}_ to prevent collisions.
# Do NOT include the prefix in name — Core adds it.
# ──────────────────────────────────────────────────────────────────────────────

[[schema.extend]]
table = "core.documents"   # must be in the extendable whitelist (see below)

  [[schema.extend.columns]]
  name  = "nfe_chave"      # stored as mod_{slug}_nfe_chave in the DB
  type  = "text"
  label = "Chave NF-e"

  [[schema.extend.columns]]
  name  = "nfe_numero"
  type  = "integer"
  label = "Número NF-e"

# ──────────────────────────────────────────────────────────────────────────────
# [[schema.functions]] — standalone SQL / PL/pgSQL functions
# Stored as mod_{module_slug}.{function_name}
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
# [[schema.enums]] — PostgreSQL ENUM types
# Stored as mod_{module_slug}.{enum_name}
# ──────────────────────────────────────────────────────────────────────────────

[[schema.enums]]
name   = "invoice_status"
values = ["draft", "issued", "cancelled"]
```

---

## Column types

| Type | Notes |
|---|---|
| `text` | Variable-length text |
| `integer` | 32-bit integer |
| `bigint` | 64-bit integer |
| `boolean` | true / false |
| `uuid` | UUID |
| `date` | Calendar date (no time) |
| `timestamptz` | Timestamp with time zone |
| `jsonb` | Binary JSON |
| `bytea` | Binary data |
| `numeric` | Arbitrary precision |
| `numeric(p,s)` | Precision + scale — e.g. `numeric(15,2)` |

Any other type string is rejected with a 422 error before any DDL runs.

---

## Trigger body rules

1. **No `$$` inside the body.** Core wraps the body in `$$ BEGIN ... END; $$`. The body itself must not contain `$$`. Validated at parse time.
2. **Always `RETURN NEW` or `RETURN NULL`.** Row-level before-triggers must return a row. Omitting it causes a runtime error when the trigger fires.
3. **No transaction control.** Do not use `BEGIN`, `COMMIT`, or `ROLLBACK` inside bodies.
4. **Row access via `NEW` / `OLD`.** Standard PL/pgSQL trigger variables.
5. **Multi-line strings.** Use TOML triple-quoted strings (`"""..."""`).

---

## Extendable table whitelist

`[[schema.extend]]` may target only:

- `core.documents`
- `core.document_items`
- `core.partners`
- `core.users`

Extending any other table returns 422 `module.schema_validation`.

Column names are automatically prefixed `mod_{module_slug}_`. **Do not include the prefix yourself** — declare `name = "nfe_chave"` and Core stores it as `mod_fiscal_nfe_chave`.

---

## Additive-only guarantee

| Operation | Supported |
|---|---|
| Create table | Yes |
| Add column | Yes |
| Create index | Yes |
| Add CHECK constraint | Yes |
| Create / replace trigger | Yes |
| Create / replace function | Yes |
| Create enum | Yes |
| Add enum value | Yes |
| Drop table | **No** |
| Drop column | **No** |
| Rename column / table | **No** |
| Change column type | **No** |
| Drop index / constraint | **No** |

For destructive operations use a SQL migration in `migrations/`.

---

## Diff semantics

### First install

Core introspects the module schema (none exists yet) → full "create everything" delta applied.

### Module update (re-install with new schema.toml)

Core computes SHA-256 of `schema.toml` bytes. If the hash matches the one stored in `mod_{slug}.schema_state`, the engine is skipped entirely (fast path, 0 DDL). If the hash differs, Core introspects the live schema and applies only what's new — new tables, new columns on existing tables, new indexes, new enum values, etc.

---

## Meta row auto-registration

After DDL, Core registers schema objects in the meta layer automatically:

### For each `[[schema.tables]]`

| Table | What is written |
|---|---|
| `meta.entity_definitions` | `slug`, `table_ref = mod_{slug}.{name}`, `label`, `is_system = false`, `is_custom = false` |
| `meta.entity_tab_definitions` | Default `general` tab |
| `meta.field_definitions` | One row per non-primary column |

`field_type` is auto-derived from the column type:

| Column type | `field_type` |
|---|---|
| `text`, `bytea` | `text` |
| `integer`, `bigint` | `integer` |
| `boolean` | `boolean` |
| `uuid` | `uuid` |
| `date` | `date` |
| `timestamptz` | `timestamptz` |
| `jsonb` | `jsonb` |
| `numeric`, `numeric(p,s)` | `numeric` |

Override with `meta_type` on the column when you need a different value (e.g. `meta_type = "select"` for a FK column that should render as a dropdown).

### For each `[[schema.extend]]` column

Core finds the `entity_definitions` row for the target table and upserts a `field_definitions` row:
- `slug = mod_{slug}_{col_name}` (the prefixed name)
- `label` from `col.label` or `col.name`
- `is_custom = false`

Once registered, the read gateway serves the entity immediately without a server restart:

```
POST /api/read/{table_name}/search
GET  /api/read/{table_name}/{id}
```

---

## Error codes

| Code | HTTP | When |
|---|---|---|
| `module.schema_toml` | 422 | `schema.toml` is not valid UTF-8 or not valid TOML |
| `module.schema_validation` | 422 | Identifier fails regex, type not in allowlist, `$$` in body, invalid trigger timing/events, extend target not whitelisted |
| `module.schema_ddl_failed` | 500 | DDL execution failed; `message` contains the statement and the PG error |

Validation errors include a `field` path (e.g. `tables[0].columns[1].name`) to pinpoint the problem.

---

## Identifier rules

- Pattern: `[a-z_][a-z0-9_]*`
- Max length: 63 characters
- Case: lowercase only (PostgreSQL folds identifiers to lowercase anyway)

Names failing validation return 422 before any DDL is generated.

---

## Complete example — fiscal module

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

After installing this module, Core produces:

- Table `mod_fiscal.nfe_documents` with all declared columns, indexes, constraint, and trigger.
- Columns `mod_fiscal_nfe_chave` and `mod_fiscal_nfe_numero` added to `core.documents`.
- Function `mod_fiscal.validate_cnpj(text) RETURNS boolean`.
- Enum `mod_fiscal.nfe_status`.
- `meta.entity_definitions` row: `nfe_documents` → `mod_fiscal.nfe_documents`.
- `meta.field_definitions` rows for `document_id`, `chave_acesso`, `numero`, `status`, `emitido_em`.
- `meta.field_definitions` rows on the `documents` entity for `mod_fiscal_nfe_chave` and `mod_fiscal_nfe_numero`.

Read gateway available immediately (no server restart):
```
POST /api/read/nfe_documents/search
GET  /api/read/nfe_documents/{id}
```
