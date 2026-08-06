param(
  [string]$Version = "2026.07.04",
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$targetDirectory = Join-Path $repoRoot "apps\backend\vendor"
$targetPath = Join-Path $targetDirectory "yt-dlp.exe"

if ((Test-Path $targetPath) -and -not $Force) {
  Write-Host "Backend yt-dlp binary is already prepared."
  exit 0
}

$downloadPath = Join-Path $env:TEMP "comic-ai-yt-dlp-$Version.exe"
$checksumsPath = Join-Path $env:TEMP "comic-ai-yt-dlp-$Version-SHA2-256SUMS"
$releaseUrl = "https://github.com/yt-dlp/yt-dlp/releases/download/$Version"

function Download-ReleaseFile {
  param([string]$Url, [string]$Path)

  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    & $curl.Source --silent --show-error --fail --location --retry 3 --retry-all-errors --connect-timeout 20 --output $Path $Url
    if ($LASTEXITCODE -eq 0) { return }
  }
  Invoke-WebRequest -Uri $Url -OutFile $Path
}

try {
  Download-ReleaseFile -Url "$releaseUrl/yt-dlp.exe" -Path $downloadPath
  Download-ReleaseFile -Url "$releaseUrl/SHA2-256SUMS" -Path $checksumsPath
  $checksumLine = Get-Content -LiteralPath $checksumsPath | Where-Object { $_ -match "\*?yt-dlp\.exe$" } | Select-Object -First 1
  if (-not $checksumLine -or $checksumLine -notmatch "^([0-9a-fA-F]{64})\s+") { throw "yt_dlp_checksum_missing" }
  $expectedHash = $Matches[1].ToLowerInvariant()
  $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $downloadPath).Hash.ToLowerInvariant()
  if ($actualHash -ne $expectedHash) { throw "yt_dlp_checksum_mismatch" }
  New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null
  Move-Item -LiteralPath $downloadPath -Destination $targetPath -Force
  Write-Host "Backend yt-dlp binary is prepared."
} finally {
  Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $checksumsPath -Force -ErrorAction SilentlyContinue
}
