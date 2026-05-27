using Kairos.Application.Abstractions;
using Kairos.Application.FreeSlots;
using Kairos.Infrastructure.Repositories;
using Kairos.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Kairos.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// Registers the data layer: KairosDbContext through the Aspire Npgsql integration (connection
    /// string + health checks + OTel from the AppHost resource named "kairosdb"), plus repositories,
    /// the unit of work, the SQL free-slot service, and the clock.
    /// </summary>
    public static IHostApplicationBuilder AddInfrastructure(this IHostApplicationBuilder builder)
    {
        builder.AddNpgsqlDbContext<KairosDbContext>(
            connectionName: "kairosdb",
            configureDbContextOptions: options =>
                // Reads are no-tracking by default; repositories opt in to tracking for mutations.
                options.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking));

        builder.Services.AddScoped<ITaskRepository, TaskRepository>();
        builder.Services.AddScoped<IScheduleRepository, ScheduleRepository>();
        builder.Services.AddScoped<IUnitOfWork, EfUnitOfWork>();
        builder.Services.AddScoped<IFreeSlotService, FreeSlotService>();
        builder.Services.AddSingleton<IClock, SystemClock>();

        return builder;
    }
}
