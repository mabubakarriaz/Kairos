// Kairos Aspire AppHost — the source of truth for the resource graph and the dev inner-loop orchestrator.
// "One contract, two runtimes": resource names here (postgres, kairosdb, web) must match the
// ConnectionStrings__kairosdb keys in Kairos.Infrastructure and the service names in compose.{dev,prod}.yml.
// MCP is served at /mcp inside the `web` host — there is NO separate `mcp` resource.
var builder = DistributedApplication.CreateBuilder(args);

// ── Data ─────────────────────────────────────────────────────────────────────
// PostgreSQL 17 with btree_gist + multiranges (database-builder owns the schema details).
// Persistent named volume so data survives container restarts.
var postgres = builder.AddPostgres("postgres")
                      .WithImage("postgres", "17-alpine")
                      .WithDataVolume("kairos_pgdata");

if (builder.ExecutionContext.IsRunMode)
{
    // Dev-only admin UI — never leaks into the published prod compose.
    postgres = postgres.WithPgAdmin();
}

var kairosdb = postgres.AddDatabase("kairosdb");

// ── The single app host ──────────────────────────────────────────────────────
// Razor UI + Minimal APIs (/api/*) + MCP (/mcp) + GoogleCalendarSyncWorker, all in one process.
// Data Protection keys + OAuth tokens persist to the dpkeys volume (Infrastructure wires this).
var web = builder.AddProject<Projects.Kairos_Web>("web")
                 .WithReference(kairosdb)
                 .WaitFor(kairosdb)
                 .WithExternalHttpEndpoints();

// ── Dev-only observability stack ───────────────────────────────────────────────
// The full OTel Collector → Prometheus/Loki/Tempo → Grafana fan-out is dev-only and
// owned by observability-builder. Guarded by IsRunMode so `aspire publish` never emits it.
if (builder.ExecutionContext.IsRunMode)
{
    // observability-builder: builder.AddContainer("otel-collector", ...), prometheus, loki, tempo, grafana
}

builder.Build().Run();
