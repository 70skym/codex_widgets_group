const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

let win;
let tray;

const dataPath = () => path.join(app.getPath("userData"), "resolution-field.json");

const defaults = {
  remotePreset: { width: 1920, height: 1080, frequency: 60 },
  autoRemote: false,
  pollMs: 5000
};

function loadSettings() {
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(dataPath(), "utf8")) };
  } catch {
    return defaults;
  }
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(dataPath()), { recursive: true });
  fs.writeFileSync(dataPath(), `${JSON.stringify({ ...defaults, ...settings }, null, 2)}\n`, "utf8");
  return loadSettings();
}

function runDisplay(args = []) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, "display.ps1");
    const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    execFile(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...args], {
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message).trim()));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(new Error(`Could not parse display output: ${parseError.message}`));
      }
    });
  });
}

function chromeRemoteDesktopActive() {
  return new Promise((resolve) => {
    execFile("tasklist.exe", ["/FO", "CSV"], { windowsHide: true }, (_error, stdout) => {
      const text = stdout.toLowerCase();
      resolve(text.includes("remoting_host.exe") || text.includes("chromeremotedesktophost.exe"));
    });
  });
}

async function applyPreset(preset) {
  const args = ["-Action", "set", "-Width", String(preset.width), "-Height", String(preset.height)];
  if (preset.frequency) args.push("-Frequency", String(preset.frequency));
  return runDisplay(args);
}

function fallbackModes() {
  return [
    { width: 3840, height: 2160, frequency: 60, label: "3840x2160@60" },
    { width: 3440, height: 1440, frequency: 60, label: "3440x1440@60" },
    { width: 2560, height: 1440, frequency: 60, label: "2560x1440@60" },
    { width: 1920, height: 1200, frequency: 60, label: "1920x1200@60" },
    { width: 1920, height: 1080, frequency: 60, label: "1920x1080@60" },
    { width: 1600, height: 900, frequency: 60, label: "1600x900@60" },
    { width: 1366, height: 768, frequency: 60, label: "1366x768@60" },
    { width: 1280, height: 720, frequency: 60, label: "1280x720@60" }
  ];
}

async function displayInfo() {
  const info = await runDisplay(["-Action", "get"]);
  if (info.current?.width && info.current?.height && Array.isArray(info.modes) && info.modes.length) return info;
  const size = screen.getPrimaryDisplay().size;
  return {
    ...info,
    current: {
      width: size.width,
      height: size.height,
      frequency: 0,
      label: `${size.width}x${size.height}`
    },
    modes: Array.isArray(info.modes) && info.modes.length ? info.modes : fallbackModes()
  };
}

async function autoTick() {
  const settings = loadSettings();
  if (!settings.autoRemote) return;
  const active = await chromeRemoteDesktopActive();
  if (!active) return;
  const info = await runDisplay(["-Action", "get"]);
  const target = settings.remotePreset;
  if (info.current.width === target.width && info.current.height === target.height) return;
  await applyPreset(target);
}

function createWindow() {
  const { x, y, width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workArea;
  const margin = 8;
  const width = Math.max(420, Math.floor(screenWidth / 4));
  const height = Math.max(250, Math.floor(screenHeight / 4));

  win = new BrowserWindow({
    width,
    height,
    x: x + margin,
    y: y + screenHeight - height - margin,
    minWidth: 390,
    minHeight: 240,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "index.html"));
  win.once("ready-to-show", () => win.show());
}

function createTray() {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#10151f"/>
      <rect x="6" y="8" width="20" height="14" rx="2" fill="#7cc8ff"/>
      <path d="M11 26h10M16 22v4" stroke="#f6f7f2" stroke-width="2" stroke-linecap="round"/>
      <circle cx="24" cy="9" r="4" fill="#65d6ad"/>
    </svg>
  `);
  tray = new Tray(nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${svg}`));
  tray.setToolTip("Resolution Field");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show", click: () => win.show() },
    { label: "Hide", click: () => win.hide() },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() }
  ]));
  tray.on("click", () => {
    if (win.isVisible()) win.hide();
    else win.show();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  setInterval(() => autoTick().catch(() => {}), defaults.pollMs);
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

ipcMain.handle("display-info", () => displayInfo());
ipcMain.handle("display-set", (_event, preset) => applyPreset(preset));
ipcMain.handle("settings-read", () => loadSettings());
ipcMain.handle("settings-write", (_event, settings) => saveSettings(settings));
ipcMain.handle("remote-active", () => chromeRemoteDesktopActive());
ipcMain.handle("window-action", (_event, action) => {
  if (!win) return false;
  if (action === "close") win.hide();
  if (action === "toggle-pin") {
    const next = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(next, "floating");
    return next;
  }
  return win.isAlwaysOnTop();
});
