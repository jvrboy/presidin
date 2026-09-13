import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { ProCard, SectionHeader, KpiGrid, StatTile, MeterBar, DataPanel } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Camera,
  Eye,
  ScanFace,
  Car,
  Clock,
  HardDrive,
  Radio,
  Move,
  Bell,
  Brain,
  Activity,
  Heart,
  Crosshair,
} from "lucide-react";
import {
  dashboardInit,
  motionZones,
  objectFilter,
  faceRecognition,
  plateReader,
  timelineEvents,
  storageConfig,
  streamingConfig,
  ptzPreset,
  alertRouting,
  aiSummary,
  anomalyDetect,
  healthMonitor,
  crossTrack,
  SURVEILLANCE_TOOLS,
} from "@/lib/surveillance/surveillance";

export const Route = createFileRoute("/surveillance")({
  head: () => ({ meta: [{ title: "Surveillance | Infinite Loop Sound" }] }),
  component: SurveillancePage,
});

const OBJECT_TYPES = ["person", "vehicle", "animal", "package"] as const;
const ANOMALY_TYPES = ["loitering", "unusual-hours", "sudden-motion"] as const;

export default function SurveillancePage() {
  const [cameraCount, setCameraCount] = useState("8");
  const [zones, setZones] = useState([
    { id: "zone-1", sensitivity: 75 },
    { id: "zone-2", sensitivity: 50 },
  ]);
  const [selectedObjects, setSelectedObjects] = useState<string[]>(["person", "vehicle"]);
  const [faceList] = useState([
    { id: "f1", name: "Alice", type: "allow" },
    { id: "f2", name: "Unknown", type: "deny" },
  ]);
  const [plates] = useState(["ABC-123", "XYZ-789"]);
  const [retention, setRetention] = useState("30");
  const [hybrid, setHybrid] = useState(true);
  const [quality, setQuality] = useState("high");
  const [adaptive, setAdaptive] = useState(true);
  const [presets] = useState([
    { name: "Entrance", pan: 0, tilt: 0, zoom: 1 },
    { name: "Parking", pan: 90, tilt: 0, zoom: 2 },
  ]);
  const [channels, setChannels] = useState(["email", "sms"]);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("06:00");
  const [eventCount, setEventCount] = useState("42");
  const [timeRange, setTimeRange] = useState("last 24 hours");
  const [selectedAnomalies, setSelectedAnomalies] = useState<string[]>(["loitering"]);
  const [healthCameras] = useState([
    { id: "cam-1", signal: 92, uptime: 99 },
    { id: "cam-2", signal: 45, uptime: 87 },
  ]);
  const [trackObjectId, setTrackObjectId] = useState("obj-42");
  const [trackCameras, setTrackCameras] = useState(["cam-1", "cam-2", "cam-3"]);

  const dashboard = dashboardInit(Number(cameraCount) || 0);
  const motionResult = motionZones(zones);
  const objectResult = objectFilter(selectedObjects);
  const faceResult = faceRecognition(faceList);
  const plateResult = plateReader(plates);
  const timeline = timelineEvents(Number(eventCount) || 0);
  const storage = storageConfig(Number(retention) || 0, hybrid);
  const streaming = streamingConfig(quality, adaptive);
  const ptz = ptzPreset(presets);
  const alerts = alertRouting(channels, { start: quietStart, end: quietEnd });
  const summary = aiSummary(Number(eventCount) || 0, timeRange);
  const anomalies = anomalyDetect(selectedAnomalies);
  const health = healthMonitor(healthCameras);
  const tracking = crossTrack(trackObjectId, trackCameras);

  const toggle = (list: string[], item: string, setter: (v: string[]) => void) =>
    setter(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="Surveillance"
          subtitle="Camera grid, AI detection, and monitoring"
          icon={<Camera className="h-5 w-5" />}
        />
        <KpiGrid>
          <StatTile label="Cameras" value={String(dashboard.cameras)} />
          <StatTile label="Grid Layout" value={dashboard.gridLayout} />
          <StatTile label="Active Zones" value={String(motionResult.active)} />
          <StatTile label="Status" value={dashboard.status} />
        </KpiGrid>

        <ProCard
          title="Camera Grid"
          description="Dashboard layout configuration"
          icon={<Camera className="h-4 w-4" />}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cam-count">Camera Count</Label>
              <Input
                id="cam-count"
                type="number"
                value={cameraCount}
                onChange={(e) => setCameraCount(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
              {Array.from({ length: Math.min(dashboard.cameras, 16) }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-md border border-border bg-muted/30 flex items-center justify-center"
                >
                  <Camera className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
            <Badge variant="secondary">Layout: {dashboard.gridLayout}</Badge>
          </div>
        </ProCard>

        <ProCard
          title="Motion Zones"
          description="Define sensitivity per zone"
          icon={<Activity className="h-4 w-4" />}
        >
          <div className="space-y-3">
            {motionResult.zones.map((z) => (
              <div key={z.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-mono">{z.id}</span>
                  <span>{z.sensitivity}%</span>
                </div>
                <MeterBar label={z.id} value={z.sensitivity} max={100} format={(v) => `${v}%`} />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setZones([...zones, { id: `zone-${zones.length + 1}`, sensitivity: 50 }])
              }
            >
              Add Zone
            </Button>
          </div>
        </ProCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="Object Filter"
            description="Filter detected objects by type"
            icon={<Eye className="h-4 w-4" />}
          >
            <div className="flex flex-wrap gap-2">
              {OBJECT_TYPES.map((t) => (
                <Button
                  key={t}
                  variant={selectedObjects.includes(t) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggle(selectedObjects, t, setSelectedObjects)}
                >
                  {t}
                </Button>
              ))}
            </div>
            <DataPanel className="mt-4">
              <pre className="text-xs">{JSON.stringify(objectResult.detected, null, 2)}</pre>
            </DataPanel>
          </ProCard>
          <ProCard
            title="Face Recognition"
            description="Allow / deny lists"
            icon={<ScanFace className="h-4 w-4" />}
          >
            <div className="space-y-2">
              {faceResult.list.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-md border border-border p-2"
                >
                  <span className="text-sm">{f.name}</span>
                  <Badge variant={f.type === "allow" ? "default" : "destructive"}>{f.type}</Badge>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-4 text-sm">
              <span>Allow: {faceResult.allowCount}</span>
              <span>Deny: {faceResult.denyCount}</span>
            </div>
          </ProCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="Plate Reader"
            description="Logged license plates"
            icon={<Car className="h-4 w-4" />}
          >
            <div className="space-y-2">
              {plateResult.plates.map((p) => (
                <div key={p} className="rounded-md border border-border p-2 font-mono text-sm">
                  {p}
                </div>
              ))}
              <p className="text-sm text-muted-foreground">{plateResult.logged} plate(s) logged</p>
            </div>
          </ProCard>
          <ProCard
            title="Timeline Events"
            description="Recent event markers"
            icon={<Clock className="h-4 w-4" />}
          >
            <div className="space-y-2">
              <Input
                type="number"
                value={eventCount}
                onChange={(e) => setEventCount(e.target.value)}
              />
              {timeline.markers.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{m.type}</Badge>
                  <span>{new Date(m.time).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </ProCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="Storage Config"
            description="Retention and hybrid storage"
            icon={<HardDrive className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="retention">Retention (days)</Label>
                <Input
                  id="retention"
                  type="number"
                  value={retention}
                  onChange={(e) => setRetention(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hybrid}
                  onChange={(e) => setHybrid(e.target.checked)}
                />{" "}
                Hybrid (cloud + local)
              </label>
              <DataPanel>
                <p className="text-sm">
                  Estimated size: {(storage.estimatedSize / 1024).toFixed(1)} GB
                </p>
              </DataPanel>
            </div>
          </ProCard>
          <ProCard
            title="Streaming Config"
            description="Quality and adaptive bitrate"
            icon={<Radio className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="quality">Quality</Label>
                <select
                  id="quality"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                >
                  {["low", "medium", "high", "ultra"].map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={adaptive}
                  onChange={(e) => setAdaptive(e.target.checked)}
                />{" "}
                Adaptive bitrate
              </label>
              <DataPanel>
                <p className="text-sm">
                  Bitrate: {(streaming.bitrate / 1_000_000).toFixed(1)} Mbps
                </p>
              </DataPanel>
            </div>
          </ProCard>
        </div>

        <ProCard
          title="PTZ Presets"
          description="Pan-tilt-zoom presets and patrol path"
          icon={<Move className="h-4 w-4" />}
        >
          <div className="space-y-2">
            {ptz.presets.map((p) => (
              <div
                key={p.name}
                className="flex items-center justify-between rounded-md border border-border p-2 text-sm"
              >
                <span>{p.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  pan:{p.pan}° tilt:{p.tilt}° zoom:{p.zoom}x
                </span>
              </div>
            ))}
            <DataPanel>
              <p className="text-sm">
                <span className="text-muted-foreground">Patrol path:</span> {ptz.patrolPath}
              </p>
            </DataPanel>
          </div>
        </ProCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="Alert Routing"
            description="Channels and quiet hours"
            icon={<Bell className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="channels">Channels (comma-separated)</Label>
                <Input
                  id="channels"
                  value={channels.join(", ")}
                  onChange={(e) => setChannels(e.target.value.split(",").map((c) => c.trim()))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quiet-start">Quiet Start</Label>
                  <Input
                    id="quiet-start"
                    value={quietStart}
                    onChange={(e) => setQuietStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quiet-end">Quiet End</Label>
                  <Input
                    id="quiet-end"
                    value={quietEnd}
                    onChange={(e) => setQuietEnd(e.target.value)}
                  />
                </div>
              </div>
              <DataPanel>
                <p className="text-sm">
                  Channels: {alerts.channels.join(", ")} | Quiet: {alerts.quietHours.start}–
                  {alerts.quietHours.end}
                </p>
              </DataPanel>
            </div>
          </ProCard>
          <ProCard
            title="AI Summary"
            description="Automated event summary"
            icon={<Brain className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="time-range">Time Range</Label>
                <Input
                  id="time-range"
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                />
              </div>
              <DataPanel>
                <p className="text-sm">{summary.summary}</p>
              </DataPanel>
            </div>
          </ProCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="Anomaly Detection"
            description="Detect suspicious patterns"
            icon={<Crosshair className="h-4 w-4" />}
          >
            <div className="flex flex-wrap gap-2">
              {ANOMALY_TYPES.map((t) => (
                <Button
                  key={t}
                  variant={selectedAnomalies.includes(t) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggle(selectedAnomalies, t, setSelectedAnomalies)}
                >
                  {t}
                </Button>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {anomalies.types.length} type(s) active
            </p>
          </ProCard>
          <ProCard
            title="Health Monitor"
            description="Camera signal and uptime"
            icon={<Heart className="h-4 w-4" />}
          >
            <div className="space-y-3">
              {health.cameras.map((c) => (
                <div key={c.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono">{c.id}</span>
                    <Badge
                      variant={
                        c.status === "online"
                          ? "default"
                          : c.status === "degraded"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {c.status}
                    </Badge>
                  </div>
                  <MeterBar label="Signal" value={c.signal} max={100} format={(v) => `${v}%`} />
                </div>
              ))}
            </div>
          </ProCard>
        </div>

        <ProCard
          title="Cross-Camera Tracking"
          description="Track an object across cameras"
          icon={<Crosshair className="h-4 w-4" />}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="track-obj">Object ID</Label>
              <Input
                id="track-obj"
                value={trackObjectId}
                onChange={(e) => setTrackObjectId(e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="track-cams">Cameras (comma-separated)</Label>
              <Input
                id="track-cams"
                value={trackCameras.join(", ")}
                onChange={(e) => setTrackCameras(e.target.value.split(",").map((c) => c.trim()))}
              />
            </div>
          </div>
          <DataPanel className="mt-4">
            <p className="text-sm">
              Tracking <span className="font-mono">{tracking.objectId}</span> across{" "}
              {tracking.cameras.length} camera(s) — {tracking.handoffs} handoff(s)
            </p>
          </DataPanel>
        </ProCard>

        <ProCard
          title="Available Tools"
          description={`${SURVEILLANCE_TOOLS.length} surveillance tools`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SURVEILLANCE_TOOLS.map((t) => (
              <div key={t.name} className="rounded-md border border-border p-3 space-y-1">
                <Badge variant="outline">{t.name}</Badge>
                <p className="text-xs text-muted-foreground">{t.description}</p>
                <p className="text-xs font-mono text-muted-foreground">
                  params: {t.parameters.join(", ")}
                </p>
              </div>
            ))}
          </div>
        </ProCard>
      </div>
    </AppShell>
  );
}
