# Referência do ERP SDK (`window.ERP`)

O objeto `window.ERP` é injetado em toda página customizada antes dos próprios scripts da página rodarem. Nenhum `<script src>` necessário.

---

## Autenticação

### `ERP.token() → string | null`

Retorna o token de autenticação atual do `localStorage`. `null` quando não autenticado.

```js
const token = ERP.token();
```

### `ERP.user() → object | null`

Retorna o payload do JWT decodificado. `null` quando não autenticado ou em modo mock.

```js
const user = ERP.user();
// { sub: "uuid", name: "Rafael", email: "...", roles: [...], exp: ... }
```

---

## Dados

### `ERP.read(entity, query?, opts?) → Promise<ApiResponse>`

Busca registros de uma entidade customizada.

```js
const res = await ERP.read('orders', {
  filters: [
    { order: 1, group: 1, field: 'status', op: 'eq', value: 'pending' }
  ],
  sort_by:    'created_at',
  sort_order: 'desc',
  limit:  20,
  offset: 0,
});

if (res.error) { ERP.toast(res.error, 'error'); return; }

const { items, total } = res.data;
// items: array de registros
// total: contagem total (para paginação)
```

Padrões de `query`: `{ filters: [], limit: 50, offset: 0 }`. Veja [`../advanced-search.md`](../advanced-search.md) para a referência completa de filtros.

`opts.company_id` — sobrescrita opcional do escopo de empresa.

---

### `ERP.write(entity, data, companyId?) → Promise<ApiResponse>`

Cria um novo registro.

```js
const res = await ERP.write('orders', {
  product_id: 'uuid',
  quantity:   10,
  notes:      'urgente',
});

if (res.error) { ERP.toast(res.error, 'error'); return; }
const newOrder = res.data; // { id: 'uuid', ... }
```

---

### `ERP.update(entity, id, data, companyId?) → Promise<ApiResponse>`

Atualiza um registro existente por ID.

```js
const res = await ERP.update('orders', order.id, { status: 'shipped' });
```

---

### `ERP.delete(entity, id) → Promise<ApiResponse>`

Exclui um registro por ID. Retorna 204 (sem corpo em caso de sucesso).

```js
ERP.confirm('pedido #1234', async () => {
  const res = await ERP.delete('orders', order.id);
  if (res.error) ERP.toast(res.error, 'error');
  else { ERP.toast('Pedido excluído.', 'success'); loadOrders(); }
});
```

---

### `ERP.query(sql, params?) → Promise<ApiResponse>`

Executa uma consulta SQL parametrizada. Use `$1`, `$2`, ... para os parâmetros.

```js
const res = await ERP.query(
  'SELECT id, name, total FROM mod_sales.orders WHERE status = $1 LIMIT $2',
  ['pending', 50]
);

if (res.error) { ERP.toast(res.error, 'error'); return; }
const rows = res.data.rows; // array de objetos de linha
```

> **Escopo:** As consultas são limitadas aos schemas permitidos. Schemas core e meta são bloqueados.

---

## Rotinas

### `ERP.execute(routineId, input?) → Promise<ApiResponse>`

Executa uma rotina pelo seu UUID.

```js
const res = await ERP.execute('uuid-da-rotina', {
  order_id: order.id,
  send_email: true,
});

if (res.error) { ERP.toast(res.error, 'error'); return; }
// O formato da resposta depende da rotina
await ERP.parseDirective(res);
```

---

### `ERP.parseDirective(result, ctx?) → Promise<void>`

Processa uma resposta de diretiva de uma rotina. Renderiza a UI adequada com base no campo `directive`.

```js
const res = await ERP.execute(routineId, input);
await ERP.parseDirective(res, {
  // ctx é opcional — forneça para fluxos de duas fases
  execute: (extra) => ERP.execute(routineId, { ...input, ...extra }),
  load:    () => loadData(),  // chamado na diretiva "reload"
});
```

| `directive` | UI renderizada |
|-------------|----------------|
| ausente + `success: true` | Toast "Ação executada." |
| ausente + `success: false` | Toast de erro com `message` |
| `toast` | Notificação toast |
| `modal` | Diálogo informativo/aviso/erro |
| `confirm` | Diálogo de confirmação; re-executa com `_confirmed: true` |
| `input_form` | Modal de formulário; re-executa com valores + `_submitted: true` |
| `redirect` | Navega o shell para `slug` |
| `reload` | Chama `ctx.load()` se fornecido |
| `download` | Dispara download de arquivo a partir de conteúdo base64 |

Especificação completa de diretivas: [`../page-action-directives.md`](../page-action-directives.md)

---

## Eventos

### `ERP.emit(eventType, payload, companyId?) → Promise<ApiResponse>`

Emite um evento no barramento de eventos do ERP.

```js
await ERP.emit('order.status_changed', { order_id: id, new_status: 'shipped' });
```

---

### `ERP.on(eventType, callback) → { close(), refresh() }`

Assina eventos em tempo real via SSE. Retorna um identificador para fechar ou atualizar a conexão.

```js
const sub = ERP.on('inventory.updated', (payload, event) => {
  console.log('inventory updated:', payload);
  loadData();
});

// Quando terminar (ex.: ao descarregar a página):
window.addEventListener('unload', () => sub.close());
```

---

