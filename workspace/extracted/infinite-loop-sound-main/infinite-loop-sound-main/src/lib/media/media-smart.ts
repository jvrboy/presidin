// media-smart.ts — Pure functions for AI-powered smart media workflows (prompt-to-edit, auto-edit, highlights, search, emotion, copyright, accessibility).

export interface PromptToEditResult {
  prompt: string;
  parsedActions: string[];
  status: string;
}

export function promptToEdit(prompt: string): PromptToEditResult {
  if (!prompt) {
    return { prompt: "", parsedActions: [], status: "empty" };
  }
  const keywords: Record<string, string> = {
    cut: "trim",
    trim: "trim",
    speed: "change-speed",
    slow: "change-speed",
    color: "color-correct",
    grade: "color-correct",
    transition: "add-transition",
    fade: "add-transition",
    text: "add-text",
    title: "add-text",
    zoom: "add-zoom",
    blur: "add-blur",
    music: "add-music",
    audio: "adjust-audio",
    stabilize: "stabilize",
  };
  const lower = prompt.toLowerCase();
  const parsedActions: string[] = [];
  for (const [keyword, action] of Object.entries(keywords)) {
    if (lower.includes(keyword) && !parsedActions.includes(action)) {
      parsedActions.push(action);
    }
  }
  return {
    prompt,
    parsedActions: parsedActions.length > 0 ? parsedActions : ["manual-review"],
    status: parsedActions.length > 0 ? "parsed" : "needs-review",
  };
}

export interface AutoEditResult {
  brief: string;
  footageCount: number;
  firstCutDuration: number;
  status: string;
}

export function autoEdit(brief: string, footageCount: number): AutoEditResult {
  if (!brief) {
    return { brief: "", footageCount, firstCutDuration: 0, status: "no-brief" };
  }
  // Rough heuristic: ~5 seconds per clip for a first cut
  const firstCutDuration = footageCount * 5;
  return {
    brief,
    footageCount,
    firstCutDuration,
    status: "first-cut-ready",
  };
}

export interface HighlightReelResult {
  videoDuration: number;
  highlightCount: number;
  highlights: number[];
  totalDuration: number;
}

export function highlightReel(videoDuration: number, highlightCount: number): HighlightReelResult {
  const highlights: number[] = [];
  const interval = videoDuration / (highlightCount + 1);
  for (let i = 1; i <= highlightCount; i++) {
    highlights.push(Math.round(interval * i * 10) / 10);
  }
  // Each highlight clip is ~10 seconds
  const totalDuration = highlightCount * 10;
  return { videoDuration, highlightCount, highlights, totalDuration };
}

export interface ContentSearchResult {
  query: string;
  results: number;
  matchedClips: string[];
}

export function contentSearch(query: string, librarySize: number): ContentSearchResult {
  if (!query) {
    return { query: "", results: 0, matchedClips: [] };
  }
  // Simulate semantic search: return up to 20% of library or 10, whichever is smaller
  const max = Math.min(10, Math.max(1, Math.floor(librarySize * 0.2)));
  const matchedClips: string[] = [];
  for (let i = 0; i < max; i++) {
    matchedClips.push(`clip-${query.replace(/\s+/g, "-").toLowerCase()}-${i + 1}`);
  }
  return { query, results: matchedClips.length, matchedClips };
}

export interface EmotionTagResult {
  clipId: string;
  emotions: string[];
  subjects: string[];
  confidence: number;
}

export function emotionTag(clipId: string): EmotionTagResult {
  if (!clipId) {
    return { clipId: "", emotions: [], subjects: [], confidence: 0 };
  }
  const emotionPool = ["joy", "excitement", "calm", "tension", "surprise", "nostalgia"];
  const subjectPool = ["person", "landscape", "vehicle", "animal", "building", "object"];
  // Deterministic pick based on clipId hash
  const hash = clipId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const emotions = [
    emotionPool[hash % emotionPool.length],
    emotionPool[(hash + 1) % emotionPool.length],
  ];
  const subjects = [
    subjectPool[hash % subjectPool.length],
    subjectPool[(hash + 2) % subjectPool.length],
  ];
  const confidence = Math.round((0.7 + (hash % 30) / 100) * 100) / 100;
  return { clipId, emotions, subjects, confidence };
}

export interface CopyrightCheckResult {
  mediaType: string;
  scanned: boolean;
  issues: number;
  status: string;
}

export function copyrightCheck(mediaType: string): CopyrightCheckResult {
  if (!mediaType) {
    return { mediaType: "", scanned: false, issues: 0, status: "no-media" };
  }
  // Simulate scanning; certain types more likely to have issues
  const issueProne = ["music", "footage", "image"];
  const hasIssue = issueProne.includes(mediaType) && mediaType.length % 2 === 0;
  return {
    mediaType,
    scanned: true,
    issues: hasIssue ? 1 : 0,
    status: hasIssue ? "flagged" : "clear",
  };
}

export interface AccessibilityOptions {
  altText: boolean;
  colorBlindSafe: boolean;
  closedCaptions: boolean;
}

export function accessibilityCheck(options: AccessibilityOptions): Record<string, boolean> {
  return {
    altText: options.altText,
    colorBlindSafe: options.colorBlindSafe,
    closedCaptions: options.closedCaptions,
    passed: options.altText && options.colorBlindSafe && options.closedCaptions,
  };
}

export const SMART_TOOLS = [
  {
    name: "promptToEdit",
    label: "Prompt-to-Edit",
    description: "Parse a natural-language prompt into edit actions",
  },
  {
    name: "autoEdit",
    label: "Auto-Edit",
    description: "Generate a first cut from a brief and footage count",
  },
  {
    name: "highlightReel",
    label: "Highlight Reel",
    description: "Extract highlight timestamps from a video",
  },
  {
    name: "contentSearch",
    label: "Content Search",
    description: "Semantic search across the media library",
  },
  {
    name: "emotionTag",
    label: "Emotion Tag",
    description: "Tag clips with detected emotions and subjects",
  },
  {
    name: "copyrightCheck",
    label: "Copyright Check",
    description: "Scan media for potential copyright issues",
  },
  {
    name: "accessibilityCheck",
    label: "Accessibility Check",
    description: "Verify alt text, color-blind safety, and captions",
  },
];
