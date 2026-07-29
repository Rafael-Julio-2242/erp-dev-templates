package main

import (
	"my-erp-action/gen/erp-core/component/host"
	action "my-erp-action/gen/erp-core/component/action"
)

func init() {
	action.Exports.Execute = func(input string) string {
		host.Log("info", "action executed")
		return `{"success":true,"data":null}`
	}
}
func main() {}
