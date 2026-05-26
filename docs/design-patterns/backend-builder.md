# backend-builder — Design Patterns

> Patterns for the backend slice: the **solution layout**, **Domain** + **Application**, the **`Kairos.Web` host** (Razor Pages + Minimal APIs), and the **`GoogleCalendarSyncWorker`**.
> Companion to [`.claude/skills/backend-builder/SKILL.md`](../../.claude/skills/backend-builder/SKILL.md). Canonical stack: [technology-stack.md](../technology-stack.md). Legend & cross-cutting patterns: [README.md](README.md).

This is the slice with the most patterns because it owns the project's spine: the layering, the application services every other host calls, and the background sync. Two of the headline patterns here — **Clean Architecture** and **MVP** — are architectural (**[non-GoF]**); the rest are pure GoF.

## Architectural backbone — Layered / Clean Architecture (Ports & Adapters)

**[non-GoF]** (Fowler PoEAA "Layered"; Cockburn "Hexagonal"; Martin "Clean Architecture")

The dependency rule is the whole game: `Web → Application → Domain`, `Infrastructure → Application/Domain`, **`Domain` depends on nothing**. The Application layer defines **ports** (interfaces: `ITaskService`, `ITaskRepository`, `IFreeSlotService`); Infrastructure and Web are **adapters** that plug into those ports. This is what lets the MCP tools, the Razor PageModels, and the `/api/*` endpoints all be thin adapters over the same core.

> Everything below is a *tactical* pattern operating **inside** this layered structure. If a tactical pattern would force a dependency the wrong way (e.g. Domain referencing EF), it's wrong — the backbone wins.

## Architectural macro — MVP (Model-View-Presenter) for the web surface

**[non-GoF]** (Potel/Fowler GUI architectures). _This is the pattern the project lead called out for the backend._

Kairos uses **Razor Pages**, whose PageModel maps cleanly onto MVP — and arguably more cleanly than onto MVC, because a PageModel is bound to exactly one view:

| MVP role | Kairos realization |
|---|---|
| **Model** | `Kairos.Application` DTOs (`TaskDto`, `ScheduledBlockDto`, `FreeSlot`) + the application services that produce them. No domain or EF types cross into the view. |
| **View** (passive) | The `.cshtml` / partials (`_DayColumn`, `_FreeSlotsPanel`, …). They render what they're handed and raise requests; they hold no logic. |
| **Presenter** | The **PageModel** handler (`OnGet`/`OnPost…`). It invokes the application service, shapes the Model, and chooses the response. |

Why MVP and not MVC here: with htmx, a handler returns a **server-rendered partial** (`return Request.IsHtmx() ? Partial("Partials/_DayColumn", model) : Page();`). The view stays **passive** — it never decides what to fetch — which is the defining trait of MVP's Passive View variant. The Presenter (PageModel) holds the presentation logic and is unit-testable without a browser.

> The frontend mechanics of the View (Composite partial tree, htmx Observer events, the keymap Command) are detailed in [frontend-builder.md](frontend-builder.md). This file owns the **Presenter** side.

## Pattern catalogue

| Pattern | Category | Where in Kairos | Why |
|---|---|---|---|
| **Facade** | [GoF · Structural] | `ITaskService` / `IScheduleService` / `IFreeSlotService` in `Kairos.Application` | One simple front door over domain + infrastructure; Web, `/api/*`, and MCP all call it. |
| **Command** | [GoF · Behavioral] | inbound request records `CreateTaskRequest`, `RescheduleTaskRequest`; optional **MediatR** handlers | Each use case is a self-contained request object; enables a uniform validate→handle pipeline. |
| **Mediator** | [GoF · Behavioral] | **MediatR** (optional) decoupling Presenters/endpoints from handlers | Callers send a request; a mediator routes it to the right handler — no direct handler references. |
| **State** | [GoF · Behavioral] | the `syncToken` state machine in `GoogleCalendarSyncWorker` | Behavior of a sync cycle depends on which state it's in (no-token / has-token / 410-reset). |
| **Template Method** | [GoF · Behavioral] | `BackgroundService.ExecuteAsync` skeleton; the fixed bind→validate→delegate→map endpoint shape | The skeleton is fixed; the per-step details vary. |
| **Strategy** | [GoF · Behavioral] | the C# free-slot **ranking** scoring function; full-jitter backoff policy | Swappable algorithm chosen at the boundary, over rows SQL already returned. |
| **Adapter** | [GoF · Structural] | `Infrastructure` wrapping `Google.Apis.Calendar.v3` behind an application port | Make a third-party client conform to a Kairos interface. |
| **Decorator** | [GoF · Structural] | resilience/telemetry wrapping an `HttpClient`; Data-Protection-wrapped token store | Add cross-cutting behavior without changing the wrapped object. |

