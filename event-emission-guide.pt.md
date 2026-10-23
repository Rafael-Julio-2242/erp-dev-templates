# Guia de Emissão de Eventos

Qualquer operação que altera estado — criação, atualização ou exclusão de um registro —
deve emitir um evento. Isso não é opcional. Sem eventos, outros módulos não conseguem
reagir a mudanças, a trilha de auditoria fica incompleta, e o sistema vira um
monólito fortemente acoplado onde toda integração exige alteração direta no código.

---

## A regra

> **Toda escrita, toda exclusão → um evento.**

Operações somente de leitura (consultas, buscas, lookups) não emitem eventos.
Eventos são apenas para estado que mudou e que outras partes do sistema
possam se interessar.

---

## Convenção de nomenclatura

Use segmentos separados por ponto: `{modulo}.{entidade}.{verbo}` (passado).

```
stock.product.created
stock.product.updated
stock.product.deleted
stock.movement.created
fiscal.nfe.issued
fiscal.nfe.cancelled
purchasing.order.approved
```

Evite verbos genéricos como `changed` ou `modified`. Use o verbo no passado mais específico
que descreva com precisão o que aconteceu: `created`, `updated`, `deleted`,
`approved`, `issued`, `cancelled`, `transferred`, `reserved`.

---

## O que incluir no payload

Sempre inclua:

| Campo | Por quê |
|---|---|
| `{entidade}_id` | Permite que assinantes busquem o registro completo quando necessário |
| `entity_slug` | Faz consumidores genéricos de eventos funcionarem sem hardcode |
| `occurred_at` | Quando a mudança aconteceu (use `get-time`) |
| `performed_by` | Quem disparou — passe a partir do contexto da requisição |

Inclua valores de antes/depois em atualizações quando o estado anterior importa:

```json
{
  "product_id":   "550e8400-...",
  "entity_slug":  "mod_stock.products",
  "old_quantity": 15,
  "new_quantity": 8,
  "delta":        -7,
  "occurred_at":  "2025-10-23T14:32:00Z",
  "performed_by": "user-uuid"
}
```

Para criações e exclusões, inclua um snapshot dos campos relevantes para que
assinantes não precisem fazer uma nova consulta:

```json
{
  "product_id":  "550e8400-...",
  "sku":         "PROD-001",
  "name":        "Widget A",
  "company_id":  "company-uuid",
  "occurred_at": "2025-10-23T14:32:00Z"
}
```

---

## Padrão: emitir após a escrita ser bem-sucedida

Sempre emita **depois** da escrita, nunca antes. Se a escrita falhar, nenhum evento
deve ser disparado. Se a emissão do evento falhar, registre um aviso mas não desfaça
a escrita — o sistema de eventos é eventualmente consistente, não transacional.

```rust
fn create_product(input: &str) -> String {
    let payload: serde_json::Value = match serde_json::from_str(input) {
        Ok(v)  => v,
        Err(e) => return err_response(&format!("invalid input: {e}")),
    };

    // 1. Escrever primeiro
    let write_req = serde_json::json!({
        "entity":         "mod_stock.products",
        "schema_version": 1,
        "data": {
            "name":       payload["name"],
            "sku":        payload["sku"],
            "quantity":   0,
            "threshold":  payload["threshold"].as_i64().unwrap_or(10)
        }
    });
    let raw = host::write_entity(&write_req.to_string());
    let res: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();

    if !res["success"].as_bool().unwrap_or(false) {
        return err_response("failed to create product");
    }

    let product_id = res["data"]["entity_id"].as_str().unwrap_or("");
    let occurred_at = {
        let t: serde_json::Value = serde_json::from_str(&host::get_time()).unwrap_or_default();
        t["data"]["iso8601"].as_str().unwrap_or("").to_string()
    };

    // 2. Emitir após o sucesso — falha aqui não é fatal
    let emit_res = host::emit_event(&serde_json::json!({
        "event_type": "stock.product.created",
        "payload": {
            "product_id":  product_id,
            "entity_slug": "mod_stock.products",
            "sku":         payload["sku"],
            "name":        payload["name"],
            "occurred_at": occurred_at
        }
    }).to_string());
    let emit: serde_json::Value = serde_json::from_str(&emit_res).unwrap_or_default();
    if !emit["success"].as_bool().unwrap_or(false) {
        host::log("warn", &format!("[stock] emit stock.product.created failed: {}", emit["message"]));
    }

    ok_response(serde_json::json!({ "product_id": product_id }))
}
```

