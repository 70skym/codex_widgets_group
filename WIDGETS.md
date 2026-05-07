# Field Widgets

This folder contains three Electron widgets:

- Newest Article Field
- To Do Field
- Weather Field

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

## Browser

External links open in Vivaldi when it is installed in the standard Windows location. You can override the browser path by setting the `VIVALDI_PATH` environment variable to `vivaldi.exe`.
