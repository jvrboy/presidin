// media-creative.ts — Pure functions for creative media tooling (layers, masks, shapes, text, transitions, split screen, chroma key, duotone, vignette, grain).

export type LayerType =
  | "raster"
  | "vector"
  | "adjustment"
  | "smart-object"
  | "clipping-mask"
  | "group";

export interface Layer {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  opacity: number;
}

let layerCounter = 0;

export function createLayer(name: string, type: string): Layer {
  const validTypes: LayerType[] = [
    "raster",
    "vector",
    "adjustment",
    "smart-object",
    "clipping-mask",
    "group",
  ];
  if (!validTypes.includes(type as LayerType)) {
    throw new Error(`Invalid layer type: ${type}. Valid: ${validTypes.join(", ")}`);
  }
  layerCounter += 1;
  return {
    id: `layer-${Date.now()}-${layerCounter}`,
    name,
    type,
    visible: true,
    opacity: 100,
  };
}

export type MaskType = "brush" | "gradient" | "radial" | "luminosity" | "ai-subject";

export interface Mask {
  type: string;
  params: Record<string, number>;
  animated: boolean;
}

export function createMask(type: string, params: Record<string, number>): Mask {
  const validTypes: MaskType[] = ["brush", "gradient", "radial", "luminosity", "ai-subject"];
  if (!validTypes.includes(type as MaskType)) {
    throw new Error(`Invalid mask type: ${type}. Valid: ${validTypes.join(", ")}`);
  }
  return {
    type,
    params,
    animated: false,
  };
}

export interface BlendIfResult {
  range: string;
  channel: string;
  values: Record<string, [number, number]>;
}

export function blendIf(
  range: string,
  channel: string,
  values: { thisLayer: [number, number]; underlyingLayer: [number, number] },
): BlendIfResult {
  return {
    range,
    channel,
    values: {
      thisLayer: values.thisLayer,
      underlyingLayer: values.underlyingLayer,
    },
  };
}

export type ShapeType = "rectangle" | "ellipse" | "polygon" | "custom-path" | "pen-tool";

export interface ShapeResult {
  shape: string;
  params: Record<string, number>;
  path: string;
}

export function drawShape(shape: string, params: Record<string, number>): ShapeResult {
  const validShapes: ShapeType[] = ["rectangle", "ellipse", "polygon", "custom-path", "pen-tool"];
  if (!validShapes.includes(shape as ShapeType)) {
    throw new Error(`Invalid shape: ${shape}. Valid: ${validShapes.join(", ")}`);
  }
  const pathMap: Record<string, string> = {
    rectangle: `M0,0 L${params.width ?? 100},0 L${params.width ?? 100},${params.height ?? 100} L0,${params.height ?? 100} Z`,
    ellipse: `M${(params.width ?? 100) / 2},0 A${(params.width ?? 100) / 2},${(params.height ?? 100) / 2} 0 1,1 ${(params.width ?? 100) / 2},${params.height ?? 100} A${(params.width ?? 100) / 2},${(params.height ?? 100) / 2} 0 1,1 ${(params.width ?? 100) / 2},0 Z`,
    polygon: `M${(params.width ?? 100) / 2},0 L${params.width ?? 100},${(params.height ?? 100) / 2} L${(params.width ?? 100) / 2},${params.height ?? 100} L0,${(params.height ?? 100) / 2} Z`,
    "custom-path": `M0,0 C${params.cx1 ?? 25},${params.cy1 ?? 25} ${params.cx2 ?? 75},${params.cy2 ?? 75} ${params.width ?? 100},${params.height ?? 100}`,
    "pen-tool": `M${params.x1 ?? 0},${params.y1 ?? 0} L${params.x2 ?? 100},${params.y2 ?? 100}`,
  };
  return {
    shape,
    params,
    path: pathMap[shape] ?? "",
  };
}

export type TextAnimation = "kinetic" | "variable" | "static";

export interface TextOptions {
  content: string;
  font: string;
  size: number;
  animation: string;
  curvePath: boolean;
  threeD: boolean;
  behindSubject: boolean;
}

export function createText(options: TextOptions): Record<string, string | number | boolean> {
  const validAnimations: TextAnimation[] = ["kinetic", "variable", "static"];
  if (!validAnimations.includes(options.animation as TextAnimation)) {
    throw new Error(
      `Invalid text animation: ${options.animation}. Valid: ${validAnimations.join(", ")}`,
    );
  }
  return {
    content: options.content,
    font: options.font,
    size: options.size,
    animation: options.animation,
    curvePath: options.curvePath,
    threeD: options.threeD,
    behindSubject: options.behindSubject,
  };
}

export interface Sticker {
  stickerId: string;
  animated: boolean;
  position: { x: number; y: number };
}

export function addSticker(stickerId: string, animated: boolean): Sticker {
  return {
    stickerId,
    animated,
    position: { x: 50, y: 50 },
  };
}

