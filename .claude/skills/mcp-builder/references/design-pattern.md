# mcp-builder — Design Patterns

> Patterns for the AI-integration slice: the **MCP server mapped in-process at `/mcp`** inside `Kairos.Web`, its **tools** and **resources**, and the **Streamable HTTP / SSE transport**.
> Companion to [`.claude/skills/mcp-builder/SKILL.md`](../SKILL.md). Canonical stack: [technology-stack.md](technology-stack.md). Legend & cross-cutting patterns: [design-pattern.md](../../../../docs/design-pattern.md).

The skill's one-line rule — **"the MCP server is an adapter, not a brain"** — *is* the design pattern. Every pattern here serves that rule: expose the existing application services to AI clients over a protocol, adding nothing but translation, validation, and a clear contract.

## Architectural backbone — Adapter

**Intent (GoF):** Convert the interface of a class into another interface clients expect; let classes work together that otherwise couldn't because of incompatible interfaces.

MCP tools adapt the **MCP/JSON-RPC** world to the **`Kairos.Application` service** world. An AI client speaks tool-calls; the application speaks `ITaskService` / `IScheduleService` / `IFreeSlotService`. The tool class is the Adapter in between — and because it delegates to the **same Facade** the Razor PageModels use, there is exactly one implementation of each behavior in the system.

## Pattern catalogue

| Pattern | Category | Where in Kairos | Why |
|---|---|---|---|
| **Adapter** | [GoF · Structural] | `Mcp/Tools/*` adapting MCP requests → `Kairos.Application` services | Make AI-client tool-calls work against the existing service interfaces. |
| **Command** | [GoF · Behavioral] | each `[McpServerTool]` method (`create_task`, `delete_task`, `reschedule_task`, …) | A tool call is a named, parameterized request object the client invokes. |
| **Facade** | [GoF · Structural] | the application services the tools call | Shared front door — tools never touch `DbContext` or duplicate logic. |
| **Remote Proxy** | [GoF · Structural] | `app.MapMcp("/mcp")` over Streamable HTTP / SSE | A network surrogate that lets an out-of-process AI client drive in-process services. |
| **Chain of Responsibility** | [GoF · Behavioral] | validate (FluentValidation) → map to structured error → delegate | An input passes through handlers; validation can short-circuit with a structured error before the service runs. |
| **Template Method** | [GoF · Behavioral] | the fixed tool shape: bind → validate → call service → map result | Same skeleton for every tool; only the service call differs. |
| **Registry / Service Locator** | [non-GoF] | `WithToolsFromAssembly()` / `WithResourcesFromAssembly()` discovery | Auto-register all `[McpServerToolType]`/`[McpServerResourceType]` without manual wiring. |

---

### Adapter — tools over application services

**Where it lives:** `src/Kairos.Web/Mcp/Tools/`. A tool binds a typed request, validates it, and delegates — nothing more:

```csharp
[McpServerToolType]
public class TaskTools
{
    [McpServerTool, Description("Create a Kairos task with a title, optional description, estimate, and tags.")]
    public async Task<TaskDto> CreateTask(
        ITaskService tasks, CreateTaskRequest input, CancellationToken ct = default)
        => await tasks.CreateAsync(input, ct);   // same ITaskService the PageModel uses
}
```

**Why it fits:** the tool conforms Kairos's interface to MCP's expected interface and back — the literal definition of Adapter. The injected `ITaskService` proves the "adapter, not brain" contract: no logic, no data access here.

**Pitfalls:** the moment a tool reaches for `DbContext`, re-implements ranking, or branches on business rules, it stops being an Adapter and duplicates the core. Keep it to bind → validate → delegate → map.

### Command — each tool is a request object

**Where it lives:** the v1 surface — `list_tasks`, `create_task`, `delete_task`, `reschedule_task`, `list_free_slots` — is a set of Commands the AI client invokes by name with parameters. The MCP SDK's discovery + invocation is the Command's invoker.

