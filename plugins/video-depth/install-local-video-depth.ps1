param(
  [string]$Python = "py",
  [string]$TorchIndexUrl = "",
  [string]$AllowedOrigin = ""
)

$ErrorActionPreference = "Stop"
$pluginRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venv = Join-Path $pluginRoot ".venv"
$service = Join-Path $pluginRoot "local-video-depth-service.py"
$serviceOutputLog = Join-Path $pluginRoot "service.stdout.log"
$serviceErrorLog = Join-Path $pluginRoot "service.stderr.log"

function Invoke-SystemPython([Parameter(ValueFromRemainingArguments = $true)][object[]]$Arguments) {
  if ($Python -eq "py") {
    & $Python -3 @Arguments
  }
  else {
    & $Python @Arguments
  }
  if ($LASTEXITCODE -ne 0) { throw "Python command failed with exit code $LASTEXITCODE" }
}

if (-not (Test-Path (Join-Path $venv "Scripts/python.exe"))) {
  Invoke-SystemPython -m venv $venv
}
$pythonExe = Join-Path $venv "Scripts/python.exe"
& $pythonExe -m pip install --upgrade pip
if ($TorchIndexUrl) {
  & $pythonExe -m pip install torch --index-url $TorchIndexUrl
}
else {
  & $pythonExe -m pip install torch
}
$requirements = Join-Path $pluginRoot "video-depth-requirements.txt"
if (-not (Test-Path $requirements)) {
  $requirements = Join-Path (Resolve-Path (Join-Path $pluginRoot "../..")) "scripts/video-depth-requirements.txt"
}
& $pythonExe -m pip install -r $requirements
if ($AllowedOrigin) {
  Set-Content -LiteralPath (Join-Path $pluginRoot "plugin.env") -Value "VIDEO_DEPTH_ALLOWED_ORIGINS=$AllowedOrigin" -Encoding utf8
}

try {
  Invoke-RestMethod -Uri "http://127.0.0.1:48123/health" -TimeoutSec 2 | Out-Null
  Write-Host "Video depth plugin is already running."
  exit 0
}
catch {
  # The loopback service is not running yet.
}

Start-Process `
  -FilePath $pythonExe `
  -ArgumentList "`"$service`"" `
  -WorkingDirectory $pluginRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $serviceOutputLog `
  -RedirectStandardError $serviceErrorLog

for ($attempt = 1; $attempt -le 20; $attempt++) {
  Start-Sleep -Milliseconds 500
  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:48123/health" -TimeoutSec 2 | Out-Null
    Write-Host "Video depth plugin is installed and running."
    exit 0
  }
  catch {
    # The service process may still be starting.
  }
}

throw "Video depth plugin failed to start. Check $serviceErrorLog"
