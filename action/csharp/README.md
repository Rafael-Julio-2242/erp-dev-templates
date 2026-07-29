# ERP Action Template — C# (`action` world)

## Toolchain

.NET 10 Preview: https://dotnet.microsoft.com/download/dotnet/10.0

## Build

```powershell
./build.ps1
```

Output: `module.wasm`

## Package

```powershell
Compress-Archive -Path module.wasm -DestinationPath my-action.zip
```

## Exports

- `Execute(input: string) → string` — input/output are JSON strings
