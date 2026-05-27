namespace Kairos.Web.Features;

/// <summary>
/// Feature flags bound from the "Features" section of appsettings.json. Each vertical slice ships
/// behind one of these so it's independently demoable and can be dark-launched.
/// </summary>
public sealed class KairosFeatures
{
    public const string SectionName = "Features";

    /// <summary>Schedule view + add tasks with time ranges (the MVP slice). On by default.</summary>
    public bool ScheduleView { get; set; } = true;

    /// <summary>Top-N free-slot suggestions panel.</summary>
    public bool FreeSlotSuggestions { get; set; } = true;

    /// <summary>In-process MCP server mapped at /mcp.</summary>
    public bool Mcp { get; set; } = true;

    /// <summary>Google Calendar read-only busy import (Slice 4). Off until OAuth is configured.</summary>
    public bool GoogleCalendarSync { get; set; }

    /// <summary>Recurring Kairos blocks via rrule (Slice 5).</summary>
    public bool RecurringBlocks { get; set; }
}
