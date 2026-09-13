// Pure functions for screen recording configuration and post-processing.
// No side effects — every function returns a fresh value derived from its inputs.

export type CursorStyle = "circle" | "ring" | "spotlight";

export type TrimSplitMergeAction = "trim" | "split" | "merge";

export type FillerWord = "um" | "uh" | "like" | "you-know";

export type CropMode = string;

export type ExportRatio = "16:9" | "9:16" | "1:1";

export interface RecordingConfig {
  webcam: boolean;
  micAudio: boolean;
  systemAudio: boolean;
}

export interface StartRecordingResult {
  config: Record<string, boolean>;
  status: string;
  recordingId: string;
}

export interface KeystrokeVisualizerResult {
  enabled: boolean;
  keys: string[];
}

export interface GreenScreenResult {
  enabled: boolean;
  bgImage: string;
  matte: string;
}

export interface CursorHighlightResult {
  style: string;
  rippleOnClick: boolean;
}

export interface ZoomFollowResult {
  enabled: boolean;
  zoomLevel: number;
}

export interface TrimSplitMergeResult {
  action: string;
  params: Record<string, number>;
}

export interface SilenceRemoveResult {
  threshold: number;
  removed: number;
}

export interface FillerCutResult {
  words: string[];
  removed: number;
}

export interface ChapterMarker {
  time: number;
  label: string;
}

export interface ChapterMarkersResult {
  markers: ChapterMarker[];
  count: number;
}

export interface TranscriptionResult {
  speakerLabels: boolean;
  segments: number;
  words: number;
}

export interface FaceTrackingResult {
  cropMode: string;
  tracked: boolean;
}

export interface MultiSceneResult {
  scenes: string[];
  hotkeys: string[];
}

export interface DrawAnnotateResult {
  enabled: boolean;
  color: string;
}

export interface MultiExportResult {
  ratios: string[];
  outputs: number;
}

export interface CaptionBurnResult {
  style: string;
  burned: boolean;
}

export interface ToTutorialResult {
  steps: number;
  documentFormat: string;
}

export interface FaceBlurResult {
  enabled: boolean;
  blurType: string;
}

const VALID_CURSOR_STYLES: CursorStyle[] = ["circle", "ring", "spotlight"];

const VALID_TRIM_ACTIONS: TrimSplitMergeAction[] = ["trim", "split", "merge"];

const VALID_FILLER_WORDS: FillerWord[] = ["um", "uh", "like", "you-know"];

const VALID_EXPORT_RATIOS: ExportRatio[] = ["16:9", "9:16", "1:1"];

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

function assertValid(value: string, allowed: readonly string[], label: string): void {
  if (!allowed.includes(value as never)) {
    throw new Error(`Invalid ${label}: "${value}". Allowed: ${allowed.join(", ")}`);
  }
}

function assertValidList(values: string[], allowed: readonly string[], label: string): void {
  if (!Array.isArray(values)) {
    throw new Error(`${label} must be an array`);
  }
  for (const v of values) {
    assertValid(v, allowed, label);
  }
}

export function startRecording(config: RecordingConfig): StartRecordingResult {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("config must be a plain object");
  }
  return {
    config: {
      webcam: Boolean(config.webcam),
      micAudio: Boolean(config.micAudio),
      systemAudio: Boolean(config.systemAudio),
    },
    status: "recording",
    recordingId: `rec_${Math.random().toString(36).slice(2, 10)}`,
  };
}

export function keystrokeVisualizer(enabled: boolean): KeystrokeVisualizerResult {
  return { enabled: Boolean(enabled), keys: [] };
}

export function greenScreen(enabled: boolean, bgImage: string): GreenScreenResult {
  if (enabled) {
    assertNonEmpty(bgImage, "bgImage");
  }
  return {
    enabled: Boolean(enabled),
    bgImage: enabled ? bgImage : "",
    matte: enabled ? "chroma-key" : "none",
  };
}

export function cursorHighlight(style: string, rippleOnClick: boolean): CursorHighlightResult {
  assertValid(style, VALID_CURSOR_STYLES, "cursor style");
  return { style, rippleOnClick: Boolean(rippleOnClick) };
}

export function zoomFollow(enabled: boolean, zoomLevel: number): ZoomFollowResult {
  if (enabled) {
    if (!Number.isFinite(zoomLevel) || zoomLevel < 1 || zoomLevel > 4) {
      throw new Error("zoomLevel must be between 1 and 4 when enabled");
    }
  }
  return { enabled: Boolean(enabled), zoomLevel: enabled ? zoomLevel : 1 };
}

export function trimSplitMerge(
  action: string,
  params: Record<string, number>,
): TrimSplitMergeResult {
  assertValid(action, VALID_TRIM_ACTIONS, "trim/split/merge action");
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new Error("params must be a plain object");
  }
  for (const [k, v] of Object.entries(params)) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`param "${k}" must be a finite number`);
    }
  }
  return { action, params: { ...params } };
}

