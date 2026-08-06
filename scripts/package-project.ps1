param(
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$videoBatchBinaryBuilder = Join-Path $repoRoot "scripts\prepare-video-batch-yt-dlp.ps1"

if (-not (Test-Path (Join-Path $repoRoot "apps\backend\vendor\yt-dlp.exe"))) {
  & $videoBatchBinaryBuilder
  if ($LASTEXITCODE -ne 0) { throw "Unable to prepare the backend video batch resolver" }
}

if (-not $OutputPath) {
  $OutputPath = Join-Path $repoRoot "dist\release\comic-ai-package-$timestamp.zip"
}

$outputDir = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$excludedRootNames = @(
  ".agents",
  ".claude",
  ".codex-runtime",
  ".git",
  ".gstack",
  ".gstack-codex",
  ".idea",
  ".ignore",
  ".local",
  ".next",
  ".npm-cache",
  ".opencode",
  ".superpowers",
  ".turbo",
  ".worktrees",
  "artifacts",
  "backups",
  "design-previews",
  "dist",
  "memory",
  "node_modules",
  "secrets",
  "test-results",
  "tmp",
  "tmp-dev-server",
  "tmp-ui-screenshots"
)

$excludedAnySegmentNames = @(
  ".git",
  ".next",
  ".npm-cache",
  ".turbo",
  "dist",
  "node_modules",
  "test-results"
)

$excludedExactFiles = @(
  ".env",
  ".env.local",
  "NUL.css",
  "_utf8_probe.txt",
  "museai-dashboard-firecrawl.html",
  "museai-dashboard-inapp.html",
  "museai-login-firecrawl.html"
)

$script:CopiedFileCount = 0
$script:SkippedDirectoryCount = 0
$script:SkippedFileCount = 0

function Get-RelativeSegments {
  param([string]$RelativePath)

  return @($RelativePath -split "[\\/]" | Where-Object { $_ -ne "" })
}

function Test-ExcludedDirectory {
  param([string]$RelativePath)

  $segments = @(Get-RelativeSegments -RelativePath $RelativePath)
  if ($segments.Count -eq 0) {
    return $false
  }

  if ($excludedRootNames -contains $segments[0]) {
    return $true
  }

  if ($segments.Count -ge 2 -and $segments[0] -eq "plugins" -and $segments[1] -eq "video-batch") {
    return $true
  }

  foreach ($segment in $segments) {
    if ($excludedAnySegmentNames -contains $segment) {
      return $true
    }
  }

  return $false
}

function Test-ExcludedFile {
  param([string]$RelativePath)

  $segments = @(Get-RelativeSegments -RelativePath $RelativePath)
  if ($segments.Count -eq 0) {
    return $false
  }

  if ($excludedRootNames -contains $segments[0]) {
    return $true
  }

  foreach ($segment in $segments) {
    if ($excludedAnySegmentNames -contains $segment) {
      return $true
    }
  }

  $fileName = Split-Path -Leaf $RelativePath

  if ($excludedExactFiles -contains $fileName) {
    return $true
  }

  if ($fileName -eq ".DS_Store") {
    return $true
  }

  if ($fileName -match "^\.env\..+\.local$") {
    return $true
  }

  if ($fileName -match "^\.tmp-") {
    return $true
  }

  if ($fileName -match "\.log$") {
    return $true
  }

  return $false
}

function Copy-IncludedFiles {
  param(
    [string]$SourceDir,
    [string]$DestinationDir,
    [string]$RelativeBase = ""
  )

  foreach ($item in Get-ChildItem -LiteralPath $SourceDir -Force) {
    $relativePath = if ($RelativeBase) {
      Join-Path $RelativeBase $item.Name
    } else {
      $item.Name
    }

    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
      if ($item.PSIsContainer) {
        $script:SkippedDirectoryCount++
      } else {
        $script:SkippedFileCount++
      }
      continue
    }

    if ($item.PSIsContainer) {
      if (Test-ExcludedDirectory -RelativePath $relativePath) {
        $script:SkippedDirectoryCount++
        continue
      }

      $nextDestination = Join-Path $DestinationDir $item.Name
      New-Item -ItemType Directory -Force -Path $nextDestination | Out-Null
      Copy-IncludedFiles -SourceDir $item.FullName -DestinationDir $nextDestination -RelativeBase $relativePath
      continue
    }

    if (Test-ExcludedFile -RelativePath $relativePath) {
      $script:SkippedFileCount++
      continue
    }

    $targetPath = Join-Path $DestinationDir $item.Name
    $targetParent = Split-Path -Parent $targetPath
    if ($targetParent) {
      New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
    }

    Copy-Item -LiteralPath $item.FullName -Destination $targetPath -Force
    $script:CopiedFileCount++
  }
}

$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("comic-ai-package-" + [System.Guid]::NewGuid().ToString("N"))

try {
  New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
  Copy-IncludedFiles -SourceDir $repoRoot -DestinationDir $stagingRoot

  if (Test-Path -LiteralPath $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $stagingRoot,
    $OutputPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
  )

  Write-Host "Created package zip: $OutputPath"
  Write-Host "Included files: $script:CopiedFileCount"
  Write-Host "Skipped directories: $script:SkippedDirectoryCount"
  Write-Host "Skipped files: $script:SkippedFileCount"
} finally {
  if (Test-Path -LiteralPath $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
  }
}
