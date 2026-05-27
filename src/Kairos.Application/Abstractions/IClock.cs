namespace Kairos.Application.Abstractions;

/// <summary>Abstracts "now" (always UTC) so domain logic and free-slot ranking stay testable.</summary>
public interface IClock
{
    DateTimeOffset UtcNow { get; }
}
