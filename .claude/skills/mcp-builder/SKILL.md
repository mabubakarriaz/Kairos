---
name: mcp-builder
description: "Build the Kairos MCP server — an ASP.NET Core host using the ModelContextProtocol C# SDK that exposes tools and resources over Streamable HTTP / SSE so AI clients can read tasks and add/remove/update them. Use when the user asks to create or change the MCP server, MCP tools (create/list/update/delete/reschedule task), MCP resources, the MCP transport/hosting, or to connect an AI client to Kairos."
---

# mcp-builder

Build the Kairos MCP server exactly as specified in [docs/technology-stack.md](../../../docs/technology-stack.md). This skill is the procedural companion to that document for the AI-integration layer: the tech-stack doc decides *what* the MCP stack is, this skill decides *how* to expose Kairos to AI agents consistently. It is a sibling of `backend-builder`, `frontend-builder`, `observability-builder`, and `database-builder` — the MCP server is a thin host (`Kairos.Mcp`) that delegates to the same application services those builders produce.

**Read [docs/technology-stack.md](../../../docs/technology-stack.md) first** — it is the source of truth. If anything here conflicts with it, the tech-stack doc wins; update this skill to match.

## Canonical MCP stack (from the tech-stack doc)

- **Protocol:** **Model Context Protocol (MCP)** — exposes Kairos so AI clients can read tasks and add/remove/update items
- **SDK:** **`ModelContextProtocol`** — the official C# SDK for implementing MCP tools and resources
- **Host/transport:** **ASP.NET Core MCP server** over **Streamable HTTP / SSE**
- **Runtime:** .NET 10 ASP.NET Core (`Kairos.Mcp`), wired through .NET Aspire
- **Telemetry/data:** inherits OTel from `Kairos.ServiceDefaults`; reaches Postgres through `Kairos.Application` services (never its own data access)

> **Guiding principle:** the MCP server is an adapter, not a brain. Tools validate input and call the *same* application services that Razor Pages and the API use — no business logic, no direct `DbContext` access, is duplicated here.

## Target layout (inside `src/Kairos.Mcp`)

```
src/Kairos.Mcp/
  Program.cs                  # builder.AddServiceDefaults(); AddMcpServer().WithHttpTransport().WithToolsFromAssembly(); app.MapMcp()
  Tools/
    TaskTools.cs              # [McpServerToolType] — create/list/update/delete/reschedule
  Resources/
    TaskResources.cs          # [McpServerResourceType] — exposes task data as resources
  Contracts/                  # request/response records for tools (mapped to Application DTOs)
  Kairos.Mcp.csproj           # references Kairos.Application (+ ServiceDefaults)
```

## Build workflow

Stand up the bare server first and confirm a client can list tools, then add tools one at a time, each delegating to an application service. Run `dotnet build` after each tool. Don't batch failures.

### 1. Packages & references
```powershell
dotnet add src/Kairos.Mcp package ModelContextProtocol.AspNetCore
```
Reference `Kairos.Application` (for service interfaces + validators) and `Kairos.ServiceDefaults`. Do **not** reference `Kairos.Infrastructure` directly — the host stays persistence-ignorant.

### 2. Host setup — `Program.cs`
```csharp
var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();                 // OTel, health, service discovery

builder.Services.AddApplication();            // app services + FluentValidation
builder.AddInfrastructure();                  // registers KairosDbContext via Aspire (impl only)

builder.Services
    .AddMcpServer()
    .WithHttpTransport()                      // Streamable HTTP / SSE
    .WithToolsFromAssembly()                  // discover [McpServerToolType]
    .WithResourcesFromAssembly();             // discover [McpServerResourceType]

var app = builder.Build();
app.MapDefaultEndpoints();                     // health/liveness from ServiceDefaults
app.MapMcp();                                  // MCP endpoint (Streamable HTTP / SSE)
app.Run();
```

