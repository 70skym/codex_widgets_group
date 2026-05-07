$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Desktop = [Environment]::GetFolderPath("Desktop")
$ElectronIcon = Join-Path $AppDir "node_modules\electron\dist\electron.exe"

function New-WidgetShortcut {
  param(
    [string]$Name,
    [string]$Launcher
  )

  $ShortcutPath = Join-Path $Desktop "$Name.lnk"
  $Shell = New-Object -ComObject WScript.Shell
  $Shortcut = $Shell.CreateShortcut($ShortcutPath)
  $Shortcut.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"
  $Shortcut.Arguments = '"' + (Join-Path $AppDir $Launcher) + '"'
  $Shortcut.WorkingDirectory = $AppDir
  if (Test-Path $ElectronIcon) {
    $Shortcut.IconLocation = "$ElectronIcon,0"
  }
  $Shortcut.Description = $Name
  $Shortcut.Save()
  Write-Host "Created $ShortcutPath"
}

Push-Location $AppDir
npm.cmd install
Pop-Location

New-WidgetShortcut "Newest Article Field" "start-newest-article-field.vbs"
New-WidgetShortcut "Weather Field" "start-weather-field.vbs"
New-WidgetShortcut "To Do Field" "start-todo-field.vbs"
New-WidgetShortcut "Resolution Field" "start-resolution-field.vbs"

Write-Host "Widgets installed. Use the desktop shortcuts to launch them."
