using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Kairos.Infrastructure;

/// <summary>
/// Design-time factory so `dotnet ef migrations add/script` can build the model without booting the
/// web host or connecting to a database. The connection string here is never actually opened during
/// scaffolding — at runtime the context is configured by Aspire (AddNpgsqlDbContext("kairosdb")).
/// </summary>
public sealed class KairosDbContextFactory : IDesignTimeDbContextFactory<KairosDbContext>
{
    public KairosDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<KairosDbContext>()
            .UseNpgsql("Host=localhost;Database=kairosdb;Username=postgres;Password=postgres")
            .Options;

        return new KairosDbContext(options);
    }
}
