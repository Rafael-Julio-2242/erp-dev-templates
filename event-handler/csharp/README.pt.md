# Template de Event Handler ERP — C# (world `event-handler`)

## Ferramentas

.NET 10 Preview: https://dotnet.microsoft.com/download/dotnet/10.0

## Build

```powershell
./build.ps1
```

Saída: `module.wasm`

## Empacotamento

```powershell
Compress-Archive -Path module.wasm -DestinationPath my-event-handler.zip
```

## Exportações

- `OnEvent(entity: string, trigger: string, data: string) → string`
  - valores de `trigger`: `"created"` | `"updated"` | `"deleted"`
