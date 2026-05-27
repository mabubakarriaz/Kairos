using Kairos.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Kairos.Infrastructure.Configurations;

public sealed class ScheduledBlockConfiguration : IEntityTypeConfiguration<ScheduledBlock>
{
    public void Configure(EntityTypeBuilder<ScheduledBlock> builder)
    {
        builder.ToTable("scheduled_blocks", t =>
        {
            t.HasCheckConstraint("ck_blocks_time_order", "end_ts > start_ts");
            t.HasCheckConstraint("ck_blocks_source", "source IN ('kairos','gcal')");
        });

        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");

        builder.Property(x => x.TaskId).HasColumnName("task_id");

        // Enum → lowercase string, matching the CHECK + the EXCLUDE WHERE (source='kairos').
        builder.Property(x => x.Source)
            .HasColumnName("source")
            .HasMaxLength(16)
            .IsRequired()
            .HasConversion(v => v.ToString().ToLowerInvariant(), v => Enum.Parse<BlockSource>(v, ignoreCase: true));

        builder.Property(x => x.ExternalId).HasColumnName("external_id").HasMaxLength(512);
        builder.Property(x => x.StartUtc).HasColumnName("start_ts").IsRequired();
        builder.Property(x => x.EndUtc).HasColumnName("end_ts").IsRequired();
        builder.Property(x => x.Rrule).HasColumnName("rrule").HasMaxLength(1024);

        // FK to tasks (no navigation on the domain side). Cascade so deleting a task drops its blocks.
        builder.HasOne<TaskItem>()
            .WithMany()
            .HasForeignKey(x => x.TaskId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(x => x.Source).HasDatabaseName("idx_blocks_source");
        builder.HasIndex(x => new { x.Source, x.ExternalId })
            .HasDatabaseName("idx_blocks_external")
            .HasFilter("external_id IS NOT NULL");

        // The generated `during` tstzrange column, its GiST index, and the no-overlap EXCLUDE
        // constraint can't be expressed in fluent mapping — emitted as raw SQL in the migration.

        // Optimistic concurrency via the Postgres xmin system column.
        builder.Property<uint>("xmin").HasColumnName("xmin").HasColumnType("xid").IsRowVersion();
    }
}
