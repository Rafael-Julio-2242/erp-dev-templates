using ErpCore.Component.Host;
namespace MyModule;

public class ModuleImpl : IModule {
    public static string Start() {
        Host.Log("info", "module started");
        return """{"success":true,"data":null,"message":"ok"}""";
    }
    public static string Stop() => """{"success":true}""";
    public static string CallRoutine(string name, string input) =>
        """{"success":false,"message":"not implemented"}""";
    public static string CallEndpoint(string name, string method, string path, string body, string headers) =>
        """{"success":false,"message":"not implemented"}""";
    public static string CallEvent(string name, string trigger, string entity, string data) =>
        """{"success":false,"message":"not implemented"}""";
}
