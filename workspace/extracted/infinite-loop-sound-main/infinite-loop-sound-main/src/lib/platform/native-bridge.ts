// Native Bridge — Unified device access API across platforms.
// Provides file system, network, and app folder access for:
// - Electron (desktop .exe/.dmg/.AppImage): native Node fs + net
// - Capacitor (iOS .ipa / Android .apk): Filesystem + FilesystemPath plugins
// - Web: File System Access API (Chrome/Edge) or IndexedDB fallback

import { detectPlatform, type Platform } from "./model-loader";

export interface DeviceFile {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modified: number;
}

export interface NetworkInfo {
  online: boolean;
  type: string;
  downlink: number;
  rtt: number;
}

export interface AppStorageInfo {
  appFolder: string;
  usedBytes: number;
  quotaBytes: number;
  freeBytes: number;
}

export interface NativeBridge {
  platform: Platform;
  isNative: boolean;
  listFiles: (dirPath: string) => Promise<DeviceFile[]>;
  readFile: (filePath: string) => Promise<ArrayBuffer>;
  writeFile: (filePath: string, data: ArrayBuffer) => Promise<void>;
  deleteFile: (filePath: string) => Promise<void>;
  createDirectory: (dirPath: string) => Promise<void>;
  pickFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
  pickDirectory: () => Promise<string | null>;
  getAppFolder: () => Promise<string>;
  getStorageInfo: () => Promise<AppStorageInfo>;
  getNetworkInfo: () => Promise<NetworkInfo>;
  downloadFile: (url: string, destPath: string) => Promise<void>;
  openExternal: (filePath: string) => Promise<void>;
}

function getElectronAPI(): any | null {
  if (typeof window !== "undefined" && (window as any).nativeAPI) {
    return (window as any).nativeAPI;
  }
  return null;
}

function getCapacitorPlugins(): any | null {
  if (typeof window !== "undefined" && (window as any).Capacitor?.Plugins) {
    return (window as any).Capacitor.Plugins;
  }
  return null;
}

