#requires -Version 7
<#
.SYNOPSIS
  Restore drill — proves a backup is actually restorable (a backup you've never restored isn't one).
.DESCRIPTION
  Spins a throwaway postgres:17-alpine container, pg_restores the latest (or given) dump, and asserts
  the `tasks` table came back. Tears the container down afterwards. Rehearse this in Slice 0.
.EXAMPLE
  pwsh scripts/restore-drill.ps1
#>
param(
  [string] $BackupDir = "$env:USERPROFILE\KairosData\backups",
  [string] $DumpFile,
  [int]    $Port = 55444
)

$ErrorActionPreference = "Stop"
if (-not $DumpFile) {
  $latest = Get-ChildItem -Path $BackupDir -Filter "kairos-*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) { throw "No dump files found in $BackupDir." }
  $DumpFile = $latest.FullName
}
Write-Host "Restore drill using $DumpFile"

$name = "kairos-restore-drill"
docker rm -f $name 2>$null | Out-Null
docker run -d --name $name -e POSTGRES_DB=kairosdb -e POSTGRES_USER=kairos -e POSTGRES_PASSWORD=kairos -p "${Port}:5432" postgres:17-alpine | Out-Null

try {
  Write-Host "Waiting for Postgres..."
  for ($i = 0; $i -lt 30; $i++) {
    docker exec $name pg_isready -U kairos -d kairosdb *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }

  Get-Content $DumpFile -AsByteStream | docker exec -i $name pg_restore -U kairos -d kairosdb --clean --if-exists
  # pg_restore can exit non-zero on benign warnings; verify by querying instead.

  $count = (docker exec $name psql -U kairos -d kairosdb -t -A -c "SELECT count(*) FROM tasks;").Trim()
  Write-Host "Restored tasks rows: $count"
  if (-not ($count -match '^\d+$')) { throw "Restore drill FAILED — could not read the tasks table." }
  Write-Host "✓ Restore drill passed."
}
finally {
  docker rm -f $name | Out-Null
}
