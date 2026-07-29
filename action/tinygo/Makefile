WIT_DIR = ./wit
WORLD   = action
OUT     = module.wasm

.PHONY: bindings build zip

bindings:
	wasm-tools component wit $(WIT_DIR) -o world.wasm --wasm
	go tool wit-bindgen-go generate --world $(WORLD) --out gen ./world.wasm

build: bindings
	tinygo build -target=wasip2 -wit-package ./$(WIT_DIR) -wit-world $(WORLD) -o $(OUT) .

zip:
	zip -r my-action.zip $(OUT)