## API (bruta)

### `ERP.api(path, options?) → Promise<ApiResponse>`

Faz uma requisição autenticada bruta para qualquer endpoint do ERP.

```js
const res = await ERP.api('/api/pages', { method: 'GET' });
const res = await ERP.api('/api/routines/search', {
  method: 'POST',
  body: JSON.stringify({ filters: [...], limit: 50, offset: 0 }),
});
```

---

## Notificações

### `ERP.notify(target, title, opts?) → Promise<ApiResponse>`

Envia uma notificação para um usuário ou papel.

```js
// Para um usuário específico
await ERP.notify({ userId: 'uuid' }, 'Pedido aprovado', {
  kind: 'success',
  body: 'O pedido #1234 foi aprovado e está em separação.',
});

// Para todos os usuários com um papel
await ERP.notify({ roleSlug: 'estoque' }, 'Estoque crítico', {
  kind: 'warning',
  body: 'O produto X atingiu o nível mínimo.',
});
```

---

## Navegação

### `ERP.navigate(slug) → void`

Abre outra página ERP como uma nova aba no shell.

```js
ERP.navigate('orders');        // página nativa do sistema
ERP.navigate('my-dashboard'); // página customizada por slug
```

> Usa `postMessage` para o shell pai — o iframe em si não é redirecionado.

---

## Tema

### `ERP.theme() → 'dark' | 'light'`

Retorna o tema atual do shell.

```js
const theme = ERP.theme();
document.body.classList.toggle('dark', theme === 'dark');
```

### `ERP.onThemeChange(callback) → { disconnect() }`

Assina mudanças de tema. O SDK também sincroniza automaticamente `html[data-theme]` na inicialização e a cada mudança, então você pode usar seletores CSS diretamente sem chamar este método.

```js
ERP.onThemeChange((theme) => {
  document.body.classList.toggle('dark', theme === 'dark');
});
```

**Abordagem CSS (recomendada):**

O elemento `html` já tem `data-theme="dark"` ou `data-theme="light"` definido pelo SDK. Use-o diretamente no CSS:

```css
body { background: #fff; color: #000; }
[data-theme="dark"] body { background: #0d0f18; color: #e8eaf0; }
```

---

## Utilitários de UI

### `ERP.toast(message, kind?)`

Exibe uma notificação toast dentro do iframe.

```js
ERP.toast('Salvo com sucesso.', 'success');
ERP.toast('Campo obrigatório.', 'error');
ERP.toast('Sincronizando...', 'info');
ERP.toast('Atenção: estoque baixo.', 'warning');
```

`kind`: `'success'` `'error'` `'info'` `'warning'` (padrão: `'info'`)

---

### `ERP.confirm(label, callback)`

Exibe um diálogo de confirmação para ações destrutivas.

```js
ERP.confirm('empresa Acme Corp', async () => {
  const res = await ERP.delete('companies', company.id);
  if (res.error) ERP.toast(res.error, 'error');
  else ERP.toast('Empresa excluída.', 'success');
});
```

O diálogo exibe: "Excluir **[label]**? Esta ação não pode ser desfeita."

---

### `ERP.esc(value) → string`

Escapa HTML de um valor. Use sempre que renderizar dados fornecidos pelo usuário em strings HTML.

```js
el.innerHTML = `<span>${ERP.esc(user.name)}</span>`;
```

---

## Filtros Salvos

### `ERP.loadSavedFilters(entitySlug, onApply)`

Carrega presets de filtros salvos para uma entidade. Requer dois elementos com `id="sf-btn"` e `id="sf-menu"` no DOM.

```html
<button id="sf-btn">Filtros salvos</button>
<div id="sf-menu" style="position:relative"></div>

<script>
  ERP.loadSavedFilters('orders', (filters) => {
    activeFilters = filters;
    loadData();
  });
</script>
```

---

## Formato de ApiResponse

Todos os métodos de dados retornam um formato consistente:

```js
{
  data:   <T> | null,      // corpo da resposta (null em caso de erro)
  error:  string | null,   // código de erro (null em caso de sucesso)
  status: number,          // código de status HTTP
}
```

Sempre verifique `res.error` antes de usar `res.data`:

```js
const res = await ERP.read('orders', { limit: 10 });
if (res.error) {
  ERP.toast('Erro ao carregar pedidos.', 'error');
  return;
}
const { items, total } = res.data;
```

---

## Config de Dev (`erp.config.json`)

Ao abrir a página fora do shell (desenvolvimento local), o SDK procura por `./erp.config.json`:

**Modo servidor** — faz proxy para um backend real:

```json
{
  "mode":   "server",
  "server": "http://localhost:8080",
  "token":  "eyJhbGci..."
}
```

**Modo mock** — dados em memória, sem backend:

```json
{
  "mode": "mock",
  "mock_data": {
    "companies": [
      { "id": "1", "name": "Acme",  "is_active": true  },
      { "id": "2", "name": "Globex","is_active": false }
    ],
    "orders": []
  },
  "mock_query": {
    "SELECT count(*) FROM mod_sales.orders": [{ "count": 42 }]
  }
}
```

> Chaves de `mock_data` são os slugs de entidade passados para `ERP.read()`.
> Chaves de `mock_query` são as strings SQL exatas passadas para `ERP.query()`.
