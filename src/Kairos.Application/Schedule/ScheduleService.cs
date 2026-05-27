using System.Diagnostics;
using FluentValidation;
using Kairos.Application.Abstractions;
using Kairos.Application.Telemetry;

namespace Kairos.Application.Schedule;

/// <summary>
/// Use-case logic for the day view and drag-to-reschedule. Resolves the local-day window to a
/// UTC half-open interval, fetches overlapping blocks, and moves Kairos blocks on drop.
/// </summary>
public sealed class ScheduleService(
    IScheduleRepository schedule,
    IUnitOfWork unitOfWork,
    IValidator<RescheduleRequest> validator) : IScheduleService
{
    public async Task<DayScheduleDto> GetDayAsync(DateOnly date, string timeZoneId, CancellationToken ct = default)
    {
        using var activity = KairosTelemetry.Source.StartActivity(KairosTelemetry.ScheduleRender);
        activity?.SetTag("schedule.date", date.ToString("yyyy-MM-dd"));

        var tz = ResolveTimeZone(timeZoneId);

        // Local midnight → UTC, half-open window [start, start+1d).
        var localStart = new DateTimeOffset(date.ToDateTime(TimeOnly.MinValue), tz.GetUtcOffset(date.ToDateTime(TimeOnly.MinValue)));
        var dayStartUtc = localStart.ToUniversalTime();
        var dayEndUtc = localStart.AddDays(1).ToUniversalTime();

        var sw = Stopwatch.GetTimestamp();
        var blocks = await schedule.GetBlocksInRangeAsync(dayStartUtc, dayEndUtc, ct);
        KairosTelemetry.PostgresQuerySeconds.Record(
            Stopwatch.GetElapsedTime(sw).TotalSeconds, new KeyValuePair<string, object?>("query", "day_window"));

        return new DayScheduleDto(date, tz.Id, dayStartUtc, dayEndUtc, blocks);
    }

    public async Task<ScheduledBlockDto> RescheduleAsync(RescheduleRequest request, CancellationToken ct = default)
    {
        using var activity = KairosTelemetry.Source.StartActivity(KairosTelemetry.TaskReschedule);
        activity?.SetTag("block.id", request.BlockId);

        await validator.ValidateAndThrowAsync(request, ct);

        var block = await schedule.GetByIdAsync(request.BlockId, ct)
            ?? throw new ScheduleConflictException("That block no longer exists.");

        block.MoveTo(request.StartUtc, request.EndUtc);   // throws if the block is a read-only gcal block
        await unitOfWork.SaveChangesAsync(ct);            // throws ScheduleConflictException on overlap

        return new ScheduledBlockDto(block.Id, block.TaskId, TitleFor(block), block.Source.ToString(),
                                     block.StartUtc, block.EndUtc);
    }

    private static string TitleFor(Domain.ScheduledBlock block) =>
        block.Source == Domain.BlockSource.Gcal ? "(busy)" : "Task";

    private static TimeZoneInfo ResolveTimeZone(string timeZoneId)
    {
        if (string.IsNullOrWhiteSpace(timeZoneId)) return TimeZoneInfo.Utc;
        return TimeZoneInfo.TryFindSystemTimeZoneById(timeZoneId, out var tz) ? tz : TimeZoneInfo.Utc;
    }
}
