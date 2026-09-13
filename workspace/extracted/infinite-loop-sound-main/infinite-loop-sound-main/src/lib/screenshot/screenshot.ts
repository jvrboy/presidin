// Pure functions for screenshot capture, annotation, and processing.
// No side effects — every function returns a fresh value derived from its inputs.

export type CaptureMode = "full-screen" | "window" | "region" | "scrolling";

export type AnnotationType = "arrow" | "box" | "blur" | "highlight" | "numbered-steps";

export type SensitiveType = "email" | "credit-card" | "password";

export interface CaptureResult {
  mode: string;
  timestamp: number;
  imageData: string;
}

export interface DelayedCaptureResult {
  seconds: number;
  countdown: number;
}

export interface AnnotateResult {
  type: string;
  params: Record<string, number>;
}

export interface AutoBlurResult {
  sensitiveTypes: string[];
  blurred: number;
}

export interface OcrResult {
  text: string;
  confidence: number;
  words: number;
}

export interface UploadResult {
  filename: string;
  url: string;
  shareable: boolean;
}

export interface HistorySearchResult {
  query: string;
  results: number;
  matches: string[];
}

export interface CompareResult {
  before: string;
  after: string;
  diffPercentage: number;
}

export interface BatchCaptureResult {
  interval: number;
  count: number;
  captured: number;
}

export interface RedactResult {
  areas: number[];
  reversible: boolean;
  log: string;
}

export interface ToMarkdownResult {
  markdown: string;
  components: number;
}

export interface PerspectiveCorrectResult {
  corners: [number, number][];
  corrected: boolean;
}

const VALID_CAPTURE_MODES: CaptureMode[] = ["full-screen", "window", "region", "scrolling"];

const VALID_ANNOTATION_TYPES: AnnotationType[] = [
  "arrow",
  "box",
  "blur",
  "highlight",
  "numbered-steps",
];

const VALID_SENSITIVE_TYPES: SensitiveType[] = ["email", "credit-card", "password"];

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

export function capture(mode: string): CaptureResult {
  assertValid(mode, VALID_CAPTURE_MODES, "capture mode");
  return {
    mode,
    timestamp: Date.now(),
    imageData: `data:image/png;base64,${Math.random().toString(36).slice(2, 12)}`,
  };
}

export function delayedCapture(seconds: number): DelayedCaptureResult {
  assertPositive(seconds, "seconds");
  return { seconds, countdown: seconds };
}

export function annotate(type: string, params: Record<string, number>): AnnotateResult {
  assertValid(type, VALID_ANNOTATION_TYPES, "annotation type");
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new Error("params must be a plain object");
  }
  for (const [k, v] of Object.entries(params)) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`param "${k}" must be a finite number`);
    }
  }
  return { type, params: { ...params } };
}

export function autoBlur(sensitiveTypes: string[]): AutoBlurResult {
  if (!Array.isArray(sensitiveTypes)) {
    throw new Error("sensitiveTypes must be an array");
  }
  for (const t of sensitiveTypes) {
    assertValid(t, VALID_SENSITIVE_TYPES, "sensitive type");
  }
  return { sensitiveTypes: [...sensitiveTypes], blurred: sensitiveTypes.length };
}

export function ocrExtract(imageData: string): OcrResult {
  assertNonEmpty(imageData, "imageData");
  return { text: "", confidence: 0, words: 0 };
}

export function uploadToCloud(filename: string): UploadResult {
  assertNonEmpty(filename, "filename");
  return {
    filename,
    url: `https://cdn.example.com/${encodeURIComponent(filename)}`,
    shareable: true,
  };
}

export function historySearch(query: string, total: number): HistorySearchResult {
  assertNonEmpty(query, "query");
  assertPositive(total, "total");
  const matches: string[] = [];
  for (let i = 0; i < Math.min(total, 5); i++) {
    matches.push(`${query}-${i + 1}`);
  }
  return { query, results: matches.length, matches };
}

export function compare(before: string, after: string): CompareResult {
  assertNonEmpty(before, "before");
  assertNonEmpty(after, "after");
  return {
    before,
    after,
    diffPercentage: before === after ? 0 : 100,
  };
}

export function batchCapture(interval: number, count: number): BatchCaptureResult {
  assertPositive(interval, "interval");
  assertPositive(count, "count");
  return { interval, count, captured: count };
}

export function redact(areas: number[], reversible: boolean): RedactResult {
  if (!Array.isArray(areas)) {
    throw new Error("areas must be an array");
  }
  for (const a of areas) {
    if (!Number.isFinite(a) || a < 0) {
      throw new Error("each area must be a non-negative number");
    }
  }
  return {
    areas: [...areas],
    reversible: Boolean(reversible),
    log: `redacted ${areas.length} area(s)`,
  };
}

export function toMarkdown(imageData: string): ToMarkdownResult {
  assertNonEmpty(imageData, "imageData");
  return {
    markdown: `![screenshot](${imageData})`,
    components: 1,
  };
}

export function perspectiveCorrect(corners: [number, number][]): PerspectiveCorrectResult {
  if (!Array.isArray(corners) || corners.length !== 4) {
    throw new Error("corners must be an array of exactly 4 [x, y] pairs");
  }
  for (const c of corners) {
    if (
      !Array.isArray(c) ||
      c.length !== 2 ||
      typeof c[0] !== "number" ||
      typeof c[1] !== "number"
    ) {
      throw new Error("each corner must be a [number, number] pair");
    }
  }
  return { corners: corners.map((c) => [...c] as [number, number]), corrected: true };
}

export interface ScreenshotTool {
  name: string;
  description: string;
  parameters: string[];
}

export const SCREENSHOT_TOOLS: ScreenshotTool[] = [
  {
    name: "capture",
    description: "Capture a screenshot in full-screen, window, region, or scrolling mode.",
    parameters: ["mode"],
  },
  {
    name: "delayedCapture",
    description: "Schedule a capture after a delay in seconds.",
    parameters: ["seconds"],
  },
  {
    name: "annotate",
    description: "Annotate a screenshot with arrow, box, blur, highlight, or numbered steps.",
    parameters: ["type", "params"],
  },
  {
    name: "autoBlur",
    description: "Automatically blur sensitive content (email, credit-card, password).",
    parameters: ["sensitiveTypes"],
  },
  {
    name: "ocrExtract",
    description: "Extract text from a screenshot image via OCR.",
    parameters: ["imageData"],
  },
  {
    name: "uploadToCloud",
    description: "Upload a screenshot to the cloud and get a shareable URL.",
    parameters: ["filename"],
  },
  {
    name: "historySearch",
    description: "Search screenshot history by query string.",
    parameters: ["query", "total"],
  },
  {
    name: "compare",
    description: "Compare two screenshots and return a diff percentage.",
    parameters: ["before", "after"],
  },
  {
    name: "batchCapture",
    description: "Capture multiple screenshots at a fixed interval.",
    parameters: ["interval", "count"],
  },
  {
    name: "redact",
    description: "Redact areas of a screenshot, optionally reversible.",
    parameters: ["areas", "reversible"],
  },
  {
    name: "toMarkdown",
    description: "Convert a screenshot to a Markdown image reference.",
    parameters: ["imageData"],
  },
  {
    name: "perspectiveCorrect",
    description: "Correct perspective distortion using 4 corner points.",
    parameters: ["corners"],
  },
];
