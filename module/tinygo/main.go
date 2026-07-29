package main

import (
	"my-erp-module/gen/erp-core/component/host"
	"my-erp-module/gen/erp-core/component/module"
)

func init() {
	module.Exports.Start = func() string {
		host.Log("info", "module started")
		return `{"success":true,"data":null,"message":"ok"}`
	}
	module.Exports.Stop = func() string { return `{"success":true}` }
	module.Exports.CallRoutine = func(name, input string) string {
		return `{"success":false,"message":"not implemented"}`
	}
	module.Exports.CallEndpoint = func(name, method, path, body, headers string) string {
		return `{"success":false,"message":"not implemented"}`
	}
	module.Exports.CallEvent = func(name, trigger, entity, data string) string {
		return `{"success":false,"message":"not implemented"}`
	}
}
func main() {}
