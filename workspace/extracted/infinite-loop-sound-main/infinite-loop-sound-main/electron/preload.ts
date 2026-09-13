import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("nativeAPI", {
  // App folder
  getAppFolder: () => ipcRenderer.invoke("native:getAppFolder"),
  getStorageInfo: () => ipcRenderer.invoke("native:getStorageInfo"),

  // File system
  listFiles: (dirPath: string) => ipcRenderer.invoke("native:listFiles", dirPath),
  readBuffer: (filePath: string) => ipcRenderer.invoke("native:readFile", filePath),
  readFile: (filePath: string) => ipcRenderer.invoke("native:readFile", filePath),
  writeFile: (filePath: string, data: ArrayBuffer) =>
    ipcRenderer.invoke("native:writeFile", filePath, data),
  deleteFile: (filePath: string) => ipcRenderer.invoke("native:deleteFile", filePath),
  createDirectory: (dirPath: string) => ipcRenderer.invoke("native:createDirectory", dirPath),

  // File pickers
  openFile: (filters: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke("dialog:openFile", filters),
  openDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  saveFile: (defaultName: string, filters: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke("dialog:saveFile", defaultName, filters),

  // Network
  downloadFile: (url: string, destPath: string) =>
    ipcRenderer.invoke("native:downloadFile", url, destPath),
  openExternal: (filePath: string) => ipcRenderer.invoke("native:openExternal", filePath),

  // Legacy compat
  stat: (filePath: string) => ipcRenderer.invoke("file:stat", filePath),

  platform: process.platform,
  isElectron: true,
});
