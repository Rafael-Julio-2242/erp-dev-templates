# Referência do `module.toml`

`module.toml` é o arquivo de manifesto na raiz de todo ZIP de módulo. O Core o lê durante a instalação para registrar rotinas, endpoints HTTP, handlers de eventos, páginas, pastas de navegação, behaviors de documentos, tipos de documento e dependências entre módulos. Campos ausentes assumem listas vazias como padrão.

---

## Layout do ZIP

```
module.zip
├── module.toml              ← este documento (obrigatório)
├── module.wasm              (obrigatório quando wasm = true)
├── schema.toml              (opcional — DDL declarativo)
├── entities/                (opcional — um .toml por entidade)
├── seeds/                   (opcional — dados INSERT-only)
└── pages/                   (opcional — uma pasta por página)
    └── my-dashboard/
        └── index.html
```

---

## `[module]` — metadados

```toml
[module]
name        = "Meu Módulo"
slug        = "meu-modulo"
version     = "01.000.000"
min_core    = "01.000.000"
description = "Descrição curta exibida na lista de módulos."
icon        = "box"
author      = "Acme Corp"
wasm        = true
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `name` | string | ✅ | Nome de exibição legível por humanos |
| `slug` | string | ✅ | Identificador único — `[a-z0-9-]+`, máx 64 caracteres. Determina o prefixo de schema `mod_{slug}` |
| `version` | string | ✅ | `MM.mmm.ppp` com zero-padding — ex.: `01.002.003`. Deve aumentar em cada re-instalação que altere algo |
| `min_core` | string | ✅ | Versão mínima do Core exigida. Mesmo formato `MM.mmm.ppp`. A instalação retorna 422 se o Core em execução for mais antigo |
| `description` | string | ❌ | Descrição curta opcional |
| `icon` | string | ❌ | Dica de ícone para a UI |
| `author` | string | ✅ | Nome do autor do módulo. Armazenado em `core.routines.author` para cada rotina registrada |
| `wasm` | bool | ✅ | `true` quando `module.wasm` está no ZIP. `false` para módulos apenas de schema — rotinas, endpoints e event handlers declarados no TOML não serão executáveis |

**Regras de formato da versão:**
- Exatamente `MM.mmm.ppp` — maior com 2 dígitos, menor com 3, patch com 3, separados por pontos
- Zero-preencha todas as partes: `01.000.000`, `01.002.010`, `02.000.000`
- A comparação é lexicográfica (funciona por causa do zero-padding)

---

## `[[routines]]`

Rotinas são funções WASM nomeadas chamáveis por endpoints HTTP, event handlers, behaviors ou o scheduler do Core.

```toml
[[routines]]
name          = "calcular-total"        # relativo — armazenado como meu-modulo.calcular-total
description   = "Calcula o total do pedido incluindo impostos."
routine_type  = "function"
param_schema  = { type = "object", properties = { order_id = { type = "string" } } }
return_schema = { type = "object", properties = { total = { type = "number" } } }

[[routines]]
name         = "sincronizar-estoque"
routine_type = "procedure"              # sem valor de retorno
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `name` | string | ✅ | Nome relativo, armazenado como `{module_slug}.{name}` em `core.routines` |
| `description` | string | ❌ | Descrição legível por humanos |
| `routine_type` | string | ✅ | Ver tabela abaixo |
| `param_schema` | objeto JSON Schema | ❌ | Schema de entrada (JSON Schema draft-07) |
| `return_schema` | objeto JSON Schema | ❌ | Schema de saída |

**Valores de `routine_type`:**

| Valor | Descrição |
|---|---|
| `function` | Retorna um valor |
| `procedure` | Com efeitos colaterais; sem valor de retorno |
| `trigger` | Chamado quando um trigger de DB/evento dispara |
| `action` | Ação invocável pelo usuário |
| `interceptor` | Intercepta uma etapa de pipeline |
| `scheduled` | Executa em agendamento recorrente. **Nota:** `cron_expression` NÃO é configurado pelo module.toml — configure o agendamento via painel do Core após a instalação |

---

## `[[endpoints]]`

Endpoints HTTP customizados despachados para uma rotina WASM. As rotas ficam ativas imediatamente após a instalação — sem necessidade de reiniciar o Core.