---

## Padrão: emitir para operações em lote

Para operações em lote, emita um único evento de resumo — não um evento por linha. Emitir
N eventos para N linhas sobrecarrega assinantes e degrada a performance.

```rust
// ✅ um evento de resumo para ajuste de estoque em lote
host::emit_event(&serde_json::json!({
    "event_type": "stock.adjustment.completed",
    "payload": {
        "batch_id":    batch_id,
        "item_count":  affected_count,
        "occurred_at": occurred_at
    }
}).to_string());

// ❌ nunca faça isso dentro de um loop
for item in &items {
    host::emit_event(&serde_json::json!({
        "event_type": "stock.product.updated",
        "payload": { "product_id": item["id"] }
    }).to_string());
}
```

---

## Tipos de evento devem ser registrados

`emit-event` exige que o slug do `event_type` exista em `meta.event_types`.
Registre os tipos de evento do seu módulo em uma migration:

```sql
-- migrations/0002_register_event_types.sql
INSERT INTO meta.event_types (slug, label, description, schema_version)
VALUES
    ('stock.product.created',  'Produto criado',   'Emitido quando um produto é cadastrado', 1),
    ('stock.product.updated',  'Produto atualizado', 'Emitido quando um produto é alterado',  1),
    ('stock.product.deleted',  'Produto removido', 'Emitido quando um produto é excluído',   1),
    ('stock.movement.created', 'Movimentação de estoque', 'Emitido a cada entrada ou saída de estoque', 1)
ON CONFLICT (slug) DO NOTHING;
```

Se você pular esse passo, `emit-event` retornará `success: false` e o evento
será descartado silenciosamente.

---

## Consumindo eventos de outro módulo

Qualquer módulo pode escutar eventos emitidos por outros módulos. Registre o handler
em `start()` e processe em `call_event`:

```rust
fn start() -> String {
    // Escutar eventos de estoque do módulo stock
    host::register_event_handler(&serde_json::json!({
        "event_type":   "stock.product.created",
        "handler_name": "on_product_created"
    }).to_string());
    r#"{"success":true,"data":null,"message":"ok"}"#.into()
}

fn call_event(name: String, _trigger: String, _entity: String, data: String) -> String {
    match name.as_str() {
        "on_product_created" => handle_product_created(&data),
        _ => err_response(&format!("unknown handler: {name}")),
    }
}

fn handle_product_created(data: &str) -> String {
    let payload: serde_json::Value = serde_json::from_str(data).unwrap_or_default();
    let product_id = payload["product_id"].as_str().unwrap_or("");
    // ... reagir ao novo produto
    ok_response(serde_json::json!({ "processed": product_id }))
}
```

---

## Resumo

| Situação | Emitir? |
|---|---|
| Registro criado via `write-entity` | Sim — `{modulo}.{entidade}.created` |
| Registro atualizado via `write-entity` | Sim — `{modulo}.{entidade}.updated` |
| Registro excluído via `delete-entity` ou `execute` | Sim — `{modulo}.{entidade}.deleted` |
| Operação em lote concluída | Sim — um evento de resumo |
| Consulta / busca / leitura | Não |
| Estado interno intermediário (revertido) | Não |
| Step de operação disparado (ciclo de vida do documento) | Geralmente não — o próprio step já é o evento |

Emita após a escrita. Nunca antes. Registre falhas, nunca aborte por causa delas.
Registre todos os tipos de evento em uma migration antes do primeiro uso.
