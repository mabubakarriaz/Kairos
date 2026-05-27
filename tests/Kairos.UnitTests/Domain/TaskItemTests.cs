using FluentAssertions;
using Kairos.Domain;
using Xunit;

namespace Kairos.UnitTests.Domain;

public sealed class TaskItemTests
{
    private static readonly DateTimeOffset Now = new(2026, 5, 27, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Create_WithoutEstimate_UsesDefault()
    {
        var task = TaskItem.Create("Write docs", Now);

        task.EstimateMinutes.Should().Be(TaskItem.DefaultEstimateMinutes);
        task.Title.Should().Be("Write docs");
        task.IsCompleted.Should().BeFalse();
        task.CreatedAt.Should().Be(Now);
    }

    [Fact]
    public void Create_TrimsTitle()
    {
        TaskItem.Create("  spaced  ", Now).Title.Should().Be("spaced");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_BlankTitle_Throws(string title)
    {
        var act = () => TaskItem.Create(title, Now);
        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Create_NonPositiveEstimate_Throws()
    {
        var act = () => TaskItem.Create("x", Now, estimateMinutes: 0);
        act.Should().Throw<ArgumentOutOfRangeException>();
    }

    [Fact]
    public void MarkComplete_SetsCompletedAtUtc()
    {
        var task = TaskItem.Create("x", Now);

        task.MarkComplete(Now.AddHours(2));

        task.IsCompleted.Should().BeTrue();
        task.CompletedAt.Should().Be(Now.AddHours(2));
    }

    [Fact]
    public void Reopen_ClearsCompletedAt()
    {
        var task = TaskItem.Create("x", Now);
        task.MarkComplete(Now);

        task.Reopen();

        task.IsCompleted.Should().BeFalse();
    }
}