```toml
[[endpoints]]
path          = "/meu-modulo/calcular"   # caminho completo da URL
method        = "POST"
routine_name  = "calcular-total"          # relativo — mesmo nome em [[routines]]
auth_required = true

[[endpoints]]
path          = "/meu-modulo/status-publico"
method        = "GET"
routine_name  = "obter-status"
auth_required = false
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `path` | string | ✅ | Caminho completo da URL. Deve ser único entre todos os módulos instalados |
| `method` | string | ✅ | Método HTTP: `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| `routine_name` | string | ✅ | Nome relativo da rotina (declarada em `[[routines]]`). Armazenado como `{module_slug}.{routine_name}` |
| `auth_required` | bool | ✅ | Se o endpoint exige um token de sessão válido |

Na re-instalação, rotas não presentes no manifesto são **desativadas** (não deletadas). Rotas desativadas retornam 404.

---

## `[[event_handlers]]`

Inscreve uma rotina WASM em um tipo de evento publicado. A cada evento correspondente, o Core invoca a rotina de forma assíncrona.

```toml
[[event_handlers]]
event_slug   = "estoque.item.reservado"   # deve existir em core.event_types
routine_name = "ao-reservar-item"          # nome relativo da rotina
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `event_slug` | string | ✅ | Slug do tipo de evento para se inscrever. Deve existir em `core.event_types` antes que o handler possa disparar |
| `routine_name` | string | ✅ | Nome relativo da rotina (declarada em `[[routines]]`) |

Na re-instalação, handlers não presentes no manifesto são removidos.

---

## `[[pages]]`

Páginas de UI customizadas com assets HTML/CSS/JS estáticos no ZIP. As páginas usam hash de conteúdo — a re-instalação pula páginas cujos assets não mudaram.

```toml
[[pages]]
slug        = "meu-dashboard"           # deve corresponder a pages/meu-dashboard/index.html no ZIP
title       = "Dashboard"
permissions = ["meu-modulo.dashboard:read"]

  [[pages.sections]]
  slug                = "resumo"
  title               = "Resumo"
  sort_order          = 0

  [[pages.sections]]
  slug                = "detalhes"
  title               = "Detalhes"
  required_permission = "meu-modulo.dashboard:admin"
  sort_order          = 1
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `slug` | string | ✅ | Identificador da página. Um asset ZIP deve existir em `pages/{slug}/index.html` — 422 se ausente |
| `title` | string | ✅ | Título de exibição |
| `permissions` | array de strings | ❌ | Slugs de permissão necessários para acessar esta página |
| `sections` | array | ❌ | Sub-seções nomeadas dentro da página |

**Campos de seção:**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `slug` | string | ✅ | Identificador da seção |
| `title` | string | ✅ | Título de exibição da seção |
| `required_permission` | string | ❌ | Se definido, a seção fica oculta para usuários sem esta permissão |
| `sort_order` | inteiro | ❌ | Ordem de exibição; padrão 0 |

**Diferença das páginas entities/:** `[[pages]]` exigem assets HTML físicos no ZIP e renderizam frontends arbitrários. As páginas de entidade `[form]` são UIs SchemaForm geradas automaticamente — sem HTML necessário.

Na re-instalação, páginas não presentes no manifesto são desativadas.

---

## `[nav]`

Atribui páginas a pastas de navegação na barra lateral. As pastas são criadas na instalação e removidas na desinstalação.

```toml
[[nav.folders]]
slug       = "meu-modulo"
title      = "Meu Módulo"
sort_order = 10

[[nav.folders]]
slug       = "relatorios"
title      = "Relatórios"
parent     = "meu-modulo"    # cria meu-modulo/relatorios — o pai deve existir antes
sort_order = 0

[[nav.items]]
page       = "meu-dashboard"        # slug de [[pages]]
folder     = "meu-modulo"           # caminho completo (ex.: "meu-modulo/relatorios" para aninhado)
sort_order = 0
```

**Campos de `[[nav.folders]]`:**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `slug` | string | ✅ | Identificador da pasta (último segmento do caminho) |
| `title` | string | ✅ | Rótulo de exibição na barra lateral |
| `parent` | string | ❌ | Caminho completo da pasta pai (ex.: `"financeiro"` ou `"financeiro/relatorios"`). Omitir para pastas raiz |
| `sort_order` | inteiro | ❌ | Posição de ordenação; padrão 0 |

**Campos de `[[nav.items]]`:**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `page` | string | ✅ | Slug da página — deve ser declarado em `[[pages]]` deste módulo |
| `folder` | string | ✅ | Caminho completo da pasta. Deve ser declarado em `[[nav.folders]]` acima, OU já existir no Core como pasta de sistema |
| `sort_order` | inteiro | ❌ | Posição de ordenação dentro da pasta; padrão 0 |

