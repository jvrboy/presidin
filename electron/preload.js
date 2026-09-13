/**
 * PRESIDIN — Electron preload (sandboxed bridge)
 * Exposes a minimal, safe API to the renderer.
 */
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("presidinDesktop", {
  platform: process.platform,
  version: process.versions.electron,
  isElectron: true,
  quit: () => process.exit(0),
});
