# Kairos Builder Skills

Eight project skills that build Kairos slice by slice, each grounded in [docs/technology-stack.md](../../docs/technology-stack.md) (the source of truth) with rationale in [docs/report-technical-design-research.md](../../docs/report-technical-design-research.md). One skill per section of that doc; all share the same conventions — `net10.0`, Clean Architecture layering, the resource names `kairosdb` / `web`, and the `TaskItem` aggregate (with `ScheduledBlock`).

> **MCP is in-process:** per the tech-stack doc, the MCP server is mapped at `/mcp` inside `Kairos.Web` — there is no separate `Kairos.Mcp` project, container, or `mcp` resource.

## The skills

| Skill | Owns | Tech-stack section |
|---|---|---|
| [backend-builder](backend-builder/SKILL.md) | Solution layout, Domain/Application, the ASP.NET Core host, runtime tuning, Google sync worker | Platform & Runtime, Backend, External Integrations |
| [database-builder](database-builder/SKILL.md) | EF Core, Npgsql, entities, the range/multirange schema, migrations, Postgres resource | Database |
| [frontend-builder](frontend-builder/SKILL.md) | Razor Pages, Tailwind, htmx, Alpine, the SortableJS drag island, Vite pipeline | Frontend |
| [mcp-builder](mcp-builder/SKILL.md) | MCP server (in-process `/mcp` on Web), tools, resources, transport | AI Integration (MCP) |
| [observability-builder](observability-builder/SKILL.md) | OTel custom spans/metrics, Collector, Prometheus/Loki/Tempo, Grafana, postgres-exporter | Observability |
| [orchestration-builder](orchestration-builder/SKILL.md) | Aspire AppHost, ServiceDefaults, Dockerfiles, reverse proxy, dev/prod Compose | Containerization & Orchestration |
| [testing-builder](testing-builder/SKILL.md) | xUnit, Testcontainers, Aspire.Hosting.Testing, Playwright + k6 budget gates | Testing & Quality |
| [devops-builder](devops-builder/SKILL.md) | EditorConfig, analyzers, feature flags, GitHub Actions CI/CD, backups | Tooling & DevOps |

## Recommended build order

1. **orchestration-builder** — solution, `ServiceDefaults`, AppHost skeleton, project graph.
2. **backend-builder** — Domain + Application + the `Kairos.Web` host shell.
3. **database-builder** — entities, `KairosDbContext`, the range/multirange schema, migrations, Postgres wired in the AppHost.
4. **mcp-builder** — MCP tools/resources mapped in-process at `/mcp` on `Kairos.Web`, delegating to Application services.
5. **frontend-builder** — Razor Pages + Tailwind/htmx/Alpine + the SortableJS drag island, over the backend handlers.
6. **observability-builder** — OTel in `ServiceDefaults`; verify in the Aspire dashboard, then Grafana.
7. **testing-builder** — unit → Testcontainers integration → Aspire app-model tests.
8. **devops-builder** — `.editorconfig`, `Directory.Build.props`, CI/CD that runs the above.

> Roughly dependency order: stand up the graph, fill in layers bottom-up, then verify and automate. Each skill's own workflow says "work in vertical slices" — get one task feature working end to end across the skills before broadening.

## How to use

- Invoke a skill via the Skill tool by name (e.g. `backend-builder`), or reference it when asking for that slice of work.
- Each skill links back to the tech-stack doc; if a decision changes there, update the affected skill to match.
- Skills live under `.claude/skills/`, so they travel with the repo and are picked up when the skills system scans the project.
