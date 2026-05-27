using Kairos.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Kairos.Infrastructure.Configurations;

public sealed class OAuthTokenConfiguration : IEntityTypeConfiguration<OAuthToken>
{
    public void Configure(EntityTypeBuilder<OAuthToken> builder)
    {
        builder.ToTable("oauth_tokens");

        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");

        builder.Property(x => x.Provider).HasColumnName("provider").HasMaxLength(64).IsRequired();
        builder.HasIndex(x => x.Provider).IsUnique();   // one active token row per provider

        // Stored ciphertext (Data Protection); never plaintext.
        builder.Property(x => x.AccessTokenCipher).HasColumnName("access_token").IsRequired();
        builder.Property(x => x.RefreshTokenCipher).HasColumnName("refresh_token");
        builder.Property(x => x.ExpiresAtUtc).HasColumnName("expires_at");
        builder.Property(x => x.NextSyncToken).HasColumnName("next_sync_token").HasMaxLength(512);
        builder.Property(x => x.UpdatedAtUtc).HasColumnName("updated_at").IsRequired();

        // Optimistic concurrency via the Postgres xmin system column.
        builder.Property<uint>("xmin").HasColumnName("xmin").HasColumnType("xid").IsRowVersion();
    }
}
