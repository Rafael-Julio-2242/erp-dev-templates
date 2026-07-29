.PHONY: bindings build zip

bindings:
	@echo "cargo-component generates bindings automatically during build"

build:
	cargo component build --release
	cp target/wasm32-wasip2/release/my_action.wasm module.wasm

zip:
	zip -r my-action.zip module.wasm
