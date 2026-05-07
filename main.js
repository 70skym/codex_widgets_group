const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let win;
let tray;

const WIDGET_HTML = "src/index.html";
const emptyArticleData = { version: 1, saved: [], updatedAt: null };

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

function articleDataPath() {
  if (process.env.ARTICLE_FIELD_DATA_PATH) return process.env.ARTICLE_FIELD_DATA_PATH;
  const syncRoot = process.env.OneDrive || process.env.OneDriveCommercial || process.env.OneDriveConsumer || app.getPath("documents");
  return path.join(syncRoot, "FieldWidgets", "article-saved.json");
}

function normalizeArticleData(data) {
  return {
    ...emptyArticleData,
    ...(data && typeof data === "object" ? data : {}),
    saved: Array.isArray(data?.saved) ? data.saved : []
  };
}

async function readArticleData() {
  const file = articleDataPath();
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  try {
    const text = await fs.promises.readFile(file, "utf8");
    return { ...normalizeArticleData(JSON.parse(text)), path: file };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeArticleData(emptyArticleData);
    return { ...emptyArticleData, path: file };
  }
}

async function writeArticleData(data) {
  const file = articleDataPath();
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const payload = normalizeArticleData(data);
  payload.version = 1;
  payload.updatedAt = new Date().toISOString();
  const temp = `${file}.tmp`;
  await fs.promises.writeFile(temp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.promises.rename(temp, file);
  return { ...payload, path: file };
}

function createWindow() {
  const { x, y, width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workArea;
  const margin = 8;
  const width = Math.max(360, Math.floor(screenWidth / 4));
  const availableHeight = screenHeight - margin * 4;
  const articleHeight = Math.floor(availableHeight / 2);
  const bounds = {
    width,
    height: articleHeight,
    x: x + screenWidth - width - margin,
    y: y + margin
  };

  win = new BrowserWindow({
    ...bounds,
    minWidth: 360,
    minHeight: 260,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: `${__dirname}/preload.js`,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setBounds(bounds);
  win.loadFile(WIDGET_HTML);
  win.once("ready-to-show", () => win.show());
}

function createTray() {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill="#10151f"/>
      <path d="M10 7h10l4 4v14H10z" fill="#f6f7f2"/>
      <path d="M20 7v5h5" fill="#aeb6c2"/>
      <path d="M13 15h9M13 19h9M13 23h6" stroke="#10151f" stroke-width="1.7" stroke-linecap="round"/>
      <circle cx="9" cy="9" r="3" fill="#65d6ad"/>
    </svg>
  `);
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${svg}`);
  tray = new Tray(icon);
  tray.setToolTip("Newest Article Field");
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
        "User-Agent": "NewestArticleField/0.1 (mailto:newest-article-field@example.local)"
      }
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    const error = new Error(`HTTP ${response.status} while fetching ${url}`);
    error.status = response.status;
    error.retryAfter = retryAfter;
    throw error;
  }
  return {
    text: await response.text(),
    contentType: response.headers.get("content-type") || ""
  };
});

ipcMain.handle("open-link", async (_event, url) => {
  await openExternal(url);
});

ipcMain.handle("article-read-data", async () => readArticleData());

ipcMain.handle("article-write-data", async (_event, data) => writeArticleData(data));

ipcMain.handle("window-action", (_event, action) => {
  if (!win) return;
  if (action === "close") win.hide();
  if (action === "minimize") win.minimize();
  if (action === "toggle-pin") {
    const next = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(next, "floating");
    return next;
  }
  return win.isAlwaysOnTop();
});
