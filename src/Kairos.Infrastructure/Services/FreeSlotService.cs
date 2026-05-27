using System.Diagnostics;
using Kairos.Application.FreeSlots;
using Kairos.Application.Telemetry;
using Kairos.Infrastructure.Queries;

namespace Kairos.Infrastructure.Services;

/// <summary>
/// Runs the SQL gap-finder, then ranks the handful of returned rows in C# (Strategy):
/// tighter fits to the estimate rank higher; with no estimate, longer slots first.
/// </summary>
public sealed class FreeSlotService(KairosDbContext db) : IFreeSlotService
{
    public async Task<IReadOnlyList<FreeSlot>> GetFreeSlotsAsync(
        DateTimeOffset fromUtc, DateTimeOffset toUtc, int? estimateMinutes = null,
        int take = 5, CancellationToken ct = default)
    {
        using var activity = KairosTelemetry.Source.StartActivity(KairosTelemetry.FreeSlotsCompute);

        var sw = Stopwatch.GetTimestamp();
        var gaps = await FreeSlotQueries.GetGapsAsync(db, fromUtc, toUtc, ct);
        KairosTelemetry.PostgresQuerySeconds.Record(
            Stopwatch.GetElapsedTime(sw).TotalSeconds, new KeyValuePair<string, object?>("query", "free_slots"));
        activity?.SetTag("freeslots.gaps", gaps.Count);

        var slots = gaps.Select(r => new FreeSlot(
            new DateTimeOffset(DateTime.SpecifyKind(r.StartUtc, DateTimeKind.Utc), TimeSpan.Zero),
            new DateTimeOffset(DateTime.SpecifyKind(r.EndUtc, DateTimeKind.Utc), TimeSpan.Zero)));

        if (estimateMinutes is int est)
            slots = slots.Where(s => s.Duration.TotalMinutes >= est);

        return [.. slots
            .Select(s => s with { Score = Score(s, estimateMinutes) })
            .OrderByDescending(s => s.Score)
            .ThenBy(s => s.StartUtc)
            .Take(take <= 0 ? 5 : take)];
    }

    private static double Score(FreeSlot slot, int? estimateMinutes)
    {
        var durationMin = slot.Duration.TotalMinutes;
        if (estimateMinutes is int est)
        {
            var waste = durationMin - est;        // >= 0 (shorter slots already filtered out)
            return 100.0 / (1 + waste);           // a tighter fit wastes less and ranks higher
        }

        return durationMin;                        // no estimate: prefer the longest gaps
    }
}
