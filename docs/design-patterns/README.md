# Kairos — Design Patterns

> _"The right & opportune time to do a task."_

This folder records the **design patterns** that give each slice of Kairos its structure. There is **one file per builder skill** (see [`.claude/skills/`](../../.claude/skills/README.md)); each names the patterns that should shape that slice, says **where** in Kairos each one lives, gives a small C# / config sketch, and lists the anti-patterns to avoid.

These docs are **prescriptive intent**, not yet-written code — the repository is still pre-implementation. They are meant to be folded back into the builder skills so that when a skill scaffolds a slice, it builds on a known structure rather than improvising.

## Source material

- **Primary:** Gamma, Helm, Johnson, Vlissides — _Design Patterns: Elements of Reusable Object-Oriented Software_ (the "Gang of Four", **GoF**). The 23 GoF patterns are the backbone of these docs.
- **Complementary:** a handful of patterns Kairos genuinely needs are **not** in GoF — they come from Fowler's _Patterns of Enterprise Application Architecture_ (**PoEAA**), Buschmann et al.'s _Pattern-Oriented Software Architecture_ (**POSA**), and Microsoft's .NET architecture guidance. These are labelled **[non-GoF]** wherever they appear so the lineage stays honest.

### Legend

| Tag | Meaning |
|---|---|
| **[GoF · Creational]** | Abstract Factory, Builder, Factory Method, Prototype, Singleton |
| **[GoF · Structural]** | Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy |
| **[GoF · Behavioral]** | Chain of Responsibility, Command, Interpreter, Iterator, Mediator, Memento, Observer, State, Strategy, Template Method, Visitor |
| **[non-GoF]** | Architectural / enterprise pattern (PoEAA, POSA, MS guidance) — used where GoF has no direct equivalent |

## The per-skill files

| File | Skill | Lead patterns (the ones that shape the slice most) |
|---|---|---|
| [orchestration-builder.md](orchestration-builder.md) | orchestration-builder | **Builder** (resource graph), **Bridge** (one contract, two runtimes), **Proxy** (reverse proxy) |
| [backend-builder.md](backend-builder.md) | backend-builder | **Layered/Clean Architecture** [non-GoF], **MVP** [non-GoF], **Facade** (application services), **State** (sync token), **Template Method** (worker) |
| [database-builder.md](database-builder.md) | database-builder | **Data Mapper / Repository / Unit of Work** [non-GoF], **Builder** (model config), **Strategy** (value converters), **Factory Method** (`IDbContextFactory`) |
| [mcp-builder.md](mcp-builder.md) | mcp-builder | **Adapter** (tools→services), **Command** (each tool), **Facade** (application services), **Remote Proxy** (`/mcp`) |
| [frontend-builder.md](frontend-builder.md) | frontend-builder | **MVP / Page Controller** [non-GoF], **Composite** (partial tree), **Observer** (htmx/Alpine events), **Command** (keymap, drop) |
| [observability-builder.md](observability-builder.md) | observability-builder | **Facade** (`ServiceDefaults`), **Mediator** (the Collector), **Pipes & Filters** [non-GoF], **Observer** (instrumentation) |
| [testing-builder.md](testing-builder.md) | testing-builder | **Template Method** (fixtures), **Builder** (test data), **Shared-Fixture Singleton**, **Test Double** family [non-GoF] |
| [devops-builder.md](devops-builder.md) | devops-builder | **Chain of Responsibility** (CI gates), **Memento** (backups), **Feature Toggle / Strategy** [non-GoF] |

## Cross-cutting patterns (they recur across slices — get them right once)

A few patterns appear in more than one slice because they encode the project's [cross-cutting contracts](../../CLAUDE.md). When you see them in a per-skill file, they mean the same thing:

- **Facade — the application service is the one front door.** `ITaskService` / `IScheduleService` / `IFreeSlotService` in `Kairos.Application` are Facades over the domain + infrastructure. **Razor PageModels, the `/api/*` endpoints, and the MCP tools all call the same facade** — never duplicate logic, never touch `DbContext` from a host. This single rule is why "business logic lives only in Domain/Application" holds. (See backend, frontend, mcp, database.)
- **Strategy — one behavior, swapped by environment.** Dev vs prod telemetry, the reverse-proxy choice, feature-flagged slices, EF value converters, the free-slot ranking. Anything the tech-stack doc says "differs in dev vs prod" or "is pluggable" is a Strategy.
- **Builder — fluent graphs everywhere.** The Aspire resource graph, `ModelBuilder`, `WebApplicationBuilder`, the OTel `.WithMetrics().WithTracing()` chain, Testcontainers builders. .NET's fluent configuration *is* the Builder pattern; lean into it rather than hand-constructing.
- **Single source of truth — Facade + Singleton.** Telemetry is centralized in `ServiceDefaults`; build rules in `Directory.Build.props`; the resource graph in the AppHost. "Never configure X per-host" is always an instruction to keep one Facade and not scatter copies.

## What each file contains

Every per-skill file follows the same shape so they're easy to fold into a skill:

1. **Architectural backbone** — the one macro-pattern that organizes the slice.
2. **Pattern catalogue** — a table: _Pattern · GoF category · Where in Kairos · Why_.
3. **Per-pattern detail** — Intent (paraphrased from GoF) · Where it lives (concrete Kairos types) · Sketch · Pitfalls.
4. **Anti-patterns** — tied to the tech-stack doc's [_Deliberately Excluded_](../technology-stack.md#deliberately-excluded) list, so a pattern is never used to smuggle back something we rejected.

## Guardrail: patterns serve the design, not the reverse

Kairos is a **single-user, single-process** app. Patterns are here to make the documented architecture _legible and consistent_, not to add ceremony. If a pattern would introduce an abstraction the tech-stack doc explicitly excludes (SignalR, a second state model, multi-user seams with no UI, response caching), it does **not** belong here — the [tech-stack doc](../technology-stack.md) wins, every time.

---

_Last updated: 2026-05-27 · Patterns per the Gang of Four (Gamma, Helm, Johnson, Vlissides), with non-GoF additions labelled._
