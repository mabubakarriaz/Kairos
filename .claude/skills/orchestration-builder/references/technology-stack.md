# Containerization & Orchestration — Technology Stack (Kairos)

> The **Containerization & Orchestration** slice of the canonical Kairos stack, owned by the `orchestration-builder` skill.
> Indexed in [docs/technology-stack.md](../../../../docs/technology-stack.md); rationale, benchmarks & rejected alternatives in [docs/research.md](../../../../docs/research.md). Cross-cutting decisions — the architecture diagram and the [_Deliberately Excluded_](../../../../docs/technology-stack.md#deliberately-excluded) list — live in the index. Patterns for this slice: [design-pattern.md](design-pattern.md).

## Containerization & Orchestration

| Technology | Purpose | Notes |
|---|---|---|
| **Docker** | Containerize every service | App, database, observability stack, MCP (same process as app) |
| **Docker Compose** | Spin up the full stack locally | Two files: `compose.dev.yml` (full obs + dashboard) and `compose.prod.yml` (app + Postgres + minimal OTel) |
| **.NET Aspire AppHost** | Dev-time orchestration & service discovery | `aspire publish` emits the `docker-compose.yml` + `.env`; `aspire deploy` runs it **locally only** (not a remote-deploy tool) |
| **Reverse proxy (Caddy or YARP)** | HTTPS termination on loopback | Browser sees HTTPS; app speaks HTTP/2 `h2c` behind it. HTTP/3/QUIC is irrelevant on loopback |
| **Named volumes** | Durable state | `kairos_pgdata` (Postgres), `dpkeys` (Data Protection keys), `kairos_files` (future attachments) — bind-mount under `%USERPROFILE%\KairosData\` on Windows for visibility |

> **One contract, two runtimes.** The Aspire AppHost is the source of truth for the resource graph; `aspire publish` generates the Compose artifact + `.env`. Service names, ports, the `kairosdb` database name, and the OTLP endpoint stay identical across the AppHost and both compose files. A reverse proxy terminates HTTPS on loopback; the app speaks `h2c` behind it (no HTTP/3 on loopback). **MCP is served at `/mcp` on `web`** — there is no separate `mcp` resource or container.

---

_Derived from the canonical Kairos stack. If anything here conflicts with [docs/technology-stack.md](../../../../docs/technology-stack.md), the index wins; update this slice to match._
