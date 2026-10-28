# Referência do SDK ERP.js

`window.ERP` é injetado automaticamente em toda página HTML personalizada servida pelo shell do ERP Core. Ele dá à sua página acesso autenticado aos dados, rotinas, eventos e utilitários de UI da plataforma, sem nenhuma configuração extra.

---

## Visão Geral

Páginas personalizadas são renderizadas dentro de um `<iframe srcDoc>`. O SDK é embutido no documento antes que seu código execute, portanto `window.ERP` já está disponível imediatamente — sem import, sem tag `<script>` extra.

```html
<!doctype html>
<html>
<head><title>Minha Página</title></head>
<body>
  <div id="app"></div>
  <script>
    // window.ERP está pronto aqui
    const user = ERP.user();
    document.getElementById('app').textContent = 'Olá, ' + user.name;
  </script>
</body>
</html>
```

---

## Modos de Transporte

O SDK seleciona um transporte automaticamente:

| Modo | Quando | Como |
|------|--------|------|
| **Produção** | Executando dentro do shell ERP | Lê o JWT do `localStorage`; chamadas de API vão para a mesma origem |
| **Servidor** | `erp.config.json` com `"mode": "server"` | Chama uma instância remota do ERP; útil para testes de integração |
| **Mock** | `erp.config.json` com `"mode": "mock"` | Store em memória; sem rede; útil para desenvolvimento de UI local |

### `erp.config.json` — Modo servidor

```json
{
  "mode": "server",
  "server": "http://localhost:3001",
  "token": "<um JWT válido>"
}
```

### `erp.config.json` — Modo mock

```json
{
  "mode": "mock",
  "mock_data": {
    "pedido": [
      { "id": "1", "status": "pendente", "total": 150.00 }
    ]
  },
  "mock_query": {
    "SELECT COUNT(*) FROM pedidos": [{ "count": 1 }]
  }
}
```

Coloque `erp.config.json` ao lado do seu arquivo HTML ao desenvolver fora do shell.

---

## Formato da Resposta

Todo método assíncrono (`api`, `read`, `write`, `update`, `delete`, `execute`, `emit`, `query`, `notify`) retorna o mesmo envelope:

```js
{
  data:   any | null,    // corpo da resposta parseado
  error:  string | null, // código de erro, ou null em caso de sucesso
  status: number         // código HTTP (0 = falha de rede)
}
```

Sempre verifique `error` antes de usar `data`:

```js
const res = await ERP.read('pedido', { limit: 10 });
if (res.error) {
  ERP.toast('Erro ao carregar pedidos.', 'error');
  return;
}
const pedidos = res.data.items;
```

---

## Autenticação

### `ERP.token()` → `string | null`

Retorna o JWT bruto do `localStorage`. `null` se não autenticado.

### `ERP.user()` → `object | null`

Retorna o payload decodificado do JWT. Campos presentes no token:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `sub` | string | UUID do usuário |
| `name` | string | Nome de exibição |
| `sid` | string | ID da sessão |
| `exp` | number | Timestamp de expiração (segundos Unix) |
| `iat` | number | Timestamp de emissão (segundos Unix) |

Retorna `null` no modo mock (sem JWT real).

```js
const user = ERP.user();
if (user) {
  console.log('Logado como:', user.name, '(', user.sub, ')');
}
```

---

## Tema

### `ERP.theme()` → `'dark' | 'light'`

Retorna o tema atual do shell. Recorre a `prefers-color-scheme` quando executado fora do shell.

### `ERP.onThemeChange(callback)` → `{ disconnect() }`

Chama `callback(theme)` sempre que o tema do shell mudar. Retorna um handle com método `disconnect()` para parar de escutar.

```js
document.documentElement.dataset.theme = ERP.theme();

const handle = ERP.onThemeChange(theme => {
  document.documentElement.dataset.theme = theme;
});

// Para parar:
handle.disconnect();
```

---

## Navegação

### `ERP.navigate(slug)` → `void`

Solicita ao shell que abra uma página pelo slug. Abre em uma nova aba dentro do sistema de abas do ERP.

```js
ERP.navigate('pedidos');         // abre a página "pedidos"
ERP.navigate('detalhe-cliente'); // abre qualquer página registrada
```

---

## API Bruta

### `ERP.api(path, options?)` → `Promise<Response>`

Wrapper de fetch de baixo nível. O cabeçalho de autenticação é adicionado automaticamente.

| Opção | Tipo | Descrição |
|-------|------|-----------|
| `method` | string | Método HTTP (padrão: `'GET'`) |
| `body` | string | Corpo da requisição codificado em JSON |
| `headers` | object | Cabeçalhos extras para mesclar |

```js
// GET
const res = await ERP.api('/api/custom/meu-endpoint');

// POST
const res = await ERP.api('/api/custom/meu-endpoint', {
  method: 'POST',
  body: JSON.stringify({ foo: 'bar' }),
});
```

---

## Gateway de Dados

