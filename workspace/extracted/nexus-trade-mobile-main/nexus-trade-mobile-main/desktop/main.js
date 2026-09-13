// Nexus Trade — Windows desktop shell.
//
// Loads the statically-exported Expo web build (produced by
// `npm run build:web` in the project root and copied into
// desktop/web/ before packaging) inside a native Electron window.
// The web build already contains the full liquid-glass UI, dashboard
// metrics, candlestick charts, and settings — this shell just gives
// it a proper native Windows window, menu, and installer identity.

const { app, BrowserWindow, Menu, shell, nativeTheme } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");

const isDev = !app.isPackaged;

// The Expo Router static web export (output: "static") emits HTML that
// references assets with ABSOLUTE paths (e.g. "/_expo/static/js/...").
// Loading index.html directly via win.loadFile() uses the file:// protocol,
// under which an absolute path resolves against the filesystem root — not
// the web/ directory — so every script/style/image 404s and the window
// renders blank. Serving the exported bundle over a real (loopback-only)
// HTTP server sidesteps this entirely and is the standard fix for
// packaging an Expo/React static export inside Electron.
const WEB_ROOT = path.join(__dirname, "web");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent(req.url.split("?")[0]);
        let filePath = path.join(WEB_ROOT, urlPath === "/" ? "index.html" : urlPath);

        // Guard against path traversal outside WEB_ROOT.
        if (!filePath.startsWith(WEB_ROOT)) {
          res.writeHead(403);
          return res.end("Forbidden");
        }

        fs.stat(filePath, (err, stat) => {
          if (err || !stat.isFile()) {
            // expo-router static export produces per-route HTML files;
            // fall back to root index.html for any unmatched client route
            // instead of a hard 404 (mirrors typical SPA server behavior).
            const fallback = path.join(WEB_ROOT, "index.html");
            return fs.readFile(fallback, (fallbackErr, data) => {
              if (fallbackErr) {
                res.writeHead(404);
                return res.end("Not found");
              }
              res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
              res.end(data);
            });
          }

          const ext = path.extname(filePath).toLowerCase();
          res.writeHead(200, {
            "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
          });
          fs.createReadStream(filePath).pipe(res);
        });
      } catch (e) {
        res.writeHead(500);
        res.end("Internal error");
      }
    });

    // Bind to loopback only, on an OS-assigned free port — never exposed
    // outside the machine.
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
    server.on("error", reject);
  });
}

let staticServer = null;

async function createWindow() {
  nativeTheme.themeSource = "dark";

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#070B12",
    title: "Nexus Trade",
    icon: path.join(__dirname, "build", "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  if (!staticServer) {
    staticServer = await startStaticServer();
  }
  win.loadURL(`http://127.0.0.1:${staticServer.port}/`);

  win.once("ready-to-show", () => win.show());

  // Open any target="_blank" links (e.g. docs, external quote sources)
  // in the user's default browser instead of a second Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) win.webContents.openDevTools({ mode: "detach" });

  return win;
}

function buildMenu() {
  const template = [
    {
      label: "Nexus Trade",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
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
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (staticServer && staticServer.server) {
    staticServer.server.close();
  }
});
