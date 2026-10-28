# erp-module-templates — Reference Guide

## Overview

ERP Core Module System accepts ZIPs containing `module.toml` + `module.wasm` + migrations + pages.
WASM modules communicate with Core via WebAssembly Component Model using the WIT contract at
`wit/erp-core.wit` (package `erp-core:component@0.1.0`).

This repository provides ready-to-use templates for all 6 supported languages × 3 WASM worlds.
Pick a template, run `make build`, upload the ZIP.

---

## WIT Contract (fonte da verdade)

Arquivo canônico: `crates/core/wit/component.wit` → copiado como `wit/erp-core.wit` no repo de templates.

```wit
package erp-core:component@0.1.0;

interface host {
    log:                  func(level: string, msg: string);
    read-entity:          func(input: string) -> string;
    list-entities:        func(input: string) -> string;
    write-entity:         func(input: string) -> string;
    delete-entity:        func(input: string) -> string;
    call-routine:         func(input: string) -> string;
    emit-event:           func(input: string) -> string;
    query:                func(input: string) -> string;
    execute:              func(input: string) -> string;
    describe-entity:      func(input: string) -> string;
    list-entity-schemas:  func(input: string) -> string;
    list-modules:         func(input: string) -> string;
    http-request:         func(input: string) -> string;
    get-time:             func() -> string;
    random-uuid:          func() -> string;
    cache-get:            func(input: string) -> string;
    cache-set:            func(input: string) -> string;
    cache-delete:         func(input: string) -> string;
    storage-upload:       func(input: string) -> string;
    storage-get-url:      func(input: string) -> string;
    storage-delete:       func(input: string) -> string;
    vector-upsert:        func(input: string) -> string;
    vector-search:        func(input: string) -> string;
}

interface module-host {
    log-mod:                  func(level: string, msg: string);
    register-endpoint:        func(input: string) -> string;
    register-event-handler:   func(input: string) -> string;
    register-mcp-tool:        func(input: string) -> string;
}

world module {
    import host;
    import module-host;
    export start:         func() -> string;
    export stop:          func() -> string;
    export call-routine:  func(name: string, input: string) -> string;
    export call-endpoint: func(name: string, method: string, path: string, body: string, headers: string) -> string;
    export call-event:    func(name: string, trigger: string, entity: string, data: string) -> string;
}

world action {
    import host;
    export execute: func(input: string) -> string;
}

world event-handler {
    import host;
    export on-event: func(entity: string, trigger: string, data: string) -> string;
}
```

**Transporte:** todas as funções usam JSON string. Response padrão: `{ "success": bool, "data": string|null, "message": string }`.

---

## Estrutura do Repositório

```
erp-module-templates/
├── README.md
├── entities-folder-reference.md  ← formato entities/ TOML (DDL + SchemaForm)
├── wit/
│   └── erp-core.wit              ← contrato canônico (cópia de component.wit)
│
├── module/                       ← world: module (start/stop/call-routine/call-endpoint/call-event)
│   ├── rust/
│   ├── typescript/
│   ├── tinygo/
│   ├── python/
│   ├── csharp/
│   └── c/
│
├── action/                       ← world: action (execute)
│   ├── rust/
│   ├── typescript/
│   ├── tinygo/
│   ├── python/
│   ├── csharp/
│   └── c/
│
└── event-handler/                ← world: event-handler (on-event)
    ├── rust/
    ├── typescript/
    ├── tinygo/
    ├── python/
    ├── csharp/
    └── c/
```

