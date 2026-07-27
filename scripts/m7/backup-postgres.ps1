param(
  [Parameter(Mandatory = $true)][string]$DatabaseUrl,
  [Parameter(Mandatory = $true)][string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $resolvedOutput "phms-$timestamp.dump"
$manifest = Join-Path $resolvedOutput "phms-$timestamp.sha256"

& pg_dump --format=custom --no-owner --no-privileges --dbname=$DatabaseUrl --file=$backup
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }

$hash = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $([System.IO.Path]::GetFileName($backup))" | Set-Content -LiteralPath $manifest -Encoding ascii
Write-Output "Backup created: $backup"
Write-Output "Checksum manifest: $manifest"
