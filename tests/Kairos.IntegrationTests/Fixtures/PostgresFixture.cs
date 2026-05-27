using Kairos.Application;
using Kairos.Application.Abstractions;
using Kairos.Application.FreeSlots;
using Kairos.Infrastructure;
using Kairos.Infrastructure.Repositories;
using Kairos.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;
using Xunit;

namespace Kairos.IntegrationTests.Fixtures;

/// <summary>
/// One real PostgreSQL 17 container shared across the collection. Applies migrations on start
/// (which also proves they apply cleanly, incl. the generated `during` column + EXCLUDE constraint)
/// and builds the same DI graph the app uses so tests exercise the real services + SQL.
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _db = new PostgreSqlBuilder("postgres:17-alpine")
        .Build();

    public ServiceProvider Services { get; private set; } = default!;

    public async Task InitializeAsync()
    {
        await _db.StartAsync();

        var services = new ServiceCollection();
        services.AddDbContext<KairosDbContext>(o =>
            o.UseNpgsql(_db.GetConnectionString())
             .UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking));
        services.AddApplication();
        services.AddScoped<ITaskRepository, TaskRepository>();
        services.AddScoped<IScheduleRepository, ScheduleRepository>();
        services.AddScoped<IUnitOfWork, EfUnitOfWork>();
        services.AddScoped<IFreeSlotService, FreeSlotService>();
        services.AddSingleton<IClock, SystemClock>();
        Services = services.BuildServiceProvider();

        await using var scope = Services.CreateAsyncScope();
        var ctx = scope.ServiceProvider.GetRequiredService<KairosDbContext>();
        await ctx.Database.MigrateAsync();
    }

    /// <summary>Wipe data between tests so each starts from a clean schedule.</summary>
    public async Task ResetAsync()
    {
        await using var scope = Services.CreateAsyncScope();
        var ctx = scope.ServiceProvider.GetRequiredService<KairosDbContext>();
        await ctx.Database.ExecuteSqlRawAsync(
            "TRUNCATE tasks, scheduled_blocks, oauth_tokens RESTART IDENTITY CASCADE;");
    }

    public async Task DisposeAsync()
    {
        await Services.DisposeAsync();
        await _db.DisposeAsync();
    }
}

[CollectionDefinition("postgres")]
public sealed class PostgresCollection : ICollectionFixture<PostgresFixture>;
