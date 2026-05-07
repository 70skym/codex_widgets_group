const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let win;
let tray;

function vivaldiPath() {
  const candidates = [
    process.env.VIVALDI_PATH,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Vivaldi", "Application", "vivaldi.exe"),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Vivaldi", "Application", "vivaldi.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Vivaldi", "Application", "vivaldi.exe")
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function openExternal(url) {
  const browser = vivaldiPath();
  if (!browser) return shell.openExternal(url);
  const child = spawn(browser, [url], { detached: true, stdio: "ignore" });
  child.unref();
}

function createWindow() {
  const { x, y, width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workArea;
  const margin = 8;
  const width = Math.max(360, Math.floor(screenWidth / 4));
  const availableHeight = screenHeight - margin * 4;
  const articleHeight = Math.floor(availableHeight / 2);
  const middleHeight = Math.floor((availableHeight - articleHeight) / 2);
  const weatherHeight = availableHeight - articleHeight - middleHeight;
  const bounds = {
    width,
    height: weatherHeight,
    x: x + screenWidth - width - margin,
    y: y + margin + articleHeight + margin + middleHeight + margin
  };

  win = new BrowserWindow({
    ...bounds,
    minWidth: 360,
    minHeight: 200,
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

  win.setBounds(bounds);
  win.loadFile(path.join(__dirname, "index.html"));
  win.once("ready-to-show", () => win.show());
}

function createTray() {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill="#10151f"/>
      <path d="M9 21h14" stroke="#7cc8ff" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M11 15a5 5 0 0 1 10 0" fill="none" stroke="#f4d35e" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M12 24l-1.5 3M17 24l-1.5 3M22 24l-1.5 3" stroke="#65d6ad" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `);
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${svg}`);
  tray = new Tray(icon);
  tray.setToolTip("Weather Field");
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
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

ipcMain.handle("fetch-url", async (_event, url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "WeatherField/0.1 (mailto:weather-field@example.local)"
      }
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }
  return {
    text: await response.text(),
    contentType: response.headers.get("content-type") || ""
  };
});

ipcMain.handle("open-link", async (_event, url) => {
  await openExternal(url);
});

ipcMain.handle("window-action", (_event, action) => {
  if (!win) return;
  if (action === "close") win.hide();
  if (action === "toggle-pin") {
    const next = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(next, "floating");
    return next;
  }
  return win.isAlwaysOnTop();
});
