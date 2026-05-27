using FluentAssertions;
using Kairos.Domain;
using Xunit;

namespace Kairos.UnitTests.Domain;

public sealed class ScheduledBlockTests
{
    private static readonly DateTimeOffset Start = new(2026, 5, 27, 9, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset End = new(2026, 5, 27, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public void CreateForTask_SetsKairosSourceAndWindow()
    {
        var taskId = Guid.NewGuid();

        var block = ScheduledBlock.CreateForTask(taskId, Start, End);

        block.Source.Should().Be(BlockSource.Kairos);
        block.TaskId.Should().Be(taskId);
        block.Duration.Should().Be(TimeSpan.FromHours(1));
    }

    [Fact]
    public void CreateForTask_EndNotAfterStart_Throws()
    {
        var act = () => ScheduledBlock.CreateForTask(Guid.NewGuid(), End, Start);
        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void CreateFromGcal_RequiresExternalId()
    {
        var act = () => ScheduledBlock.CreateFromGcal("", Start, End);
        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void MoveTo_KairosBlock_UpdatesWindow()
    {
        var block = ScheduledBlock.CreateForTask(Guid.NewGuid(), Start, End);

        block.MoveTo(Start.AddHours(2), End.AddHours(2));

        block.StartUtc.Should().Be(Start.AddHours(2));
        block.EndUtc.Should().Be(End.AddHours(2));
    }

    [Fact]
    public void MoveTo_GcalBlock_Throws()
    {
        var block = ScheduledBlock.CreateFromGcal("ext-1", Start, End);

        var act = () => block.MoveTo(Start.AddHours(1), End.AddHours(1));

        act.Should().Throw<InvalidOperationException>("Google Calendar blocks are read-only");
    }
}
