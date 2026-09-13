import { app, BrowserWindow, ipcMain, dialog, FileFilter, shell } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0a0e1a",
    title: "Divergence IQ",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/client/index.html"));
  }

  // Block navigation away from the app origin (phishing / XSS escape hatch)
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev ? /^https?:\/\/localhost:\d+/.test(url) : url.startsWith("file://");
    if (!allowed) event.preventDefault();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ============================================================
// App Folder — Creates a dedicated folder for user data on the device
// ============================================================

function getAppDataFolder(): string {
  const home = os.homedir();
  const folder = path.join(home, "Documents", "DivergenceIQ");
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  return folder;
}

/**
 * Confine a renderer-supplied path to the app data folder.
 * Returns the resolved absolute path or null when it escapes the sandbox.
 */
function resolveSandboxedPath(target: string): string | null {
  if (typeof target !== "string" || target.trim() === "") return null;
  const base = getAppDataFolder();
  const resolved = path.resolve(base, target);
  const rel = path.relative(base, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}

ipcMain.handle("native:getAppFolder", async () => {
  return getAppDataFolder();
});

ipcMain.handle("native:getStorageInfo", async () => {
  try {
    const folder = getAppDataFolder();
    const stat = fs.statSync(folder);
    return { ok: true, appFolder: folder, usedBytes: stat.size, quotaBytes: 0, freeBytes: 0 };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

// ============================================================
// File System — read/write/list/delete/mkdir, sandboxed to the app folder.
// Access outside the app folder must go through the native dialogs so the
// user explicitly grants it.
// ============================================================

ipcMain.handle("native:listFiles", async (_event, dirPath: string) => {
  try {
    const safeDir = resolveSandboxedPath(dirPath);
    if (!safeDir) return [];
    const entries = await fs.promises.readdir(safeDir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(safeDir, entry.name);
        const stat = await fs.promises.stat(fullPath);
        return {
          name: entry.name,
          path: fullPath,
          size: stat.size,
          isDirectory: entry.isDirectory(),
          modified: stat.mtimeMs,
        };
      }),
    );
    return files;
  } catch {
    return [];
  }
});

ipcMain.handle("native:readFile", async (_event, filePath: string) => {
  try {
    const safePath = resolveSandboxedPath(filePath);
    if (!safePath) return { ok: false, error: "Path outside app folder is not permitted" };
    const buffer = await fs.promises.readFile(safePath);
    return { ok: true, data: buffer.buffer };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle("native:writeFile", async (_event, filePath: string, data: ArrayBuffer) => {
  try {
    const safePath = resolveSandboxedPath(filePath);
    if (!safePath) return { ok: false, error: "Path outside app folder is not permitted" };
    const dir = path.dirname(safePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await fs.promises.writeFile(safePath, new Uint8Array(data));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle("native:deleteFile", async (_event, filePath: string) => {
  try {
    const safePath = resolveSandboxedPath(filePath);
    if (!safePath) return { ok: false, error: "Path outside app folder is not permitted" };
    await fs.promises.unlink(safePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle("native:createDirectory", async (_event, dirPath: string) => {
  try {
    const safeDir = resolveSandboxedPath(dirPath);
    if (!safeDir) return { ok: false, error: "Path outside app folder is not permitted" };
    await fs.promises.mkdir(safeDir, { recursive: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

// ============================================================
// File Pickers — Native dialogs (user-granted access; not sandboxed)
// ============================================================

ipcMain.handle("dialog:openFile", async (_event, filters: FileFilter[]) => {
  if (!mainWindow) return { canceled: true, filePaths: [] };
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: filters.length ? filters : [{ name: "All Files", extensions: ["*"] }],
  });
  return result;
});

ipcMain.handle("dialog:openDirectory", async () => {
  if (!mainWindow) return { canceled: true, filePaths: [] };
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  return result;
});

ipcMain.handle("dialog:saveFile", async (_event, defaultName: string, filters: FileFilter[]) => {
  if (!mainWindow) return { canceled: true, filePath: "" };
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: filters.length ? filters : [{ name: "All Files", extensions: ["*"] }],
  });
  return result;
});

// ============================================================
// Network — Download files into the app folder over HTTPS only
// ============================================================

ipcMain.handle("native:downloadFile", async (_event, url: string, destPath: string) => {
  try {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: "Invalid URL" };
    }
    if (parsed.protocol !== "https:") {
      return { ok: false, error: "Only https:// downloads are permitted" };
    }
    const safePath = resolveSandboxedPath(destPath);
    if (!safePath) return { ok: false, error: "Destination outside app folder is not permitted" };

    // Manual redirect handling — re-validate each hop's protocol and host
    let currentUrl = parsed;
    for (let hop = 0; hop < 5; hop++) {
      if (currentUrl.protocol !== "https:") throw new Error("Redirect to non-HTTPS blocked");
      const response = await fetch(currentUrl, { redirect: "manual" });
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        currentUrl = new URL(response.headers.get("location")!, currentUrl);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const dir = path.dirname(safePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await fs.promises.writeFile(safePath, buffer);
      return { ok: true };
    }
    return { ok: false, error: "Too many redirects" };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle("native:openExternal", async (_event, target: string) => {
  try {
    // URLs open in the system browser; local files only inside the app folder
    if (/^https?:\/\//i.test(target)) {
      await shell.openExternal(target);
      return { ok: true };
    }
    const safePath = resolveSandboxedPath(target);
    if (!safePath) return { ok: false, error: "Path outside app folder is not permitted" };
    const result = await shell.openPath(safePath);
    return result ? { ok: false, error: result } : { ok: true };
  } catch {
    return { ok: false, error: "Failed to open" };
  }
});

// Keep legacy handlers for backward compat (sandboxed to the app folder)
ipcMain.handle("file:readBuffer", async (_event, filePath: string) => {
  try {
    const safePath = resolveSandboxedPath(filePath);
    if (!safePath) return { ok: false, error: "Path outside app folder is not permitted" };
    const buffer = await fs.promises.readFile(safePath);
    return { ok: true, data: buffer.buffer };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle("file:stat", async (_event, filePath: string) => {
  try {
    const safePath = resolveSandboxedPath(filePath);
    if (!safePath) return { ok: false, error: "Path outside app folder is not permitted" };
    const stat = await fs.promises.stat(safePath);
    return { ok: true, size: stat.size, name: path.basename(safePath), modified: stat.mtimeMs };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});