**Regras:**
- As pastas são processadas em profundidade: pais antes dos filhos. Declare as pastas pai antes das filhas no array TOML.
- Módulos podem atribuir páginas a pastas de sistema do Core já existentes (ex.: `"configuracoes"`) sem declará-las em `[[nav.folders]]`.
- A instalação valida todas as referências de `nav.items[].page` e `nav.items[].folder` antes de escrever qualquer coisa — uma referência inválida retorna 422.

---

## `[[behaviors]]`

Hooks do ciclo de vida de documentos. Os behaviors disparam quando um documento muda de estado (aprovar, emitir, cancelar).

```toml
[[behaviors]]
slug         = "meu-modulo.notificar-aprovacao"
label        = "Notificar equipe na aprovação"
trigger      = "after_approve"
handler_type = "emit_event"
handler_config = { event_type = "meu-modulo.documento.aprovado" }
position     = 0

[[behaviors]]
slug         = "meu-modulo.validar-antes-emitir"
label        = "Validar itens antes de emitir"
trigger      = "before_issue"
handler_type = "call_routine"
handler_config = { routine_slug = "meu-modulo.validar-emissao" }
position     = 10
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `slug` | string | ✅ | Identificador único de behavior entre todos os módulos |
| `label` | string | ✅ | Descrição legível por humanos |
| `trigger` | string | ✅ | Evento de ciclo de vida que dispara este behavior (ver abaixo) |
| `handler_type` | string | ✅ | Estratégia de despacho (ver abaixo) |
| `handler_config` | objeto | ✅ | Configuração específica do tipo |
| `position` | inteiro | ❌ | Ordem de execução entre behaviors no mesmo trigger; padrão 0 |

**Valores de `trigger`:**

| Valor | Quando dispara | Comportamento em erro |
|---|---|---|
| `before_approve` | Antes da transição de aprovação | Erro aborta a transição |
| `after_approve` | Após a transição de aprovação | Erro apenas registrado |
| `before_issue` | Antes da transição de emissão | Erro aborta a transição |
| `after_issue` | Após a transição de emissão | Erro apenas registrado |
| `before_cancel` | Antes da transição de cancelamento | Erro aborta a transição |
| `after_cancel` | Após a transição de cancelamento | Erro apenas registrado |

**Valores de `handler_type`:**

| Valor | Shape do `handler_config` | Descrição |
|---|---|---|
| `emit_event` | `{ event_type: "meu.evento.slug" }` | Publica o slug do evento no outbox |
| `call_routine` | `{ routine_slug: "meu-modulo.minha-rotina" }` | Dispara a rotina de forma assíncrona via outbox |
| `call_module_function` | `{}` | Despacha para o WASM do módulo (assíncrono; valor de retorno não usado) |

**Importante:** behaviors instalados por um módulo são marcados como `is_locked = true`. Eles **não são removidos na desinstalação** — sobrevivem à remoção do módulo e devem ser limpos manualmente se não forem mais necessários.

---

## `[[document_type_groups]]` + `[[document_types]]`

Registra tipos de documento e seus grupos. Os tipos de documento aparecem no fluxo de criação de documentos. A instalação semeia automaticamente as permissões `read`, `create`, `update` e `delete` para cada tipo sob o recurso `documents.<slug>`.

```toml
[[document_type_groups]]
slug     = "docs-meu-modulo"
label    = "Documentos do Meu Módulo"
position = 10

[[document_types]]
slug       = "ordem-compra"
label      = "Ordem de Compra"
group_slug = "docs-meu-modulo"    # deve corresponder a um slug de [[document_type_groups]] acima
position   = 0

[[document_types]]
slug       = "recebimento-mercadoria"
label      = "Recebimento de Mercadoria"
group_slug = "docs-meu-modulo"
position   = 1
```

**Campos de `[[document_type_groups]]`:**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `slug` | string | ✅ | Identificador único do grupo |
| `label` | string | ✅ | Rótulo de exibição |
| `position` | inteiro | ❌ | Posição de ordenação; padrão 0 |

**Campos de `[[document_types]]`:**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `slug` | string | ✅ | Identificador único do tipo de documento |
| `label` | string | ✅ | Rótulo de exibição |
| `group_slug` | string | ✅ | Grupo pai — deve ser declarado em `[[document_type_groups]]` neste manifesto |
| `position` | inteiro | ❌ | Posição de ordenação dentro do grupo; padrão 0 |

**Importante:** tipos e grupos de documento **não são removidos na desinstalação**. Persistem até serem deletados manualmente.

---

## `[dependencies]`

Declara outros módulos que devem estar instalados antes deste.

```toml
[dependencies]

