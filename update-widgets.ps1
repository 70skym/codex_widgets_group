$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $AppDir

if (Test-Path ".git") {
  git pull --ff-only
} else {
  Write-Host "No .git folder found. Skipping git pull."
}

npm.cmd install
Pop-Location

Write-Host "Widgets updated. Restart any running widgets to load changes."
