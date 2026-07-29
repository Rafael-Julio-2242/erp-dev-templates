package main

import (
	eventhandler "my-erp-event-handler/gen/erp-core/component/event-handler"
)

func init() {
	eventhandler.Exports.OnEvent = func(entity, trigger, data string) string {
		// trigger = "created" | "updated" | "deleted"
		return `{"success":true}`
	}
}
func main() {}
