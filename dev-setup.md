# Dev Setup — ERP Module Development

This guide covers everything needed to build, test, and iterate on ERP modules locally.

---

## Prerequisites

### All languages
- ERP Core running locally (Docker Compose — see below)
- `curl` or any HTTP client for API calls

### Per language

| Language | Install |
|----------|---------|
| **Rust** | `cargo install cargo-component` |
| **TypeScript** | `npm install -g @bytecodealliance/jco @bytecodealliance/componentize-js` |
| **TinyGo** | [TinyGo 0.31+](https://tinygo.org/getting-started/install/) + `go install github.com/bytecodealliance/wasm-tools-go/cmd/wit-bindgen-go@latest` + [wasm-tools CLI](https://github.com/bytecodealliance/wasm-tools) |
| **Python** | `pip install componentize-py` |
| **C** | [WASI SDK 24](https://github.com/WebAssembly/wasi-sdk/releases) + [wasm-tools CLI](https://github.com/bytecodealliance/wasm-tools) |
| **C#** | .NET 10 SDK + `dotnet workload install wasi-experimental` |

---

## Running ERP Core locally

### First-time setup

```bash
# 1. Clone erp-core (or use existing clone)
git clone <erp-core-repo-url>
cd erp-core

# 2. Generate RSA key pair (run once)
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out private.pem
openssl rsa -in private.pem -pubout -out public.pem

# 3. Create config.toml from example
cp config.example.toml config.toml
# Edit config.toml — paste the contents of private.pem and public.pem
# in the respective fields. config.toml is gitignored, never commit it.

# 4. Start
docker compose up --build
```

API available at `http://localhost:3000`.

### Subsequent runs

```bash
docker compose up       # start (no rebuild)
docker compose down     # stop
docker compose down -v  # stop + wipe database
```

---

## Getting an auth token

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your-password"}'
```

Response includes `"token"`. Export it for the examples below:

```bash
export TOKEN="<token-from-response>"
```

---

## Building a module

```bash
# Rust (from module/rust/ or examples/stock-module/)
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

## Installing a module

```bash
curl -s -X POST http://localhost:3000/api/modules/install \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@my-module.zip"
```

A successful install returns `{"success": true, "data": {...}}` and runs
`start()` on the WASM component, which registers endpoints and event handlers.

---

## Uninstalling a module

```bash
curl -s -X DELETE http://localhost:3000/api/modules/{slug} \
  -H "Authorization: Bearer $TOKEN"
```

Replace `{slug}` with the module's slug (e.g. `stock`).

---

## Iterating on a module

The standard edit → rebuild → reinstall loop:

```bash
# 1. Edit source code
# 2. Rebuild
make build && make zip

# 3. Uninstall old version
curl -s -X DELETE http://localhost:3000/api/modules/stock \
  -H "Authorization: Bearer $TOKEN"

# 4. Reinstall
curl -s -X POST http://localhost:3000/api/modules/install \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@my-module.zip"
```

---

## Calling a routine

Routines are called by their UUID (obtained after install). List routines to
find the ID:

```bash
curl -s http://localhost:3000/api/routines \
  -H "Authorization: Bearer $TOKEN"
```

Execute a routine by ID:

```bash
curl -s -X POST http://localhost:3000/api/routines/{routine-id}/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input": {}}'
```

Pass arbitrary JSON in `"input"` — it becomes the `input` string in
`call_routine(name, input)`.

---

## Calling a custom endpoint

Endpoints registered via `module_host::register_endpoint` in `start()` are
served under `/api/module{path}`. If your module registered path `/low-stock`
with method `GET`:

```bash
curl -s http://localhost:3000/api/module/low-stock \
  -H "Authorization: Bearer $TOKEN"
```

The `path` you pass to `register-endpoint` is stored verbatim, so it is your
responsibility to namespace it (e.g. `/stock/low-stock`) if needed.

---

## Viewing logs

```bash
docker compose logs -f core
```

Calls to `host::log("info", "...")` appear in the container output tagged with
the log level. Use `"warn"` or `"error"` to make specific messages easy to grep.

---

## Checking schema.toml was applied

After installing a module with a `schema.toml`, verify tables were created:

```bash
# Connect to the Postgres container
docker compose exec postgres psql -U postgres -d erp

# Inside psql:
\dt mod_stock.*
```

---

## Useful API endpoints

| Action | Method | Path |
|--------|--------|------|
| Login | POST | `/api/auth/login` |
| Install module | POST | `/api/modules/install` |
| Uninstall module | DELETE | `/api/modules/{slug}` |
| List modules | GET | `/api/modules` |
| List routines | GET | `/api/routines` |
| Execute routine | POST | `/api/routines/{id}/execute` |
| Custom endpoint | ANY | `/api/module{registered-path}` |
| Emit event | POST | `/api/events/emit` |
| Write entity | POST | `/api/write/{entity}` |
| Read entity | POST | `/api/read/{entity}/search` |
