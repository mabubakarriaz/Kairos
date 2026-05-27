# orchestration-builder — Design Patterns

> Patterns for the integrator slice: the **Aspire AppHost**, **`ServiceDefaults`**, per-service **Dockerfiles**, the **reverse proxy**, and the **dev/prod Compose split**.
> Companion to [`.claude/skills/orchestration-builder/SKILL.md`](../SKILL.md). Canonical stack: [technology-stack.md](technology-stack.md). Legend & cross-cutting patterns: [design-pattern.md](../../../../docs/design-pattern.md).

Orchestration is where the pieces _connect_, so its patterns are about **assembling a graph** and **decoupling the declaration of that graph from the runtime that executes it** — the skill's "one contract, two runtimes" principle stated in pattern terms.

## Architectural backbone — Builder + Bridge

The AppHost is a **Builder** that assembles a resource graph; **Bridge** keeps that graph (the abstraction) independent of whether it runs as an Aspire dev process or as Docker Compose (the two implementations). Everything else hangs off these two.

## Pattern catalogue

| Pattern | Category | Where in Kairos | Why |
|---|---|---|---|
| **Builder** | [GoF · Creational] | `DistributedApplication.CreateBuilder` → `AddPostgres().WithDataVolume().AddDatabase()`, `AddProject<Kairos_Web>().WithReference().WaitFor()` | Assemble a complex resource graph step by step with a fluent API; the same builder yields different products (dev run vs published Compose). |
| **Bridge** | [GoF · Structural] | AppHost resource graph (abstraction) ↔ {Aspire `run`, `aspire publish`→Compose} (implementors) | "One contract, two runtimes." The graph is declared once; dev and prod are two implementations that vary independently. |
| **Proxy** | [GoF · Structural] | `reverse-proxy/Caddyfile` — Caddy/YARP terminating HTTPS, forwarding `h2c://web:8080` | A protocol/access proxy: the browser talks HTTPS to a stand-in; the app speaks cleartext HTTP/2 behind it and never terminates TLS itself. |
| **Composite** | [GoF · Structural] | `postgres` → `kairosdb` (database child of the server), `web.WithReference(kairosdb)` | The resource graph is a tree of resources-and-references treated uniformly by Aspire. |
| **Abstract Factory** | [GoF · Creational] | `IsRunMode` guards producing a **dev family** (pgAdmin + full obs) vs a **prod family** (minimal OTel) of resources | One AppHost produces whole families of environment-appropriate resources without the callsite knowing which family. |
| **Facade** | [GoF · Structural] | `ServiceDefaults.AddServiceDefaults()` / `app.MapDefaultEndpoints()` | One call wires OTel + health + resilience + discovery for every host. |
| **Singleton** _(scoped to the deployment)_ | [GoF · Creational] | the shared `kairos` network; named volumes `kairos_pgdata` / `dpkeys` / `kairos_files` | Exactly one shared instance of each piece of durable/connective state across the stack. |

---

### Builder — the resource graph

**Intent (GoF):** Separate the construction of a complex object from its representation so the same construction process can create different representations.

**Where it lives:** `Kairos.AppHost/AppHost.cs`. The fluent chain *is* a Director driving a Builder:

```csharp
var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres").WithDataVolume("kairos_pgdata");
if (builder.ExecutionContext.IsRunMode) postgres = postgres.WithPgAdmin();
var kairosdb = postgres.AddDatabase("kairosdb");

builder.AddProject<Projects.Kairos_Web>("web")
       .WithReference(kairosdb).WaitFor(kairosdb)
       .WithExternalHttpEndpoints();      // serves Razor + /api/* + /mcp

builder.Build().Run();
```

**Why it fits:** `builder.Build()` is the GoF "get the product" step; before it, each `With…` adds a part. Crucially, the **same** description is the source for two products — an in-process dev run and the `aspire publish` Compose artifact.

**Pitfalls:** The resource names `postgres` / `kairosdb` / `web` are a **contract**, not Builder cosmetics — they must match the `ConnectionStrings__kairosdb` key and both compose service names. Don't introduce an `mcp` resource; MCP is `/mcp` on `web`.

### Bridge — one contract, two runtimes

**Intent (GoF):** Decouple an abstraction from its implementation so the two can vary independently.

**Where it lives:** the AppHost graph is the **abstraction**; `aspire run` (dev inner loop) and `aspire publish → compose.dev.yml / compose.prod.yml` are **two implementors**. The same logical graph is realized two ways, and you can change the dev experience (add the Aspire dashboard) without changing the prod realization (pared-down OTel-to-disk).