Esses métodos encapsulam o gateway de dados da plataforma. Funcionam com qualquer entidade registrada no schema, incluindo entidades do core e entidades definidas por módulos.

### `ERP.read(entity, query?, opts?)` → `Promise<Response>`

Pesquisa e pagina registros de uma entidade.

```js
ERP.read(
  'pedido',          // slug da entidade
  {
    filters:    [],  // veja advanced-search.md para o formato de filtros
    sort_by:    'created_at',
    sort_order: 'desc',
    limit:      25,
    offset:     0,
  }
)
```

Formato de `data` em caso de sucesso:

```json
{
  "items": [...],
  "total": 142,
  "page": 1,
  "page_size": 25
}
```

Terceiro argumento opcional `opts`:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `company_id` | string | Limita os resultados a uma empresa específica |

### `ERP.write(entity, data, companyId?)` → `Promise<Response>`

Cria um novo registro.

```js
const res = await ERP.write('pedido', { cliente_id: 'uuid', total: 99.90 });
if (!res.error) {
  console.log('Criado:', res.data.id);
}
```

### `ERP.update(entity, id, data, companyId?)` → `Promise<Response>`

Atualiza um registro existente pelo ID.

```js
await ERP.update('pedido', 'uuid-do-pedido', { status: 'concluido' });
```

### `ERP.delete(entity, id)` → `Promise<Response>`

Exclui um registro pelo ID.

```js
await ERP.delete('pedido', 'uuid-do-pedido');
```

---

## Rotinas

### `ERP.execute(routineId, input?)` → `Promise<Response>`

Executa uma rotina WASM pelo seu UUID. `input` é passado como campo `input` da rotina.

```js
const res = await ERP.execute('uuid-da-rotina', { pedido_id: 'uuid' });

// A resposta segue a convenção de diretivas — use parseDirective para processá-la:
await ERP.parseDirective(res, {
  execute: (extra) => ERP.execute('uuid-da-rotina', { pedido_id: 'uuid', ...extra }),
});
```

Formato de `data` em caso de sucesso (antes das diretivas):

```json
{ "success": true, "data": {}, "message": "" }
```

---

## Eventos

### `ERP.emit(eventType, payload?, companyId?)` → `Promise<Response>`

Emite um evento de domínio. Use a convenção de nomenclatura `{modulo}.{entidade}.{verbo}`.

```js
await ERP.emit('meumod.pedido.arquivado', { pedido_id: 'uuid' });
```

### `ERP.on(eventType, callback)` → `{ close(), refresh() }`

Assina eventos em tempo real via SSE. O callback recebe o payload do evento parseado.

```js
const sub = ERP.on('meumod.pedido.criado', (payload, event) => {
  console.log('Novo pedido:', payload.pedido_id);
  renderizarPedido(payload);
});

// Para de escutar:
sub.close();

// Reconecta (ex.: após queda de rede):
sub.refresh();
```

---

## Consulta SQL

### `ERP.query(sql, params?)` → `Promise<Response>`

Executa um `SELECT` SQL diretamente no banco de dados da plataforma. Operações de escrita são rejeitadas.

```js
const res = await ERP.query(
  'SELECT id, total FROM pedidos WHERE status = $1 LIMIT $2',
  ['pendente', 10]
);
if (!res.error) {
  const linhas = res.data.rows;
}
```

Formato de `data`: `{ "rows": [...] }`

> Use `ERP.read()` sempre que possível — ele respeita o escopo de empresa e permissões por coluna. Recorra a `ERP.query()` apenas para agregações ou JOINs que `read` não consiga expressar.

---

## Notificações

### `ERP.notify(target, title, opts?)` → `Promise<Response>`

Envia uma notificação in-app para um usuário ou perfil.

| Campo de `target` | Tipo | Descrição |
|-------------------|------|-----------|
| `userId` | string | UUID do usuário destinatário |
| `roleSlug` | string | Distribui para todos os usuários com este perfil |

| Campo de `opts` | Tipo | Descrição |
|-----------------|------|-----------|
| `kind` | string | `'info'` \| `'success'` \| `'warning'` \| `'error'` |
| `body` | string | Texto opcional do corpo da notificação |
| `data` | object | JSON arbitrário anexado à notificação |

```js
// Notificar um usuário específico
await ERP.notify({ userId: 'uuid-do-usuario' }, 'Pedido aprovado', {
  kind: 'success',
  body: 'O pedido #1042 foi aprovado.',
});

// Notificar todos os usuários de um perfil
await ERP.notify({ roleSlug: 'supervisor' }, 'Nova solicitação pendente');
```

---

## Filtros Salvos

### `ERP.loadSavedFilters(entitySlug, onApply)` → `Promise<void>`

Configura o dropdown de filtros salvos para uma página de listagem. Requer dois elementos no DOM:

| ID | Função |
|----|--------|
| `sf-btn` | Botão que abre o dropdown |
| `sf-menu` | `<div>` container para os itens do dropdown |

