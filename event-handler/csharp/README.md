# ERP Event Handler Template — C# (`event-handler` world)

## Toolchain

.NET 10 Preview: https://dotnet.microsoft.com/download/dotnet/10.0

## Build

```powershell
./build.ps1
```

Output: `module.wasm`

## Package

```powershell
Compress-Archive -Path module.wasm -DestinationPath my-event-handler.zip
```

## Exports

- `OnEvent(entity: string, trigger: string, data: string) → string`
  - `trigger` values: `"created"` | `"updated"` | `"deleted"`
