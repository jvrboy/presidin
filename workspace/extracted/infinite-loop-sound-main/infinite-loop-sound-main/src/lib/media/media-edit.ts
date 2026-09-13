/**
 * media-edit.ts
 *
 * Pure functions for media editing operations: cropping, filtering, adjustments,
 * effects, background manipulation, trimming, image manipulation, layer blending,
 * object removal, and texture application. Each function is side-effect free and
 * returns a plain object describing the operation result.
 */

export interface ImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface CropResult {
  width: number;
  height: number;
  cropX: number;
  cropY: number;
}

export interface FilterResult {
  filter: string;
  intensity: number;
}

export interface AdjustmentParams {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
  clarity: number;
  dehaze: number;
  sharpness: number;
  noiseReduction: number;
}

export interface EffectResult {
  effect: string;
  intensity: number;
}

export interface BackgroundRemovalResult {
  matte: number[];
  edgeRefinement: boolean;
  transparentPng: boolean;
}

export interface BackgroundReplacementResult {
  type: string;
  source: string;
}

export interface TrimResult {
  start: number;
  end: number;
  mode: string;
}

export interface ManipulationResult {
  tool: string;
  params: Record<string, number>;
}

export interface MergeResult {
  mode: string;
  count: number;
}

export interface BlendResult {
  blendMode: string;
  opacity: number;
}

export interface ObjectRemovalResult {
  mode: string;
  pixelsRemoved: number;
}

export interface TextureResult {
  texture: string;
  blendMode: string;
  opacity: number;
}

const ASPECT_PRESETS: Record<string, (w: number, h: number) => { width: number; height: number }> =
  {
    "9:16": (w, h) => ({ width: Math.round((h * 9) / 16), height: h }),
    "16:9": (w, h) => ({ width: w, height: Math.round((w * 9) / 16) }),
    "1:1": (w, h) => {
      const s = Math.min(w, h);
      return { width: s, height: s };
    },
    "4:5": (w, h) => ({ width: Math.round((h * 4) / 5), height: h }),
    freeform: (w, h) => ({ width: w, height: h }),
  };

const FILTER_PRESETS = ["cinematic", "vintage", "film", "moody", "vibrant"] as const;

const EFFECTS = [
  "glow",
  "bloom",
  "chromatic aberration",
  "film grain",
  "light leaks",
  "glitch",
  "vhs",
  "prism",
  "tilt-shift",
  "motion blur",
  "radial blur",
] as const;

