using ErpCore.Component.Host;
namespace MyEventHandler;

public class EventHandlerImpl : IEventHandler {
    public static string OnEvent(string entity, string trigger, string data) {
        // trigger = "created" | "updated" | "deleted"
        return """{"success":true}""";
    }
}
