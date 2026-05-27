namespace Kairos.Application.FreeSlots;

/// <summary>A gap in the schedule a task could fill. <see cref="Score"/> ranks fit (higher = better).</summary>
public sealed record FreeSlot(DateTimeOffset StartUtc, DateTimeOffset EndUtc, double Score = 0)
{
    public TimeSpan Duration => EndUtc - StartUtc;
}

/// <summary>
/// Free-slot detection. The gap-finding is SQL (multirange: unnest(work_mr - range_agg(busy)));
/// only the top-N ranking of the handful of returned rows happens in C#. Don't reimplement
/// gap-finding in application code.
/// </summary>
public interface IFreeSlotService
{
    Task<IReadOnlyList<FreeSlot>> GetFreeSlotsAsync(
        DateTimeOffset fromUtc, DateTimeOffset toUtc, int? estimateMinutes = null,
        int take = 5, CancellationToken ct = default);
}
