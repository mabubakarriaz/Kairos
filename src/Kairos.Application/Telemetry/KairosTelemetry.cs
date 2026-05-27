using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace Kairos.Application.Telemetry;

/// <summary>
/// The single Kairos <see cref="ActivitySource"/> + <see cref="Meter"/>. Call sites across
/// Application/Infrastructure/Web start these spans and record these metrics; ServiceDefaults
/// registers the source + meter names with OpenTelemetry. Names are EXACT — Grafana dashboards
/// and NFR-budget alerts depend on them.
/// </summary>
public static class KairosTelemetry
{
    public const string ActivitySourceName = "Kairos";
    public const string MeterName = "Kairos";

    public static readonly ActivitySource Source = new(ActivitySourceName);
    public static readonly Meter Meter = new(MeterName);

    // ── Custom span names ────────────────────────────────────────────────────
    public const string ScheduleRender = "schedule.render";
    public const string FreeSlotsCompute = "freeslots.compute";
    public const string GcalSyncCycle = "gcal.sync.cycle";
    public const string TaskReschedule = "task.reschedule";

    // ── Custom metrics ───────────────────────────────────────────────────────
    public static readonly Histogram<double> HtmxPartialSwapSeconds =
        Meter.CreateHistogram<double>("kairos_htmx_partial_swap_seconds", "s", "Server time to render an htmx partial swap.");

    public static readonly Histogram<double> PostgresQuerySeconds =
        Meter.CreateHistogram<double>("kairos_postgres_query_seconds", "s", "Time for hot-path Postgres queries (day window, free slots).");

    public static readonly Gauge<long> ActiveTasks =
        Meter.CreateGauge<long>("kairos_active_tasks", "{tasks}", "Number of open (incomplete) tasks.");

    public static readonly Gauge<double> GcalSyncLagSeconds =
        Meter.CreateGauge<double>("kairos_gcal_sync_lag_seconds", "s", "Seconds since the last successful Google Calendar sync.");

    public static readonly Counter<long> GcalRateLimitedTotal =
        Meter.CreateCounter<long>("kairos_gcal_rate_limited_total", "{responses}", "Google Calendar 403 rateLimitExceeded / 429 responses.");

    public static readonly Counter<long> GcalTokenRefreshFailedTotal =
        Meter.CreateCounter<long>("kairos_gcal_token_refresh_failed_total", "{failures}", "Google OAuth token-refresh failures.");
}
