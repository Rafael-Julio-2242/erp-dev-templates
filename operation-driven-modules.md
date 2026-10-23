# Operation-Driven Module Design

Modules that affect business-critical workflows — stock, fiscal, pricing,
compliance, printing — **must** anchor their configuration to
`core.document_operations`, not to a global settings table.

This pattern is non-negotiable for any module that changes behavior based on
what kind of transaction is being executed.

---

## Why global config breaks production

A global config table looks harmless at first:

```sql
-- ❌ anti-pattern
CREATE TABLE mod_fiscal.config (
    singleton    BOOL PRIMARY KEY DEFAULT true CHECK (singleton = true),
    cfop         TEXT NOT NULL DEFAULT '5102',
    cst          TEXT NOT NULL DEFAULT '000',
    emit_nfe     BOOL NOT NULL DEFAULT true
);
```

The problem: one company has *Venda Simples* (no NF-e, CFOP 5102) and *Venda
Interestadual* (NF-e required, CFOP 6102) running simultaneously.
A global `emit_nfe = true` breaks the first operation. Setting it to `false`
breaks the second. There is no way to satisfy both — the module becomes
permanently misconfigured for at least one workflow.

---

## The correct pattern: config per operation

Each operation gets its own row in your config table:

```sql
-- ✅ correct
CREATE TABLE mod_fiscal.operation_config (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_id    UUID NOT NULL REFERENCES core.document_operations(id) ON DELETE CASCADE,
    cfop            TEXT NOT NULL,
    cst             TEXT NOT NULL DEFAULT '000',
    emit_nfe        BOOL NOT NULL DEFAULT false,
    tax_regime      TEXT NOT NULL DEFAULT 'simples',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (operation_id)
);
```

Now *Venda Simples* and *Venda Interestadual* each have their own row.
Adding a third operation type costs one INSERT, not a code change.

---

## Wiring: register a step on the operation

Your module hooks into the document lifecycle by registering a step on the
relevant operation. Do this from `start()` or via a dedicated routine that the
installer calls after creating the operation.

```rust
// Register a step: after_issue → call this module's fiscal handler
let step = serde_json::json!({
    "operation_id": operation_id,   // UUID of the target operation
    "trigger":      "after_issue",  // before/after save/approve/issue/cancel
    "action_type":  "call_module_function",
    "action_config": {
        "module_slug": "fiscal",
        "function":    "on_issue"   // maps to call_event("on_issue", ...)
    },
    "position": 0
});
host::execute(&serde_json::json!({
    "sql": "INSERT INTO core.document_operation_steps
            (operation_id, trigger, action_type, action_config, position)
            VALUES ($1, $2, $3, $4, $5)",
    "params": [
        operation_id,
        step["trigger"],
        step["action_type"],
        step["action_config"].to_string(),
        "0"
    ]
}).to_string());
```

---

## Wiring: reading config inside the handler

When the step fires, your handler receives the `document_id` in its payload.
Resolve the operation from the document, then look up your config row:

```rust
fn on_issue(data: &str) -> String {
    let payload: serde_json::Value = serde_json::from_str(data).unwrap_or_default();
    let document_id = payload["document_id"].as_str().unwrap_or("");

    // 1. Resolve operation_id from the document
    let doc_raw = host::query(&serde_json::json!({
        "sql":    "SELECT operation_id FROM core.documents WHERE id = $1",
        "params": [document_id]
    }).to_string());
    let doc_res: serde_json::Value = serde_json::from_str(&doc_raw).unwrap_or_default();
    let operation_id = doc_res["rows"][0]["operation_id"].as_str().unwrap_or("");

    // 2. Load THIS module's config for that specific operation
    let cfg_raw = host::query(&serde_json::json!({
        "sql":    "SELECT * FROM mod_fiscal.operation_config WHERE operation_id = $1",
        "params": [operation_id]
    }).to_string());
    let cfg_res: serde_json::Value = serde_json::from_str(&cfg_raw).unwrap_or_default();

    let cfg = &cfg_res["rows"][0];
    let emit_nfe = cfg["emit_nfe"].as_bool().unwrap_or(false);
    let cfop     = cfg["cfop"].as_str().unwrap_or("5102");

    if !emit_nfe {
        return ok_response(serde_json::json!({ "skipped": "nfe not required for this operation" }));
    }

    // 3. Proceed with operation-specific fiscal logic
    emit_nfe_for_document(document_id, cfop)
}
```

---

## Exposing config via SchemaForm

Register `operation_config` as an entity so operators can configure it from
the UI without code changes:

```toml
# entities/operation_config.toml

[table]
name  = "operation_config"
label = "Configuração Fiscal por Operação"

  [[table.columns]]
  name       = "id"
  type       = "uuid"
  primary    = true
  default    = "gen_random_uuid()"

  [[table.columns]]
  name       = "operation_id"
  type       = "uuid"
  required   = true
  references = "core.document_operations.id"
  on_delete  = "cascade"
  label      = "Operação"

  [[table.columns]]
  name     = "cfop"
  type     = "text"
  required = true
  label    = "CFOP"

  [[table.columns]]
  name     = "emit_nfe"
  type     = "boolean"
  required = true
  default  = "false"
  label    = "Emitir NF-e"

[form]
title = "Configuração Fiscal por Operação"

  [[form.tabs]]
  key   = "general"
  label = "Geral"

  [[form.fields]]
  column    = "operation_id"
  label     = "Operação"
  tab       = "general"
  position  = 0
  required  = true
  fk_entity = "document_operation"

  [[form.fields]]
  column   = "cfop"
  label    = "CFOP"
  tab      = "general"
  position = 1
  required = true
  mask     = "9999"

  [[form.fields]]
  column   = "emit_nfe"
  label    = "Emitir NF-e"
  tab      = "general"
  position = 2
```

---

## Applies to more than fiscal

The same principle applies to every module that changes behavior per workflow:

| Module type | What to key by operation |
|---|---|
| Fiscal / NF-e | CFOP, CST, tax regime, NF-e flag |
| Stock | Which warehouse to debit, reservation policy |
| Pricing | Which price table or discount rule to apply |
| Printing | Which document layout or template to use |
| Compliance | Which approval chain to trigger |
| Integrations | Which external API endpoint or credentials to use |

If a module stores a setting that could ever need to be different for two
operations running in the same company, that setting belongs in an
operation-scoped config table, not a global one.

---

## Operation lifecycle triggers

Available triggers for `document_operation_steps.trigger`:

| Trigger | When it fires |
|---|---|
| `before_save` | Before the document is persisted (can abort) |
| `after_save` | After the document is saved (draft) |
| `before_approve` | Before approval transition |
| `after_approve` | After approval — document is approved |
| `before_issue` | Before issue transition |
| `after_issue` | After issue — document is fully issued, safe to emit NF-e |
| `before_cancel` | Before cancellation — can abort |
| `after_cancel` | After cancellation — issue reversal events here |

Use `after_issue` for NF-e emission, stock decrement, and financial posting.
Use `before_cancel` to validate if cancellation is still allowed (e.g., NF-e
already authorised with SEFAZ). Use `before_save` only for synchronous
validation that must block the save.

---

## Summary

> Every behavior that depends on *which* operation triggered it must be stored
> in a table with `operation_id` as a foreign key. A global config table is a
> bug waiting to happen in any multi-operation environment.
