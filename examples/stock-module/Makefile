OUT = module.wasm

.PHONY: build zip

build:
	cargo component build --release
	cp target/wasm32-wasip2/release/stock_module.wasm $(OUT)

zip:
	zip -r my-module.zip module.toml $(OUT) schema.toml pages/
