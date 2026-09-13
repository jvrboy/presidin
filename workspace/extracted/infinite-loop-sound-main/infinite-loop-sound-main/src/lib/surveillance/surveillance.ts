// Pure functions for camera / surveillance configuration and monitoring.
// No side effects — every function returns a fresh value derived from its inputs.

export type ObjectType = "person" | "vehicle" | "animal" | "package";

export type AnomalyType = "loitering" | "unusual-hours" | "sudden-motion";

export interface MotionZone {
  id: string;
  sensitivity: number;
}

export interface FaceEntry {
  id: string;
  name: string;
  type: string;
}

export interface PtzPreset {
  name: string;
  pan: number;
  tilt: number;
  zoom: number;
}

export interface CameraHealth {
  id: string;
  signal: number;
  uptime: number;
}

export interface DashboardInit {
  cameras: number;
  gridLayout: string;
  status: string;
}

export interface MotionZonesResult {
  zones: MotionZone[];
  active: number;
}

export interface ObjectFilterResult {
  types: string[];
  detected: Record<string, number>;
}

export interface FaceRecognitionResult {
  list: FaceEntry[];
  allowCount: number;
  denyCount: number;
}

export interface PlateReaderResult {
  plates: string[];
  logged: number;
}

export interface TimelineEventsResult {
  events: number;
  markers: { time: number; type: string }[];
}

export interface StorageConfigResult {
  retention: number;
  hybrid: boolean;
  estimatedSize: number;
}

export interface StreamingConfigResult {
  quality: string;
  adaptive: boolean;
  bitrate: number;
}

export interface PtzPresetResult {
  presets: PtzPreset[];
  patrolPath: string;
}

export interface AlertRoutingResult {
  channels: string[];
  quietHours: { start: string; end: string };
}

export interface AiSummaryResult {
  events: number;
  timeRange: string;
  summary: string;
}

export interface AnomalyDetectResult {
  types: string[];
  detected: number;
}

export interface HealthMonitorResult {
  cameras: (CameraHealth & { status: string })[];
}

export interface CrossTrackResult {
  objectId: string;
  cameras: string[];
  handoffs: number;
}

const VALID_OBJECT_TYPES: ObjectType[] = ["person", "vehicle", "animal", "package"];

const VALID_ANOMALY_TYPES: AnomalyType[] = ["loitering", "unusual-hours", "sudden-motion"];

const QUALITY_BITRATES: Record<string, number> = {
  low: 1_000_000,
  medium: 2_500_000,
  high: 5_000_000,
  ultra: 10_000_000,
};

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}

function assertValidList(values: string[], allowed: readonly string[], label: string): void {
  if (!Array.isArray(values)) {
    throw new Error(`${label} must be an array`);
  }
  for (const v of values) {
    if (!allowed.includes(v as never)) {
      throw new Error(`Invalid ${label} value: "${v}". Allowed: ${allowed.join(", ")}`);
    }
  }
}

export function dashboardInit(cameras: number): DashboardInit {
  assertPositive(cameras, "cameras");
  return {
    cameras,
    gridLayout: cameras <= 4 ? "2x2" : cameras <= 9 ? "3x3" : "4x4",
    status: "online",
  };
}

export function motionZones(zones: MotionZone[]): MotionZonesResult {
  if (!Array.isArray(zones)) {
    throw new Error("zones must be an array");
  }
  for (const z of zones) {
    assertNonEmpty(z.id, "zone id");
    if (!Number.isFinite(z.sensitivity) || z.sensitivity < 0 || z.sensitivity > 100) {
      throw new Error("zone sensitivity must be between 0 and 100");
    }
  }
  return {
    zones: zones.map((z) => ({ ...z })),
    active: zones.filter((z) => z.sensitivity > 0).length,
  };
}

export function objectFilter(types: string[]): ObjectFilterResult {
  assertValidList(types, VALID_OBJECT_TYPES, "object type");
  const detected: Record<string, number> = {};
  for (const t of types) {
    detected[t] = 0;
  }
  return { types: [...types], detected };
}

export function faceRecognition(list: FaceEntry[]): FaceRecognitionResult {
  if (!Array.isArray(list)) {
    throw new Error("list must be an array");
  }
  for (const e of list) {
    assertNonEmpty(e.id, "face id");
    assertNonEmpty(e.name, "face name");
    assertNonEmpty(e.type, "face type");
  }
  return {
    list: list.map((e) => ({ ...e })),
    allowCount: list.filter((e) => e.type === "allow").length,
    denyCount: list.filter((e) => e.type === "deny").length,
  };
}

export function plateReader(plates: string[]): PlateReaderResult {
  if (!Array.isArray(plates)) {
    throw new Error("plates must be an array");
  }
  for (const p of plates) {
    assertNonEmpty(p, "plate");
  }
  return { plates: [...plates], logged: plates.length };
}

export function timelineEvents(events: number): TimelineEventsResult {
  assertPositive(events, "events");
  const markers: { time: number; type: string }[] = [];
  for (let i = 0; i < Math.min(events, 10); i++) {
    markers.push({ time: Date.now() - i * 60_000, type: i % 2 === 0 ? "motion" : "object" });
  }
  return { events, markers };
}

export function storageConfig(retention: number, hybrid: boolean): StorageConfigResult {
  assertPositive(retention, "retention");
  return {
    retention,
    hybrid: Boolean(hybrid),
    estimatedSize: Math.round(retention * 1.5 * 1024),
  };
}

