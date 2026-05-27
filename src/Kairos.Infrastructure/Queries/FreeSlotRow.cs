namespace Kairos.Infrastructure.Queries;

/// <summary>
/// Keyless projection of one gap returned by the multirange free-slot SQL. Column names
/// (start_utc/end_utc) match the SELECT in <see cref="FreeSlotQueries"/>.
/// </summary>
public sealed class FreeSlotRow
{
    public DateTime StartUtc { get; init; }
    public DateTime EndUtc { get; init; }
}