export function createNativeBridge(): NativeBridge {
  const platform = detectPlatform();
  const electronAPI = getElectronAPI();
  const capacitorPlugins = getCapacitorPlugins();

  const isNative = platform === "electron" || platform === "capacitor";

  async function ensureAppFolder(): Promise<string> {
    if (platform === "electron" && electronAPI?.getAppFolder) {
      return electronAPI.getAppFolder();
    }
    if (platform === "capacitor" && capacitorPlugins?.Filesystem) {
      const dir = "DivergenceIQ";
      try {
        await capacitorPlugins.Filesystem.mkdir({
          path: dir,
          directory: "DOCUMENTS",
          recursive: true,
        });
      } catch {
        /* may already exist */
      }
      return dir;
    }
    // Web fallback — use a virtual folder name
    return "DivergenceIQ";
  }

  return {
    platform,
    isNative,

    async listFiles(dirPath: string): Promise<DeviceFile[]> {
      if (platform === "electron" && electronAPI?.listFiles) {
        return electronAPI.listFiles(dirPath);
      }
      if (platform === "capacitor" && capacitorPlugins?.Filesystem) {
        const result = await capacitorPlugins.Filesystem.readdir({
          path: dirPath,
          directory: "DOCUMENTS",
        });
        return result.files.map((f: any) => ({
          name: f.name,
          path: `${dirPath}/${f.name}`,
          size: f.size || 0,
          isDirectory: f.type === "directory",
          modified: f.mtime || 0,
        }));
      }
      // Web: File System Access API
      if (typeof window !== "undefined" && (window as any).showDirectoryPicker) {
        try {
          const dirHandle = await (window as any).showDirectoryPicker();
          const files: DeviceFile[] = [];
          for await (const entry of dirHandle.values()) {
            files.push({
              name: entry.name,
              path: `${dirPath}/${entry.name}`,
              size: 0,
              isDirectory: entry.kind === "directory",
              modified: 0,
            });
          }
          return files;
        } catch {
          return [];
        }
      }
      return [];
    },

    async readFile(filePath: string): Promise<ArrayBuffer> {
      if (platform === "electron" && electronAPI?.readBuffer) {
        const result = await electronAPI.readBuffer(filePath);
        if (result.ok) return result.data;
        throw new Error(result.error);
      }
      if (platform === "capacitor" && capacitorPlugins?.Filesystem) {
        const result = await capacitorPlugins.Filesystem.readFile({
          path: filePath,
          directory: "DOCUMENTS",
        });
        return result.data instanceof ArrayBuffer
          ? result.data
          : new Uint8Array(result.data).buffer;
      }
      throw new Error("File reading not supported on this platform");
    },

    async writeFile(filePath: string, data: ArrayBuffer): Promise<void> {
      if (platform === "electron" && electronAPI?.writeFile) {
        const result = await electronAPI.writeFile(filePath, data);
        if (!result.ok) throw new Error(result.error);
        return;
      }
      if (platform === "capacitor" && capacitorPlugins?.Filesystem) {
        // The Capacitor Filesystem plugin requires a base64 string (or Blob),
        // not a raw ArrayBuffer — raw buffers reject on iOS/Android
        let base64: string;
        if (typeof btoa === "function") {
          const bytes = new Uint8Array(data);
          let binary = "";
          const CHUNK = 0x8000;
          for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
          }
          base64 = btoa(binary);
        } else {
          base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = String(reader.result ?? "");
              resolve(result.slice(result.indexOf(",") + 1));
            };
            reader.onerror = () => reject(new Error("base64 conversion failed"));
            reader.readAsDataURL(new Blob([data]));
          });
        }
        await capacitorPlugins.Filesystem.writeFile({
          path: filePath,
          data: base64,
          directory: "DOCUMENTS",
          recursive: true,
        });
        return;
      }
      // Web: File System Access API
      if (typeof window !== "undefined" && (window as any).showSaveFilePicker) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filePath.split("/").pop(),
        });
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
        return;
      }
      throw new Error("File writing not supported on this platform");
    },

    async deleteFile(filePath: string): Promise<void> {
      if (platform === "electron" && electronAPI?.deleteFile) {
        const result = await electronAPI.deleteFile(filePath);
        if (!result.ok) throw new Error(result.error);
        return;
      }
      if (platform === "capacitor" && capacitorPlugins?.Filesystem) {
        await capacitorPlugins.Filesystem.deleteFile({ path: filePath, directory: "DOCUMENTS" });
        return;
      }
      throw new Error("File deletion not supported on this platform");
    },

    async createDirectory(dirPath: string): Promise<void> {
      if (platform === "electron" && electronAPI?.createDirectory) {
        const result = await electronAPI.createDirectory(dirPath);
        if (!result.ok) throw new Error(result.error);
        return;
      }
      if (platform === "capacitor" && capacitorPlugins?.Filesystem) {
        try {
          await capacitorPlugins.Filesystem.mkdir({
            path: dirPath,
            directory: "DOCUMENTS",
            recursive: true,
          });
        } catch {
          /* may exist */
        }
        return;
      }
    },

    async pickFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null> {
      if (platform === "electron" && electronAPI?.openFile) {
        const result = await electronAPI.openFile(filters || []);
        return result.canceled ? null : result.filePaths[0];
      }
      // Web: File System Access API
      if (typeof window !== "undefined" && (window as any).showOpenFilePicker) {
        try {
          const [handle] = await (window as any).showOpenFilePicker({
            types:
              filters?.map((f) => ({
                description: f.name,
                accept: { "application/octet-stream": f.extensions.map((e) => `.${e}`) },
              })) || [],
          });
          return handle.name;
        } catch {
          return null;
        }
      }
      return null;
    },

    async pickDirectory(): Promise<string | null> {
      if (platform === "electron" && electronAPI?.openDirectory) {
        const result = await electronAPI.openDirectory();
        return result.canceled ? null : result.filePaths[0];
      }
      if (typeof window !== "undefined" && (window as any).showDirectoryPicker) {
        try {
          const handle = await (window as any).showDirectoryPicker();
          return handle.name;
        } catch {
          return null;
        }
      }
      return null;
    },

    async getAppFolder(): Promise<string> {
      return ensureAppFolder();
    },

    async getStorageInfo(): Promise<AppStorageInfo> {
      const appFolder = await ensureAppFolder();
      if (platform === "electron" && electronAPI?.getStorageInfo) {
        return electronAPI.getStorageInfo();
      }
      // Web: Storage API
      if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        return {
          appFolder,
          usedBytes: est.usage || 0,
          quotaBytes: est.quota || 0,
          freeBytes: (est.quota || 0) - (est.usage || 0),
        };
      }
      return { appFolder, usedBytes: 0, quotaBytes: 0, freeBytes: 0 };
    },

    async getNetworkInfo(): Promise<NetworkInfo> {
      if (typeof navigator !== "undefined" && (navigator as any).connection) {
        const conn = (navigator as any).connection;
        return {
          online: navigator.onLine,
          type: conn.effectiveType || "unknown",
          downlink: conn.downlink || 0,
          rtt: conn.rtt || 0,
        };
      }
      return {
        online: typeof navigator !== "undefined" ? navigator.onLine : true,
        type: "unknown",
        downlink: 0,
        rtt: 0,
      };
    },

    async downloadFile(url: string, destPath: string): Promise<void> {
      if (platform === "electron" && electronAPI?.downloadFile) {
        const result = await electronAPI.downloadFile(url, destPath);
        if (!result.ok) throw new Error(result.error);
        return;
      }
      // Web/Capacitor: fetch + write
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const buffer = await response.arrayBuffer();
      await this.writeFile(destPath, buffer);
    },

    async openExternal(filePath: string): Promise<void> {
      if (platform === "electron" && electronAPI?.openExternal) {
        await electronAPI.openExternal(filePath);
        return;
      }
      // Web: open in new tab
      if (typeof window !== "undefined") {
        window.open(filePath, "_blank");
      }
    },
  };
}

let _bridge: NativeBridge | null = null;
export function getNativeBridge(): NativeBridge {
  if (!_bridge) _bridge = createNativeBridge();
  return _bridge;
}
