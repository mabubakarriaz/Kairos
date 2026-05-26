# Kairos Builder Skills

Eight project skills that build Kairos slice by slice, each grounded in [docs/technology-stack.md](../../docs/technology-stack.md) (the source of truth). One skill per section of that doc; all share the same conventions — `net10.0`, Clean Architecture layering, and the resource names `kairosdb` / `web` / `mcp` and the `TaskItem` aggregate.

## The skills

| Skill | Owns | Tech-stack section |
|---|---|---|
| [backend-builder](backend-builder/SKILL.md) | Solution layout, Domain/Application, ASP.NET Core hosts | Platform & Runtime, Backend |
| [database-builder](database-builder/SKILL.md) | EF Core, Npgsql, entities, migrations, Postgres resource | Database |
| [frontend-builder](frontend-builder/SKILL.md) | Razor Pages, Tailwind, htmx, Alpine, Vite pipeline | Frontend |
| [mcp-builder](mcp-builder/SKILL.md) | MCP server, tools, resources, transport | AI Integration (MCP) |
| [observability-builder](observability-builder/SKILL.md) | OTel, Collector, Prometheus/Loki/Tempo, Grafana | Observability |
| [orchestration-builder](orchestration-builder/SKILL.md) | Aspire AppHost, ServiceDefaults, Dockerfiles, Compose | Containerization & Orchestration |
| [testing-builder](testing-builder/SKILL.md) | xUnit, Testcontainers, Aspire.Hosting.Testing | Testing & Quality |
| [devops-builder](devops-builder/SKILL.md) | EditorConfig, analyzers, GitHub Actions CI/CD | Tooling & DevOps |

## Recommended build order

1. **orchestration-builder** — solution, `ServiceDefaults`, AppHost skeleton, project graph.
2. **backend-builder** — Domain + Application + the Web/Mcp host shells.
3. **database-builder** — entities, `KairosDbContext`, migrations, Postgres wired in the AppHost.
4. **mcp-builder** — MCP tools/resources delegating to Application services.
5. **frontend-builder** — Razor Pages + Tailwind/htmx/Alpine/Vite over the backend handlers.
6. **observability-builder** — OTel in `ServiceDefaults`; verify in the Aspire dashboard, then Grafana.
7. **testing-builder** — unit → Testcontainers integration → Aspire app-model tests.
8. **devops-builder** — `.editorconfig`, `Directory.Build.props`, CI/CD that runs the above.

> Roughly dependency order: stand up the graph, fill in layers bottom-up, then verify and automate. Each skill's own workflow says "work in vertical slices" — get one task feature working end to end across the skills before broadening.

## How to use

- Invoke a skill via the Skill tool by name (e.g. `backend-builder`), or reference it when asking for that slice of work.
- Each skill links back to the tech-stack doc; if a decision changes there, update the affected skill to match.
- Skills live under `.claude/skills/`, so they travel with the repo and are picked up when the skills system scans the project.
