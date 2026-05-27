using Kairos.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Kairos.Infrastructure.Configurations;

public sealed class TaskItemConfiguration : IEntityTypeConfiguration<TaskItem>
{
    public void Configure(EntityTypeBuilder<TaskItem> builder)
    {
        builder.ToTable("tasks");

        builder.HasKey(t => t.Id);
        builder.Property(t => t.Id).HasColumnName("id");

        builder.Property(t => t.Title).HasColumnName("title").IsRequired().HasMaxLength(200);
        builder.Property(t => t.Description).HasColumnName("description").HasMaxLength(2000);
        builder.Property(t => t.EstimateMinutes).HasColumnName("estimate_min").IsRequired()
            .HasDefaultValue(TaskItem.DefaultEstimateMinutes);

        // Tags is a read-only view over the `_tags` backing field; map the field to a native text[].
        builder.Ignore(t => t.Tags);
        builder.Property<List<string>>("_tags")
            .HasColumnName("tags")
            .HasColumnType("text[]")
            .HasDefaultValueSql("'{}'");

        builder.Property(t => t.CreatedAt).HasColumnName("created_at").IsRequired().HasDefaultValueSql("now()");
        builder.Property(t => t.CompletedAt).HasColumnName("completed_at");

        // Optimistic concurrency via the Postgres xmin system column (not a real column — Npgsql
        // recognizes it and won't emit a CREATE for it).
        builder.Property<uint>("xmin").HasColumnName("xmin").HasColumnType("xid").IsRowVersion();
    }
}
