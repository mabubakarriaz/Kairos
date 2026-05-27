#requires -Version 7
<#
.SYNOPSIS
  Nightly Kairos Postgres backup: pg_dump -Fc + GFS retention (14 daily / 8 weekly / 12 monthly).
.DESCRIPTION
  Runs pg_dump inside the running `postgres` container against kairosdb, writes a custom-format
  dump to $BackupDir, then prunes per the retention policy. Schedule via Windows Task Scheduler
  (or run as a `kairos-backup` sidecar against the kairos_pgdata volume).
.EXAMPLE
  pwsh scripts/backup.ps1 -BackupDir "$env:USERPROFILE\KairosData\backups"
#>
param(
  [string] $BackupDir = "$env:USERPROFILE\KairosData\backups",
  [string] $Container = "kairos-postgres-1",
  [string] $Database = "kairosdb",
  [string] $User = "kairos"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$dump = Join-Path $BackupDir "kairos-$stamp.dump"

Write-Host "pg_dump $Database → $dump"
# -Fc = custom format (compressed, restorable with pg_restore).
docker exec $Container pg_dump -U $User -Fc $Database | Set-Content -Path $dump -AsByteStream
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE)." }

# ── Retention: 14 daily, 8 weekly (newest per ISO week), 12 monthly (newest per month) ──
$cal = [System.Globalization.CultureInfo]::InvariantCulture.Calendar
$all = Get-ChildItem -Path $BackupDir -Filter "kairos-*.dump" | Sort-Object LastWriteTime -Descending

$keep = [System.Collections.Generic.HashSet[string]]::new()
$all | Select-Object -First 14 | ForEach-Object { [void]$keep.Add($_.FullName) }   # daily

$weeklySeen = @{}; $monthlySeen = @{}
foreach ($f in $all) {
  $wk = "{0}-{1}" -f $f.LastWriteTime.Year, $cal.GetWeekOfYear($f.LastWriteTime, 'FirstFourDayWeek', 'Monday')
  if (-not $weeklySeen.ContainsKey($wk) -and $weeklySeen.Count -lt 8) { $weeklySeen[$wk] = $true; [void]$keep.Add($f.FullName) }
  $mo = $f.LastWriteTime.ToString("yyyy-MM")
  if (-not $monthlySeen.ContainsKey($mo) -and $monthlySeen.Count -lt 12) { $monthlySeen[$mo] = $true; [void]$keep.Add($f.FullName) }
}

$all | Where-Object { -not $keep.Contains($_.FullName) } | ForEach-Object {
  Write-Host "prune $($_.Name)"; Remove-Item $_.FullName -Force
}

Write-Host "Backup complete. Retained $($keep.Count) of $($all.Count) dumps."