export type TransitionType =
  | "cross-dissolve"
  | "whip-pan"
  | "zoom-blur"
  | "morph-cut"
  | "luma-fade"
  | "glitch"
  | "3d-flip";

export interface Transition {
  type: string;
  duration: number;
}

export function applyTransition(type: string, duration: number): Transition {
  const validTypes: TransitionType[] = [
    "cross-dissolve",
    "whip-pan",
    "zoom-blur",
    "morph-cut",
    "luma-fade",
    "glitch",
    "3d-flip",
  ];
  if (!validTypes.includes(type as TransitionType)) {
    throw new Error(`Invalid transition: ${type}. Valid: ${validTypes.join(", ")}`);
  }
  return { type, duration };
}

export type SplitLayout = "grid" | "pip" | "multi-cam";

export interface SplitScreenResult {
  layout: string;
  sources: number;
  gridSpec: string;
}

export function splitScreen(layout: string, sources: number): SplitScreenResult {
  const validLayouts: SplitLayout[] = ["grid", "pip", "multi-cam"];
  if (!validLayouts.includes(layout as SplitLayout)) {
    throw new Error(`Invalid layout: ${layout}. Valid: ${validLayouts.join(", ")}`);
  }
  const gridSpecMap: Record<string, string> = {
    grid: `repeat(${Math.ceil(Math.sqrt(sources))}, 1fr) / repeat(${Math.ceil(Math.sqrt(sources))}, 1fr)`,
    pip: `1fr 30% / 1fr 30%`,
    "multi-cam": `repeat(${sources}, 1fr) / 1fr`,
  };
  return {
    layout,
    sources,
    gridSpec: gridSpecMap[layout] ?? "1fr / 1fr",
  };
}

export interface ChromaKeyResult {
  keyColor: string;
  spillSuppression: number;
  edgeSoftness: number;
}

export function chromaKey(
  keyColor: string,
  spillSuppression: number,
  edgeSoftness: number,
): ChromaKeyResult {
  return { keyColor, spillSuppression, edgeSoftness };
}

export type DuotoneType = "duotone" | "tritone" | "gradient-map";

export interface DuotoneResult {
  shadowColor: string;
  highlightColor: string;
  type: string;
}

export function applyDuotone(
  shadowColor: string,
  highlightColor: string,
  type: string,
): DuotoneResult {
  const validTypes: DuotoneType[] = ["duotone", "tritone", "gradient-map"];
  if (!validTypes.includes(type as DuotoneType)) {
    throw new Error(`Invalid duotone type: ${type}. Valid: ${validTypes.join(", ")}`);
  }
  return { shadowColor, highlightColor, type };
}

export interface VignetteResult {
  amount: number;
  feather: number;
  centerX: number;
  centerY: number;
}

export function applyVignette(
  amount: number,
  feather: number,
  centerX: number,
  centerY: number,
): VignetteResult {
  return { amount, feather, centerX, centerY };
}

export interface GrainResult {
  amount: number;
  size: number;
  roughness: number;
  perChannel: boolean;
}

export function applyGrain(
  amount: number,
  size: number,
  roughness: number,
  perChannel: boolean,
): GrainResult {
  return { amount, size, roughness, perChannel };
}

export const CREATIVE_TOOLS = [
  {
    name: "createLayer",
    label: "Create Layer",
    description:
      "Create a new layer (raster, vector, adjustment, smart-object, clipping-mask, group)",
  },
  {
    name: "createMask",
    label: "Create Mask",
    description: "Create a mask (brush, gradient, radial, luminosity, ai-subject)",
  },
  {
    name: "blendIf",
    label: "Blend If",
    description: "Configure blend-if sliders for this/underlying layer ranges",
  },
  {
    name: "drawShape",
    label: "Draw Shape",
    description: "Draw a vector shape (rectangle, ellipse, polygon, custom-path, pen-tool)",
  },
  {
    name: "createText",
    label: "Create Text",
    description: "Create animated text with kinetic/variable/static animation, 3D, curve paths",
  },
  {
    name: "addSticker",
    label: "Add Sticker",
    description: "Add a sticker element at a position, optionally animated",
  },
  {
    name: "applyTransition",
    label: "Apply Transition",
    description:
      "Apply a transition (cross-dissolve, whip-pan, zoom-blur, morph-cut, luma-fade, glitch, 3d-flip)",
  },
  {
    name: "splitScreen",
    label: "Split Screen",
    description: "Create a split-screen layout (grid, pip, multi-cam)",
  },
  {
    name: "chromaKey",
    label: "Chroma Key",
    description: "Key out a color with spill suppression and edge softness",
  },
  {
    name: "applyDuotone",
    label: "Apply Duotone",
    description: "Apply duotone/tritone/gradient-map toning",
  },
  {
    name: "applyVignette",
    label: "Apply Vignette",
    description: "Apply a vignette with amount, feather, and center offset",
  },
  {
    name: "applyGrain",
    label: "Apply Grain",
    description: "Apply film grain with per-channel control",
  },
];
