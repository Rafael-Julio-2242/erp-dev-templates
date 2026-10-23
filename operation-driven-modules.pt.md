# Design de Módulos Orientados a Operações

Módulos que afetam fluxos de negócio críticos — estoque, fiscal, precificação,
conformidade, impressão — **devem** ancorar sua configuração em
`core.document_operations`, e não em uma tabela de configurações global.

Esse padrão é inegociável para qualquer módulo que altere comportamento com base
no tipo de transação que está sendo executada.

---

## Por que a configuração global quebra em produção

Uma tabela de configuração global parece inofensiva no início:

```sql
-- ❌ anti-pattern
CREATE TABLE mod_fiscal.config (
    singleton    BOOL PRIMARY KEY DEFAULT true CHECK (singleton = true),
    cfop         TEXT NOT NULL DEFAULT '5102',
    cst          TEXT NOT NULL DEFAULT '000',
    emit_nfe     BOOL NOT NULL DEFAULT true
);
```

O problema: uma empresa tem *Venda Simples* (sem NF-e, CFOP 5102) e *Venda
Interestadual* (NF-e obrigatória, CFOP 6102) rodando simultaneamente.
Um `emit_nfe = true` global quebra a primeira operação. Definir como `false`
quebra a segunda. Não há como satisfazer as duas — o módulo fica permanentemente
mal configurado para pelo menos um fluxo de trabalho.

---

## O padrão correto: configuração por operação

Cada operação recebe sua própria linha na tabela de configuração:

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

Agora *Venda Simples* e *Venda Interestadual* têm cada uma a sua linha.
Adicionar um terceiro tipo de operação custa um INSERT, não uma mudança de código.

---

## Conexão: registrar um step na operação

Seu módulo se conecta ao ciclo de vida do documento registrando um step na
operação relevante. Faça isso a partir de `start()` ou de uma rotina dedicada
que o instalador chama após criar a operação.

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

## Conexão: lendo a configuração dentro do handler

Quando o step disparar, seu handler recebe o `document_id` no payload.
Resolva a operação a partir do documento e carregue a linha de configuração:

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

## Expondo a configuração via SchemaForm

Registre `operation_config` como entidade para que operadores possam configurá-la
pela interface sem mudanças de código:

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

## Aplica-se a muito mais do que fiscal

O mesmo princípio se aplica a todo módulo que altera comportamento por fluxo de trabalho:

| Tipo de módulo | O que deve ser por operação |
|---|---|
| Fiscal / NF-e | CFOP, CST, regime tributário, flag NF-e |
| Estoque | Qual depósito debitar, política de reserva |
| Precificação | Qual tabela de preços ou regra de desconto aplicar |
| Impressão | Qual layout ou template de documento usar |
| Conformidade | Qual cadeia de aprovação acionar |
| Integrações | Qual endpoint de API externo ou credenciais usar |

Se um módulo armazena uma configuração que possa precisar ser diferente para duas
operações rodando na mesma empresa, essa configuração pertence a uma tabela com
escopo por operação, e não a uma tabela global.

---

## Triggers do ciclo de vida da operação

Triggers disponíveis para `document_operation_steps.trigger`:

| Trigger | Quando dispara |
|---|---|
| `before_save` | Antes de o documento ser persistido (pode abortar) |
| `after_save` | Após o documento ser salvo (rascunho) |
| `before_approve` | Antes da transição de aprovação |
| `after_approve` | Após a aprovação — documento aprovado |
| `before_issue` | Antes da transição de emissão |
| `after_issue` | Após a emissão — documento totalmente emitido, seguro para emitir NF-e |
| `before_cancel` | Antes do cancelamento — pode abortar |
| `after_cancel` | Após o cancelamento — eventos de estorno aqui |

Use `after_issue` para emissão de NF-e, decremento de estoque e lançamento financeiro.
Use `before_cancel` para validar se o cancelamento ainda é permitido (ex.: NF-e já
autorizada na SEFAZ). Use `before_save` apenas para validação síncrona que precisa
bloquear o salvamento.

---

## Resumo

> Todo comportamento que depende de *qual* operação o acionou deve ser armazenado
> em uma tabela com `operation_id` como chave estrangeira. Uma tabela de configuração
> global é um bug esperando para acontecer em qualquer ambiente com múltiplas operações.
