const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("paperWidget", {
  readData: () => ipcRenderer.invoke("article-read-data"),
  writeData: (data) => ipcRenderer.invoke("article-write-data", data),
  fetchUrl: (url) => ipcRenderer.invoke("fetch-url", url),
  openLink: (url) => ipcRenderer.invoke("open-link", url),
  windowAction: (action) => ipcRenderer.invoke("window-action", action)
});
