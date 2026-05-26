---
name: mcp-builder
description: "Build the Kairos MCP server — mapped in-process at /mcp inside Kairos.Web using the ModelContextProtocol C# SDK, exposing tools and resources over Streamable HTTP / SSE so AI clients can read tasks, add/remove/reschedule them, and query free slots. Use when the user asks to create or change the MCP server, MCP tools (list/create/delete/reschedule task, list free slots), MCP resources, the MCP transport/hosting, or to connect an AI client to Kairos."
---

# mcp-builder

Build the Kairos MCP server exactly as specified in [docs/technology-stack.md](../../../docs/technology-stack.md). This skill is the procedural companion to that document for the AI-integration layer: the tech-stack doc decides *what* the MCP stack is, this skill decides *how* to expose Kairos to AI agents consistently. The MCP server is **not** a separate service — it is mapped in-process inside `Kairos.Web` and delegates to the same application services the Razor Pages and APIs use.

**Read [docs/technology-stack.md](../../../docs/technology-stack.md) first** — it is the source of truth. [docs/report-technical-design-research.md](../../../docs/report-technical-design-research.md) §3 shows the tool sketches and the "MCP piggybacks on ASP.NET Core for free" rationale. If anything here conflicts with the tech-stack doc, the doc wins; update this skill to match.

## Canonical MCP stack (from the tech-stack doc)

