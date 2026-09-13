import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useCallback } from "react";
import { ProCard, SectionHeader, StatTile, KpiGrid, MeterBar } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Folder,
  File,
  FileText,
  HardDrive,
  Wifi,
  Download,
  Upload,
  Trash,
  FolderPlus,
  RefreshCw,
  ExternalLink,
  FolderOpen,
  Cpu,
  Network,
  Save,
} from "lucide-react";
import {
  getNativeBridge,
  type DeviceFile,
  type NetworkInfo,
  type AppStorageInfo,
} from "@/lib/platform/native-bridge";
import { detectPlatform } from "@/lib/platform/model-loader";

export const Route = createFileRoute("/native-tools")({
  head: () => ({
    meta: [
      { title: "Native Device Tools — DivergenceIQ" },
      {
        name: "description",
        content: "Access device files, network, and local storage on desktop and mobile builds.",
      },
    ],
  }),
  component: NativeToolsPage,
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function NativeToolsPage() {
  const bridge = getNativeBridge();
  const platform = detectPlatform();
  const [files, setFiles] = useState<DeviceFile[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [appFolder, setAppFolder] = useState("");
  const [storage, setStorage] = useState<AppStorageInfo | null>(null);
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<DeviceFile | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const folder = await bridge.getAppFolder();
      setAppFolder(folder);
      setCurrentPath(folder);
      const fileList = await bridge.listFiles(folder);
      setFiles(fileList);
      const storageInfo = await bridge.getStorageInfo();
      setStorage(storageInfo);
      const netInfo = await bridge.getNetworkInfo();
      setNetwork(netInfo);
    } catch (e: any) {
      setError(e?.message || "Failed to access device storage");
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const browseDirectory = useCallback(
    async (dirPath: string) => {
      setLoading(true);
      setError(null);
      try {
        const fileList = await bridge.listFiles(dirPath);
        setFiles(fileList);
        setCurrentPath(dirPath);
      } catch (e: any) {
        setError(e?.message || "Failed to list directory");
      } finally {
        setLoading(false);
      }
    },
    [bridge],
  );

  const viewFile = useCallback(
    async (file: DeviceFile) => {
      setSelectedFile(file);
      setFileContent(null);
      try {
        const buffer = await bridge.readFile(file.path);
        const text = new TextDecoder().decode(buffer);
        setFileContent(text.substring(0, 5000));
      } catch (e: any) {
        setFileContent(`[Binary file — ${formatBytes(file.size)}]`);
      }
    },
    [bridge],
  );

  const deleteFile = useCallback(
    async (file: DeviceFile) => {
      try {
        await bridge.deleteFile(file.path);
        refresh();
      } catch (e: any) {
        setError(e?.message || "Failed to delete file");
      }
    },
    [bridge, refresh],
  );

  const createSubfolder = useCallback(async () => {
    const name = prompt("Folder name:");
    if (!name) return;
    try {
      await bridge.createDirectory(`${currentPath}/${name}`);
      refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to create folder");
    }
  }, [bridge, currentPath, refresh]);

  const uploadFile = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        await bridge.writeFile(`${currentPath}/${file.name}`, buffer);
        refresh();
      } catch (err: any) {
        setError(err?.message || "Upload failed");
      }
    };
    input.click();
  }, [bridge, currentPath, refresh]);

  const downloadUrl = useCallback(async () => {
    const url = prompt("Download URL:");
    if (!url) return;
    const filename = url.split("/").pop() || "download";
    try {
      await bridge.downloadFile(url, `${currentPath}/${filename}`);
      refresh();
    } catch (e: any) {
      setError(e?.message || "Download failed");
    }
  }, [bridge, currentPath, refresh]);

  const platformLabels: Record<string, string> = {
    web: "Web Browser",
    electron: "Electron Desktop",
    capacitor: "Capacitor Mobile",
    unknown: "Unknown",
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <SectionHeader
          title="Native Device Tools"
          subtitle="File system, network, and local storage access for desktop and mobile builds."
          icon={<HardDrive className="w-5 h-5" />}
          action={<Badge variant="outline">{platformLabels[platform]}</Badge>}
        />

        <KpiGrid
          tiles={[
            {
              label: "Platform",
              value: platformLabels[platform],
              sub: bridge.isNative ? "Native access" : "Web fallback",
              icon: <Cpu className="w-4 h-4" />,
              accent: "primary",
            },
            {
              label: "App Folder",
              value: appFolder ? appFolder.split("/").pop() || appFolder : "...",
              sub: appFolder,
              icon: <Folder className="w-4 h-4" />,
              accent: "primary",
            },
            {
              label: "Storage Used",
              value: storage ? formatBytes(storage.usedBytes) : "...",
              sub: storage ? `${formatBytes(storage.freeBytes)} free` : "",
              icon: <HardDrive className="w-4 h-4" />,
              accent: "neutral",
            },
            {
              label: "Network",
              value: network ? (network.online ? "Online" : "Offline") : "...",
              sub: network ? `${network.type} · ${network.rtt}ms` : "",
              icon: <Wifi className="w-4 h-4" />,
              accent: network?.online ? "bull" : "bear",
            },
          ]}
        />

        {error && (
          <div className="rounded-lg border border-bear/30 bg-bear/10 p-3 text-sm text-bear">
            {error}
          </div>
        )}

        <ProCard
          title="File Browser"
          description={`${currentPath || appFolder || "Loading..."} · ${files.length} items`}
          icon={<FolderOpen className="w-4 h-4" />}
          action={
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={refresh}
                disabled={loading}
                className="gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
              <Button size="sm" variant="outline" onClick={createSubfolder} className="gap-1.5">
                <FolderPlus className="w-3.5 h-3.5" /> New Folder
              </Button>
              <Button size="sm" variant="outline" onClick={uploadFile} className="gap-1.5">
                <Upload className="w-3.5 h-3.5" /> Upload
              </Button>
              <Button size="sm" variant="outline" onClick={downloadUrl} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> Download URL
              </Button>
            </div>
          }
        >
          {files.length === 0 && !loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No files found. This folder was created automatically for your app data.
            </div>
          ) : (
            <div className="space-y-1">
              {files.map((file) => (
                <div
                  key={file.path}
                  className={`flex items-center gap-3 p-2 rounded-lg transition-colors hover:bg-primary/5 ${selectedFile?.path === file.path ? "bg-primary/10" : ""}`}
                >
                  {file.isDirectory ? (
                    <Folder className="w-4 h-4 text-primary shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <button
                    className="flex-1 text-left text-sm truncate"
                    onClick={() => (file.isDirectory ? browseDirectory(file.path) : viewFile(file))}
                  >
                    {file.name}
                  </button>
                  <span className="text-xs text-muted-foreground font-mono shrink-0">
                    {file.size > 0 ? formatBytes(file.size) : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono shrink-0 hidden md:block">
                    {file.modified ? new Date(file.modified).toLocaleDateString() : "—"}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => bridge.openExternal(file.path)}
                      className="h-7 w-7 p-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteFile(file)}
                      className="h-7 w-7 p-0 text-bear hover:text-bear"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ProCard>

        {fileContent !== null && selectedFile && (
          <ProCard
            title={selectedFile.name}
            description={`${formatBytes(selectedFile.size)} · ${selectedFile.path}`}
            icon={<File className="w-4 h-4" />}
          >
            <pre className="text-xs font-mono bg-muted/30 rounded p-3 max-h-80 overflow-auto whitespace-pre-wrap">
              {fileContent}
            </pre>
          </ProCard>
        )}

        <ProCard
          title="Network Status"
          description="Real-time network connectivity and quality metrics."
          icon={<Network className="w-4 h-4" />}
        >
          {network && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTile
                  label="Status"
                  value={network.online ? "Online" : "Offline"}
                  accent={network.online ? "bull" : "bear"}
                />
                <StatTile label="Connection" value={network.type} accent="neutral" />
                <StatTile label="Downlink" value={`${network.downlink} Mbps`} accent="neutral" />
                <StatTile
                  label="Latency"
                  value={`${network.rtt} ms`}
                  accent={network.rtt < 100 ? "bull" : "warning"}
                />
              </div>
              <MeterBar
                value={Math.max(0, Math.min(100, 100 - network.rtt / 10))}
                label="Connection Quality"
                color={network.online ? "bull" : "bear"}
                showValue
              />
            </div>
          )}
        </ProCard>

        <ProCard
          title="Storage Info"
          description="Local storage usage and available space."
          icon={<Save className="w-4 h-4" />}
        >
          {storage && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <StatTile label="Used" value={formatBytes(storage.usedBytes)} accent="warning" />
                <StatTile label="Free" value={formatBytes(storage.freeBytes)} accent="bull" />
                <StatTile label="Total" value={formatBytes(storage.quotaBytes)} accent="neutral" />
              </div>
              {storage.quotaBytes > 0 && (
                <MeterBar
                  value={(storage.usedBytes / storage.quotaBytes) * 100}
                  label="Storage Usage"
                  color="primary"
                  showValue
                />
              )}
            </div>
          )}
        </ProCard>
      </div>
    </AppShell>
  );
}
