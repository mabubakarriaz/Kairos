using Kairos.Application.Abstractions;
using Kairos.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kairos.Infrastructure.Repositories;

public sealed class TaskRepository(KairosDbContext db) : ITaskRepository
{
    public void Add(TaskItem task) => db.Tasks.Add(task);

    public void Remove(TaskItem task) => db.Tasks.Remove(task);

    // Tracked: the caller mutates (complete / delete) and saves through the unit of work.
    public Task<TaskItem?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        db.Tasks.AsTracking().FirstOrDefaultAsync(t => t.Id == id, ct);

    public async Task<IReadOnlyList<TaskItem>> ListAsync(bool includeCompleted, CancellationToken ct = default)
    {
        var query = db.Tasks.AsQueryable();
        if (!includeCompleted)
            query = query.Where(t => t.CompletedAt == null);

        return await query.OrderByDescending(t => t.CreatedAt).ToListAsync(ct);
    }
}
