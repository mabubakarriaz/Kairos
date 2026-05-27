using Kairos.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kairos.Infrastructure.Seed;

/// <summary>Idempotent dev seed — a couple of tasks scheduled today so the schedule view isn't empty.</summary>
public static class DbSeeder
{
    public static async Task SeedAsync(KairosDbContext db, CancellationToken ct = default)
    {
        if (await db.Tasks.AnyAsync(ct))
            return;

        var now = DateTimeOffset.UtcNow;
        var todayMidnightUtc = new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero);

        var standup = TaskItem.Create("Daily standup", now, "Sync with the team.", 15, ["work"]);
        var deepWork = TaskItem.Create("Deep work: schedule view", now, "Build the time-blocked grid.", 90, ["work", "focus"]);

        db.Tasks.AddRange(standup, deepWork);
        db.ScheduledBlocks.Add(ScheduledBlock.CreateForTask(
            standup.Id, todayMidnightUtc.AddHours(9), todayMidnightUtc.AddHours(9).AddMinutes(15)));
        db.ScheduledBlocks.Add(ScheduledBlock.CreateForTask(
            deepWork.Id, todayMidnightUtc.AddHours(10), todayMidnightUtc.AddHours(11).AddMinutes(30)));

        await db.SaveChangesAsync(ct);
    }
}
