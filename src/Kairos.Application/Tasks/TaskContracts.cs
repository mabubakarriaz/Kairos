namespace Kairos.Application.Tasks;

/// <summary>Read model for a task. Shared by the Razor PageModels and the MCP tools.</summary>
public sealed record TaskDto(
    Guid Id,
    string Title,
    string? Description,
    int EstimateMinutes,
    IReadOnlyList<string> Tags,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt)
{
    public bool IsCompleted => CompletedAt is not null;
}

/// <summary>
/// Create a task. When <see cref="StartUtc"/>/<see cref="EndUtc"/> are supplied the task is also
/// scheduled into that time range — i.e. "add a task with a time range" → a time block on the day view.
/// </summary>
public sealed record CreateTaskRequest(
    string Title,
    string? Description = null,
    int? EstimateMinutes = null,
    IReadOnlyList<string>? Tags = null,
    DateTimeOffset? StartUtc = null,
    DateTimeOffset? EndUtc = null)
{
    public bool HasTimeRange => StartUtc is not null && EndUtc is not null;
}

/// <summary>Application service for task use cases. The single source of task logic for Web + MCP.</summary>
public interface ITaskService
{
    Task<TaskDto> CreateAsync(CreateTaskRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<TaskDto>> ListAsync(bool includeCompleted = false, CancellationToken ct = default);
    Task<TaskDto?> GetAsync(Guid id, CancellationToken ct = default);
    Task<bool> CompleteAsync(Guid id, CancellationToken ct = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken ct = default);
}
