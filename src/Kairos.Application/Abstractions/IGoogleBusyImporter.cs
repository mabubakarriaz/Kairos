namespace Kairos.Application.Abstractions;

/// <summary>
/// Slice-4 port: imports read-only Google Calendar busy data via incremental syncToken polling.
/// Implemented in Infrastructure (Google.Apis.Calendar.v3). The GoogleCalendarSyncWorker drives it
/// on a jittered cadence. Only resolved when the GoogleCalendarSync feature flag is on.
/// </summary>
public interface IGoogleBusyImporter
{
    /// <summary>Run one incremental sync cycle. Returns the number of busy blocks upserted.</summary>
    Task<int> SyncOnceAsync(CancellationToken ct = default);
}
