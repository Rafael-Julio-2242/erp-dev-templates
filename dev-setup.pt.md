# Configuração de Desenvolvimento — Módulos ERP

Este guia cobre tudo o que é necessário para construir, testar e iterar em módulos ERP localmente.

---

## Pré-requisitos

### Todos os idiomas
- ERP Core rodando localmente (Docker Compose — veja abaixo)
- `curl` ou qualquer cliente HTTP para chamadas de API

### Por linguagem

| Linguagem | Instalação |
|-----------|------------|
| **Rust** | `cargo install cargo-component` |
| **TypeScript** | `npm install -g @bytecodealliance/jco @bytecodealliance/componentize-js` |
| **TinyGo** | [TinyGo 0.31+](https://tinygo.org/getting-started/install/) + `go install github.com/bytecodealliance/wasm-tools-go/cmd/wit-bindgen-go@latest` + [wasm-tools CLI](https://github.com/bytecodealliance/wasm-tools) |
| **Python** | `pip install componentize-py` |
| **C** | [WASI SDK 24](https://github.com/WebAssembly/wasi-sdk/releases) + [wasm-tools CLI](https://github.com/bytecodealliance/wasm-tools) |
| **C#** | .NET 10 SDK + `dotnet workload install wasi-experimental` |

---

## Rodando o ERP Core localmente

### Configuração inicial

```bash
# 1. Clone o erp-core (ou use um clone existente)
git clone <url-do-repo-erp-core>
cd erp-core

# 2. Gerar par de chaves RSA (executar uma vez)
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out private.pem
openssl rsa -in private.pem -pubout -out public.pem

# 3. Criar config.toml a partir do exemplo
cp config.example.toml config.toml
# Edite config.toml — cole o conteúdo de private.pem e public.pem
# nos respectivos campos. config.toml está no .gitignore, nunca faça commit.

# 4. Iniciar
docker compose up --build
```

API disponível em `http://localhost:3000`.

### Execuções subsequentes

```bash
docker compose up       # iniciar (sem rebuild)
docker compose down     # parar
docker compose down -v  # parar + limpar banco de dados
```

---

## Obtendo um token de autenticação

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "sua-senha"}'
```

A resposta inclui `"token"`. Exporte para usar nos exemplos abaixo:

```bash
export TOKEN="<token-da-resposta>"
```

---

## Compilando um módulo

```bash
# Rust (em module/rust/ ou examples/stock-module/)
make build   # → module.wasm
make zip     # → my-module.zip

# TypeScript
make build && make zip

# TinyGo / Python / C
make build && make zip

# C# (Windows PowerShell)
.\build.ps1  # → my-module.zip
```

---

## Instalando um módulo

```bash
curl -s -X POST http://localhost:3000/api/modules/install \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@my-module.zip"
```

Uma instalação bem-sucedida retorna `{"success": true, "data": {...}}` e executa
`start()` no componente WASM, que registra endpoints e handlers de eventos.

---

## Desinstalando um módulo

```bash
curl -s -X DELETE http://localhost:3000/api/modules/{slug} \
  -H "Authorization: Bearer $TOKEN"
```

Substitua `{slug}` pelo slug do módulo (ex.: `stock`).

---

## Iterando no desenvolvimento

O ciclo padrão de edição → recompilação → reinstalação:

```bash
# 1. Edite o código-fonte
# 2. Recompile
make build && make zip

# 3. Desinstale a versão antiga
curl -s -X DELETE http://localhost:3000/api/modules/stock \
  -H "Authorization: Bearer $TOKEN"

# 4. Reinstale
curl -s -X POST http://localhost:3000/api/modules/install \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@my-module.zip"
```

---

## Chamando uma rotina

Rotinas são chamadas pelo UUID (obtido após a instalação). Liste as rotinas para
encontrar o ID:

```bash
curl -s http://localhost:3000/api/routines \
  -H "Authorization: Bearer $TOKEN"
```

Execute uma rotina pelo ID:

```bash
curl -s -X POST http://localhost:3000/api/routines/{routine-id}/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input": {}}'
```

Passe JSON arbitrário em `"input"` — ele se torna a string `input` em
`call_routine(name, input)`.

---

## Chamando um endpoint customizado

Endpoints registrados via `module_host::register_endpoint` em `start()` são
servidos em `/api/module{path}`. Se o módulo registrou path `/low-stock`
com método `GET`:

```bash
curl -s http://localhost:3000/api/module/low-stock \
  -H "Authorization: Bearer $TOKEN"
```

O `path` passado para `register-endpoint` é armazenado literalmente, então é
responsabilidade do módulo prefixar com o slug se necessário (ex.: `/stock/low-stock`).

---

## Visualizando logs

```bash
docker compose logs -f core
```

Chamadas a `host::log("info", "...")` aparecem na saída do container com o nível
de log. Use `"warn"` ou `"error"` para facilitar o grep de mensagens específicas.

---

## Verificando se o schema.toml foi aplicado

Após instalar um módulo com `schema.toml`, verifique se as tabelas foram criadas:

```bash
# Conectar ao container Postgres
docker compose exec postgres psql -U postgres -d erp

# Dentro do psql:
\dt mod_stock.*
```

---

## Endpoints de API úteis

| Ação | Método | Path |
|------|--------|------|
| Login | POST | `/api/auth/login` |
| Instalar módulo | POST | `/api/modules/install` |
| Desinstalar módulo | DELETE | `/api/modules/{slug}` |
| Listar módulos | GET | `/api/modules` |
| Listar rotinas | GET | `/api/routines` |
| Executar rotina | POST | `/api/routines/{id}/execute` |
| Endpoint customizado | ANY | `/api/module{path-registrado}` |
| Emitir evento | POST | `/api/events/emit` |
| Escrever entidade | POST | `/api/write/{entity}` |
| Ler entidade | POST | `/api/read/{entity}/search` |
