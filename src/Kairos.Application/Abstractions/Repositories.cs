using Kairos.Application.Schedule;
using Kairos.Domain;

namespace Kairos.Application.Abstractions;

/// <summary>Persistence port for <see cref="TaskItem"/>. Implemented in Infrastructure (EF Core).</summary>
public interface ITaskRepository
{
    void Add(TaskItem task);
    void Remove(TaskItem task);
    Task<TaskItem?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<TaskItem>> ListAsync(bool includeCompleted, CancellationToken ct = default);
}

/// <summary>
/// Persistence port for <see cref="ScheduledBlock"/>. Reads return projected DTOs (joined to the
/// task title) to keep the read path allocation-light; writes return the tracked entity.
/// </summary>
public interface IScheduleRepository
{
    void Add(ScheduledBlock block);
    void Remove(ScheduledBlock block);
    Task<ScheduledBlock?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>Blocks (Kairos + gcal) overlapping the half-open UTC window [fromUtc, toUtc).</summary>
    Task<IReadOnlyList<ScheduledBlockDto>> GetBlocksInRangeAsync(
        DateTimeOffset fromUtc, DateTimeOffset toUtc, CancellationToken ct = default);
}

/// <summary>The DbContext is the unit of work; commit tracked changes here.</summary>
public interface IUnitOfWork
{
    /// <summary>Persists tracked changes. Throws <see cref="ScheduleConflictException"/> on a no-overlap violation.</summary>
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