[[dependencies.required]]
slug       = "fiscal"
version    = ">=01.002.000"      # constraint semver contra MM.mmm.ppp
marketplace_id = "fiscal-br"    # opcional — para resolução no marketplace

[[dependencies.optional]]
slug    = "crm"
version = "^01.000.000"
```

**Campos de dependência:**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `slug` | string | ✅ | Slug do módulo requerido |
| `version` | string | ✅ | Constraint semver contra `MM.mmm.ppp`. Suporta operadores `>=`, `^`, `~`, `=` |
| `marketplace_id` | string | ❌ | Identificador no marketplace para resolução automatizada |

**Comportamento na instalação:**
- Dependências `required`: 422 se o módulo não estiver instalado, ou se a versão instalada não satisfizer a constraint
- Dependências `optional`: sem verificação — silenciosamente ignoradas se não instaladas

---

## Ferramentas MCP (registradas via WASM)

As ferramentas MCP **não são declaradas no module.toml**. Elas são registradas em tempo de execução WASM chamando a host function `register_mcp_tool` a partir do export `start()` do módulo:

```rust
// Dentro do start() do módulo
register_mcp_tool(RegisterMcpToolInput {
    name:         "buscar-produtos",
    description:  "Busca o catálogo de produtos",
    input_schema: json!({ "type": "object", "properties": { "q": { "type": "string" } } }),
    routine_name: "buscar-produtos",
});
```

As ferramentas registradas aparecem em `tools/list` como `module__{slug}__{tool_name}` e são chamáveis via o protocolo MCP padrão. Consulte [`host-fn-reference.md`](host-fn-reference.md) para a assinatura completa da host function.

---

## Desinstalação

```
DELETE /api/modules/{slug}?drop_schema=false
DELETE /api/modules/{slug}?drop_schema=true
```

**O que é sempre removido:**

| Recurso | O que é deletado |
|---|---|
| Rotinas | Todas as linhas de `core.routines` para este módulo |
| Páginas | Linhas de `meta.page_definitions` → recarrega cache de páginas |
| Pastas de navegação | Linhas de `meta.page_folders` de propriedade deste módulo |
| Rotas | Linhas de `sys.route_definitions` → recarrega registro de rotas |
| Event handlers | Linhas de `core.module_event_handlers` |
| Definições de entidade | `meta.entity_definitions` e `field_definitions` em cascata |
| Artefato WASM | Binário removido do artifact store |

**Apenas com `drop_schema=true`:**

`DROP SCHEMA IF EXISTS mod_{slug} CASCADE` — remove todas as tabelas, sequences e views do schema do módulo. **Irreversível.**

**O que NÃO é removido na desinstalação:**

| Recurso | Motivo |
|---|---|
| `[[behaviors]]` | Marcados como `is_locked = true` — sobrevivem para auditabilidade |
| `[[document_types]]` e `[[document_type_groups]]` | Documentos que referenciam estes tipos devem continuar resolúveis |
| Ferramentas MCP em `sys.mcp_tool_definitions` | Limpas no próximo start() se o módulo não existir mais |

Após a desinstalação, `wasm_status` é definido como `"uninstalled"` e o evento `module.uninstalled` é publicado.

---

## Códigos de erro

| Código | HTTP | Quando |
|---|---|---|
| `module.invalid_manifest` | 422 | `module.toml` inválido, asset de página ausente, referência de nav inválida, `migrations.files` não vazio |
| `module.version_incompatible` | 422 | `min_core` é mais alto que a versão do Core em execução |
| `module.dependency_not_met` | 422 | Um módulo de dependência `required` não está instalado |
| `module.dependency_version_mismatch` | 422 | Uma dependência está instalada, mas sua versão não satisfaz a constraint |
| `module.artifact_not_found` | 404 | Módulo não encontrado durante a desinstalação ou registro de capacidade |
| `module.schema_validation` | 422 | `schema.toml` referencia um tipo inválido ou um alvo de extend não permitido |
| `module.schema_ddl_failed` | 500 | Instrução DDL falhou durante a aplicação do schema |
