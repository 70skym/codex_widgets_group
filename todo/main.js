const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let win;
let tray;

const emptyTodoData = { version: 1, tasks: { day: [], week: [], month: [] }, updatedAt: null };

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

function todoDataPath() {
  if (process.env.TODO_FIELD_DATA_PATH) return process.env.TODO_FIELD_DATA_PATH;
  const syncRoot = process.env.OneDrive || process.env.OneDriveCommercial || process.env.OneDriveConsumer || app.getPath("documents");
  return path.join(syncRoot, "FieldWidgets", "todo-data.json");
}

function normalizeTodoData(data) {
  const normalized = {
    ...emptyTodoData,
    ...(data && typeof data === "object" ? data : {})
  };
  normalized.tasks = {
    day: Array.isArray(normalized.tasks?.day) ? normalized.tasks.day : [],
    week: Array.isArray(normalized.tasks?.week) ? normalized.tasks.week : [],
    month: Array.isArray(normalized.tasks?.month) ? normalized.tasks.month : []
  };
  return normalized;
}

async function readTodoData() {
  const file = todoDataPath();
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  try {
    const text = await fs.promises.readFile(file, "utf8");
    return { ...normalizeTodoData(JSON.parse(text)), path: file };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeTodoData(emptyTodoData);
    return { ...emptyTodoData, path: file };
  }
}

async function writeTodoData(data) {
  const file = todoDataPath();
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const payload = normalizeTodoData(data);
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
  const middleHeight = Math.floor((availableHeight - articleHeight) / 2);
  const bounds = {
    width,
    height: middleHeight,
    x: x + screenWidth - width - margin,
    y: y + margin + articleHeight + margin
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
      <path d="M9 10h14M9 16h14M9 22h8" stroke="#f6f7f2" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M22 22l2 2 4-5" fill="none" stroke="#65d6ad" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `);
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${svg}`);
  tray = new Tray(icon);
  tray.setToolTip("To Do Field");
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

ipcMain.handle("open-link", async (_event, url) => {
  await openExternal(url);
});

ipcMain.handle("todo-read-data", async () => readTodoData());

ipcMain.handle("todo-write-data", async (_event, data) => writeTodoData(data));

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
