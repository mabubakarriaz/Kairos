namespace Kairos.Domain;

/// <summary>
/// Where a <see cref="ScheduledBlock"/> came from. Persisted as a string (HasConversion&lt;string&gt;()).
/// Only <see cref="Kairos"/> blocks are subject to the no-overlap EXCLUDE constraint;
/// <see cref="Gcal"/> blocks are read-only busy data and may overlap.
/// </summary>
public enum BlockSource
{
    Kairos,
    Gcal,
}
