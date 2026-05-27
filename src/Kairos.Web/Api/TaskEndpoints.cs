using Kairos.Application.Tasks;

namespace Kairos.Web.Api;

/// <summary>
/// Minimal API surface for tasks under /api/tasks. Thin adapter — every route delegates to
/// <see cref="ITaskService"/>, the same service the Razor PageModels and MCP tools use.
/// </summary>
public static class TaskEndpoints
{
    public static IEndpointRouteBuilder MapTaskApi(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/tasks").WithTags("Tasks");

        group.MapGet("/", (ITaskService svc, bool includeCompleted = false, CancellationToken ct = default)
            => svc.ListAsync(includeCompleted, ct));

        group.MapGet("/{id:guid}", async (Guid id, ITaskService svc, CancellationToken ct) =>
            await svc.GetAsync(id, ct) is { } dto ? Results.Ok(dto) : Results.NotFound());

        group.MapPost("/", async (CreateTaskRequest request, ITaskService svc, CancellationToken ct) =>
        {
            var created = await svc.CreateAsync(request, ct);
            return Results.Created($"/api/tasks/{created.Id}", created);
        });

        group.MapPost("/{id:guid}/complete", async (Guid id, ITaskService svc, CancellationToken ct) =>
            await svc.CompleteAsync(id, ct) ? Results.NoContent() : Results.NotFound());

        group.MapDelete("/{id:guid}", async (Guid id, ITaskService svc, CancellationToken ct) =>
            await svc.DeleteAsync(id, ct) ? Results.NoContent() : Results.NotFound());

        return app;
    }
}
