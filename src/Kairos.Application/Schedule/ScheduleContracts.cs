namespace Kairos.Application.Schedule;

/// <summary>Read model for one time block on the schedule (joined to its task title when Kairos-sourced).</summary>
public sealed record ScheduledBlockDto(
    Guid Id,
    Guid? TaskId,
    string Title,
    string Source,
    DateTimeOffset StartUtc,
    DateTimeOffset EndUtc)
{
    public bool IsGcal => string.Equals(Source, "Gcal", StringComparison.OrdinalIgnoreCase);
    public bool IsEditable => !IsGcal;
    public TimeSpan Duration => EndUtc - StartUtc;
}

/// <summary>One day's worth of blocks, plus the local-day boundaries used to lay out the grid.</summary>
public sealed record DayScheduleDto(
    DateOnly Date,
    string TimeZoneId,
    DateTimeOffset DayStartUtc,
    DateTimeOffset DayEndUtc,
    IReadOnlyList<ScheduledBlockDto> Blocks);

/// <summary>Drag-to-reschedule: move a Kairos block to a new UTC range.</summary>
public sealed record RescheduleRequest(Guid BlockId, DateTimeOffset StartUtc, DateTimeOffset EndUtc);

/// <summary>Schedule use cases. Same service backs the Razor day view, the htmx drag drop, and MCP.</summary>
public interface IScheduleService
{
    Task<DayScheduleDto> GetDayAsync(DateOnly date, string timeZoneId, CancellationToken ct = default);
    Task<ScheduledBlockDto> RescheduleAsync(RescheduleRequest request, CancellationToken ct = default);
}

/// <summary>
/// Raised when a write would violate the Postgres no-overlap EXCLUDE constraint on Kairos blocks.
/// Infrastructure translates Npgsql's exclusion_violation (SQLSTATE 23P01) into this so the
/// Application/Web layers never see provider-specific exceptions.
/// </summary>
public sealed class ScheduleConflictException(string message) : Exception(message);
