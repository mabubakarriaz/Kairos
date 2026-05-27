using Kairos.Domain;
using Kairos.Infrastructure.Queries;
using Microsoft.EntityFrameworkCore;

namespace Kairos.Infrastructure;

/// <summary>
/// The Kairos EF Core context. Mapping is Fluent-only (one IEntityTypeConfiguration per entity);
/// entities stay persistence-ignorant. btree_gist is enabled so the generated <c>during</c> range
/// can carry a GiST index + the no-overlap EXCLUDE constraint (emitted as raw SQL in the migration).
/// </summary>
public sealed class KairosDbContext(DbContextOptions<KairosDbContext> options) : DbContext(options)
{
    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<ScheduledBlock> ScheduledBlocks => Set<ScheduledBlock>();
    public DbSet<OAuthToken> OAuthTokens => Set<OAuthToken>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("btree_gist");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(KairosDbContext).Assembly);

        // Keyless projection for the multirange free-slot SQL (Queries/FreeSlotQueries.cs).
        modelBuilder.Entity<FreeSlotRow>().HasNoKey().ToView(null);
    }
}
