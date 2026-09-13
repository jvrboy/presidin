// media-pro.ts — Pure functions for professional media editing (curves, scopes, match frame, node compositing, proxy, batch, presets, versions, collaboration, cloud render).

export type CurveChannel = "RGB" | "R" | "G" | "B";

export interface CurvesResult {
  channel: string;
  points: [number, number][];
  histogram: number[];
}

export function adjustCurves(channel: string, points: [number, number][]): CurvesResult {
  const validChannels: CurveChannel[] = ["RGB", "R", "G", "B"];
  if (!validChannels.includes(channel as CurveChannel)) {
    throw new Error(`Invalid channel: ${channel}. Valid: ${validChannels.join(", ")}`);
  }
  // Generate a simple 256-bin histogram from the curve points
  const histogram: number[] = new Array(256).fill(0);
  for (const [x, y] of points) {
    const idx = Math.min(255, Math.max(0, Math.round(x)));
    histogram[idx] = y;
  }
  return { channel, points, histogram };
}

export type ScopeType = "waveform" | "vectorscope" | "rgb-parade";

export interface ScopeResult {
  scope: string;
  data: number[];
  broadcastSafe: boolean;
}

export function getScopes(scope: string): ScopeResult {
  const validScopes: ScopeType[] = ["waveform", "vectorscope", "rgb-parade"];
  if (!validScopes.includes(scope as ScopeType)) {
    throw new Error(`Invalid scope: ${scope}. Valid: ${validScopes.join(", ")}`);
  }
  const data: number[] = new Array(128)
    .fill(0)
    .map((_, i) => Math.round(Math.sin((i / 128) * Math.PI) * 100));
  return {
    scope,
    data,
    broadcastSafe: data.every((v) => v >= 0 && v <= 100),
  };
}

export type MatchType = "exposure" | "color" | "both";

export interface MatchFrameResult {
  matchType: string;
  adjustments: Record<string, number>;
}

export function matchFrame(
  sourceId: string,
  targetId: string,
  matchType: string,
): MatchFrameResult {
  const validTypes: MatchType[] = ["exposure", "color", "both"];
  if (!validTypes.includes(matchType as MatchType)) {
    throw new Error(`Invalid match type: ${matchType}. Valid: ${validTypes.join(", ")}`);
  }
  const adjustments: Record<string, number> = {};
  if (matchType === "exposure" || matchType === "both") {
    adjustments.exposure = 0.3;
    adjustments.contrast = -0.1;
  }
  if (matchType === "color" || matchType === "both") {
    adjustments.temperature = 150;
    adjustments.tint = -20;
    adjustments.saturation = 0.05;
  }
  // sourceId/targetId used for lookup in a real app; here they validate non-empty
  if (!sourceId || !targetId) {
    throw new Error("sourceId and targetId are required");
  }
  return { matchType, adjustments };
}

export interface CompositeNode {
  id: string;
  type: string;
  inputs: string[];
}

export interface NodeCompositeResult {
  nodeCount: number;
  connectionCount: number;
  renderOrder: string[];
}

export function nodeComposite(
  nodes: CompositeNode[],
  connections: [string, string][],
): NodeCompositeResult {
  // Topological sort for render order
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const node of nodes) {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  }
  for (const [from, to] of connections) {
    adj.get(from)?.push(to);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }
  const renderOrder: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    renderOrder.push(id);
    for (const neighbor of adj.get(id) ?? []) {
      inDegree.set(neighbor, (inDegree.get(neighbor) ?? 1) - 1);
      if (inDegree.get(neighbor) === 0) queue.push(neighbor);
    }
  }
  return {
    nodeCount: nodes.length,
    connectionCount: connections.length,
    renderOrder,
  };
}

export interface ProxyResult {
  originalRes: string;
  proxyRes: string;
  compressionRatio: number;
}

export function proxyWorkflow(originalRes: string, proxyRes: string): ProxyResult {
  const parseRes = (res: string): number => {
    const m = res.match(/(\d+)p/);
    return m ? parseInt(m[1], 10) : 1080;
  };
  const orig = parseRes(originalRes);
  const proxy = parseRes(proxyRes);
  const ratio = orig / proxy;
  return { originalRes, proxyRes, compressionRatio: Math.round(ratio * 100) / 100 };
}

