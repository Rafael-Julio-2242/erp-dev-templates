# Template de Módulo ERP — C# (world `module`)

## Ferramentas

.NET 10 Preview: https://dotnet.microsoft.com/download/dotnet/10.0

## Build

```powershell
./build.ps1
```

Saída: `module.wasm`

## Empacotamento

```powershell
Compress-Archive -Path module.toml, module.wasm, migrations, pages -DestinationPath my-module.zip
```

Envie `my-module.zip` ao ERP Core via `/api/modules/install`.

## Exportações

- `Start() → string`
- `Stop() → string`
- `CallRoutine(name, input) → string`
- `CallEndpoint(name, method, path, body, headers) → string`
- `CallEvent(name, trigger, entity, data) → string`

## Importações

`ErpCore.Component.Host` + `ErpCore.Component.ModuleHost`

## module.toml

Edite `module.toml` antes de empacotar:

- `[[pages]]` — arquivos HTML incluídos no ZIP
- `[[nav.folders]]` / `[[nav.items]]` — registra páginas na barra lateral
- `[[routines]]` — rotinas chamáveis no servidor
- `[migrations]` — arquivos SQL executados na instalação (schema `mod_{slug}`)

Referência completa: [`../../erp-dev-templates.md`](../../erp-dev-templates.md)
