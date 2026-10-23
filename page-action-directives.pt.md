# Diretivas de Ação de Página

Quando uma ação de página executa uma rotina WASM, o valor de retorno da rotina é passado diretamente para o frontend. Seguindo a convenção de diretivas abaixo, a rotina pode disparar respostas de UI (toasts, modais, formulários, redirecionamentos) em vez de apenas retornar dados brutos.

---

## Envelope de Resposta

Toda rotina executada como ação de página deve retornar pelo menos:

```json
{
  "success": true
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `success` | bool | ✅ | `true` = concluído (ou solicitando mais entrada). `false` = erro. |
| `refetch` | bool | ❌ | Quando `true`, o frontend recarrega a lista de registros da página após processar a diretiva. Padrão: `false`. |
| `directive` | string | ❌ | Um dos: `toast`, `modal`, `confirm`, `input_form`, `redirect`. Ausente = toast de sucesso genérico. |

### Comportamento padrão (sem `directive`)

- `success: true` → frontend exibe toast genérico "Ação executada com sucesso."
- `success: false` → frontend exibe toast de erro com o valor do campo `message`.

```json
{ "success": false, "message": "Não foi possível arquivar: existem pedidos pendentes." }
```

---

## Diretivas

### `toast`

Exibe uma notificação. Sem ação de continuação.

```json
{
  "success":     true,
  "directive":   "toast",
  "variant":     "success",
  "message":     "Exportação concluída.",
  "description": "Arquivo disponível por 24h.",
  "refetch":     false
}
```

| Campo | Tipo | Valores |
|-------|------|---------|
| `variant` | string | `success` `error` `info` `warning` |
| `message` | string | Texto principal da notificação |
| `description` | string | Subtítulo opcional |

---

### `modal`

Exibe um diálogo informativo. Sem re-execução.

```json
{
  "success":     true,
  "directive":   "modal",
  "variant":     "warning",
  "title":       "Atenção",
  "body":        "Não é possível excluir registros com pedidos ativos.",
  "close_label": "Entendido"
}
```

| Campo | Tipo | Valores |
|-------|------|---------|
| `variant` | string | `info` `warning` `error` |
| `title` | string | Título do diálogo |
| `body` | string | Texto do corpo do diálogo |
| `close_label` | string | Rótulo do botão (padrão: "Fechar") |

---

### `confirm`

Solicita confirmação do usuário em tempo de execução antes de prosseguir. O frontend exibe um diálogo de confirmação e — se o usuário aceitar — re-chama o mesmo endpoint de execução com `extra._confirmed = true`.

**Fase 1 — rotina retorna `confirm`:**

```json
{
  "success":       true,
  "directive":     "confirm",
  "title":         "Confirmar arquivamento",
  "message":       "Você está prestes a arquivar 47 registros. Esta ação não pode ser desfeita.",
  "confirm_label": "Arquivar",
  "cancel_label":  "Cancelar"
}
```

**Fase 2 — frontend re-executa com flag de confirmação:**

```json
{
  "extra": { "_confirmed": true }
}
```

**Comportamento da rotina na fase 2:**

```rust
let confirmed = ctx.extra.get("_confirmed")
    .and_then(|v| v.as_bool())
    .unwrap_or(false);

if !confirmed {
    // Retorna a diretiva confirm
    return json!({ "success": true, "directive": "confirm", ... });
}

