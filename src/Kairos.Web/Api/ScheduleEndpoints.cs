using Kairos.Application.FreeSlots;
using Kairos.Application.Schedule;

namespace Kairos.Web.Api;

/// <summary>
/// Minimal API surface for the schedule + free slots. Delegates to <see cref="IScheduleService"/> /
/// <see cref="IFreeSlotService"/>. The htmx drag island POSTs a reschedule here on drop.
/// </summary>
public static class ScheduleEndpoints
{
    public static IEndpointRouteBuilder MapScheduleApi(this IEndpointRouteBuilder app)
    {
        // GET /api/days/2026-05-27?tz=America/New_York  → the day's blocks for the grid.
        app.MapGet("/api/days/{date}", (DateOnly date, IScheduleService svc, string? tz, CancellationToken ct)
            => svc.GetDayAsync(date, tz ?? "UTC", ct))
           .WithTags("Schedule");

        // POST /api/blocks/{id}/reschedule  { startUtc, endUtc }  → drag-to-reschedule.
        app.MapPost("/api/blocks/{id:guid}/reschedule",
            (Guid id, RescheduleBody body, IScheduleService svc, CancellationToken ct)
                => svc.RescheduleAsync(new RescheduleRequest(id, body.StartUtc, body.EndUtc), ct))
           .WithTags("Schedule");

        // GET /api/slots?from=...&to=...&estimate=30  → ranked free slots.
        app.MapGet("/api/slots",
            (DateTimeOffset from, DateTimeOffset to, IFreeSlotService svc, int? estimate, int take, CancellationToken ct)
                => svc.GetFreeSlotsAsync(from, to, estimate, take <= 0 ? 5 : take, ct))
           .WithTags("Schedule");

        return app;
    }

    public sealed record RescheduleBody(DateTimeOffset StartUtc, DateTimeOffset EndUtc);
}
