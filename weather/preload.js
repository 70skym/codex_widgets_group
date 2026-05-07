const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("weatherField", {
  fetchUrl: (url) => ipcRenderer.invoke("fetch-url", url),
  openLink: (url) => ipcRenderer.invoke("open-link", url),
  windowAction: (action) => ipcRenderer.invoke("window-action", action)
});