**Why it fits:** the skill's headline rule — _"the AppHost is the source of truth for the resource graph; Docker Compose mirrors it"_ — is exactly Bridge's promise: one abstraction, swappable refined implementations, names/ports/db/OTLP endpoint identical across both.

**Pitfalls:** Bridge breaks the moment the two implementations drift. Keep ports, service names, the `kairosdb` name, and the OTLP endpoint **identical** across the AppHost and both compose files; treat `aspire publish` output as generated and re-derive the curated files from it.

### Proxy — the reverse proxy on loopback

**Intent (GoF):** Provide a surrogate for another object to control access to it.

**Where it lives:** `reverse-proxy/Caddyfile` (or YARP). It's a **protection/remote proxy**: it presents the HTTPS face the browser expects and forwards to the real subject (`web`) over `h2c`.

```caddyfile
localhost {
    reverse_proxy h2c://web:8080
}
```

**Why it fits:** the app delegates the cross-cutting concern (TLS termination) to a stand-in with the same interface (HTTP). This is the textbook reason to use a Proxy — add access control/translation without changing the subject.

**Pitfalls:** Don't enable HTTP/3/QUIC — it buys nothing on loopback. The app must **never** terminate TLS itself; the Proxy owns that single responsibility.

### Composite — the resource tree

**Intent (GoF):** Compose objects into tree structures and let clients treat individual objects and compositions uniformly.

**Where it lives:** `kairosdb` is a child of the `postgres` resource; `web` holds references to `kairosdb`. Aspire walks this tree to inject connection strings and order startup. You add a node the same way whether it's a leaf (a container) or a parent (a server with databases).

**Pitfalls:** keep the tree shallow and named per the contract; a reference (`WithReference`) is the edge that drives connection-string injection — don't bypass it with a hard-coded string.

### Abstract Factory — dev vs prod resource families

**Intent (GoF):** Provide an interface for creating families of related objects without specifying their concrete classes.

**Where it lives:** the `builder.ExecutionContext.IsRunMode` guard. In run mode the AppHost materializes the **dev family** (pgAdmin, Grafana/Prometheus/Loki/Tempo/Collector, Aspire dashboard); in publish mode it omits them, leaving the **prod family** (web + Postgres + pared-down Collector). The callsite asks for "the right resources for this mode" and gets a coherent set.

**Pitfalls:** every dev-only resource must sit behind the guard from the first commit, or it leaks into the published prod compose — the exact failure the dev/prod split exists to prevent.

### Facade — `ServiceDefaults`

See the shared note in [design-pattern.md](../../../../docs/design-pattern.md#cross-cutting-patterns-they-recur-across-slices--get-them-right-once). Here it means: every host calls `AddServiceDefaults()` + `MapDefaultEndpoints()` and inherits OTel, `/health` + `/alive`, `AddStandardResilienceHandler`, and service discovery — no host configures these itself.

### Singleton — shared network & volumes

**Intent (GoF):** Ensure a class has exactly one instance.

**Where it lives:** the single `kairos` network every service joins, and the named volumes `kairos_pgdata` / `dpkeys` / `kairos_files`. There is exactly one of each, shared across services and across `up`/`down` cycles, which is what makes state durable and connectivity uniform.

---

## Anti-patterns to avoid

- **Drifting the two runtimes.** If `compose.*.yml` and the AppHost disagree on a name/port/db/endpoint, Bridge is broken and "one contract" is a lie. Re-publish and reconcile.
- **A separate `mcp` container/resource.** MCP is in-process (`/mcp` on `web`). Adding an `mcp` node contradicts the topology contract.
- **Terminating TLS in the app or enabling HTTP/3 on loopback.** The Proxy owns TLS; loopback HTTP/3 is on the excluded list of pointless complexity.
- **Dev resources without the `IsRunMode` guard.** That's a leaked Abstract-Factory family — the Aspire dashboard / full obs stack must be absent from prod compose.
- **Baking config/secrets into images.** Config comes via environment (`ConnectionStrings__…`, `OTEL_EXPORTER_OTLP_ENDPOINT`); OAuth tokens are encrypted on the `dpkeys` volume — never committed.

## How this maps to the build workflow

The skill's workflow already walks these patterns: stand up the **Builder** graph first (fastest feedback), let `aspire publish` exercise the **Bridge** into Compose, add the **Proxy** for HTTPS, and keep the **Abstract Factory** guard around dev-only resources so the prod realization stays minimal.