---

### Facade — application services (the one front door)

**Intent (GoF):** Provide a unified higher-level interface to a subsystem, making it easier to use.

**Where it lives:** `Kairos.Application`. `ITaskService.CreateAsync(...)` hides the domain rules, the repository/`DbContext`, validation, and mapping behind one call. **The PageModel, the `/api/*` handler, and the MCP `create_task` tool all call `ITaskService.CreateAsync` — never the subsystem directly.**

```csharp
public interface ITaskService
{
    Task<IReadOnlyList<TaskDto>> ListAsync(string? status, CancellationToken ct);
    Task<TaskDto> CreateAsync(CreateTaskRequest input, CancellationToken ct);
    Task DeleteAsync(Guid id, CancellationToken ct);
}
```

**Why it fits:** this *is* the "business logic lives only in Domain/Application; Web and Infrastructure are thin adapters" contract. One Facade, three callers, zero duplication.

**Pitfalls:** a Facade that leaks `DbContext`, `IQueryable`, or domain entities to callers stops being a Facade. Return DTOs. Don't let a PageModel or MCP tool reach past it.

### Command (+ optional Mediator) — use cases as objects

**Intent (GoF):** Encapsulate a request as an object, letting you parameterize, queue, validate, and log requests uniformly.

**Where it lives:** the inbound records — `CreateTaskRequest`, `RescheduleTaskRequest` — are Commands. If the **MediatR** option in the tech-stack doc is taken, each becomes an `IRequest<T>` with a handler, and MediatR is the **Mediator** that routes it:

```csharp
public record CreateTaskRequest(string Title, string? Description, int EstimateMinutes, string[] Tags);
// optional CQRS: public record CreateTask(...) : IRequest<TaskDto>;
```

**Why it fits:** a single object per use case gives one obvious place to attach a validator (below) and one uniform shape for Web and MCP to construct. Mediator removes the need for endpoints to know handler types.

**Pitfalls:** MediatR is **optional** — only adopt it if you're going full vertical-slice/CQRS. Don't add it for two handlers; an injected service Facade is simpler. Either way, **one FluentValidation validator per Command**, shared across Web and MCP.

### State — the Google sync token state machine

**Intent (GoF):** Allow an object to alter its behavior when its internal state changes; it appears to change class.

**Where it lives:** `GoogleCalendarSyncWorker`. A cycle behaves differently per state, exactly as the skill's state machine spells out:

```
No token   → events.list(timeMin=-30d, timeMax=+90d, singleEvents=true, pageToken loop) → store nextSyncToken
Has token  → events.list(syncToken, pageToken loop) → store nextSyncToken
410 Gone   → drop local gcal rows → transition back to No token
```

**Why it fits:** the request you may issue, and what you do with the response, are state-dependent — the canonical trigger for State. It also encodes the hard rule: **never mix `timeMin`/`timeMax` with `syncToken`** (a 400), because those parameters belong to *different states*.

**Pitfalls:** `nextSyncToken` only appears on the **last page** — finish pagination before transitioning. Treat 403 `rateLimitExceeded` and 429 identically (backoff + bump `kairos_gcal_rate_limited_total`); that's a Strategy nested inside the state, not a new state.