const BLEND_MODES = [
  "normal",
  "dissolve",
  "darken",
  "multiply",
  "color burn",
  "linear burn",
  "darker color",
  "lighten",
  "screen",
  "color dodge",
  "linear dodge (add)",
  "lighter color",
  "overlay",
  "soft light",
  "hard light",
  "vivid light",
  "linear light",
  "pin light",
  "hard mix",
  "difference",
  "exclusion",
  "subtract",
  "divide",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;

const TEXTURES = ["grain", "paper", "canvas", "fabric", "dust", "scratches", "bokeh"] as const;

/**
 * Crop an image to a target aspect ratio. The crop is centered on the source.
 */
export function cropImage(imageData: ImageData, aspect: string, _mode: string): CropResult {
  const preset = ASPECT_PRESETS[aspect] ?? ASPECT_PRESETS.freeform;
  const { width, height } = preset(imageData.width, imageData.height);
  const cropX = Math.round((imageData.width - width) / 2);
  const cropY = Math.round((imageData.height - height) / 2);
  return { width, height, cropX, cropY };
}

/**
 * Apply a named filter preset at a given intensity (0-100).
 */
export function applyFilter(filterName: string, intensity: number): FilterResult {
  const clamped = Math.max(0, Math.min(100, intensity));
  const name = (FILTER_PRESETS as readonly string[]).includes(filterName)
    ? filterName
    : "cinematic";
  return { filter: name, intensity: clamped };
}

/**
 * Apply tonal adjustments. Values are expected in the range -100 to 100
 * (exposure/temperature/tint) or 0 to 100 for the remainder. Out-of-range
 * values are clamped and returned as a normalized record.
 */
export function applyAdjustment(params: AdjustmentParams): Record<string, number> {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  return {
    exposure: clamp(params.exposure, -100, 100),
    contrast: clamp(params.contrast, -100, 100),
    highlights: clamp(params.highlights, -100, 100),
    shadows: clamp(params.shadows, -100, 100),
    temperature: clamp(params.temperature, -100, 100),
    tint: clamp(params.tint, -100, 100),
    vibrance: clamp(params.vibrance, -100, 100),
    saturation: clamp(params.saturation, -100, 100),
    clarity: clamp(params.clarity, 0, 100),
    dehaze: clamp(params.dehaze, 0, 100),
    sharpness: clamp(params.sharpness, 0, 100),
    noiseReduction: clamp(params.noiseReduction, 0, 100),
  };
}

/**
 * Apply a creative effect at a given intensity (0-100).
 */
export function applyEffect(effectName: string, intensity: number): EffectResult {
  const clamped = Math.max(0, Math.min(100, intensity));
  const name = (EFFECTS as readonly string[]).includes(effectName) ? effectName : "glow";
  return { effect: name, intensity: clamped };
}

/**
 * Remove the background from an image, producing a matte and a transparent PNG flag.
 */
export function removeBackground(imageData: ImageData): BackgroundRemovalResult {
  const pixelCount = imageData.width * imageData.height;
  const matte = new Array<number>(pixelCount)
    .fill(0)
    .map((_, i) => (imageData.data[i * 4 + 3] > 128 ? 255 : 0));
  return {
    matte,
    edgeRefinement: true,
    transparentPng: true,
  };
}

/**
 * Configure a background replacement of the given type.
 */
export function changeBackground(replacement: string): BackgroundReplacementResult {
  const validTypes = ["image", "video", "color", "gradient", "blurred", "ai-scene"];
  const type = validTypes.includes(replacement) ? replacement : "color";
  const source =
    type === "color"
      ? "#000000"
      : type === "gradient"
        ? "linear-gradient(135deg, #1e3a8a, #312e81)"
        : type === "blurred"
          ? "blur(24px)"
          : `bg://${type}`;
  return { type, source };
}

/**
 * Trim media between start and end timestamps using the specified edit mode.
 */
export function trimMedia(start: number, end: number, mode: string): TrimResult {
  const validModes = ["precise", "ripple", "slip", "slide", "silence-cut"];
  const normalizedMode = validModes.includes(mode) ? mode : "precise";
  const s = Math.max(0, Math.min(start, end));
  const e = Math.max(start, end);
  return { start: s, end: e, mode: normalizedMode };
}

/**
 * Apply a geometric image manipulation tool with numeric parameters.
 */
export function manipulateImage(tool: string, params: Record<string, number>): ManipulationResult {
  const validTools = ["warp", "liquify", "perspective", "lens-distortion", "mesh", "puppet-warp"];
  const normalizedTool = validTools.includes(tool) ? tool : "warp";
  const normalizedParams: Record<string, number> = {};
  for (const [key, value] of Object.entries(params)) {
    normalizedParams[key] = Math.max(-100, Math.min(100, value));
  }
  return { tool: normalizedTool, params: normalizedParams };
}

/**
 * Merge multiple media sources into a single composite.
 */
export function mergeMedia(sources: string[], mode: string): MergeResult {
  const validModes = ["combine", "panorama", "hdr", "stack"];
  const normalizedMode = validModes.includes(mode) ? mode : "combine";
  return { mode: normalizedMode, count: sources.length };
}

/**
 * Blend two layers using the specified blend mode and opacity.
 */
export function blendLayers(blendMode: string, opacity: number): BlendResult {
  const normalizedMode = (BLEND_MODES as readonly string[]).includes(blendMode)
    ? blendMode
    : "normal";
  const clampedOpacity = Math.max(0, Math.min(100, opacity));
  return { blendMode: normalizedMode, opacity: clampedOpacity };
}

/**
 * Remove objects within a mask region using the specified removal mode.
 */
export function removeObjects(mask: number[], mode: string): ObjectRemovalResult {
  const validModes = ["content-aware", "magic-eraser", "temporal-track"];
  const normalizedMode = validModes.includes(mode) ? mode : "content-aware";
  const pixelsRemoved = mask.reduce((acc, v) => (v > 0 ? acc + 1 : acc), 0);
  return { mode: normalizedMode, pixelsRemoved };
}

/**
 * Apply a texture overlay with a blend mode and opacity.
 */
export function applyTexture(
  textureName: string,
  blendMode: string,
  opacity: number,
): TextureResult {
  const normalizedTexture = (TEXTURES as readonly string[]).includes(textureName)
    ? textureName
    : "grain";
  const normalizedBlend = (BLEND_MODES as readonly string[]).includes(blendMode)
    ? blendMode
    : "overlay";
  const clampedOpacity = Math.max(0, Math.min(100, opacity));
  return {
    texture: normalizedTexture,
    blendMode: normalizedBlend,
    opacity: clampedOpacity,
  };
}

export interface MediaEditToolMeta {
  name: string;
  description: string;
  category: string;
}

/**
 * Metadata for every media editing tool surfaced in the UI.
 */
export const MEDIA_EDIT_TOOLS: MediaEditToolMeta[] = [
  { name: "crop", description: "Reframe and crop to aspect ratios", category: "geometry" },
  { name: "filter", description: "Apply cinematic and vintage looks", category: "color" },
  { name: "adjust", description: "Fine-tune exposure, contrast, and tone", category: "color" },
  {
    name: "effects",
    description: "Add creative effects like glow and glitch",
    category: "creative",
  },
  {
    name: "remove-background",
    description: "Isolate subjects with AI matting",
    category: "masking",
  },
  {
    name: "change-background",
    description: "Swap backgrounds with images or video",
    category: "masking",
  },
  { name: "trim", description: "Cut and trim media with ripple edits", category: "timeline" },
  { name: "manipulate", description: "Warp, liquify, and distort geometry", category: "geometry" },
  { name: "merge", description: "Combine, stitch, and stack sources", category: "compositing" },
  { name: "blend", description: "Blend layers with 28 blend modes", category: "compositing" },
  {
    name: "remove-objects",
    description: "Erase objects with content-aware fill",
    category: "masking",
  },
  {
    name: "texture",
    description: "Overlay grain, paper, and bokeh textures",
    category: "creative",
  },
];
