# Backend — Technology Stack (Kairos)

> The **Platform & Runtime**, **Backend**, and **External Integrations** slice of the canonical Kairos stack, owned by the `backend-builder` skill.
> Indexed in [docs/technology-stack.md](../../../../docs/technology-stack.md); rationale, benchmarks & rejected alternatives in [docs/research.md](../../../../docs/research.md). Cross-cutting decisions — the architecture diagram and the [_Deliberately Excluded_](../../../../docs/technology-stack.md#deliberately-excluded) list — live in the index. Patterns for this slice: [design-pattern.md](design-pattern.md).

## Platform & Runtime

| Technology | Purpose | Notes |
|---|---|---|
| **.NET 10 (LTS)** | Core runtime for all backend services | LTS release; long support window |
| **C#** | Primary language | Latest language version shipped with .NET 10 |
| **.NET Aspire** | Cloud-native app orchestration | App host, service discovery, resource wiring, local dev dashboard |

**Runtime tuning (no AOT for v1):**
- **ReadyToRun + Tiered Compilation** — on by default in the .NET 10 SDK; keep them. Gets ~80% of the cold-start win at zero complexity cost.
- **Server GC** — set `<ServerGarbageCollection>true</ServerGarbageCollection>` explicitly; containers historically misdetect core count, and Workstation GC is wrong for a server process.
- **System.Text.Json source generators** — `[JsonSerializable(typeof(TaskDto))]` for the small set of API/MCP DTOs; trims first-call latency.
- **Native AOT is deliberately _not_ used** — EF Core and Razor compilation aren't cleanly AOT-compatible in .NET 10, and cold-start gains don't matter for an always-on local container. See [_Deliberately Excluded_](../../../../docs/technology-stack.md#deliberately-excluded).

## Backend

| Technology | Purpose | Notes |
|---|---|---|
| **ASP.NET Core** | Web framework | Hosts Razor Pages app + API/MCP endpoints; Kestrel on loopback (HTTP/2 `h2c` behind the reverse proxy) |
| **Razor Pages** | Server-rendered UI pages | Page-focused, server-side rendering model; source of truth for HTML |
| **Minimal APIs** | Lightweight HTTP endpoints | `/api/*` (tasks, slots, reschedule) and `/mcp`; benchmark faster than controllers and coexist with Razor Pages |
| **Entity Framework Core 10** | ORM / data access | Code-first migrations, LINQ; `AsNoTracking` on read paths, `AsSplitQuery` on block+task projections, compiled queries for hot paths |
| **Npgsql** | PostgreSQL ADO.NET + EF Core provider | First-class Postgres driver; maps `tstzrange` → `NpgsqlRange<DateTime>` natively; `MaxAutoPrepare=20`, `AutoPrepareMinUsages=2` so the GiST-overlap query gets a prepared plan |
| **IHostedService — `GoogleCalendarSyncWorker`** | Background Google Calendar sync | Polls `events.list` with `syncToken` on a 5-min ±25% jittered cadence |
| **ASP.NET Core Data Protection** | Encrypt OAuth tokens at rest | Protects `access_token`/`refresh_token`; keys persisted to a mounted volume (not env vars / appsettings — refresh tokens rotate) |
| **Ical.Net (4.x)** | RRULE expansion for recurring Kairos blocks | Expand on read for the requested window only; cache via `IMemoryCache` (30 s TTL, keyed by `(rrule_hash, window)`). Never pre-expand into the DB. Test across DST boundaries |
| **FluentValidation** | Request/model validation | Clean separation of validation rules |
| **MediatR** _(optional)_ | In-process messaging / CQRS | Useful if vertical-slice / handler style is adopted |

## External Integrations

| Technology | Purpose | Notes |
|---|---|---|
| **Google Calendar API v3** | Read-only busy-event source | Renders alongside Kairos tasks; `singleEvents=true` so Google expands recurrence/cancellations server-side |
| **`Google.Apis.Calendar.v3`** (`google-api-dotnet-client`) | Official .NET client | Fully async (`ExecuteAsync()`); transparent refresh-token handling via `IDataStore` |
| **OAuth 2.0 — installed-app flow** | Account authorization | Loopback redirect (`http://127.0.0.1:5000/oauth/callback`); scope `calendar.events.readonly` only (minimum privilege) |
| **`syncToken` incremental sync** | Bandwidth-efficient polling | State machine: full sync → store `nextSyncToken` → incremental; on `410 Gone`, drop local gcal rows and re-sync. ~288 calls/day, far under quota |

> **Push webhooks (`events.watch`) are deferred,** not adopted: they need a public HTTPS endpoint with a valid cert, channels expire weekly with no auto-renewal, and the payload carries no event data anyway. Polling wins for a localhost app. Never mix `timeMin`/`timeMax` with `syncToken` in one request — it's a 400.

---

_Derived from the canonical Kairos stack. If anything here conflicts with [docs/technology-stack.md](../../../../docs/technology-stack.md), the index wins; update this slice to match._
