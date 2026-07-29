CLANG   = $(WASI_SDK)/bin/clang
SYSROOT = $(WASI_SDK)/share/wasi-sysroot
ADAPTER = adapters/wasi_snapshot_preview1.reactor.wasm
CORE    = plugin-core.wasm
OUT     = module.wasm

.PHONY: bindings build zip

bindings:
	wit-bindgen c ./wit --world action --out-dir ./bindings

build: bindings
	$(CLANG) --target=wasm32-wasip1 --sysroot=$(SYSROOT) \
		-o $(CORE) plugin.c bindings/erp_core.c bindings/erp_core_component_type.o
	wasm-tools component new $(CORE) --adapt $(ADAPTER) -o $(OUT)

zip:
	zip -r my-action.zip $(OUT)
