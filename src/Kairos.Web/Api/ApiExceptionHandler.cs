using FluentValidation;
using Kairos.Application.Schedule;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Kairos.Web.Api;

/// <summary>
/// Translates application exceptions into structured HTTP problems so neither the API surface nor
/// the MCP tools leak raw exceptions: FluentValidation → 400 with per-field errors,
/// schedule overlap conflicts → 409.
/// </summary>
public sealed class ApiExceptionHandler(IProblemDetailsService problems) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        switch (exception)
        {
            case ValidationException ve:
                httpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
                var errors = ve.Errors
                    .GroupBy(e => e.PropertyName)
                    .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray());
                return await problems.TryWriteAsync(new ProblemDetailsContext
                {
                    HttpContext = httpContext,
                    ProblemDetails = new ValidationProblemDetails(errors)
                    {
                        Status = StatusCodes.Status400BadRequest,
                        Title = "Validation failed.",
                    },
                });

            case ScheduleConflictException sce:
                httpContext.Response.StatusCode = StatusCodes.Status409Conflict;
                return await problems.TryWriteAsync(new ProblemDetailsContext
                {
                    HttpContext = httpContext,
                    ProblemDetails = new ProblemDetails
                    {
                        Status = StatusCodes.Status409Conflict,
                        Title = "Schedule conflict.",
                        Detail = sce.Message,
                    },
                });

            default:
                return false; // let the default handler deal with it
        }
    }
}
