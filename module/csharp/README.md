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
