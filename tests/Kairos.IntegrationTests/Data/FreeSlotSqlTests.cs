using FluentAssertions;
using Kairos.Application.FreeSlots;
using Kairos.Application.Tasks;
using Kairos.IntegrationTests.Fixtures;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Kairos.IntegrationTests.Data;

/// <summary>
/// Exercises the multirange free-slot SQL (unnest(work_mr - range_agg(busy))) on real PG 17 —
/// the canonical reason Testcontainers is mandatory; this can't run on the EF in-memory provider.
/// </summary>
[Collection("postgres")]
public sealed class FreeSlotSqlTests(PostgresFixture fx)
{
    private static readonly DateTimeOffset Nine = new(2026, 5, 27, 9, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task GetFreeSlots_ReturnsGapsAroundBusyBlock()
    {
        await fx.ResetAsync();
        await using var scope = fx.Services.CreateAsyncScope();
        var tasks = scope.ServiceProvider.GetRequiredService<ITaskService>();
        var free = scope.ServiceProvider.GetRequiredService<IFreeSlotService>();

        // Busy 09:00–10:00 inside an 08:00–12:00 window → gaps 08:00–09:00 and 10:00–12:00.
        await tasks.CreateAsync(new CreateTaskRequest("Busy", StartUtc: Nine, EndUtc: Nine.AddHours(1)));

        var slots = await free.GetFreeSlotsAsync(Nine.AddHours(-1), Nine.AddHours(3), take: 10);

        slots.Should().HaveCount(2);
        slots.Should().Contain(s => s.StartUtc == Nine.AddHours(-1) && s.EndUtc == Nine);
        slots.Should().Contain(s => s.StartUtc == Nine.AddHours(1) && s.EndUtc == Nine.AddHours(3));
    }

    [Fact]
    public async Task GetFreeSlots_WithEstimate_FiltersOutShortGaps()
    {
        await fx.ResetAsync();
        await using var scope = fx.Services.CreateAsyncScope();
        var tasks = scope.ServiceProvider.GetRequiredService<ITaskService>();
        var free = scope.ServiceProvider.GetRequiredService<IFreeSlotService>();

        await tasks.CreateAsync(new CreateTaskRequest("Busy", StartUtc: Nine, EndUtc: Nine.AddHours(1)));

        // Window 08:00–12:00 → gaps of 60 min and 120 min; require ≥ 90 min → only the 120-min gap.
        var slots = await free.GetFreeSlotsAsync(Nine.AddHours(-1), Nine.AddHours(3), estimateMinutes: 90, take: 10);

        slots.Should().ContainSingle()
            .Which.Duration.Should().Be(TimeSpan.FromHours(2));
    }

    [Fact]
    public async Task GetFreeSlots_NoBusyBlocks_ReturnsWholeWindow()
    {
        await fx.ResetAsync();
        await using var scope = fx.Services.CreateAsyncScope();
        var free = scope.ServiceProvider.GetRequiredService<IFreeSlotService>();

        var slots = await free.GetFreeSlotsAsync(Nine, Nine.AddHours(4), take: 10);

        slots.Should().ContainSingle()
            .Which.Duration.Should().Be(TimeSpan.FromHours(4));
    }
}