### 3. Tools — `Tools/TaskTools.cs`
Expose the task operations named in the tech-stack doc. Each tool is small: bind a typed request, validate it with the shared FluentValidation validator, call an application service, return a result. Inject services via the tool method parameters (DI-resolved).
```csharp
[McpServerToolType]
public class TaskTools
{
    [McpServerTool, Description("List Kairos tasks, optionally filtered by status.")]
    public async Task<IReadOnlyList<TaskDto>> ListTasks(
        ITaskService tasks, string? status = null, CancellationToken ct = default)
        => await tasks.ListAsync(status, ct);

    [McpServerTool, Description("Create a new task with a title, optional description and scheduled time.")]
    public async Task<TaskDto> CreateTask(
        ITaskService tasks, CreateTaskRequest input, CancellationToken ct = default)
        => await tasks.CreateAsync(input, ct);

    // UpdateTask, DeleteTask, RescheduleTask follow the same shape.
}
```
Required tools (per the doc): **`list_tasks`**, **`create_task`**, **`update_task`**, **`delete_task`**, **`reschedule_task`**. Use clear, action-oriented names and rich `[Description]` text on tools *and* parameters — that text is the AI's only guide to correct usage.

### 4. Resources — `Resources/TaskResources.cs`
Expose read-only task data as MCP **resources** (e.g. a `kairos://tasks` listing and `kairos://tasks/{id}` items) so clients can pull context without invoking a tool. Mark types with `[McpServerResourceType]` and methods with `[McpServerResource]`.

### 5. Validation & error handling
- Validate every tool input with the same FluentValidation validators used by the web/API. On failure, return a clear, structured tool error message the model can act on — don't throw raw exceptions across the protocol boundary.
- Keep tools idempotent where sensible (e.g. delete of a missing task returns a benign result, not a crash).

### 6. Wire into Aspire
In `Kairos.AppHost/AppHost.cs`, the MCP host is a referenced project with the database wired in (already shown in `database-builder`):
```csharp
builder.AddProject<Projects.Kairos_Mcp>("mcp")
       .WithReference(kairosdb)
       .WaitFor(kairosdb);
```
Service discovery and the OTLP endpoint are injected automatically; MCP tool invocations show up as traces/metrics in the Aspire dashboard and Grafana (see `observability-builder` — add a custom `ActivitySource`/`Meter` for tool calls).

### 7. Containerize
Add a multi-stage `Dockerfile` for `Kairos.Mcp` (SDK build → runtime) and an `mcp` service in `docker-compose.yml` on the shared network, `depends_on` Postgres, with the OTLP endpoint pointing at the Collector. Keep the service name/ports aligned with the architecture diagram in the tech-stack doc.

### 8. Connect & verify a client
- Run via the AppHost (dev) or `docker compose up`. The MCP endpoint is served over Streamable HTTP.
- Verify with an MCP client (e.g. Claude Code / the MCP Inspector): list tools, call `create_task`, confirm the row lands in Postgres and is returned by `list_tasks`. Document the client config (endpoint URL + transport) in the repo README.

### 9. Tests
- Unit-test tools by mocking the application service (assert validation + mapping).
- Integration-test with **Aspire.Hosting.Testing** + **Testcontainers** Postgres: start the app model, invoke a tool end to end, and assert the database state — consistent with `backend-builder`/`database-builder`.

## Conventions

- **Adapter, not brain.** Tools validate + delegate to `Kairos.Application`; no business logic or direct `DbContext` use in `Kairos.Mcp`.
- **Descriptions are the contract.** Every tool, resource, and parameter gets precise `[Description]` text — it's the model's API documentation.
- **Tools mutate, resources read.** Use tools for create/update/delete/reschedule; use resources for read-only context exposure.
- **Validate at the boundary** with the shared validators; return structured errors, never raw exceptions.
- **Telemetry on every tool call** via the shared OTel setup; tool invocations are first-class spans.
- **No secrets/connection strings in the host** — they come from Aspire/environment.
- After changes: `dotnet build` clean, a client can list and successfully call tools, and integration tests pass.

## Definition of done

The MCP server is complete when: `Kairos.Mcp` builds and `MapMcp()` serves over Streamable HTTP / SSE; tools `list_tasks`, `create_task`, `update_task`, `delete_task`, `reschedule_task` work end to end against Postgres via application services; resources expose read-only task context; inputs are validated and errors are structured; the host is wired into the AppHost and emits telemetry; `docker compose up` runs the MCP service; and an AI client can connect and manage tasks. Anything skipped is called out explicitly.
