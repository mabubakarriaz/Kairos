using FluentAssertions;
using Kairos.Application.Schedule;
using Kairos.Application.Tasks;
using Kairos.IntegrationTests.Fixtures;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Kairos.IntegrationTests.Data;

/// <summary>
/// End-to-end through the same application services the Razor PageModels and MCP tools call:
/// create-with-time-range → appears on the day → reschedule → complete → delete.
/// </summary>
[Collection("postgres")]
public sealed class ServiceRoundtripTests(PostgresFixture fx)
{
    private static readonly DateTimeOffset Nine = new(2026, 5, 27, 9, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Day = new(2026, 5, 27);

    [Fact]
    public async Task CreateWithTimeRange_AppearsOnDay_WithTagsAndEstimate()
    {
        await fx.ResetAsync();
        await using var scope = fx.Services.CreateAsyncScope();
        var tasks = scope.ServiceProvider.GetRequiredService<ITaskService>();
        var schedule = scope.ServiceProvider.GetRequiredService<IScheduleService>();

        var created = await tasks.CreateAsync(new CreateTaskRequest(
            "Roundtrip", EstimateMinutes: 45, Tags: ["a", "b"], StartUtc: Nine, EndUtc: Nine.AddMinutes(45)));

        created.EstimateMinutes.Should().Be(45);
        created.Tags.Should().BeEquivalentTo("a", "b");

        var day = await schedule.GetDayAsync(Day, "UTC");
        day.Blocks.Should().ContainSingle(b => b.Title == "Roundtrip")
            .Which.StartUtc.Should().Be(Nine);
    }

    [Fact]
    public async Task Reschedule_MovesTheBlock()
    {
        await fx.ResetAsync();
        await using var scope = fx.Services.CreateAsyncScope();
        var tasks = scope.ServiceProvider.GetRequiredService<ITaskService>();
        var schedule = scope.ServiceProvider.GetRequiredService<IScheduleService>();

        await tasks.CreateAsync(new CreateTaskRequest("Move me", StartUtc: Nine, EndUtc: Nine.AddHours(1)));
        var block = (await schedule.GetDayAsync(Day, "UTC")).Blocks.Single();

        var moved = await schedule.RescheduleAsync(
            new RescheduleRequest(block.Id, Nine.AddHours(2), Nine.AddHours(3)));

        moved.StartUtc.Should().Be(Nine.AddHours(2));
        (await schedule.GetDayAsync(Day, "UTC")).Blocks.Single().StartUtc.Should().Be(Nine.AddHours(2));
    }

    [Fact]
    public async Task CompleteAndDelete_RemoveFromOpenList()
    {
        await fx.ResetAsync();
        await using var scope = fx.Services.CreateAsyncScope();
        var tasks = scope.ServiceProvider.GetRequiredService<ITaskService>();

        var created = await tasks.CreateAsync(new CreateTaskRequest("Temp"));

        (await tasks.CompleteAsync(created.Id)).Should().BeTrue();
        (await tasks.ListAsync(includeCompleted: false)).Should().NotContain(t => t.Id == created.Id);

        (await tasks.DeleteAsync(created.Id)).Should().BeTrue();
        (await tasks.GetAsync(created.Id)).Should().BeNull();
    }

    [Fact]
    public async Task DeleteMissingTask_ReturnsFalse()
    {
        await fx.ResetAsync();
        await using var scope = fx.Services.CreateAsyncScope();
        var tasks = scope.ServiceProvider.GetRequiredService<ITaskService>();

        (await tasks.DeleteAsync(Guid.NewGuid())).Should().BeFalse();
    }
}