// Executa a ação real
```

A rotina pode retornar qualquer diretiva após o usuário confirmar — geralmente `toast` ou `modal`.

> **Confirmação estática:** Se o mesmo texto pode ser exibido sem dados em tempo de execução, use `requires_confirmation: true` e `confirmation_message` na configuração da ação de página. O frontend exibe o diálogo de confirmação antes mesmo de chamar execute, portanto a rotina não precisa tratar `_confirmed`.

---

### `input_form`

Abre um modal de formulário para coletar entrada adicional e re-executa com esses dados.

**Fase 1 — rotina solicita entrada do formulário:**

```json
{
  "success":      true,
  "directive":    "input_form",
  "title":        "Configurar relatório",
  "description":  "Informe o período desejado.",
  "submit_label": "Gerar",
  "fields": [
    {
      "name":        "date_from",
      "label":       "Data inicial",
      "type":        "date",
      "required":    true,
      "placeholder": null,
      "options":     null
    },
    {
      "name":     "date_to",
      "label":    "Data final",
      "type":     "date",
      "required": true
    },
    {
      "name":     "format",
      "label":    "Formato",
      "type":     "select",
      "required": true,
      "options":  [
        { "value": "pdf",  "label": "PDF" },
        { "value": "xlsx", "label": "Excel" }
      ]
    },
    {
      "name":     "notes",
      "label":    "Observações",
      "type":     "textarea",
      "required": false
    }
  ]
}
```

**Tipos de campo:**

| `type` | Componente | Precisa de `options` |
|--------|-----------|----------------------|
| `text` | Campo de texto | Não |
| `number` | Campo numérico | Não |
| `textarea` | Texto multilinha | Não |
| `date` | Seletor de data | Não |
| `select` | Dropdown de seleção única | Sim |
| `multiselect` | Dropdown de seleção múltipla | Sim |
| `checkbox` | Toggle booleano | Não |

**Fase 2 — frontend re-executa com dados do formulário:**

```json
{
  "extra": {
    "date_from": "2025-01-01",
    "date_to":   "2025-06-30",
    "format":    "pdf",
    "notes":     "",
    "_submitted": true
  }
}
```

O frontend valida os campos `required` no lado do cliente antes de enviar. A rotina também pode validar no lado do servidor.

**Comportamento da rotina:**

```rust
let submitted = ctx.extra.get("_submitted")
    .and_then(|v| v.as_bool())
    .unwrap_or(false);

if !submitted {
    // Retorna a diretiva input_form
    return json!({ "success": true, "directive": "input_form", ... });
}

let date_from = ctx.extra.get("date_from").and_then(|v| v.as_str());
// ... valida e executa
```

**Falha de validação no servidor (fase 2):**

Se os dados enviados forem inválidos, retorne o formulário novamente com erros por campo. O frontend re-renderiza o formulário com os erros exibidos abaixo de cada campo.

```json
{
  "success":   false,
  "directive": "input_form",
  "title":     "Configurar relatório",
  "fields":    [ ... mesmos campos ... ],
  "errors": {
    "date_from": "Data inicial é obrigatória.",
    "date_to":   "Data final deve ser posterior à data inicial."
  }
}
```

---

### `redirect`

Navega o SPA para outra página. O frontend abre o destino como uma nova aba no shell.

```json
{
  "success":   true,
  "directive": "redirect",
  "slug":      "orders"
}
```

`slug` deve ser um slug de página válido registrado no sistema (uma página nativa da plataforma ou uma página customizada armazenada no banco).

---

## Confirmação Estática

Para diálogos de confirmação cujo texto não depende de dados em tempo de execução, configure `requires_confirmation` e `confirmation_message` diretamente na ação de página:

```json
POST /api/pages/{id}/actions
{
  "routine_id":            "uuid",
  "label":                 "Excluir selecionados",
  "requires_confirmation": true,
  "confirmation_message":  "Esta ação não pode ser desfeita. Deseja continuar?"
}
```

O frontend exibe o diálogo de confirmação **antes** de chamar execute. A rotina recebe uma chamada normal sem flag `_confirmed` e pode assumir que o usuário já confirmou.

Use a diretiva `confirm` em tempo de execução quando o texto de confirmação precisar incluir dados dinâmicos (ex.: contagem de registros) que a rotina precisa calcular.

---

## Flag `refetch`

Qualquer diretiva pode incluir `"refetch": true` para instruir o frontend a recarregar a lista de registros da página após processar a diretiva:

```json
{
  "success":   true,
  "directive": "toast",
  "variant":   "success",
  "message":   "3 registros arquivados.",
  "refetch":   true
}
```

---

## Contexto de Execução

A rotina recebe este contexto quando chamada por uma ação de página:

```json
{
  "page_id":        "uuid",
  "page_slug":      "orders",
  "selected_ids":   ["uuid", "uuid"],
  "page_records":   [{ "id": "uuid", "status": "pending" }],
  "active_filters": { "filters": [{ "order": 1, "group": 1, "field": "status", "op": "eq", "value": "pending" }] },
  "extra":          {}
}
```

- `selected_ids` — UUIDs dos registros selecionados pelo usuário na lista
- `page_records` — objetos completos dos registros selecionados
- `active_filters` — estado atual dos filtros (veja `advanced-search.md`)
- `extra` — payload adicional do lado do cliente, incluindo `_confirmed` e `_submitted` para fluxos em duas fases
