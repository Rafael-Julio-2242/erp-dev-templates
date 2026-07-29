Remove-Item -Recurse -Force obj, bin -ErrorAction SilentlyContinue
dotnet restore
dotnet publish -c Release
Copy-Item bin/Release/net10.0/wasi-wasm/publish/MyAction.wasm module.wasm