**Cada pasta `<tipo>/<linguagem>/` contém:**
- Código fonte com bindings WIT gerados (ou geráveis via `make bindings`)
- `module.toml` (somente `module/`) com slug/version de exemplo
- `schema.toml` (somente `module/`, opcional) — schema declarativo; ver `schema-toml-reference.md`
- `entities/` (somente `module/`, opcional) — uma `.toml` por entidade; cria tabela e opcionalmente página SchemaForm; ver `entities-folder-reference.md`
- `Makefile` (ou `build.ps1` para C#) com targets `bindings` + `build` + `zip`
- `README.md` — toolchain necessário + passo-a-passo
- `.gitignore` — artefatos gerados (bindings/, target/, obj/, *.wasm exceto adapter)

---

## Por Linguagem — Toolchain, Estrutura e Build

### Rust

**Toolchain:** `cargo-component` (bytecodealliance/cargo-component)

```bash
cargo install cargo-component
```

**Estrutura:**
```
module/rust/
├── Cargo.toml
├── src/
│   ├── lib.rs
│   └── bindings.rs     ← gerado (não commitar)
└── wit/
    ├── erp-core.wit
    └── deps/           ← wasi 0.2.0 packages
```

**`Cargo.toml` chave:**
```toml
[lib]
crate-type = ["cdylib"]

[package.metadata.component]
package = "erp-core:component"

[dependencies]
wit-bindgen-rt = { version = "0.44.0", features = ["bitflags"] }
```

**`Makefile`:**
```makefile
build:
	cargo component build --release
	cp target/wasm32-wasip2/release/my_module.wasm module.wasm

zip:
	zip -r my-module.zip module.toml module.wasm pages/ schema.toml
	# With entities/:   zip -r my-module.zip module.toml module.wasm pages/ entities/
	# With seeds/:      zip -r my-module.zip module.toml module.wasm pages/ schema.toml seeds/
	# Schema-only:      zip -r my-module.zip module.toml schema.toml entities/
```

**`lib.rs` (world module):**
```rust
mod bindings;
use bindings::erp_core::component::host;

struct Component;
impl bindings::Guest for Component {
    fn start() -> String {
        host::log("info", "module started");
        r#"{"success":true,"data":null,"message":"ok"}"#.into()
    }
    fn stop() -> String { r#"{"success":true}"#.into() }
    fn call_routine(_name: String, _input: String) -> String {
        r#"{"success":false,"message":"not implemented"}"#.into()
    }
    fn call_endpoint(_name: String, _method: String, _path: String, _body: String, _headers: String) -> String {
        r#"{"success":false,"message":"not implemented"}"#.into()
    }
    fn call_event(_name: String, _trigger: String, _entity: String, _data: String) -> String {
        r#"{"success":false,"message":"not implemented"}"#.into()
    }
}
bindings::export!(Component with_types_in bindings);
```

---

### TypeScript

**Toolchain:** `jco` + `@bytecodealliance/componentize-js`

```bash
npm install -g @bytecodealliance/jco @bytecodealliance/componentize-js
```

**Estrutura:**
```
module/typescript/
├── package.json
├── module.ts
└── wit/
    ├── erp-core.wit
    └── deps/
```

**`package.json`:**
```json
{
  "name": "my-erp-module",
  "type": "module",
  "scripts": {
    "build": "jco componentize module.ts --wit ./wit --world-name module --disable=all --enable stdio -o module.wasm"
  }
}
```

**`Makefile`:**
```makefile
build:
	npm run build

zip:
	zip -r my-module.zip module.toml module.wasm pages/ schema.toml
	# With entities/: zip -r my-module.zip module.toml module.wasm pages/ entities/
```

**`module.ts`:**
```typescript
// @ts-ignore
import { log } from "erp-core:component/host";

export const start = (): string => {
    log("info", "module started");
    return JSON.stringify({ success: true, data: null, message: "ok" });
};
export const stop = (): string => JSON.stringify({ success: true });
export const callRoutine = (_name: string, _input: string): string =>
    JSON.stringify({ success: false, message: "not implemented" });
export const callEndpoint = (_name: string, _method: string, _path: string, _body: string, _headers: string): string =>
    JSON.stringify({ success: false, message: "not implemented" });
export const callEvent = (_name: string, _trigger: string, _entity: string, _data: string): string =>
    JSON.stringify({ success: false, message: "not implemented" });
```

---

### TinyGo

**Toolchain:** TinyGo >= 0.33 + `wit-bindgen-go` + `wasm-tools`

```bash
# TinyGo: https://tinygo.org/getting-started/install/
go install go.bytecodealliance.org/cmd/wit-bindgen-go@latest
cargo install wasm-tools
```

**Estrutura:**
```
module/tinygo/
├── go.mod
├── tools.go        ← tool dep: wit-bindgen-go
├── main.go
├── Makefile
└── wit/
    ├── erp-core.wit
    └── deps/
```

**`go.mod`:**
```
module my-erp-module
go 1.23
require go.bytecodealliance.org v0.7.0
```

**`Makefile`:**
```makefile
WIT_DIR = ./wit
WORLD   = module
OUT     = module.wasm

bindings:
	wasm-tools component wit $(WIT_DIR) -o world.wasm --wasm
	go tool wit-bindgen-go generate --world $(WORLD) --out gen ./world.wasm

build: bindings
	tinygo build -target=wasip2 -wit-package ./$(WIT_DIR) -wit-world $(WORLD) -o $(OUT) .

zip:
	zip -r my-module.zip module.toml $(OUT) pages/ schema.toml
	# With entities/: zip -r my-module.zip module.toml $(OUT) pages/ entities/
```

**`main.go`:**
```go
package main

import (
    "my-erp-module/gen/erp-core/component/host"
    "my-erp-module/gen/erp-core/component/module"
)

func init() {
    module.Exports.Start = func() string {
        host.Log("info", "module started")
        return `{"success":true,"data":null,"message":"ok"}`
    }
    module.Exports.Stop = func() string { return `{"success":true}` }
    module.Exports.CallRoutine = func(name, input string) string {
        return `{"success":false,"message":"not implemented"}`
    }
    module.Exports.CallEndpoint = func(name, method, path, body, headers string) string {
        return `{"success":false,"message":"not implemented"}`
    }
    module.Exports.CallEvent = func(name, trigger, entity, data string) string {
        return `{"success":false,"message":"not implemented"}`
    }
}
func main() {}
```

---

### Python

**Toolchain:** `componentize-py`

```bash
pip install componentize-py
```

**Estrutura:**
```
module/python/
├── app.py
├── Makefile
└── wit/
    ├── erp-core.wit
    └── deps/
```

**`Makefile`:**
```makefile
WORLD = module
OUT   = module.wasm

bindings:
	componentize-py -d ./wit -w $(WORLD) bindings .

build:
	componentize-py -d ./wit -w $(WORLD) componentize app -o $(OUT)

zip:
	zip -r my-module.zip module.toml $(OUT) pages/ schema.toml
	# With entities/: zip -r my-module.zip module.toml $(OUT) pages/ entities/
```

**`app.py`:**
```python
import wit_world
from wit_world.imports.host import log

class WitWorld(wit_world.WitWorld):
    def start(self) -> str:
        log("info", "module started")
        return '{"success":true,"data":null,"message":"ok"}'
    def stop(self) -> str:
        return '{"success":true}'
    def call_routine(self, name: str, input: str) -> str:
        return '{"success":false,"message":"not implemented"}'
    def call_endpoint(self, name: str, method: str, path: str, body: str, headers: str) -> str:
        return '{"success":false,"message":"not implemented"}'
    def call_event(self, name: str, trigger: str, entity: str, data: str) -> str:
        return '{"success":false,"message":"not implemented"}'
```

**Nota:** `make bindings` gera `wit_world/` (gitignored). Deve rodar antes de `make build`.

---

### C

**Toolchain:** `wasi-sdk` + `wit-bindgen-cli` + `wasm-tools`

```bash
# wasi-sdk: https://github.com/WebAssembly/wasi-sdk/releases → definir $WASI_SDK
cargo install wit-bindgen-cli
cargo install wasm-tools
# adapter: baixar wasi_snapshot_preview1.reactor.wasm de bytecodealliance/wasmtime releases
```

**Estrutura:**
```
module/c/
├── plugin.c
├── Makefile
├── adapters/
│   └── wasi_snapshot_preview1.reactor.wasm
└── wit/
    ├── erp-core.wit
    └── deps/
```

**`Makefile`:**
```makefile
CLANG   = $(WASI_SDK)/bin/clang
SYSROOT = $(WASI_SDK)/share/wasi-sysroot
ADAPTER = adapters/wasi_snapshot_preview1.reactor.wasm
CORE    = plugin-core.wasm
OUT     = module.wasm

bindings:
	wit-bindgen c ./wit --world module --out-dir ./bindings

build: bindings
	$(CLANG) --target=wasm32-wasip1 --sysroot=$(SYSROOT) \
		-o $(CORE) plugin.c bindings/erp_core.c bindings/erp_core_component_type.o
	wasm-tools component new $(CORE) --adapt $(ADAPTER) -o $(OUT)

zip:
	zip -r my-module.zip module.toml $(OUT) pages/ schema.toml
	# With entities/: zip -r my-module.zip module.toml $(OUT) pages/ entities/
```

**`plugin.c`:**
```c
#include "bindings/erp_core.h"
#include <string.h>

static void set_str(erp_core_string_t *s, const char *lit) {
    s->ptr = (uint8_t *)lit;
    s->len = strlen(lit);
}

void exports_erp_core_component_module_start(erp_core_string_t *ret) {
    erp_core_string_t lvl, msg;
    set_str(&lvl, "info"); set_str(&msg, "module started");
    erp_core_component_host_log(&lvl, &msg);
    set_str(ret, "{\"success\":true,\"data\":null,\"message\":\"ok\"}");
}
void exports_erp_core_component_module_stop(erp_core_string_t *ret) {
    set_str(ret, "{\"success\":true}");
}
void exports_erp_core_component_module_call_routine(
        erp_core_string_t *name, erp_core_string_t *input, erp_core_string_t *ret) {
    set_str(ret, "{\"success\":false,\"message\":\"not implemented\"}");
}
void exports_erp_core_component_module_call_endpoint(
        erp_core_string_t *name, erp_core_string_t *method,
        erp_core_string_t *path, erp_core_string_t *body,
        erp_core_string_t *headers, erp_core_string_t *ret) {
    set_str(ret, "{\"success\":false,\"message\":\"not implemented\"}");
}
void exports_erp_core_component_module_call_event(
        erp_core_string_t *name, erp_core_string_t *trigger,
        erp_core_string_t *entity, erp_core_string_t *data,
        erp_core_string_t *ret) {
    set_str(ret, "{\"success\":false,\"message\":\"not implemented\"}");
}
```

**Nota:** `$WASI_SDK` deve apontar para instalação local do wasi-sdk. Build = 2 passos: compilar para wasm32-wasip1 core, depois adaptar para Component via `wasm-tools`.

---

### C#

**Toolchain:** .NET 10 preview + `BytecodeAlliance.Componentize.DotNet.Wasm.SDK`

```
https://dotnet.microsoft.com/download/dotnet/10.0
```

**Estrutura:**
```
module/csharp/
├── MyModule.csproj
├── Module.cs
├── nuget.config
├── build.ps1
└── wit/
    ├── erp-core.wit
    └── deps/
```

**`MyModule.csproj`:**
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <RuntimeIdentifier>wasi-wasm</RuntimeIdentifier>
    <PublishTrimmed>true</PublishTrimmed>
    <SelfContained>true</SelfContained>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="BytecodeAlliance.Componentize.DotNet.Wasm.SDK" Version="0.7.0-preview" />
  </ItemGroup>
  <ItemGroup>
    <Wit Update="wit/erp-core.wit" World="module" />
  </ItemGroup>
</Project>
```

**`build.ps1`:**
```powershell
Remove-Item -Recurse -Force obj, bin -ErrorAction SilentlyContinue
dotnet restore
dotnet publish -c Release
Copy-Item bin/Release/net10.0/wasi-wasm/publish/MyModule.wasm module.wasm
```

**`Module.cs`:**
```csharp
using ErpCore.Component.Host;
namespace MyModule;

public class ModuleImpl : IModule {
    public static string Start() {
        Host.Log("info", "module started");
        return """{"success":true,"data":null,"message":"ok"}""";
    }
    public static string Stop() => """{"success":true}""";
    public static string CallRoutine(string name, string input) =>
        """{"success":false,"message":"not implemented"}""";
    public static string CallEndpoint(string name, string method, string path, string body, string headers) =>
        """{"success":false,"message":"not implemented"}""";
    public static string CallEvent(string name, string trigger, string entity, string data) =>
        """{"success":false,"message":"not implemented"}""";
}
```

**`nuget.config`:** adicionar feed `dotnet-experimental` (Azure DevOps) para o SDK preview.

---

## Worlds `action` e `event-handler` — Diferenças

| Tipo            | World           | Exporta                                              | Importa            |
|-----------------|-----------------|------------------------------------------------------|--------------------|
| `module`        | `module`        | start, stop, call-routine, call-endpoint, call-event | host + module-host |
| `action`        | `action`        | execute(input) → string                              | host               |
| `event-handler` | `event-handler` | on-event(entity, trigger, data) → string             | host               |

Apenas trocar `--world` no build para gerar bindings do world correto.

**`action/execute` (Rust):**
```rust
fn execute(input: String) -> String {
    // input = JSON com params da action
    r#"{"success":true,"data":null}"#.into()
}
```

**`event-handler/on-event` (Rust):**
```rust
fn on_event(entity: String, trigger: String, data: String) -> String {
    // trigger = "created" | "updated" | "deleted"
    r#"{"success":true}"#.into()
}
```

---

## `module.toml` de Exemplo

### WASM module (com lógica de negócio)

```toml
[module]
name        = "My Module"
slug        = "my_module"
version     = "01.000.000"
min_core    = "01.000.000"
author      = "Your Name"
description = "Template de módulo ERP"
wasm        = true

[migrations]
files = ["0001_init.sql"]
# destructive = ["0002_drop_old.sql"]

[[pages]]
slug   = "my-module-dashboard"
title  = "Dashboard"
layout = "default"

# Sidebar nav registration.
# Folders are created if they don't exist; pages are assigned to them.
# parent = path of an existing folder or one declared above in nav.folders.
[[nav.folders]]
slug       = "my-module"
title      = "My Module"
parent     = "core"
sort_order = 10

[[nav.items]]
page       = "my-module-dashboard"
folder     = "my-module"
sort_order = 0

[[routines]]
name         = "list_items"
routine_type = "query"
```

### SQL-only module (sem WASM)

```toml
[module]
name        = "My SQL Module"
slug        = "my_sql_module"
version     = "01.000.000"
min_core    = "01.000.000"
author      = "Your Name"
description = "SQL-only module — schema.toml handles table creation"
wasm        = false
```

SQL-only modules ship `schema.toml` instead of SQL migrations when the schema is purely additive. See [`schema-toml-reference.md`](schema-toml-reference.md) for the full DSL reference.

---

## `entities/` Folder — DDL + SchemaForm declarativo

The optional `entities/` folder contains one `.toml` file per entity. Core processes each file on install:

- A file with only `[table]` → creates the table in `mod_{slug}` schema and registers `meta.entity_definitions` + `meta.field_definitions`. No UI page is created.
- A file with `[table]` **and** `[form]` → same as above, plus creates a `meta.page_definitions` row so the entity appears as a SchemaForm page in the UI.

```
module-zip/
├── module.toml
├── entities/
│   ├── categories.toml   ← table-only (no [form])
│   └── items.toml        ← table + form page
└── schema.toml           ← optional, applied before entities/
```

### `[table]` section

```toml
[table]
name  = "products"       # snake_case, becomes mod_{slug}.products
label = "Produtos"       # human-readable label for the entity

  [[table.columns]]
  name    = "id"
  type    = "uuid"
  primary = true
  default = "gen_random_uuid()"

  [[table.columns]]
  name     = "name"
  type     = "text"
  required = true
  label    = "Nome"

  [[table.columns]]
  name       = "category_id"
  type       = "uuid"
  required   = true
  references = "categories.id"   # 2-segment = same module schema
  on_delete  = "cascade"         # restrict | cascade | set_null | no_action (lowercase)
  label      = "Categoria"

  [[table.columns]]
  name     = "price"
  type     = "numeric(15,2)"
  required = true
  default  = "0"
  label    = "Preço"

  [[table.columns]]
  name     = "created_at"
  type     = "timestamptz"
  required = true
  default  = "NOW()"
```

**Column fields:**

| Field | Required | Notes |
|-------|----------|-------|
| `name` | ✅ | Snake_case. Do **not** include `id`, `created_at`, `updated_at` — Core adds them automatically. |
| `type` | ✅ | `text`, `integer`, `bigint`, `boolean`, `uuid`, `date`, `timestamptz`, `jsonb`, `numeric`, `numeric(p,s)`, `bytea` |
| `primary` | ❌ | `true` marks this column as PK. If none declared, Core adds `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`. |
| `required` | ❌ | `true` → `NOT NULL` constraint |
| `default` | ❌ | SQL expression as string (e.g. `"gen_random_uuid()"`, `"NOW()"`, `"true"`, `"0"`) |
| `label` | ❌ | Human-readable label stored in `field_definitions` |
| `references` | ❌ | FK target: `"table.column"` (same module) or `"schema.table.column"` (cross-module) |
| `on_delete` | ❌ | Required when `references` is set. Must be lowercase: `restrict`, `cascade`, `set_null`, `no_action` |

### `[form]` section (optional)

```toml
[form]
title = "Produtos"

  [[form.tabs]]
  key      = "general"
  label    = "Geral"
  position = 0

  [[form.fields]]
  column      = "category_id"
  label       = "Categoria"
  tab         = "general"
  position    = 0
  required    = true
  fk_entity   = "categories"   # slug of FK target entity for dropdown lookup

  [[form.fields]]
  column      = "name"
  label       = "Nome"
  tab         = "general"
  position    = 1
  required    = true
  show_mode   = "always"
  placeholder = "Digite o nome..."

  [[form.fields]]
  column    = "price"
  label     = "Preço"
  tab       = "general"
  position  = 2
  required  = true
  show_mode = "always"
```

**Form field fields:**

| Field | Required | Notes |
|-------|----------|-------|
| `column` | ✅ | Must match a `[[table.columns]]` name |
| `label` | ❌ | Overrides column label in this form |
| `tab` | ❌ | `key` of a `[[form.tabs]]` entry |
| `position` | ❌ | Display order (lowest first) |
| `required` | ❌ | Client-side required validation |
| `show_mode` | ❌ | `always` \| `create_only` \| `edit_only` |
| `placeholder` | ❌ | Input placeholder text |
| `fk_entity` | ❌ | Entity slug to use for FK lookup dropdown. Required for `uuid` columns that reference another table. |

See [`entities-folder-reference.md`](entities-folder-reference.md) for the complete field list and FK reference syntax.

## `schema.toml` de Exemplo

```toml
[[schema.tables]]
name  = "items"
label = "Items"

  [[schema.tables.columns]]
  name    = "id"
  type    = "uuid"
  primary = true
  default = "gen_random_uuid()"

  [[schema.tables.columns]]
  name     = "name"
  type     = "text"
  required = true
  label    = "Name"

  [[schema.tables.columns]]
  name     = "created_at"
  type     = "timestamptz"
  required = true
  default  = "NOW()"
```

`schema.toml` is additive-only: it never drops or renames columns. Core applies the DDL, registers `meta.entity_definitions` and `meta.field_definitions` automatically, and tracks a SHA-256 hash to skip DDL on re-installs when nothing changed. See [`schema-toml-reference.md`](schema-toml-reference.md).

---

## Tabela de Dependências por Linguagem

| Linguagem  | Ferramenta principal        | Gera bindings via          | Target WASM          | Comando de build                                          |
|------------|-----------------------------|----------------------------|----------------------|-----------------------------------------------------------|
| Rust       | cargo-component             | wit-bindgen (auto)         | wasm32-wasip2        | `cargo component build --release`                         |
| TypeScript | jco + componentize-js       | jco (auto)                 | wasm32-wasip2        | `jco componentize module.ts --wit ./wit --world-name ...` |
| TinyGo     | tinygo + wit-bindgen-go     | `go tool wit-bindgen-go`   | wasip2 (-target)     | `tinygo build -target=wasip2 -wit-world module .`         |
| Python     | componentize-py             | `componentize-py bindings` | wasm32 (embutido)    | `componentize-py componentize app -o module.wasm`         |
| C#         | dotnet 10 + BA WASM SDK     | MSBuild target (auto)      | wasi-wasm (RID)      | `dotnet publish -c Release`                               |
| C          | wasi-sdk/clang + wasm-tools | `wit-bindgen c`            | wasm32-wasip1+adapt  | `make build` (2 passos: compile → adapt)                  |

---

## Ordem de Criação do Repositório

1. Criar repo `erp-module-templates` no GitHub (público)
2. Commitar `wit/erp-core.wit` — cópia de `crates/core/wit/component.wit`
3. **Rust primeiro** — maior validação em compile time, mais fácil debugar WIT errado
   - `module/rust/` → `action/rust/` → `event-handler/rust/`
4. TinyGo
5. TypeScript
6. C
7. Python
8. C# (SDK em preview — pode ter friction)
9. **CI (GitHub Actions)** — após todos validados manualmente

---

## CI (Fase Futura)

```yaml
# .github/workflows/build.yml
# Para cada linguagem × tipo: roda `make build`
# Verifica .wasm tem magic header: 0x00 0x61 0x73 0x6D
# Integration test: POST /api/modules/install no Core Docker → espera 201
```

---

## CLI (Fase Futura)

```bash
erp new <slug> --type module --lang rust
# baixa module/rust/, substitui "my_module" → <slug>, renomeia arquivos
```
