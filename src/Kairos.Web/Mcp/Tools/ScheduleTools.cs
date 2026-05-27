using System.ComponentModel;
using FluentValidation;
using Kairos.Application.FreeSlots;
using Kairos.Application.Schedule;
using ModelContextProtocol;
using ModelContextProtocol.Server;

namespace Kairos.Web.Mcp.Tools;

/// <summary>
/// MCP tools for the schedule. <c>reschedule_task</c> moves a block; <c>list_free_slots</c> is the
/// headline AI affordance and delegates to <see cref="IFreeSlotService"/> (the multirange SQL —
/// free slots are computed in SQL, never reimplemented here).
/// </summary>
[McpServerToolType]
public sealed class ScheduleTools
{
    [McpServerTool(Name = "reschedule_task")]
    [Description("Move a scheduled block to a new UTC time range. Fails if the new range overlaps another Kairos block.")]
    public async Task<ScheduledBlockDto> RescheduleTask(
        IScheduleService schedule,
        [Description("The scheduled block id (GUID) to move.")] Guid blockId,
        [Description("New start, inclusive, ISO-8601 UTC.")] DateTimeOffset startUtc,
        [Description("New end, exclusive, ISO-8601 UTC.")] DateTimeOffset endUtc,
        CancellationToken ct = default)
    {
        try
        {
            return await schedule.RescheduleAsync(new RescheduleRequest(blockId, startUtc, endUtc), ct);
        }
        catch (ValidationException ex)
        {
            throw new McpException(TaskTools.Format(ex));
        }
        catch (ScheduleConflictException ex)
        {
            throw new McpException(ex.Message);
        }
    }

    [McpServerTool(Name = "list_free_slots")]
    [Description("Return open gaps in the schedule between two UTC instants, best-ranked first. Use to answer 'when am I free?' and to find a slot for a task.")]
    public async Task<IReadOnlyList<FreeSlot>> ListFreeSlots(
        IFreeSlotService slots,
        [Description("Window start, inclusive, ISO-8601 UTC.")] DateTimeOffset fromUtc,
        [Description("Window end, exclusive, ISO-8601 UTC.")] DateTimeOffset toUtc,
        [Description("Only return gaps at least this many minutes long (the task's estimate). Optional.")] int? minMinutes = null,
        [Description("How many slots to return (default 5).")] int take = 5,
        CancellationToken ct = default)
        => await slots.GetFreeSlotsAsync(fromUtc, toUtc, minMinutes, take, ct);
}
