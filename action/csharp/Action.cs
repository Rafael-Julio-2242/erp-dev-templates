using ErpCore.Component.Host;
namespace MyAction;

public class ActionImpl : IAction {
    public static string Execute(string input) {
        // input = JSON with action params
        return """{"success":true,"data":null}""";
    }
}
