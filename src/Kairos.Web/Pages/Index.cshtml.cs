using System.Diagnostics;
using FluentValidation;
using Htmx;
using Kairos.Application.FreeSlots;
using Kairos.Application.Schedule;
using Kairos.Application.Tasks;
using Kairos.Application.Telemetry;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Kairos.Web.Pages;

/// <summary>
/// The Google-style time-blocked schedule view. Renders one day as a vertical grid of 15-min slots
/// with tasks shown as positioned time blocks. Adding a task with a time range creates the block;
/// dragging a block reschedules it. Razor stays authoritative; htmx swaps server-rendered partials.
/// </summary>
public sealed class IndexModel(
    IScheduleService schedule,
    IFreeSlotService freeSlots,
    ITaskService tasks) : PageModel
{
    // Working-hours window (local) used for free-slot suggestions + off-hours dimming.
    private static readonly TimeOnly WorkStart = new(7, 0);
    private static readonly TimeOnly WorkEnd = new(21, 0);

    public DateOnly Date { get; private set; }
    public string TimeZoneId { get; private set; } = "UTC";
    public DayScheduleDto Day { get; private set; } = default!;
    public IReadOnlyList<FreeSlot> FreeSlotsForDay { get; private set; } = [];
    public IReadOnlyList<FreeSlot> BestSlots => FreeSlotsForDay.Take(3).ToList();

    public TimeOnly WorkingStart => WorkStart;
    public TimeOnly WorkingEnd => WorkEnd;

    public const double PxPerMinute = 1.6;   // 96 px/hour; a 15-min slot ≈ 24 px

    [BindProperty]
    public CreateTaskForm Form { get; set; } = new();

    public sealed class CreateTaskForm
    {
        public string Title { get; set; } = string.Empty;
        public DateOnly Date { get; set; }
        public TimeOnly StartTime { get; set; } = new(9, 0);
        public TimeOnly EndTime { get; set; } = new(10, 0);
        public int? EstimateMinutes { get; set; }
    }

    public async Task<IActionResult> OnGetAsync(DateOnly? date, string? tz, CancellationToken ct)
    {
        await LoadAsync(date, tz, ct);
        return Page();
    }

    public async Task<IActionResult> OnPostAddTaskAsync(string? tz, CancellationToken ct)
    {
        var (startUtc, endUtc) = LocalRangeToUtc(Form.Date, Form.StartTime, Form.EndTime, tz);
        var request = new CreateTaskRequest(Form.Title, EstimateMinutes: Form.EstimateMinutes,
                                            StartUtc: startUtc, EndUtc: endUtc);
        try
        {
            await tasks.CreateAsync(request, ct);
        }
        catch (ValidationException ex)
        {
            foreach (var error in ex.Errors)
                ModelState.AddModelError($"Form.{error.PropertyName}", error.ErrorMessage);
        }
        catch (ScheduleConflictException ex)
        {
            ModelState.AddModelError("Form", ex.Message);
        }

        await LoadAsync(Form.Date, tz, ct);
        return Request.IsHtmx()
            ? Partial("Partials/_DayColumn", this)
            : RedirectToPage(new { date = Form.Date, tz });
    }

    // Polled every 30s by htmx to nudge the red "now" line — not SignalR.
    public async Task<IActionResult> OnGetNowLineAsync(DateOnly? date, string? tz, CancellationToken ct)
    {
        await LoadAsync(date, tz, ct);
        return Partial("Partials/_NowLine", this);
    }

    public async Task<IActionResult> OnPostRescheduleAsync(
        Guid blockId, DateOnly date, int startMin, int durationMin, string? tz, CancellationToken ct)
    {
        var start = new TimeOnly(0, 0).Add(TimeSpan.FromMinutes(startMin));
        var end = new TimeOnly(0, 0).Add(TimeSpan.FromMinutes(startMin + durationMin));
        var (startUtc, endUtc) = LocalRangeToUtc(date, start, end, tz);
        try
        {
            await schedule.RescheduleAsync(new RescheduleRequest(blockId, startUtc, endUtc), ct);
        }
        catch (ScheduleConflictException)
        {
            // The drop overlaps another block — re-render unchanged; the block snaps back.
        }

        var sw = Stopwatch.GetTimestamp();
        await LoadAsync(date, tz, ct);
        var result = Partial("Partials/_DayColumn", this);
        KairosTelemetry.HtmxPartialSwapSeconds.Record(
            Stopwatch.GetElapsedTime(sw).TotalSeconds, new KeyValuePair<string, object?>("handler", "reschedule"));
        return result;
    }

    // ── view helpers ────────────────────────────────────────────────────────────
    public double TopPx(DateTimeOffset instant) => MinutesFromDayStart(instant) * PxPerMinute;
    public double HeightPx(DateTimeOffset start, DateTimeOffset end) =>
        Math.Max(16, (end - start).TotalMinutes * PxPerMinute);
    public double MinutesFromDayStart(DateTimeOffset instant) =>
        Math.Clamp((instant - Day.DayStartUtc).TotalMinutes, 0, 1440);

    public bool IsToday => Date == DateOnly.FromDateTime(DateTimeOffset.UtcNow.UtcDateTime);
    public double? NowTopPx
    {
        get
        {
            var now = DateTimeOffset.UtcNow;
            return IsToday && now >= Day.DayStartUtc && now < Day.DayEndUtc
                ? (now - Day.DayStartUtc).TotalMinutes * PxPerMinute
                : null;
        }
    }

    private async Task LoadAsync(DateOnly? date, string? tz, CancellationToken ct)
    {
        Date = date ?? DateOnly.FromDateTime(DateTimeOffset.UtcNow.UtcDateTime);
        TimeZoneId = string.IsNullOrWhiteSpace(tz) ? "UTC" : tz;
        Form.Date = Date;

        Day = await schedule.GetDayAsync(Date, TimeZoneId, ct);

        var (workStartUtc, workEndUtc) = LocalRangeToUtc(Date, WorkStart, WorkEnd, TimeZoneId);
        FreeSlotsForDay = await freeSlots.GetFreeSlotsAsync(workStartUtc, workEndUtc, take: 20, ct: ct);
    }

    private static (DateTimeOffset start, DateTimeOffset end) LocalRangeToUtc(
        DateOnly date, TimeOnly start, TimeOnly end, string? tzId)
    {
        var tz = ResolveTimeZone(tzId);
        var localStart = date.ToDateTime(start);
        var localEnd = date.ToDateTime(end);
        var startUtc = new DateTimeOffset(localStart, tz.GetUtcOffset(localStart)).ToUniversalTime();
        var endUtc = new DateTimeOffset(localEnd, tz.GetUtcOffset(localEnd)).ToUniversalTime();
        return (startUtc, endUtc);
    }

    private static TimeZoneInfo ResolveTimeZone(string? tzId)
    {
        if (string.IsNullOrWhiteSpace(tzId)) return TimeZoneInfo.Utc;
        return TimeZoneInfo.TryFindSystemTimeZoneById(tzId, out var tz) ? tz : TimeZoneInfo.Utc;
    }
}
