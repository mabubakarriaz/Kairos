using FluentValidation;

namespace Kairos.Application.Tasks;

/// <summary>Boundary validation for task creation — shared by the Razor/API surface and the MCP tools.</summary>
public sealed class CreateTaskRequestValidator : AbstractValidator<CreateTaskRequest>
{
    public CreateTaskRequestValidator()
    {
        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("Title is required.")
            .MaximumLength(200);

        RuleFor(x => x.Description)
            .MaximumLength(2000);

        RuleFor(x => x.EstimateMinutes)
            .GreaterThan(0).When(x => x.EstimateMinutes is not null)
            .WithMessage("Estimate must be a positive number of minutes.");

        // A time range is optional, but if one bound is given the other must be too, and end > start.
        RuleFor(x => x.EndUtc)
            .NotNull().When(x => x.StartUtc is not null)
            .WithMessage("End time is required when a start time is given.");

        RuleFor(x => x.StartUtc)
            .NotNull().When(x => x.EndUtc is not null)
            .WithMessage("Start time is required when an end time is given.");

        RuleFor(x => x)
            .Must(x => x.EndUtc > x.StartUtc)
            .When(x => x.HasTimeRange)
            .WithMessage("The block must end after it starts.");
    }
}
