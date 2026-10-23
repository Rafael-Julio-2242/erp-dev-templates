# Páginas Customizadas

Páginas customizadas são arquivos HTML enviados para a plataforma ERP. Eles rodam dentro de um iframe isolado com acesso completo ao backend ERP via SDK `window.ERP` — sem necessidade de configurar autenticação.

---

## Como Funciona

```
1. Crie a página pela interface admin (Páginas → Nova)
2. Faça upload do seu arquivo .html
3. Opcionalmente, anexe arquivos CSS e JS separadamente
4. A página aparece na barra lateral de navegação quando atribuída a uma pasta via `[[nav.items]]` em `module.toml` (para páginas de módulo) ou manualmente pela interface admin
5. Usuários a abrem como uma aba — o SDK ERP.js é injetado automaticamente
```

O shell injeta `window.ERP` antes dos próprios scripts da página rodarem. Não é necessário carregar nenhuma biblioteca externa.

---

## Início Rápido

Salve isso como `hello.html` e faça upload:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: system-ui; padding: 24px; }
    [data-theme="dark"] body { background: #0d0f18; color: #e8eaf0; }
  </style>
</head>
<body>
  <h2>Olá, <span id="name">...</span></h2>
  <button id="btn">Buscar empresas</button>
  <ul id="list"></ul>

  <script>
    const u = ERP.user();
    document.getElementById('name').textContent = u?.name ?? 'visitante';

    document.getElementById('btn').onclick = async () => {
      const res = await ERP.read('companies', { limit: 10 });
      if (res.error) { ERP.toast(res.error, 'error'); return; }
      document.getElementById('list').innerHTML =
        res.data.items.map(c => `<li>${c.name}</li>`).join('');
    };
  </script>
</body>
</html>
```

---

## O Que Você Recebe

| Recurso | Método | Notas |
|---------|--------|-------|
| Chamadas autenticadas à API | `ERP.read()` `ERP.write()` `ERP.api()` | Token gerenciado automaticamente |
| Navegação | `ERP.navigate(slug)` | Abre uma aba no shell |
| Usuário atual | `ERP.user()` | Payload do JWT decodificado |
| Detecção de tema | `ERP.theme()` | `'dark'` \| `'light'` |
| Eventos de mudança de tema | `ERP.onThemeChange(cb)` | Sincronizado automaticamente com `html[data-theme]` |
| Toasts | `ERP.toast(msg, kind)` | `success` `error` `warning` `info` |
| Diálogos de confirmação | `ERP.confirm(label, cb)` | Padrão para ações destrutivas |
| Execução de rotinas | `ERP.execute(routineId, input)` | Chama qualquer rotina ativa |
| Eventos SSE | `ERP.on(eventType, cb)` | Assinatura de eventos em tempo real |

Referência completa do SDK: [erp-sdk-reference.md](erp-sdk-reference.md)

---

## Estrutura de Arquivos

Uma página pode ser um único arquivo `.html`, ou você pode separar as responsabilidades:

```
my-page/
├── index.html      ← enviado como "HTML content"
├── styles.css      ← enviado como "CSS content" (opcional)
└── app.js          ← enviado como "JS content" (opcional)
```

O shell injeta CSS e JS no HTML antes de renderizar, então você pode mantê-los separados durante o desenvolvimento e combiná-los via formulário admin no upload.

---

## Modo Dev (Testes Locais Sem o Shell)

Crie um arquivo `erp.config.json` ao lado do seu HTML:

```json
{
  "mode": "server",
  "server": "http://localhost:8080",
  "token": "seu-token-jwt-de-dev"
}
```

Ou use dados mock:

```json
{
  "mode": "mock",
  "mock_data": {
    "companies": [
      { "id": "1", "name": "Acme Corp", "is_active": true }
    ]
  }
}
```

Abra o arquivo HTML diretamente no navegador (via servidor HTTP local, não por `file://`). O SDK detecta a ausência de `window.__ERP_SHELL__` e carrega a configuração automaticamente.

---

## Ações de Página

Páginas podem ter ações no servidor (rotinas) anexadas a elas. O shell renderiza botões de ação acima do iframe automaticamente — o autor da página não precisa adicionar botões para isso.

As ações comunicam via [sistema de diretivas](../page-action-directives.md):
- A rotina retorna uma diretiva JSON
- O shell renderiza a UI adequada (toast, modal, confirmação, formulário)
- Em fluxos de múltiplas fases (`confirm`, `input_form`), o shell re-executa com os dados coletados

Veja [`../page-action-directives.md`](../page-action-directives.md) para a especificação completa.

---

## Exemplos

| Arquivo | O que demonstra |
|---------|-----------------|
| [`examples/01-hello-world.html`](examples/01-hello-world.html) | Página mínima: informações do usuário + uma chamada à API |
| [`examples/02-data-table.html`](examples/02-data-table.html) | Tabela com busca e paginação |
| [`examples/03-action-form.html`](examples/03-action-form.html) | Formulário que chama uma rotina e trata diretivas |
| [`examples/04-theme-aware.html`](examples/04-theme-aware.html) | Suporte completo ao tema escuro/claro |
