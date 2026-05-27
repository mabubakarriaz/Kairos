using Kairos.Application.Abstractions;
using Kairos.Application.Schedule;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Kairos.Infrastructure.Repositories;

/// <summary>
/// Commits the DbContext (the unit of work) and translates Postgres' exclusion_violation
/// (SQLSTATE 23P01, raised by the no_overlap_kairos EXCLUDE constraint) into the Application-level
/// <see cref="ScheduleConflictException"/> so higher layers never see Npgsql exceptions.
/// </summary>
public sealed class EfUnitOfWork(KairosDbContext db) : IUnitOfWork
{
    private const string ExclusionViolation = "23P01";

    public async Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        try
        {
            return await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: ExclusionViolation })
        {
            throw new ScheduleConflictException("That time overlaps an existing block on your schedule.");
        }
    }
}
