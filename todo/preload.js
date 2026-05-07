const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("todoField", {
  readData: () => ipcRenderer.invoke("todo-read-data"),
  writeData: (data) => ipcRenderer.invoke("todo-write-data", data),
  openLink: (url) => ipcRenderer.invoke("open-link", url),
  windowAction: (action) => ipcRenderer.invoke("window-action", action)
});
