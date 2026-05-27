using FluentValidation;
using Kairos.Application.Schedule;
using Kairos.Application.Tasks;
using Microsoft.Extensions.DependencyInjection;

namespace Kairos.Application;

public static class DependencyInjection
{
    /// <summary>
    /// Registers application services + all FluentValidation validators in this assembly.
    /// Repositories, the clock, and the SQL-backed free-slot service are registered by Infrastructure.
    /// </summary>
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddValidatorsFromAssemblyContaining<CreateTaskRequestValidator>(includeInternalTypes: true);

        services.AddScoped<ITaskService, TaskService>();
        services.AddScoped<IScheduleService, ScheduleService>();

        return services;
    }
}
