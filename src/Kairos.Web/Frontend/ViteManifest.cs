using System.Text.Json;
using System.Text.Json.Serialization;

namespace Kairos.Web.Frontend;

/// <summary>
/// Reads Vite's build manifest so Razor can reference hash-fingerprinted, immutably-cacheable assets
/// (wwwroot/dist/vite-manifest.json). Assets are built by Vite — never hand-edited in wwwroot/dist.
/// </summary>
public sealed class ViteManifest
{
    private const string BasePath = "/dist/";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly Dictionary<string, Entry> _entries;

    public ViteManifest(IWebHostEnvironment env)
    {
        var root = env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot");
        var manifestPath = Path.Combine(root, "dist", "vite-manifest.json");

        _entries = File.Exists(manifestPath)
            ? JsonSerializer.Deserialize<Dictionary<string, Entry>>(File.ReadAllText(manifestPath), JsonOptions) ?? []
            : [];
    }

    /// <summary>Hashed URL for the entry's JS bundle (null if assets aren't built yet).</summary>
    public string? Script(string entry = "src/main.ts")
        => _entries.TryGetValue(entry, out var e) ? BasePath + e.File : null;

    /// <summary>Hashed URLs for the entry's CSS bundles.</summary>
    public IEnumerable<string> Styles(string entry = "src/main.ts")
        => _entries.TryGetValue(entry, out var e) && e.Css is not null
            ? e.Css.Select(c => BasePath + c)
            : [];

    private sealed record Entry(
        [property: JsonPropertyName("file")] string File,
        [property: JsonPropertyName("css")] string[]? Css);
}