export interface BatchResult {
  count: number;
  operation: string;
  estimatedTime: number;
  status: string;
}

export function batchProcess(count: number, operation: string): BatchResult {
  const timePerOp = 3; // seconds per item
  return {
    count,
    operation,
    estimatedTime: count * timePerOp,
    status: "queued",
  };
}

export type PresetType = "edit-recipe" | "lut" | "effect-stack";

export interface PresetResult {
  name: string;
  type: string;
  saved: boolean;
}

export function savePreset(
  name: string,
  type: string,
  data: Record<string, unknown>,
): PresetResult {
  const validTypes: PresetType[] = ["edit-recipe", "lut", "effect-stack"];
  if (!validTypes.includes(type as PresetType)) {
    throw new Error(`Invalid preset type: ${type}. Valid: ${validTypes.join(", ")}`);
  }
  if (!name) {
    throw new Error("Preset name is required");
  }
  // data is accepted but in a pure function we just confirm it's non-empty
  const saved = Object.keys(data).length > 0;
  return { name, type, saved };
}

let versionCounter = 0;

export interface VersionSnapshot {
  id: string;
  label: string;
  timestamp: number;
  branchable: boolean;
}

export function versionSnapshot(label: string): VersionSnapshot {
  versionCounter += 1;
  return {
    id: `v-${Date.now()}-${versionCounter}`,
    label,
    timestamp: Date.now(),
    branchable: true,
  };
}

export type CollabAction = "join" | "comment" | "edit" | "leave";

export interface CollaborationEvent {
  action: string;
  userId: string;
  timestamp: number;
}

export function collaborate(action: string, userId: string): CollaborationEvent {
  const validActions: CollabAction[] = ["join", "comment", "edit", "leave"];
  if (!validActions.includes(action as CollabAction)) {
    throw new Error(`Invalid action: ${action}. Valid: ${validActions.join(", ")}`);
  }
  if (!userId) {
    throw new Error("userId is required");
  }
  return { action, userId, timestamp: Date.now() };
}

export interface CloudRenderResult {
  format: string;
  resolution: string;
  estimatedCost: number;
  status: string;
}

export function cloudRender(format: string, resolution: string): CloudRenderResult {
  const resNum = parseInt(resolution.replace(/\D/g, ""), 10) || 1080;
  const baseCost = (resNum / 1080) * 0.5;
  const formatMultiplier = format === "prores" ? 2 : format === "exr" ? 3 : 1;
  return {
    format,
    resolution,
    estimatedCost: Math.round(baseCost * formatMultiplier * 100) / 100,
    status: "estimated",
  };
}

export const PRO_MEDIA_TOOLS = [
  {
    name: "adjustCurves",
    label: "Adjust Curves",
    description: "Adjust RGB/R/G/B curves with histogram output",
  },
  {
    name: "getScopes",
    label: "Get Scopes",
    description: "Read waveform, vectorscope, or RGB parade with broadcast-safe check",
  },
  {
    name: "matchFrame",
    label: "Match Frame",
    description: "Match exposure, color, or both between two clips",
  },
  {
    name: "nodeComposite",
    label: "Node Composite",
    description: "Composite via node graph with topological render order",
  },
  {
    name: "proxyWorkflow",
    label: "Proxy Workflow",
    description: "Calculate proxy compression ratio from resolutions",
  },
  {
    name: "batchProcess",
    label: "Batch Process",
    description: "Queue a batch operation with estimated time",
  },
  {
    name: "savePreset",
    label: "Save Preset",
    description: "Save an edit-recipe, LUT, or effect-stack preset",
  },
  {
    name: "versionSnapshot",
    label: "Version Snapshot",
    description: "Create a branchable version snapshot",
  },
  {
    name: "collaborate",
    label: "Collaborate",
    description: "Log a collaboration event (join, comment, edit, leave)",
  },
  {
    name: "cloudRender",
    label: "Cloud Render",
    description: "Estimate cloud render cost by format and resolution",
  },
];
