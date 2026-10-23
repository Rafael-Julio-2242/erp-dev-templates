# ERP Module Template — C# (`module` world)

## Toolchain

.NET 10 Preview: https://dotnet.microsoft.com/download/dotnet/10.0

## Build

```powershell
./build.ps1
```

Output: `module.wasm`

## Package

```powershell
Compress-Archive -Path module.toml, module.wasm, migrations, pages -DestinationPath my-module.zip
```

Upload `my-module.zip` to ERP Core via `/api/modules/install`.

## Exports

- `Start() → string`
- `Stop() → string`
- `CallRoutine(name, input) → string`
- `CallEndpoint(name, method, path, body, headers) → string`
- `CallEvent(name, trigger, entity, data) → string`

## Imports

`ErpCore.Component.Host` + `ErpCore.Component.ModuleHost`

## module.toml

Edit `module.toml` before packaging:

- `[[pages]]` — HTML files shipped in the ZIP
- `[[nav.folders]]` / `[[nav.items]]` — register pages in the sidebar
- `[[routines]]` — callable server-side routines
- `[migrations]` — SQL files to run on install (`mod_{slug}` schema)

Full reference: [`../../erp-dev-templates.md`](../../erp-dev-templates.md)
