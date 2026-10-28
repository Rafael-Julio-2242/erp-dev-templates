Remove-Item -Recurse -Force obj, bin -ErrorAction SilentlyContinue
dotnet restore
dotnet publish -c Release
Copy-Item bin/Release/net10.0/wasi-wasm/publish/MyModule.wasm module.wasm
Compress-Archive -Path module.toml, module.wasm, schema.toml, pages -DestinationPath my-module.zip -Force
