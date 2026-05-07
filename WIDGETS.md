# Field Widgets

This folder contains three Electron widgets:

- Newest Article Field
- To Do Field
- Weather Field
- Resolution Field

## Install On Another PC

1. Copy or clone this folder to the other PC.
2. Install Node.js if it is not already installed.
3. Run PowerShell in this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-widgets.ps1
```

The installer runs `npm.cmd install` and creates desktop shortcuts for all three widgets.

## Updating Across PCs

The most reliable setup is to keep this folder in a Git repository or a synced folder such as OneDrive. When the widget code changes, pull or sync the folder on the other PC, then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\update-widgets.ps1
```

If this folder is a Git repo, the update script runs `git pull --ff-only` and then `npm.cmd install`. If it is not a Git repo, it still refreshes npm dependencies.

## To Do Sync

To Do Field stores tasks in a shared JSON file. By default it uses:

```text
%OneDrive%\FieldWidgets\todo-data.json
```

If OneDrive is not available, it falls back to the user's Documents folder. To use a custom location, set this environment variable before launching the widget:

```powershell
setx TODO_FIELD_DATA_PATH "C:\Path\To\todo-data.json"
```

The widget reloads the JSON file every 15 seconds, so changes made on another PC appear after OneDrive syncs the file. If two PCs edit at the exact same time, the most recent save wins.

## Article Saved Sync

Newest Article Field stores saved papers in:

```text
%OneDrive%\FieldWidgets\article-saved.json
```

The widget reloads the file every 15 seconds. To use a custom path, set:

```powershell
setx ARTICLE_FIELD_DATA_PATH "C:\Path\To\article-saved.json"
```

## Weather Location

Weather Field starts with Kobe fixed by default. Use the `Kobe` / `Auto` button in the title bar to switch automatic location updates on or off.

When automatic location is on, Weather Field checks the approximate current location at startup and then about once per hour. It uses IP-based location from `ipinfo.io`, so it is approximate rather than GPS-precise. The detected place is saved locally and used for Open-Meteo weather.

## Browser

External links open in Vivaldi when it is installed in the standard Windows location. You can override the browser path by setting the `VIVALDI_PATH` environment variable to `vivaldi.exe`.

## Resolution Field

Resolution Field changes the Windows display resolution from a small desktop widget. It is intended for Chrome Remote Desktop workflows where the host PC should quickly switch to a resolution that matches the client PC.

Run it with:

```powershell
npm.cmd run resolution
```

Chrome Remote Desktop does not expose the client PC resolution through a stable public API. Resolution Field therefore uses a selected remote preset and can automatically apply it while the Chrome Remote Desktop host process is active.
