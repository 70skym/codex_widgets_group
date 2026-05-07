const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("resolutionField", {
  displayInfo: () => ipcRenderer.invoke("display-info"),
  setDisplay: (preset) => ipcRenderer.invoke("display-set", preset),
  readSettings: () => ipcRenderer.invoke("settings-read"),
  writeSettings: (settings) => ipcRenderer.invoke("settings-write", settings),
  remoteActive: () => ipcRenderer.invoke("remote-active"),
  windowAction: (action) => ipcRenderer.invoke("window-action", action)
});
