using System.Net;
using System.Net.Http.Json;
using Aspire.Hosting;
using Aspire.Hosting.Testing;
using FluentAssertions;
using Xunit;

namespace Kairos.AppTests;

/// <summary>
/// Boots the wired Aspire graph (postgres + web, with MCP in-process on web) and exercises it like a
/// client: web is healthy, /mcp is served, and a task created via the API is visible via the API —
/// proving service discovery + Postgres + the app graph fit together. These are the slowest tests.
/// </summary>
public sealed class KairosAppModelTests
{
    private static async Task<(DistributedApplication app, HttpClient http)> StartAsync()
    {
        var builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.Kairos_AppHost>();
        var app = await builder.BuildAsync();
        await app.StartAsync();

        var http = app.CreateHttpClient("web");
        await app.ResourceNotifications.WaitForResourceHealthyAsync("web")
            .WaitAsync(TimeSpan.FromMinutes(3));
        return (app, http);
    }

    [Fact]
    public async Task Web_IsHealthy_And_Mcp_IsServed()
    {
        var (app, http) = await StartAsync();
        await using var _ = app;

        (await http.GetAsync("/alive")).StatusCode.Should().Be(HttpStatusCode.OK);
        // /mcp is mapped on web (Streamable HTTP); a bare GET is not 404.
        (await http.GetAsync("/mcp")).StatusCode.Should().NotBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task TaskCreatedViaApi_IsListed()
    {
        var (app, http) = await StartAsync();
        await using var _ = app;

        // The AppHost mounts a persistent data volume, so app-model runs accumulate data. Use a
        // unique title + an unused far-future slot so the no-overlap constraint never trips.
        var title = $"app-model {Guid.NewGuid():N}";
        var start = new DateTimeOffset(2099, 1, 1, 0, 0, 0, TimeSpan.Zero).AddMinutes(Random.Shared.Next(0, 500_000));

        var create = await http.PostAsJsonAsync("/api/tasks", new
        {
            title,
            startUtc = start,
            endUtc = start.AddHours(1),
        });
        var body = await create.Content.ReadAsStringAsync();
        create.StatusCode.Should().Be(HttpStatusCode.Created, "response body was: {0}", body);

        var list = await http.GetStringAsync("/api/tasks");
        list.Should().Contain(title);
    }
}