**Why it fits:** Command's value is a uniform, self-describing request. Here the `[Description]` text on the tool **and each parameter** *is* the contract the model reads — so descriptions are not documentation, they're the Command's public interface. Write them precisely.

**Pitfalls:** keep tools idempotent where sensible (deleting a missing task returns a benign result, not a crash). Action-oriented names; rich parameter descriptions.

### Facade — shared application services

See the cross-cutting note in [design-pattern.md](../../../../docs/design-pattern.md#cross-cutting-patterns-they-recur-across-slices--get-them-right-once) and [backend-builder.md](../../backend-builder/references/design-pattern.md#facade--application-services-the-one-front-door). For MCP specifically: `list_free_slots` calls `IFreeSlotService`, which runs the **multirange SQL** — the tool never re-implements gap-finding.

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

### Remote Proxy — the `/mcp` endpoint

**Intent (GoF):** A proxy provides a local representative for an object in a different address space.

**Where it lives:** `app.MapMcp("/mcp")` exposes the in-process tools to an **out-of-process** AI client over Streamable HTTP / SSE. The client holds no Kairos types; it drives them through the network surrogate.

**Why it fits:** it's the same code path as the web UI (same process, same DI container, same services), surfaced through a remote interface — Proxy, not a second service. This is the "MCP piggybacks on ASP.NET Core for free" rationale, and why there is **no separate `Kairos.Mcp` project, container, or `mcp` Aspire resource**.

**Pitfalls:** **pin the `ModelContextProtocol` version** in the csproj — the spec and SDK are still moving (Dependabot reviews its bumps manually; see [devops-builder.md](../../devops-builder/references/design-pattern.md)).

### Chain of Responsibility — validate → structured error → delegate

**Intent (GoF):** Pass a request along a chain of handlers until one handles it.

**Where it lives:** every tool input runs through the **same FluentValidation validator** the Web/API uses; on failure the chain short-circuits and returns a **structured tool error the model can act on** — never a raw exception across the protocol boundary. Only a valid request reaches the service.

**Pitfalls:** don't let exceptions leak across MCP. Catch at the boundary and translate to structured errors; a stack trace is useless to a model and may leak internals.

### Template Method & Registry

- **Template Method:** every tool follows the identical skeleton (bind → validate → delegate → map). Keeping it uniform is what makes a tool and a PageModel interchangeable thin adapters over one Facade.
- **Registry [non-GoF]:** `WithToolsFromAssembly()` / `WithResourcesFromAssembly()` discover and register all `[McpServerToolType]` / `[McpServerResourceType]` classes — add a tool by writing the class, not by editing wiring.

### Tools mutate, Resources read

A small but firm split: **Tools** are Commands that change state (create/delete/reschedule); **Resources** (`[McpServerResource]`, e.g. `kairos://tasks`, `kairos://tasks/{id}`) are read-only context the client can pull without invoking a tool. Don't blur them — a resource that mutates, or a tool that exists only to read, muddies the contract the model relies on.

## Anti-patterns to avoid

- **A "brain" in the tool.** No business logic, no `DbContext`, no re-implemented gap-finding — delegate to the Facade.
- **A separate MCP service/container/resource.** MCP is in-process (`/mcp` on `web`); a sidecar contradicts the topology contract and duplicates DI.
- **Raw exceptions across the protocol.** Validate at the boundary; return structured errors.
- **Thin or missing `[Description]` text.** Descriptions are the Command's contract for the model — vague text causes wrong tool use.
- **Unpinned SDK.** The MCP spec/SDK move; an unpinned bump can silently change framing.

## How this maps to the build workflow

Map the bare server first (confirm a client can list tools) — that's the Remote Proxy + Registry working. Then add tools one at a time: each is an Adapter/Command following the Template Method skeleton, validated via the Chain, delegating to a shared Facade. Verify end to end against real Postgres (a created task is returned by `list_tasks`; `list_free_slots` returns real gaps) — see [testing-builder.md](../../testing-builder/references/design-pattern.md).
