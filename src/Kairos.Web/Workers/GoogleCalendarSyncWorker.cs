using Kairos.Application.Abstractions;
using Kairos.Application.Telemetry;

namespace Kairos.Web.Workers;

/// <summary>
/// Polls Google Calendar for read-only busy data on a 5-min ± 25% jittered cadence and hands each
/// cycle to <see cref="IGoogleBusyImporter"/> (Infrastructure owns the syncToken state machine and the
/// Google client). Registered only when the GoogleCalendarSync feature flag is on, so its dependency
/// is never resolved while the flag is off (the MVP default).
/// </summary>
public sealed class GoogleCalendarSyncWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<GoogleCalendarSyncWorker> logger) : BackgroundService
{
    private static readonly TimeSpan BaseInterval = TimeSpan.FromMinutes(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("GoogleCalendarSyncWorker started (jittered ~5 min cadence).");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var activity = KairosTelemetry.Source.StartActivity(KairosTelemetry.GcalSyncCycle);
                using var scope = scopeFactory.CreateScope();
                var importer = scope.ServiceProvider.GetRequiredService<IGoogleBusyImporter>();
                var upserted = await importer.SyncOnceAsync(stoppingToken);
                KairosTelemetry.GcalSyncLagSeconds.Record(0);   // just synced → zero lag
                activity?.SetTag("gcal.upserted", upserted);
                logger.LogInformation("gcal.sync.cycle upserted {Count} busy blocks.", upserted);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // Never let a sync failure kill the worker; back off and retry next cycle.
                logger.LogError(ex, "Google Calendar sync cycle failed; will retry next interval.");
            }

            await Task.Delay(NextInterval(), stoppingToken);
        }
    }

    /// <summary>5 min ± 25% jitter so polling doesn't thunder against a single quota window.</summary>
    private static TimeSpan NextInterval()
    {
        var jitter = (Random.Shared.NextDouble() - 0.5) * 0.5;   // [-0.25, +0.25]
        return BaseInterval * (1 + jitter);
    }
}
