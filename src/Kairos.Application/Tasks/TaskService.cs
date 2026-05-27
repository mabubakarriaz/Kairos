using FluentValidation;
using Kairos.Application.Abstractions;
using Kairos.Application.Telemetry;
using Kairos.Domain;

namespace Kairos.Application.Tasks;

/// <summary>
/// Use-case logic for tasks. Creating a task with a time range also creates the Kairos
/// <see cref="ScheduledBlock"/> that renders as its time block. Web and MCP both call this.
/// </summary>
public sealed class TaskService(
    ITaskRepository tasks,
    IScheduleRepository schedule,
    IUnitOfWork unitOfWork,
    IClock clock,
    IValidator<CreateTaskRequest> validator) : ITaskService
{
    public async Task<TaskDto> CreateAsync(CreateTaskRequest request, CancellationToken ct = default)
    {
        await validator.ValidateAndThrowAsync(request, ct);

        var task = TaskItem.Create(
            request.Title, clock.UtcNow, request.Description, request.EstimateMinutes, request.Tags);
        tasks.Add(task);

        if (request.HasTimeRange)
        {
            var block = ScheduledBlock.CreateForTask(task.Id, request.StartUtc!.Value, request.EndUtc!.Value);
            schedule.Add(block);
        }

        await unitOfWork.SaveChangesAsync(ct);
        return Map(task);
    }

    public async Task<IReadOnlyList<TaskDto>> ListAsync(bool includeCompleted = false, CancellationToken ct = default)
    {
        var items = await tasks.ListAsync(includeCompleted, ct);
        if (!includeCompleted)
            KairosTelemetry.ActiveTasks.Record(items.Count);   // open-task gauge
        return [.. items.Select(Map)];
    }

    public async Task<TaskDto?> GetAsync(Guid id, CancellationToken ct = default)
    {
        var task = await tasks.GetByIdAsync(id, ct);
        return task is null ? null : Map(task);
    }

    public async Task<bool> CompleteAsync(Guid id, CancellationToken ct = default)
    {
        var task = await tasks.GetByIdAsync(id, ct);
        if (task is null) return false;
        task.MarkComplete(clock.UtcNow);
        await unitOfWork.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var task = await tasks.GetByIdAsync(id, ct);
        if (task is null) return false;
        tasks.Remove(task);
        await unitOfWork.SaveChangesAsync(ct);
        return true;
    }

    private static TaskDto Map(TaskItem t) =>
        new(t.Id, t.Title, t.Description, t.EstimateMinutes, t.Tags, t.CreatedAt, t.CompletedAt);
}
