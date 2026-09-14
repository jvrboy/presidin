/**
 * PRESIDIN — Electron main process
 * Wraps the Next.js static export as a native desktop app.
 * Handles both dev (loads from :3000) and production (loads from out/index.html).
 */
const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#06081A",
    title: "PRESIDIN",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Dev mode: load from dev server
  const isDev = process.env.PRESIDIN_DEV === "1";
  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load the built static export
    // Next.js export puts files in out/ directory
    const outDir = path.join(__dirname, "..", "out");
    const indexPath = path.join(outDir, "index.html");
    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      // Fallback: try loading from dist/
      const distPath = path.join(__dirname, "..", "dist", "index.html");
      if (fs.existsSync(distPath)) {
        mainWindow.loadFile(distPath);
      } else {
        mainWindow.loadURL("data:text/html,<h1>PRESIDIN build not found</h1><p>Run <code>bun run build && bun next export</code> first.</p>");
      }
    }
  }

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // Build menu
  const template = [
    {
      label: "File",
      submenu: [
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
