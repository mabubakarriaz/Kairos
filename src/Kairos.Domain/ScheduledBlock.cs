namespace Kairos.Domain;

/// <summary>
/// A time block on the schedule. Kairos blocks belong to a <see cref="TaskItem"/> and render as the
/// task's time block in the day view; gcal blocks are read-only busy data with no task.
/// Times are UTC <see cref="DateTimeOffset"/> (timestamptz). The database derives a generated
/// <c>during</c> tstzrange from <see cref="StartUtc"/>/<see cref="EndUtc"/> and enforces no-overlap
/// on Kairos blocks via an EXCLUDE constraint (database-builder).
/// </summary>
public sealed class ScheduledBlock
{
    // EF Core materialization constructor.
    private ScheduledBlock() { }

    private ScheduledBlock(Guid id, Guid? taskId, BlockSource source,
                           DateTimeOffset startUtc, DateTimeOffset endUtc,
                           string? externalId, string? rrule)
    {
        Id = id;
        TaskId = taskId;
        Source = source;
        StartUtc = startUtc;
        EndUtc = endUtc;
        ExternalId = externalId;
        Rrule = rrule;
    }

    public Guid Id { get; private set; }

    /// <summary>The owning task. Null for <see cref="BlockSource.Gcal"/> busy blocks.</summary>
    public Guid? TaskId { get; private set; }

    public BlockSource Source { get; private set; }

    public DateTimeOffset StartUtc { get; private set; }
    public DateTimeOffset EndUtc { get; private set; }

    /// <summary>Google event id for gcal blocks (for incremental syncToken reconciliation).</summary>
    public string? ExternalId { get; private set; }

    /// <summary>RFC-5545 recurrence rule for recurring Kairos blocks. Expanded on read, never pre-expanded into rows.</summary>
    public string? Rrule { get; private set; }

    public TimeSpan Duration => EndUtc - StartUtc;
    public bool IsRecurring => !string.IsNullOrWhiteSpace(Rrule);

    /// <summary>Schedule a Kairos task into a time range. This is what "add a task with a time range" creates.</summary>
    public static ScheduledBlock CreateForTask(Guid taskId, DateTimeOffset startUtc, DateTimeOffset endUtc,
                                               string? rrule = null)
    {
        Guard(startUtc, endUtc);
        return new ScheduledBlock(Guid.NewGuid(), taskId, BlockSource.Kairos,
                                  startUtc.ToUniversalTime(), endUtc.ToUniversalTime(), externalId: null, rrule);
    }

    /// <summary>Create a read-only busy block mirrored from Google Calendar.</summary>
    public static ScheduledBlock CreateFromGcal(string externalId, DateTimeOffset startUtc, DateTimeOffset endUtc)
    {
        if (string.IsNullOrWhiteSpace(externalId))
            throw new ArgumentException("Gcal block requires an external id.", nameof(externalId));
        Guard(startUtc, endUtc);
        return new ScheduledBlock(Guid.NewGuid(), taskId: null, BlockSource.Gcal,
                                  startUtc.ToUniversalTime(), endUtc.ToUniversalTime(), externalId, rrule: null);
    }

    /// <summary>Move a Kairos block to a new range (drag-to-reschedule). Gcal blocks are immutable.</summary>
    public void MoveTo(DateTimeOffset startUtc, DateTimeOffset endUtc)
    {
        if (Source is BlockSource.Gcal)
            throw new InvalidOperationException("Google Calendar blocks are read-only and cannot be moved.");
        Guard(startUtc, endUtc);
        StartUtc = startUtc.ToUniversalTime();
        EndUtc = endUtc.ToUniversalTime();
    }

    private static void Guard(DateTimeOffset startUtc, DateTimeOffset endUtc)
    {
        if (endUtc <= startUtc)
            throw new ArgumentException("A scheduled block must end after it starts.");
    }
}