export function silenceRemove(threshold: number): SilenceRemoveResult {
  if (!Number.isFinite(threshold) || threshold < -60 || threshold > 0) {
    throw new Error("threshold must be in dBFS between -60 and 0");
  }
  return { threshold, removed: 0 };
}

export function fillerCut(words: string[]): FillerCutResult {
  assertValidList(words, VALID_FILLER_WORDS, "filler word");
  return { words: [...words], removed: words.length };
}

export function chapterMarkers(markers: ChapterMarker[]): ChapterMarkersResult {
  if (!Array.isArray(markers)) {
    throw new Error("markers must be an array");
  }
  for (const m of markers) {
    assertPositive(m.time, "marker time");
    assertNonEmpty(m.label, "marker label");
  }
  return {
    markers: markers.map((m) => ({ ...m })),
    count: markers.length,
  };
}

export function transcription(speakerLabels: boolean): TranscriptionResult {
  return {
    speakerLabels: Boolean(speakerLabels),
    segments: 0,
    words: 0,
  };
}

export function faceTracking(cropMode: string): FaceTrackingResult {
  assertNonEmpty(cropMode, "cropMode");
  return { cropMode, tracked: true };
}

export function multiScene(scenes: string[]): MultiSceneResult {
  if (!Array.isArray(scenes)) {
    throw new Error("scenes must be an array");
  }
  for (const s of scenes) {
    assertNonEmpty(s, "scene");
  }
  const hotkeys = scenes.map((_, i) => `F${i + 1}`);
  return { scenes: [...scenes], hotkeys };
}

export function drawAnnotate(enabled: boolean, color: string): DrawAnnotateResult {
  if (enabled) {
    assertNonEmpty(color, "color");
  }
  return { enabled: Boolean(enabled), color: enabled ? color : "#ffffff" };
}

export function multiExport(ratios: string[]): MultiExportResult {
  assertValidList(ratios, VALID_EXPORT_RATIOS, "export ratio");
  return { ratios: [...ratios], outputs: ratios.length };
}

export function captionBurn(style: string): CaptionBurnResult {
  assertNonEmpty(style, "style");
  return { style, burned: true };
}

export function toTutorial(steps: number): ToTutorialResult {
  assertPositive(steps, "steps");
  return { steps, documentFormat: "markdown" };
}

export function faceBlur(enabled: boolean): FaceBlurResult {
  return { enabled: Boolean(enabled), blurType: enabled ? "gaussian" : "none" };
}

export interface ScreenRecordTool {
  name: string;
  description: string;
  parameters: string[];
}

export const SCREEN_RECORD_TOOLS: ScreenRecordTool[] = [
  {
    name: "startRecording",
    description: "Start a screen recording with webcam, mic, and system audio options.",
    parameters: ["config"],
  },
  {
    name: "keystrokeVisualizer",
    description: "Toggle on-screen keystroke visualization.",
    parameters: ["enabled"],
  },
  {
    name: "greenScreen",
    description: "Enable green screen with a background image and chroma-key matte.",
    parameters: ["enabled", "bgImage"],
  },
  {
    name: "cursorHighlight",
    description: "Highlight the cursor with circle, ring, or spotlight style.",
    parameters: ["style", "rippleOnClick"],
  },
  {
    name: "zoomFollow",
    description: "Zoom and follow the cursor at a given zoom level.",
    parameters: ["enabled", "zoomLevel"],
  },
  {
    name: "trimSplitMerge",
    description: "Trim, split, or merge recording segments.",
    parameters: ["action", "params"],
  },
  {
    name: "silenceRemove",
    description: "Remove silent segments below a dBFS threshold.",
    parameters: ["threshold"],
  },
  {
    name: "fillerCut",
    description: "Cut filler words (um, uh, like, you-know) from the recording.",
    parameters: ["words"],
  },
  {
    name: "chapterMarkers",
    description: "Add chapter markers at specified times with labels.",
    parameters: ["markers"],
  },
  {
    name: "transcription",
    description: "Transcribe audio with optional speaker labels.",
    parameters: ["speakerLabels"],
  },
  {
    name: "faceTracking",
    description: "Enable face-tracking auto-crop.",
    parameters: ["cropMode"],
  },
  {
    name: "multiScene",
    description: "Configure multiple scenes with hotkeys.",
    parameters: ["scenes"],
  },
  {
    name: "drawAnnotate",
    description: "Draw annotations on the recording with a chosen color.",
    parameters: ["enabled", "color"],
  },
  {
    name: "multiExport",
    description: "Export the recording in multiple aspect ratios.",
    parameters: ["ratios"],
  },
  {
    name: "captionBurn",
    description: "Burn captions into the recording with a given style.",
    parameters: ["style"],
  },
  {
    name: "toTutorial",
    description: "Convert the recording into a step-by-step tutorial document.",
    parameters: ["steps"],
  },
  {
    name: "faceBlur",
    description: "Blur faces in the recording using gaussian blur.",
    parameters: ["enabled"],
  },
];
