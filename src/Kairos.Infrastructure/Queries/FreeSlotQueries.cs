using Microsoft.EntityFrameworkCore;

namespace Kairos.Infrastructure.Queries;

/// <summary>
/// The canonical multirange free-slot SQL. Gap-finding is done entirely in Postgres —
/// <c>unnest(work_mr - range_agg(busy))</c> returns the gaps directly. C# only ranks them.
/// Don't reintroduce a gaps-and-islands fallback; PG 14+ multiranges are mandated to avoid it.
/// </summary>
public static class FreeSlotQueries
{
    public static Task<List<FreeSlotRow>> GetGapsAsync(
        KairosDbContext db, DateTimeOffset fromUtc, DateTimeOffset toUtc, CancellationToken ct = default) =>
        db.Set<FreeSlotRow>()
            .FromSql($"""
                WITH busy AS (
                    SELECT range_agg(during)::tstzmultirange AS busy_mr
                    FROM scheduled_blocks
                    WHERE during && tstzrange({fromUtc}, {toUtc}, '[)')
                ),
                working AS (
                    SELECT multirange(tstzrange({fromUtc}, {toUtc}, '[)')) AS work_mr
                ),
                gaps AS (
                    SELECT unnest(work_mr - COALESCE(busy_mr, tstzmultirange())) AS g
                    FROM busy, working
                )
                SELECT lower(g) AS "StartUtc", upper(g) AS "EndUtc"
                FROM gaps
                WHERE NOT lower_inf(g) AND NOT upper_inf(g)
                ORDER BY lower(g)
                """)
            .AsNoTracking()
            .ToListAsync(ct);
}