export function streamingConfig(quality: string, adaptive: boolean): StreamingConfigResult {
  assertNonEmpty(quality, "quality");
  const q = quality.toLowerCase();
  if (!(q in QUALITY_BITRATES)) {
    throw new Error(
      `Invalid quality: "${quality}". Allowed: ${Object.keys(QUALITY_BITRATES).join(", ")}`,
    );
  }
  return { quality: q, adaptive: Boolean(adaptive), bitrate: QUALITY_BITRATES[q] };
}

export function ptzPreset(presets: PtzPreset[]): PtzPresetResult {
  if (!Array.isArray(presets)) {
    throw new Error("presets must be an array");
  }
  for (const p of presets) {
    assertNonEmpty(p.name, "preset name");
    if (![0, 90, 180, 270].includes(p.pan)) {
      throw new Error("pan must be one of 0, 90, 180, 270");
    }
  }
  return {
    presets: presets.map((p) => ({ ...p })),
    patrolPath: presets.map((p) => p.name).join(" → ") || "none",
  };
}

export function alertRouting(
  channels: string[],
  quietHours: { start: string; end: string },
): AlertRoutingResult {
  if (!Array.isArray(channels)) {
    throw new Error("channels must be an array");
  }
  for (const c of channels) {
    assertNonEmpty(c, "channel");
  }
  if (!quietHours || typeof quietHours !== "object") {
    throw new Error("quietHours must be an object");
  }
  assertNonEmpty(quietHours.start, "quietHours.start");
  assertNonEmpty(quietHours.end, "quietHours.end");
  return {
    channels: [...channels],
    quietHours: { start: quietHours.start, end: quietHours.end },
  };
}

export function aiSummary(events: number, timeRange: string): AiSummaryResult {
  assertPositive(events, "events");
  assertNonEmpty(timeRange, "timeRange");
  return {
    events,
    timeRange,
    summary: `${events} notable events detected during ${timeRange}.`,
  };
}

export function anomalyDetect(types: string[]): AnomalyDetectResult {
  assertValidList(types, VALID_ANOMALY_TYPES, "anomaly type");
  return { types: [...types], detected: 0 };
}

export function healthMonitor(cameras: CameraHealth[]): HealthMonitorResult {
  if (!Array.isArray(cameras)) {
    throw new Error("cameras must be an array");
  }
  for (const c of cameras) {
    assertNonEmpty(c.id, "camera id");
    if (!Number.isFinite(c.signal) || c.signal < 0 || c.signal > 100) {
      throw new Error("camera signal must be between 0 and 100");
    }
    assertPositive(c.uptime, "camera uptime");
  }
  return {
    cameras: cameras.map((c) => ({
      ...c,
      status: c.signal > 75 ? "online" : c.signal > 25 ? "degraded" : "offline",
    })),
  };
}

export function crossTrack(objectId: string, cameras: string[]): CrossTrackResult {
  assertNonEmpty(objectId, "objectId");
  if (!Array.isArray(cameras)) {
    throw new Error("cameras must be an array");
  }
  for (const c of cameras) {
    assertNonEmpty(c, "camera id");
  }
  return {
    objectId,
    cameras: [...cameras],
    handoffs: Math.max(0, cameras.length - 1),
  };
}

export interface SurveillanceTool {
  name: string;
  description: string;
  parameters: string[];
}

export const SURVEILLANCE_TOOLS: SurveillanceTool[] = [
  {
    name: "dashboardInit",
    description: "Initialize the surveillance dashboard for N cameras.",
    parameters: ["cameras"],
  },
  {
    name: "motionZones",
    description: "Define motion detection zones with sensitivity levels.",
    parameters: ["zones"],
  },
  {
    name: "objectFilter",
    description: "Filter detected objects by type (person, vehicle, animal, package).",
    parameters: ["types"],
  },
  {
    name: "faceRecognition",
    description: "Manage allow/deny face recognition lists.",
    parameters: ["list"],
  },
  {
    name: "plateReader",
    description: "Log license plates captured by cameras.",
    parameters: ["plates"],
  },
  {
    name: "timelineEvents",
    description: "Generate a timeline of recent surveillance events.",
    parameters: ["events"],
  },
  {
    name: "storageConfig",
    description: "Configure retention days and hybrid (cloud+local) storage.",
    parameters: ["retention", "hybrid"],
  },
  {
    name: "streamingConfig",
    description: "Set streaming quality and adaptive bitrate.",
    parameters: ["quality", "adaptive"],
  },
  {
    name: "ptzPreset",
    description: "Define PTZ presets and generate a patrol path.",
    parameters: ["presets"],
  },
  {
    name: "alertRouting",
    description: "Route alerts to channels with quiet hours.",
    parameters: ["channels", "quietHours"],
  },
  {
    name: "aiSummary",
    description: "Generate an AI summary of events over a time range.",
    parameters: ["events", "timeRange"],
  },
  {
    name: "anomalyDetect",
    description: "Detect anomalies like loitering, unusual-hours, sudden-motion.",
    parameters: ["types"],
  },
  {
    name: "healthMonitor",
    description: "Monitor camera signal strength and uptime.",
    parameters: ["cameras"],
  },
  {
    name: "crossTrack",
    description: "Track an object across multiple cameras with handoff counting.",
    parameters: ["objectId", "cameras"],
  },
];
