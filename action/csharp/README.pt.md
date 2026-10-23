# Template de Action ERP — C# (world `action`)

## Ferramentas

.NET 10 Preview: https://dotnet.microsoft.com/download/dotnet/10.0

## Build

```powershell
./build.ps1
```

Saída: `module.wasm`

## Empacotamento

```powershell
Compress-Archive -Path module.wasm -DestinationPath my-action.zip
```

## Exportações

- `Execute(input: string) → string` — entrada/saída são strings JSON
