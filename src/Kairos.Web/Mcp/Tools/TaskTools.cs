using System.ComponentModel;
using FluentValidation;
using Kairos.Application.Tasks;
using ModelContextProtocol;
using ModelContextProtocol.Server;

namespace Kairos.Web.Mcp.Tools;

/// <summary>
/// MCP tools for managing tasks. Adapters only — each validates input and delegates to the same
/// <see cref="ITaskService"/> the Razor Pages and /api/* endpoints use. No business logic here.
/// </summary>
[McpServerToolType]
public sealed class TaskTools
{
    [McpServerTool(Name = "list_tasks")]
    [Description("List Kairos tasks. By default returns only open tasks; set includeCompleted=true to include completed ones too.")]
    public async Task<IReadOnlyList<TaskDto>> ListTasks(
        ITaskService tasks,
        [Description("Include completed tasks in addition to open ones.")] bool includeCompleted = false,
        CancellationToken ct = default)
        => await tasks.ListAsync(includeCompleted, ct);

    [McpServerTool(Name = "create_task")]
    [Description("Create a Kairos task. Supply both startUtc and endUtc (ISO-8601 UTC) to also schedule it as a time block on the day view.")]
    public async Task<TaskDto> CreateTask(
        ITaskService tasks,
        [Description("Task title (required).")] string title,
        [Description("Optional longer description.")] string? description = null,
        [Description("Effort estimate in minutes (defaults to 30 when omitted).")] int? estimateMinutes = null,
        [Description("Optional tags.")] string[]? tags = null,
        [Description("Block start, inclusive, ISO-8601 UTC. Provide together with endUtc to schedule the task.")] DateTimeOffset? startUtc = null,
        [Description("Block end, exclusive, ISO-8601 UTC. Provide together with startUtc to schedule the task.")] DateTimeOffset? endUtc = null,
        CancellationToken ct = default)
    {
        var request = new CreateTaskRequest(title, description, estimateMinutes, tags, startUtc, endUtc);
        try
        {
            return await tasks.CreateAsync(request, ct);
        }
        catch (ValidationException ex)
        {
            // Structured, model-readable error — never a raw exception across the protocol.
            throw new McpException(Format(ex));
        }
    }

    [McpServerTool(Name = "delete_task")]
    [Description("Delete a task by id (also removes its scheduled blocks). Idempotent: returns false if the task did not exist.")]
    public async Task<bool> DeleteTask(
        ITaskService tasks,
        [Description("The task id (GUID).")] Guid id,
        CancellationToken ct = default)
        => await tasks.DeleteAsync(id, ct);

    [McpServerTool(Name = "complete_task")]
    [Description("Mark a task complete. Idempotent: returns false if the task did not exist.")]
    public async Task<bool> CompleteTask(
        ITaskService tasks,
        [Description("The task id (GUID).")] Guid id,
        CancellationToken ct = default)
        => await tasks.CompleteAsync(id, ct);

    internal static string Format(ValidationException ex) =>
        "Invalid input: " + string.Join("; ", ex.Errors.Select(e => $"{e.PropertyName}: {e.ErrorMessage}"));
}
