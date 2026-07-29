.PHONY: bindings build zip

bindings:
	@echo "cargo-component generates bindings automatically during build"

build:
	cargo component build --release
	cp target/wasm32-wasip2/release/my_event_handler.wasm module.wasm

zip:
	zip -r my-event-handler.zip module.wasm
