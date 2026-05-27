namespace Kairos.Domain;

/// <summary>
/// The core Kairos aggregate — a thing to do. Kairos = "the right &amp; opportune time to do a task",
/// so scheduling lives in <see cref="ScheduledBlock"/>; a task may have zero or more blocks.
/// Persistence-ignorant: no EF Core / ASP.NET types here (database-builder owns the mapping).
/// </summary>
public sealed class TaskItem
{
    private readonly List<string> _tags = [];

    // EF Core materialization constructor.
    private TaskItem()
    {
        Title = string.Empty;
    }

    private TaskItem(Guid id, string title, string? description, int estimateMinutes,
                     IEnumerable<string> tags, DateTimeOffset createdAt)
    {
        Id = id;
        Title = title;
        Description = description;
        EstimateMinutes = estimateMinutes;
        _tags.AddRange(tags);
        CreatedAt = createdAt;
    }

    /// <summary>Default effort estimate (minutes) when the caller doesn't supply one — matches the schema default.</summary>
    public const int DefaultEstimateMinutes = 30;

    public Guid Id { get; private set; }
    public string Title { get; private set; }
    public string? Description { get; private set; }

    /// <summary>Rough effort estimate in minutes; drives free-slot fit ranking. NOT NULL (defaults to 30).</summary>
    public int EstimateMinutes { get; private set; }

    public IReadOnlyList<string> Tags => _tags;

    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset? CompletedAt { get; private set; }

    public bool IsCompleted => CompletedAt is not null;

    /// <summary>Create a new task. <paramref name="now"/> is injected (UTC) so the domain stays testable.</summary>
    public static TaskItem Create(string title, DateTimeOffset now, string? description = null,
                                  int? estimateMinutes = null, IEnumerable<string>? tags = null)
    {
        if (string.IsNullOrWhiteSpace(title))
            throw new ArgumentException("Task title is required.", nameof(title));
        if (estimateMinutes is < 1)
            throw new ArgumentOutOfRangeException(nameof(estimateMinutes), "Estimate must be positive.");

        return new TaskItem(Guid.NewGuid(), title.Trim(), description, estimateMinutes ?? DefaultEstimateMinutes,
                            tags ?? [], now.ToUniversalTime());
    }

    public void Rename(string title)
    {
        if (string.IsNullOrWhiteSpace(title))
            throw new ArgumentException("Task title is required.", nameof(title));
        Title = title.Trim();
    }

    public void MarkComplete(DateTimeOffset now) => CompletedAt = now.ToUniversalTime();

    public void Reopen() => CompletedAt = null;
}