- **Protocol:** **Model Context Protocol (MCP)** — exposes Kairos so AI clients can read tasks and add/remove/reschedule items and query free slots
- **SDK:** **`ModelContextProtocol`** (C# SDK, 1.x) — official (Microsoft + Anthropic); handles JSON-RPC framing & tool discovery. **Pin the version** — spec & SDK are still moving
- **Hosting transport:** **`ModelContextProtocol.AspNetCore`** — `AddMcpServer().WithHttpTransport().WithToolsFromAssembly()` + `app.MapMcp("/mcp")`; **Streamable HTTP / SSE**
- **Topology:** **same process as the app** — `/mcp` is a route inside `Kairos.Web`. There is **no separate `Kairos.Mcp` project, container, or `mcp` Aspire resource** (this supersedes the older separate-host design)
- **Telemetry/data:** inherits OTel from `Kairos.ServiceDefaults`; reaches Postgres through `Kairos.Application` services (never its own data access)

> **Guiding principle:** the MCP server is an adapter, not a brain. Tools validate input and call the *same* application services that Razor Pages and the `/api/*` endpoints use — no business logic, no direct `DbContext` access, is duplicated here.

## Target layout (inside `src/Kairos.Web`)

```
src/Kairos.Web/
  Program.cs                  # AddMcpServer().WithHttpTransport().WithToolsFromAssembly().WithResourcesFromAssembly(); app.MapMcp("/mcp")
  Mcp/
    Tools/
      TaskTools.cs            # [McpServerToolType] — list/create/delete/reschedule task
      ScheduleTools.cs        # [McpServerToolType] — list_free_slots
    Resources/
      TaskResources.cs        # [McpServerResourceType] — exposes task data as resources
    Contracts/               # request/response records for tools (mapped to Application DTOs)
```

`Kairos.Web` already references `Kairos.Application` (service interfaces + validators) and `Kairos.ServiceDefaults`. The MCP tool classes live beside the Razor Pages and share the same DI container — so a tool and a PageModel resolve the *same* `ITaskService`.

## Build workflow

Map the bare server first and confirm a client can list tools, then add tools one at a time, each delegating to an application service. Run `dotnet build` after each tool. Don't batch failures.

### 1. Package
```powershell
dotnet add src/Kairos.Web package ModelContextProtocol.AspNetCore   # pin the exact 1.x version in the csproj
```
No new project — the MCP surface ships inside `Kairos.Web`.

### 2. Host setup — `Kairos.Web/Program.cs`
Register MCP alongside Razor Pages, the `/api/*` Minimal APIs, and the `GoogleCalendarSyncWorker`:
```csharp
var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();                 // OTel, health, service discovery

builder.Services.AddApplication();            // app services + FluentValidation
builder.AddInfrastructure();                  // KairosDbContext via Aspire (impl only)

builder.Services
    .AddMcpServer()
    .WithHttpTransport()                      // Streamable HTTP / SSE
    .WithToolsFromAssembly()                  // discover [McpServerToolType]
    .WithResourcesFromAssembly();             // discover [McpServerResourceType]

builder.Services.AddRazorPages();

var app = builder.Build();
app.MapDefaultEndpoints();                     // health/liveness from ServiceDefaults
app.MapRazorPages();
app.MapApiEndpoints();                         // /api/* (tasks, slots, reschedule)
app.MapMcp("/mcp");                            // MCP endpoint (Streamable HTTP / SSE)
app.Run();
```

### 3. Task tools — `Mcp/Tools/TaskTools.cs`
Each tool is small: bind a typed request, validate it with the shared FluentValidation validator, call an application service, return a result. Inject services via tool method parameters (DI-resolved).
```csharp
[McpServerToolType]
public class TaskTools
{
    [McpServerTool, Description("List Kairos tasks, optionally filtered by status.")]
    public async Task<IReadOnlyList<TaskDto>> ListTasks(
        ITaskService tasks, string? status = null, CancellationToken ct = default)
        => await tasks.ListAsync(status, ct);

    [McpServerTool, Description("Create a Kairos task with a title, optional description, estimate, and tags.")]
    public async Task<TaskDto> CreateTask(
        ITaskService tasks, CreateTaskRequest input, CancellationToken ct = default)
        => await tasks.CreateAsync(input, ct);

    // DeleteTask, RescheduleTask follow the same shape (RescheduleTask -> IScheduleService).
}
```

### 4. Schedule tool — `Mcp/Tools/ScheduleTools.cs`
`list_free_slots` is the headline AI affordance ("what free slots do I have tomorrow?"). It delegates to `IFreeSlotService`, which runs the **multirange SQL** (free slots = SQL, not C#) and returns ranked slots:
```csharp
[McpServerTool, Description("Return free slots ≥ minMinutes between t1 and t2, best-ranked first.")]
public async Task<IReadOnlyList<FreeSlot>> ListFreeSlots(
    IFreeSlotService slots,
    [Description("Window start (inclusive, UTC).")] DateTimeOffset t1,
    [Description("Window end (exclusive, UTC).")]   DateTimeOffset t2,
    [Description("Minimum slot length in minutes.")] int minMinutes = 15,
    CancellationToken ct = default)
    => await slots.ListFreeAsync(t1, t2, minMinutes, ct);
```

**Required v1 tool surface** (per the tech-stack doc): **`list_tasks`**, **`create_task`**, **`delete_task`**, **`reschedule_task`**, **`list_free_slots`**. (`update_task` may be added for editing task fields, consistent with CLAUDE.md's "update" capability, but the five above are the canonical surface.) Use clear, action-oriented names and rich `[Description]` text on tools *and* parameters — that text is the AI's only guide to correct usage.

### 5. Resources — `Mcp/Resources/TaskResources.cs`
Expose read-only task data as MCP **resources** (e.g. a `kairos://tasks` listing and `kairos://tasks/{id}` items) so clients can pull context without invoking a tool. Mark types with `[McpServerResourceType]` and methods with `[McpServerResource]`.

### 6. Validation & error handling
- Validate every tool input with the same FluentValidation validators used by the web/API. On failure, return a **clear, structured tool error** the model can act on — **never throw raw exceptions across the protocol boundary**.
- Keep tools idempotent where sensible (e.g. delete of a missing task returns a benign result, not a crash).

### 7. Wire into Aspire (nothing extra)
Because MCP lives in `Kairos.Web`, the existing `web` resource already provides the DB reference, service discovery, and the OTLP endpoint — no new AppHost wiring:
```csharp
builder.AddProject<Projects.Kairos_Web>("web").WithReference(kairosdb).WaitFor(kairosdb)
       .WithExternalHttpEndpoints();   // also serves /mcp
```
Add a custom `ActivitySource`/`Meter` for tool calls so MCP invocations show up as traces/metrics in the Aspire dashboard and Grafana (see `observability-builder`).

### 8. Containerize (nothing extra)
`/mcp` ships in the `Kairos.Web` image and is reachable through the reverse proxy in `compose.dev.yml`/`compose.prod.yml` — there is no separate `mcp` service to add (see `orchestration-builder`).

### 9. Connect & verify a client
- Run via the AppHost (dev) or `docker compose up`. The MCP endpoint is `/mcp` on the web host (over Streamable HTTP, behind Caddy's HTTPS in compose).
- Verify with an MCP client (e.g. Claude Code / the MCP Inspector): list tools, call `create_task`, confirm the row lands in Postgres and is returned by `list_tasks`; ask `list_free_slots` for tomorrow and confirm gaps come back. Document the client config (endpoint URL + transport) in the repo README.

### 10. Tests — see `testing-builder`
- Unit-test tools by mocking the application service (assert validation + mapping).
- Integration-test with **Aspire.Hosting.Testing** + **Testcontainers** Postgres: start the app model, invoke a tool over `/mcp` end to end, and assert database state — including `list_free_slots` against the real multirange SQL.

## Conventions

- **In-process, not a sidecar.** MCP is `/mcp` on `Kairos.Web`; no separate project/container/`mcp` resource.
- **Adapter, not brain.** Tools validate + delegate to `Kairos.Application`; no business logic or direct `DbContext` use.
- **Free slots = SQL.** `list_free_slots` calls `IFreeSlotService` (multirange query); the tool never reimplements gap-finding.
- **Descriptions are the contract.** Every tool, resource, and parameter gets precise `[Description]` text — it's the model's API documentation.
- **Tools mutate, resources read.** Tools for create/delete/reschedule; resources for read-only context.
- **Validate at the boundary** with the shared validators; return structured errors, never raw exceptions.
- **Pin the SDK version** in the csproj — the MCP spec and C# SDK are still moving.
- **Telemetry on every tool call** via the shared OTel setup; tool invocations are first-class spans.
- **No secrets/connection strings in the host** — they come from Aspire/environment.
- After changes: `dotnet build` clean, a client can list and successfully call tools, and integration tests pass.

## Definition of done

The MCP server is complete when: `Kairos.Web` maps `/mcp` over Streamable HTTP / SSE with a pinned `ModelContextProtocol` version; tools `list_tasks`, `create_task`, `delete_task`, `reschedule_task`, and `list_free_slots` work end to end against Postgres via application services (free slots via the multirange SQL); resources expose read-only task context; inputs are validated and errors are structured; tool calls emit telemetry; `/mcp` ships in the `Kairos.Web` image and is reachable through the reverse proxy in both compose files; and an AI client can connect and manage tasks. Anything skipped is called out explicitly.
