param(
  [Parameter(Mandatory = $true)][string]$EvidenceDirectory
)

$ErrorActionPreference = "Stop"
$resolvedEvidence = [System.IO.Path]::GetFullPath($EvidenceDirectory)
New-Item -ItemType Directory -Path $resolvedEvidence -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$transcript = Join-Path $resolvedEvidence "release-gate-$timestamp.log"

Start-Transcript -LiteralPath $transcript | Out-Null
try {
  npm.cmd run format:check
  if ($LASTEXITCODE -ne 0) { throw "Formatting gate failed" }
  npm.cmd run check
  if ($LASTEXITCODE -ne 0) { throw "Repository gate failed" }
  npm.cmd audit --audit-level=high
  if ($LASTEXITCODE -ne 0) { throw "Dependency audit failed" }

  $manifest = @{
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    status = "PASS"
    node = (node --version)
    npm = (npm.cmd --version)
    gitCommit = (git rev-parse HEAD 2>$null)
  }
  $manifest | ConvertTo-Json | Set-Content `
    -LiteralPath (Join-Path $resolvedEvidence "release-manifest-$timestamp.json") `
    -Encoding utf8
}
finally {
  Stop-Transcript | Out-Null
}

Write-Output "Release gate passed. Evidence: $resolvedEvidence"
