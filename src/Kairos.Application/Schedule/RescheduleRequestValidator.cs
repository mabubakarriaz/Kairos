using FluentValidation;

namespace Kairos.Application.Schedule;

/// <summary>Boundary validation for drag-to-reschedule — shared by the htmx drop endpoint and MCP.</summary>
public sealed class RescheduleRequestValidator : AbstractValidator<RescheduleRequest>
{
    public RescheduleRequestValidator()
    {
        RuleFor(x => x.BlockId).NotEmpty();
        RuleFor(x => x.EndUtc)
            .GreaterThan(x => x.StartUtc)
            .WithMessage("The block must end after it starts.");
    }
}
