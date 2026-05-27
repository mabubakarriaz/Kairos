# Kairos — Technology Stack (index)

> _"The right & opportune time to do a task."_

This is the **index** for the Kairos technology stack. It remains the canonical anchor for the **cross-cutting** decisions — the architecture diagram and the [_Deliberately Excluded_](#deliberately-excluded) list below — but the per-concern detail now lives **next to the skill that owns it**, in each skill's `references/technology-stack.md` slice. If anything — a skill, a slice, your own instinct — conflicts with the relevant slice, update the conflicting thing to match; if a cross-cutting decision changes, update it here.

Version floors and key decisions are derived from [`research.md`](research.md) — read that for the rationale, benchmarks, and rejected alternatives behind each choice. Design patterns per slice are indexed in [`design-pattern.md`](design-pattern.md).

---

## Stack by concern (per-skill slices)

Each concern's technologies, version floors, and notes live in the owning skill's slice:

| Concern (stack section) | Owner skill | Slice |
|---|---|---|
| Platform & Runtime · Backend · External Integrations | backend-builder | [references/technology-stack.md](../.claude/skills/backend-builder/references/technology-stack.md) |
| Database | database-builder | [references/technology-stack.md](../.claude/skills/database-builder/references/technology-stack.md) |
| Frontend | frontend-builder | [references/technology-stack.md](../.claude/skills/frontend-builder/references/technology-stack.md) |
| AI Integration (MCP) | mcp-builder | [references/technology-stack.md](../.claude/skills/mcp-builder/references/technology-stack.md) |
| Observability | observability-builder | [references/technology-stack.md](../.claude/skills/observability-builder/references/technology-stack.md) |
| Containerization & Orchestration | orchestration-builder | [references/technology-stack.md](../.claude/skills/orchestration-builder/references/technology-stack.md) |
| Testing & Quality | testing-builder | [references/technology-stack.md](../.claude/skills/testing-builder/references/technology-stack.md) |
| Tooling & DevOps · Backup & Durability | devops-builder | [references/technology-stack.md](../.claude/skills/devops-builder/references/technology-stack.md) |

> Skill overview & build order: [.claude/skills/README.md](../.claude/skills/README.md). Patterns index: [design-pattern.md](design-pattern.md). Rationale & benchmarks: [research.md](research.md).

---

## Deliberately Excluded

These were evaluated in [`research.md`](research.md) and rejected for v1 — listed here (cross-cutting) so they don't creep back in:

| Excluded | Reason |
|---|---|
| **Blazor (Server / Auto / WASM)** | Server mode = per-pixel SignalR for drag (anti-pattern); Auto-mode hydration is flaky in .NET 10; WASM = multi-MB download for a localhost app |
| **React + Vite SPA** | Second build pipeline, second state model, zero capability gain at <700 DOM nodes |
| **Native AOT (`PublishAot`)** | Loses EF Core + Razor compilation tooling; cold-start gains irrelevant for an always-on container |
| **SignalR / WebSockets** | Not needed; the "now" line uses a stateless 30 s `hx-trigger`, and last-write-wins is fine for one user |
| **Service worker / IndexedDB / CRDTs** | Local-first is overkill for a single-user localhost app |
| **Output/response caching** | Single-digit-ms indexed queries on loopback; caching only adds invalidation pain |
| **Auth / multi-user (for now)** | Single-user behind `127.0.0.1`; schema leaves room (`user_id`) but no UI affordances |

---

## Architecture at a Glance

```
                              ┌─────────────────────────┐
                   AI Client ─▶│  MCP endpoint (/mcp)    │
                              └────────────┬────────────┘
                                           │
   Browser ──HTTPS──▶ Reverse Proxy ──h2c──▶ ASP.NET Core App (.NET 10)
   (Razor + htmx 2.x                         │  ├─ Razor Pages (HTML)
    + Tailwind + Alpine                      │  ├─ Minimal APIs (/api/*, /mcp)
    + SortableJS drag island)                │  ├─ GoogleCalendarSyncWorker (IHostedService)
        │  drag visuals stay client-side;    │  └─ EF Core 10 ──▶ PostgreSQL 17
        │  POST only on drop (onEnd)         │           (btree_gist, multiranges,
        ▼                                    │            auto_explain, pg_stat_statements)
   hx-swap-oob: slot + panel                 │
                                             │  syncToken poll (5 min ±25%)
                                             ▼
                                   Google Calendar API v3  (OAuth, read-only)

   OpenTelemetry (OTLP) ──▶ Collector ──▶ Prometheus / Loki / Tempo ──▶ Grafana
   (+ postgres-exporter, dotnet-counters, web-vitals.js)        Aspire Dashboard = dev only

   Orchestrated by .NET Aspire  •  Packaged with Docker  •  Run via Docker Compose (dev/prod split)
   State in named volumes (kairos_pgdata, dpkeys)  •  Nightly pg_dump backups
```

---

_Last updated: 2026-05-27_
