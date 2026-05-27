using Kairos.Application.Abstractions;
using Kairos.Application.Schedule;
using Kairos.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kairos.Infrastructure.Repositories;

public sealed class ScheduleRepository(KairosDbContext db) : IScheduleRepository
{
    public void Add(ScheduledBlock block) => db.ScheduledBlocks.Add(block);

    public void Remove(ScheduledBlock block) => db.ScheduledBlocks.Remove(block);

    // Tracked: drag-to-reschedule mutates the block then saves.
    public Task<ScheduledBlock?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        db.ScheduledBlocks.AsTracking().FirstOrDefaultAsync(b => b.Id == id, ct);

    public async Task<IReadOnlyList<ScheduledBlockDto>> GetBlocksInRangeAsync(
        DateTimeOffset fromUtc, DateTimeOffset toUtc, CancellationToken ct = default)
    {
        // Half-open overlap: a block overlaps [from, to) iff start < to AND end > from.
        // (GiST-indexed `during &&` is used by the free-slot SQL; this predicate hits start_ts/end_ts.)
        var blocks = await db.ScheduledBlocks
            .Where(b => b.StartUtc < toUtc && b.EndUtc > fromUtc)
            .OrderBy(b => b.StartUtc)
            .ToListAsync(ct);

        var taskIds = blocks.Where(b => b.TaskId is not null).Select(b => b.TaskId!.Value).Distinct().ToList();
        var titles = taskIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.Tasks.Where(t => taskIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, t => t.Title, ct);

        return [.. blocks.Select(b => new ScheduledBlockDto(
            b.Id,
            b.TaskId,
            b.TaskId is { } tid && titles.TryGetValue(tid, out var title)
                ? title
                : (b.Source == BlockSource.Gcal ? "(busy)" : "(task)"),
            b.Source.ToString(),
            b.StartUtc,
            b.EndUtc))];
    }
}
