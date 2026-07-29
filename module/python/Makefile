WORLD = module
OUT   = module.wasm

.PHONY: bindings build zip

bindings:
	componentize-py -d ./wit -w $(WORLD) bindings .

build:
	componentize-py -d ./wit -w $(WORLD) componentize app -o $(OUT)

zip:
	zip -r my-module.zip module.toml $(OUT) migrations/ pages/