```html
<button id="sf-btn">Filtros salvos ▾</button>
<div id="sf-menu" style="display:none; position:absolute; ..."></div>

<script>
  let filtrosAtuais = [];

  ERP.loadSavedFilters('pedido', (filtros) => {
    filtrosAtuais = filtros;
    aplicarFiltros(filtros);
  });
</script>
```

Quando o usuário seleciona um filtro salvo, `onApply` é chamado com o array de filtros. Use esse array na sua chamada `ERP.read()`. O dropdown também inclui a opção "Salvar filtro atual", que salva o estado atual de filtros via modal integrado.

Para o formato do array de filtros, consulte [`advanced-search.md`](advanced-search.md).

---

## Utilitários de UI

### `ERP.toast(message, kind?)` → `void`

Exibe uma notificação temporária no canto inferior direito. Fecha automaticamente após 3,5 s.

| `kind` | Cor |
|--------|-----|
| `'success'` | Verde |
| `'error'` | Vermelho |
| `'warning'` | Âmbar |
| `'info'` (padrão) | Azul |

```js
ERP.toast('Salvo com sucesso.', 'success');
ERP.toast('Falha ao conectar.', 'error');
```

### `ERP.esc(value)` → `string`

Escapa HTML de um valor. Sempre use ao inserir dados do usuário ou da API em `innerHTML`.

```js
el.innerHTML = '<span>' + ERP.esc(registro.nome) + '</span>';
```

Converte `&`, `<`, `>`, `"` para suas entidades HTML. `null` / `undefined` viram `''`.

### `ERP.confirm(label, callback)` → `void`

Exibe um diálogo de confirmação para ação destrutiva. O diálogo é fixado para fluxos de exclusão.

```js
ERP.confirm(registro.nome, async () => {
  await ERP.delete('pedido', registro.id);
  ERP.toast('Registro excluído.', 'success');
  carregar();
});
```

> Para confirmações de propósito geral com rótulos e mensagens personalizados, use uma rotina que retorne a diretiva `confirm` e processe-a com `ERP.parseDirective`. Veja [`page-action-directives.md`](page-action-directives.md).

---

## Processamento de Diretivas

### `ERP.parseDirective(result, ctx?)` → `Promise<void>`

Processa a resposta padrão de diretiva retornada por uma rotina de ação de página. Veja [`page-action-directives.md`](page-action-directives.md) para o contrato completo de diretivas.

| Campo de `ctx` | Tipo | Descrição |
|----------------|------|-----------|
| `execute` | `(extra) => Promise` | Re-executa a rotina com dados extras (usado nos fluxos de duas fases `confirm` e `input_form`) |
| `load` | `() => void` | Recarrega a lista de registros da página (usado pela diretiva `reload`) |

```js
async function executarAcao(extra = {}) {
  const res = await ERP.execute('uuid-da-rotina', { registro_id: 'uuid', ...extra });
  await ERP.parseDirective(res, {
    execute: executarAcao,
    load: carregarRegistros,
  });
}
```

Diretivas suportadas: `toast`, `modal`, `confirm`, `input_form`, `redirect`, `reload`, `download`.

---

## Exemplo Completo

```html
<!doctype html>
<html>
<head>
  <title>Pedidos</title>
  <style>
    :root { font-family: system-ui; }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: 8px 12px; border-bottom: 1px solid #eee; text-align: left; }
  </style>
</head>
<body>
  <h2>Pedidos Pendentes</h2>
  <button id="sf-btn">Filtros salvos ▾</button>
  <div id="sf-menu" style="display:none;position:absolute;background:#fff;border:1px solid #ccc;min-width:200px"></div>
  <table id="tbl"><thead><tr><th>ID</th><th>Total</th><th>Ação</th></tr></thead><tbody></tbody></table>

  <script>
    let filtros = [{ order: 1, group: 1, field: 'status', op: 'eq', value: 'pendente' }];
    const tbody = document.querySelector('#tbl tbody');

    async function carregar() {
      const res = await ERP.read('pedido', { filters: filtros, sort_by: 'created_at', sort_order: 'desc', limit: 50 });
      if (res.error) { ERP.toast('Erro ao carregar.', 'error'); return; }
      tbody.innerHTML = res.data.items.map(p =>
        '<tr>'
        + '<td>' + ERP.esc(p.id) + '</td>'
        + '<td>R$ ' + ERP.esc(String(p.total)) + '</td>'
        + '<td><button onclick="arquivar(' + ERP.esc(JSON.stringify(p.id)) + ')">Arquivar</button></td>'
        + '</tr>'
      ).join('');
    }

    async function arquivar(id) {
      const res = await ERP.execute('uuid-rotina-arquivar', { pedido_id: id });
      await ERP.parseDirective(res, { execute: (e) => ERP.execute('uuid-rotina-arquivar', { pedido_id: id, ...e }), load: carregar });
    }

    ERP.loadSavedFilters('pedido', f => { filtros = f; carregar(); });
    carregar();
  </script>
</body>
</html>
```
