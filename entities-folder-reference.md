# entities/ Folder Reference

The optional `entities/` folder inside a module ZIP lets you declare tables and SchemaForm pages using a TOML DSL instead of hand-writing SQL migrations.

One `.toml` file = one entity. Core processes every file in this folder on install, after `schema.toml` has been applied.

---

## Rules

- **Table-only** (`[table]` section, no `[form]`): Core creates the table in `mod_{slug}` schema, registers `meta.entity_definitions`, seeds `meta.field_definitions` for every declared column, and auto-seeds `read/create/update/delete` permissions in `core.permissions`. No UI page is created.
- **Table + form** (`[table]` + `[form]` sections): same as above, plus Core creates a `meta.page_definitions` row so the entity appears as a SchemaForm page in the navigation.
- **Idempotent**: install is a no-op when the table already matches (same hash). Safe to re-install.
- **Permissions**: `read`, `create`, `update`, `delete` are auto-seeded for each entity on every install with `ON CONFLICT DO NOTHING`.
- **Uninstall**: `meta.entity_definitions` rows are deleted (cascade-deletes `field_definitions` and `page_definitions`). Tables in `mod_{slug}` are **not dropped**.

---

## File Layout

```
module-zip/
├── module.toml
├── entities/
│   ├── categories.toml   ← [table] only
│   └── items.toml        ← [table] + [form]
├── migrations/           ← optional; runs before entities/
└── schema.toml           ← optional; runs before entities/
```

---

## `[table]` Section

```toml
[table]
name  = "products"     # snake_case identifier — becomes mod_{module_slug}.products
label = "Produtos"     # human-readable label stored in entity_definitions
```

### `[[table.columns]]`

Each column is a `[[table.columns]]` entry.

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

### Column Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Snake_case column name. `[a-z_][a-z0-9_]*`, max 63 chars. |
| `type` | string | ✅ | See type list below. |
| `primary` | bool | ❌ | Marks this column as PRIMARY KEY. If omitted, Core auto-adds `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`. |
| `required` | bool | ❌ | `true` → `NOT NULL` constraint. Default: `false`. |
| `default` | string | ❌ | SQL default expression: `"gen_random_uuid()"`, `"NOW()"`, `"true"`, `"0"`, `"'active'"`, etc. |
| `label` | string | ❌ | Human-readable label stored in `field_definitions.label`. Falls back to `name` if omitted. |
| `references` | string | ❌ | FK target. See **FK references** below. |
| `on_delete` | string | ❌ | Required when `references` is set. Must be **lowercase**: `restrict`, `cascade`, `set_null`, `no_action`. |

### Allowed Column Types

| TOML `type` | PostgreSQL DDL | `field_type` in field_definitions |
|-------------|----------------|------------------------------------|
| `text` | `TEXT` | `text` |
| `integer` | `INTEGER` | `integer` |
| `bigint` | `BIGINT` | `integer` |
| `boolean` | `BOOLEAN` | `boolean` |
| `uuid` (no FK) | `UUID` | `text` |
| `uuid` (with FK) | `UUID` + FK constraint | `select` |
| `date` | `DATE` | `date` |
| `timestamptz` | `TIMESTAMPTZ` | `datetime` |
| `jsonb` | `JSONB` | `json` |
| `numeric` | `NUMERIC` | `decimal` |
| `numeric(p,s)` | `NUMERIC(p, s)` | `decimal` |
| `bytea` | `BYTEA` | `text` |

### FK References

`references` takes a dot-separated path:

| Format | Scope | Example |
|--------|-------|---------|
| `table.column` | Same module schema | `"categories.id"` |
| `schema.table.column` | Cross-module or core | `"mod_stock.categories.id"` |

The FK constraint is added as `REFERENCES mod_{slug}.{table}({column})` (or the fully-qualified path for 3-segment refs).

`on_delete` must be lowercase — validation rejects `CASCADE`, `RESTRICT`, etc.

---

## `[form]` Section (optional)

Adding `[form]` to an entity file registers a SchemaForm page in `meta.page_definitions`. Users open this page to create and edit records for the entity.

```toml
[form]
title = "Produtos"   # page title shown in the UI header
```

### `[[form.tabs]]`

Optional grouping. If omitted, all fields render in a single default tab.

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

| Field | Required | Notes |
|-------|----------|-------|
| `key` | ✅ | Identifier referenced by `[[form.fields]].tab` |
| `label` | ✅ | Tab label shown in the UI |
| `position` | ❌ | Display order (lowest first). Default: 0. |

### `[[form.fields]]`

One entry per visible form field.

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

### Form Field Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `column` | string | ✅ | Must match a `[[table.columns]]` `name`. |
| `label` | string | ❌ | Overrides column label for this form. |
| `tab` | string | ❌ | `key` of a `[[form.tabs]]` entry. Omit if not using tabs. |
| `position` | integer | ❌ | Display order within the tab (lowest first). |
| `required` | bool | ❌ | Client-side required validation in the form. |
| `show_mode` | string | ❌ | `always` \| `create_only` \| `edit_only`. Default: `always`. |
| `placeholder` | string | ❌ | Placeholder text shown inside the input. |
| `fk_entity` | string | ❌ | Entity **slug** (not table name) for FK dropdown lookup. Required for `uuid` columns with `references`. The form renders a searchable select that queries `POST /api/read/{fk_entity}/search`. |

---

## Complete Example — Two Entities

### `entities/categories.toml` (table-only)

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

No `[form]` section → no SchemaForm page is created for `categories`. The entity is accessible via the read/write gateways but has no auto-generated UI.

### `entities/items.toml` (table + form)

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

`[form]` present → Core registers a SchemaForm page for `items`. The `category_id` field renders as a searchable FK dropdown backed by `POST /api/read/categories/search`.

---

## What Core Registers on Install

For each entity file:

| Table | Row created |
|-------|-------------|
| `meta.entity_definitions` | One row with `slug`, `module_id`, `table_ref = "mod_{slug}.{name}"`, `label` |
| `meta.field_definitions` | One row per `[[table.columns]]` entry (excluding PK `id` and auto-added timestamps) |
| `meta.page_definitions` | One row **only if** `[form]` section is present |

FK columns get `fk_entity_slug` set on their `field_definitions` row, which the frontend uses to drive FK lookup dropdowns.

---

## Interaction with `schema.toml` and `migrations/`

Core applies these in order:

1. `migrations/` SQL files (in the order declared in `module.toml`)
2. `schema.toml` (declarative DDL engine)
3. `entities/` files (DDL + meta registration)

`entities/` runs last, so migrations and schema.toml can set up prerequisites (extensions, seed data, referenced tables from other modules) before entities/ creates tables that depend on them.

---

## Error Codes

| Code | HTTP | When |
|------|------|------|
| `module.entities_toml` | 422 | File is not valid UTF-8 or not valid TOML |
| `module.schema_validation` | 422 | `on_delete` not lowercase, unknown column type, FK format invalid |
| `module.schema_ddl_failed` | 500 | DDL execution failed; `message` contains the statement prefix and Postgres error |
