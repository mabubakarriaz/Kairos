using FluentAssertions;
using Kairos.Application.Abstractions;
using Kairos.Application.Schedule;
using Kairos.Application.Tasks;
using Kairos.Domain;
using Kairos.IntegrationTests.Fixtures;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Kairos.IntegrationTests.Data;

[Collection("postgres")]
public sealed class ScheduleConstraintTests(PostgresFixture fx)
{
    private static readonly DateTimeOffset T0 = new(2026, 5, 27, 9, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task OverlappingKairosBlocks_RaiseScheduleConflict()
    {
        await fx.ResetAsync();
        await using var scope = fx.Services.CreateAsyncScope();
        var tasks = scope.ServiceProvider.GetRequiredService<ITaskService>();

        await tasks.CreateAsync(new CreateTaskRequest("A", StartUtc: T0, EndUtc: T0.AddHours(1)));

        var act = async () => await tasks.CreateAsync(
            new CreateTaskRequest("B", StartUtc: T0.AddMinutes(30), EndUtc: T0.AddMinutes(90)));

        await act.Should().ThrowAsync<ScheduleConflictException>();
    }

    [Fact]
    public async Task OverlappingGcalBlocks_AreAllowed()
    {
        await fx.ResetAsync();
        await using var scope = fx.Services.CreateAsyncScope();
        var schedule = scope.ServiceProvider.GetRequiredService<IScheduleRepository>();
        var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        schedule.Add(ScheduledBlock.CreateFromGcal("e1", T0, T0.AddHours(1)));
        schedule.Add(ScheduledBlock.CreateFromGcal("e2", T0.AddMinutes(30), T0.AddMinutes(90)));

        var act = async () => await uow.SaveChangesAsync();

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task AdjacentKairosBlocks_AreAllowed()
    {
        await fx.ResetAsync();
        await using var scope = fx.Services.CreateAsyncScope();
        var tasks = scope.ServiceProvider.GetRequiredService<ITaskService>();

        await tasks.CreateAsync(new CreateTaskRequest("A", StartUtc: T0, EndUtc: T0.AddHours(1)));

        // [09:00,10:00) and [10:00,11:00) touch but don't overlap (half-open range).
        var act = async () => await tasks.CreateAsync(
            new CreateTaskRequest("B", StartUtc: T0.AddHours(1), EndUtc: T0.AddHours(2)));

        await act.Should().NotThrowAsync();
    }
}
