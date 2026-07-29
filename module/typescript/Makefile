.PHONY: bindings build zip

bindings:
	npm install

build:
	npm run build

zip:
	zip -r my-module.zip module.toml module.wasm migrations/ pages/
