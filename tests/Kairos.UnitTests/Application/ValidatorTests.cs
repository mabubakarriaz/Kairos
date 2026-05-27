using FluentAssertions;
using Kairos.Application.Schedule;
using Kairos.Application.Tasks;
using Xunit;

namespace Kairos.UnitTests.Application;

public sealed class CreateTaskRequestValidatorTests
{
    private readonly CreateTaskRequestValidator _validator = new();
    private static readonly DateTimeOffset T0 = new(2026, 5, 27, 9, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Valid_TitleOnly_Passes()
    {
        _validator.Validate(new CreateTaskRequest("Do the thing")).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Valid_WithTimeRange_Passes()
    {
        var req = new CreateTaskRequest("Meeting", StartUtc: T0, EndUtc: T0.AddHours(1));
        _validator.Validate(req).IsValid.Should().BeTrue();
    }

    [Fact]
    public void EmptyTitle_Fails()
    {
        _validator.Validate(new CreateTaskRequest("")).IsValid.Should().BeFalse();
    }

    [Fact]
    public void EndBeforeStart_Fails()
    {
        var req = new CreateTaskRequest("x", StartUtc: T0.AddHours(1), EndUtc: T0);
        _validator.Validate(req).IsValid.Should().BeFalse();
    }

    [Fact]
    public void StartWithoutEnd_Fails()
    {
        _validator.Validate(new CreateTaskRequest("x", StartUtc: T0)).IsValid.Should().BeFalse();
    }

    [Fact]
    public void NonPositiveEstimate_Fails()
    {
        _validator.Validate(new CreateTaskRequest("x", EstimateMinutes: 0)).IsValid.Should().BeFalse();
    }
}

public sealed class RescheduleRequestValidatorTests
{
    private readonly RescheduleRequestValidator _validator = new();
    private static readonly DateTimeOffset T0 = new(2026, 5, 27, 9, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Valid_Passes()
    {
        var req = new RescheduleRequest(Guid.NewGuid(), T0, T0.AddHours(1));
        _validator.Validate(req).IsValid.Should().BeTrue();
    }

    [Fact]
    public void EndNotAfterStart_Fails()
    {
        var req = new RescheduleRequest(Guid.NewGuid(), T0, T0);
        _validator.Validate(req).IsValid.Should().BeFalse();
    }

    [Fact]
    public void EmptyBlockId_Fails()
    {
        var req = new RescheduleRequest(Guid.Empty, T0, T0.AddHours(1));
        _validator.Validate(req).IsValid.Should().BeFalse();
    }
}
