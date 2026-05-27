using System.ComponentModel;
using System.Text.Json;
using Kairos.Application.Tasks;
using ModelContextProtocol.Server;

namespace Kairos.Web.Mcp.Resources;

/// <summary>
/// Read-only MCP resources so clients can pull task context without invoking a tool.
/// Tools mutate; resources read. Both go through the same <see cref="ITaskService"/>.
/// </summary>
[McpServerResourceType]
public sealed class TaskResources
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [McpServerResource(UriTemplate = "kairos://tasks", Name = "tasks", MimeType = "application/json")]
    [Description("All open Kairos tasks, as a JSON array.")]
    public async Task<string> AllTasks(ITaskService tasks, CancellationToken ct = default)
        => JsonSerializer.Serialize(await tasks.ListAsync(includeCompleted: false, ct), Json);

    [McpServerResource(UriTemplate = "kairos://tasks/{id}", Name = "task", MimeType = "application/json")]
    [Description("A single Kairos task by id, as JSON. Returns null if no such task exists.")]
    public async Task<string> TaskById(
        ITaskService tasks,
        [Description("Task id (GUID).")] string id,
        CancellationToken ct = default)
    {
        var dto = Guid.TryParse(id, out var guid) ? await tasks.GetAsync(guid, ct) : null;
        return JsonSerializer.Serialize(dto, Json);
    }
}
