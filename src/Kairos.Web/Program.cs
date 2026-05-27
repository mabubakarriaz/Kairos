using Kairos.Application;
using Kairos.Infrastructure;
using Kairos.Infrastructure.Seed;
using Kairos.Web.Api;
using Kairos.Web.Features;
using Kairos.Web.Frontend;
using Kairos.Web.Workers;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Aspire shared wiring: OpenTelemetry, health checks, HTTP resilience, service discovery.
builder.AddServiceDefaults();

// Feature flags — each vertical slice ships behind one (appsettings.json "Features").
builder.Services.Configure<KairosFeatures>(builder.Configuration.GetSection(KairosFeatures.SectionName));
var features = builder.Configuration.GetSection(KairosFeatures.SectionName).Get<KairosFeatures>() ?? new KairosFeatures();

// Application use cases + FluentValidation validators.
builder.Services.AddApplication();

// Infrastructure: KairosDbContext via Aspire Npgsql, repositories, free-slot SQL, the clock.
builder.AddInfrastructure();

// Razor Pages render HTML; Minimal APIs (/api/*) serve data + htmx partials. Structured problem details.
builder.Services.AddRazorPages();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddResponseCompression(o => o.EnableForHttps = true);

// Vite manifest lookup for hashed assets; antiforgery token rides htmx posts via this header.
builder.Services.AddSingleton<ViteManifest>();
builder.Services.AddAntiforgery(o => o.HeaderName = "RequestVerificationToken");

// Google Calendar read-only busy import (Slice 4): only run the worker when the flag is on,
// so its IGoogleBusyImporter dependency is never resolved while the feature is off (MVP default).
if (features.GoogleCalendarSync)
    builder.Services.AddHostedService<GoogleCalendarSyncWorker>();

// In-process MCP server (Streamable HTTP / SSE) — tools + resources delegate to the same
// application services as the Razor Pages and /api/*. Mapped at /mcp below when the flag is on.
if (features.Mcp)
{
    builder.Services
        .AddMcpServer()
        .WithHttpTransport()
        .WithToolsFromAssembly()
        .WithResourcesFromAssembly();
}

var app = builder.Build();

// Dev only: apply migrations at startup behind an environment guard, then seed demo data.
// Prod uses an EF migration bundle / one-shot migrator step — never migrate-on-startup.
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<KairosDbContext>();
    await db.Database.MigrateAsync();
    await DbSeeder.SeedAsync(db);
}

app.UseExceptionHandler();
app.UseResponseCompression();

app.MapDefaultEndpoints();          // /health (liveness) + /alive (readiness)
app.MapStaticAssets();              // fingerprinted static assets (Vite output in wwwroot/dist)
app.MapRazorPages().WithStaticAssets();
app.MapTaskApi();
app.MapScheduleApi();

if (features.Mcp)
    app.MapMcp("/mcp");                 // Streamable HTTP / SSE; behind Caddy HTTPS in compose

app.Run();

// Exposed for Aspire.Hosting.Testing / WebApplicationFactory integration tests.
public partial class Program;
