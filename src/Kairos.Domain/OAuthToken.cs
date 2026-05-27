namespace Kairos.Domain;

/// <summary>
/// Encrypted OAuth credentials + sync cursor for an external provider (Google Calendar in v1).
/// The token strings are <b>ciphertext</b> — Infrastructure encrypts/decrypts with ASP.NET Core
/// Data Protection (keys on the dpkeys volume); plaintext never touches the database or config.
/// </summary>
public sealed class OAuthToken
{
    private OAuthToken() { Provider = string.Empty; AccessTokenCipher = string.Empty; }

    public OAuthToken(string provider, string accessTokenCipher, string? refreshTokenCipher,
                      DateTimeOffset? expiresAtUtc)
    {
        Id = Guid.NewGuid();
        Provider = provider;
        AccessTokenCipher = accessTokenCipher;
        RefreshTokenCipher = refreshTokenCipher;
        ExpiresAtUtc = expiresAtUtc;
        UpdatedAtUtc = DateTimeOffset.UtcNow;
    }

    public Guid Id { get; private set; }

    /// <summary>Logical provider key, e.g. "google". One active token row per provider.</summary>
    public string Provider { get; private set; }

    public string AccessTokenCipher { get; private set; }
    public string? RefreshTokenCipher { get; private set; }
    public DateTimeOffset? ExpiresAtUtc { get; private set; }

    /// <summary>Google incremental sync cursor — only set after a full page-loop completes.</summary>
    public string? NextSyncToken { get; private set; }

    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public void UpdateTokens(string accessTokenCipher, string? refreshTokenCipher, DateTimeOffset? expiresAtUtc)
    {
        AccessTokenCipher = accessTokenCipher;
        if (refreshTokenCipher is not null) RefreshTokenCipher = refreshTokenCipher;  // refresh tokens rotate; keep last if absent
        ExpiresAtUtc = expiresAtUtc;
        UpdatedAtUtc = DateTimeOffset.UtcNow;
    }

    public void SetSyncToken(string? nextSyncToken)
    {
        NextSyncToken = nextSyncToken;
        UpdatedAtUtc = DateTimeOffset.UtcNow;
    }
}