### Template Method — the worker loop & the endpoint shape

**Intent (GoF):** Define the skeleton of an algorithm, deferring some steps to subclasses/overrides.

**Where it lives:** (1) `BackgroundService.ExecuteAsync(CancellationToken)` — the framework owns the lifecycle skeleton; Kairos fills in the jittered poll body. (2) Every inbound handler follows the same fixed skeleton: **bind → validate → delegate to Facade → map result/error**. Keeping that shape uniform is what makes Web and MCP handlers interchangeable thin adapters.

**Pitfalls:** the 5-min **± 25% jitter** is part of the skeleton, not an afterthought — a fixed interval thunders against the quota. Honor the `CancellationToken` so shutdown is clean.

### Strategy — free-slot ranking & backoff

**Intent (GoF):** Define a family of interchangeable algorithms and make them swappable.

**Where it lives:** `IFreeSlotService` runs the **multirange SQL** (gap-finding is the database's job — see [database-builder.md](database-builder.md)) and then applies a **ranking Strategy** in C# over the handful of returned rows (the research report §1 scoring formula). The full-jitter backoff (1→64 s cap) is a second, smaller Strategy inside the sync worker.

**Pitfalls:** **never reimplement gap-finding in C#** — that's the Strategy boundary. C# ranks; SQL finds. Keep the scoring function pure so it's unit-testable without I/O.

### Adapter — the Google Calendar client

**Intent (GoF):** Convert the interface of a class into another interface clients expect.

**Where it lives:** `Kairos.Infrastructure/Google/` wraps `Google.Apis.Calendar.v3` behind an application-defined port (e.g. `IGoogleCalendarClient`). The worker and services depend on the port, not on Google's SDK types — so the third-party shape never leaks into the Domain/Application layers.

**Pitfalls:** don't let `Google.Apis.*` types surface above Infrastructure; map to Kairos `ScheduledBlock`/DTO at the adapter seam.

### Decorator — resilience, telemetry & token encryption

**Intent (GoF):** Attach additional responsibilities to an object dynamically.

**Where it lives:** the typed `HttpClient` for Google is wrapped by `AddStandardResilienceHandler` (retry/jitter) and HttpClient instrumentation — Decorators added via the DI pipeline. The OAuth **token store** decorates raw persistence with ASP.NET Core **Data Protection** (encrypt on write, decrypt on read) so plaintext tokens never hit the column or a log.

**Pitfalls:** Data-Protection keys live on the mounted `dpkeys` volume — **never** env vars / `appsettings.json` (refresh tokens rotate). The decorator chain order matters: telemetry should observe the *outermost* call.

---

## Anti-patterns to avoid

- **Logic in the Presenter or the adapter.** No business rules in PageModels, `/api/*` handlers, MCP tools, or Infrastructure — they delegate to the Application Facade. (Excluded-list spirit: thin hosts.)
- **A "Smart View."** Razor partials must stay passive (MVP). The instant a `.cshtml` starts deciding what data to fetch, you've drifted toward the SPA/Blazor model the tech-stack doc excludes.
- **Gap-finding in C#.** Free slots are SQL; C# only ranks. Reintroducing a C# gaps-and-islands routine defeats the PG-14+ mandate.
- **Native AOT / per-pixel server round-trips / SignalR.** All on the _Deliberately Excluded_ list; no pattern here should pull them back in.
- **MediatR-for-its-own-sake.** Command is mandatory (the request records); the Mediator (MediatR) is optional — don't add indirection two handlers don't need.

## How this maps to the build workflow

Build vertical slices: a slice is a **Command** + its validator + a **Facade** method + the Infrastructure **Adapter**, surfaced through an MVP **Presenter** (PageModel) and the equivalent MCP tool. The sync worker adds the **State** machine and its **Strategy** backoff. Each slice ships behind an `appsettings.json` feature flag (see [devops-builder.md](devops-builder.md)).
