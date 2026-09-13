/**
 * media-ai.ts
 *
 * Pure functions for AI-powered media tools: generative fill/replace, text-to-image,
 * text-to-video, image-to-video, face retouch/swap, rotoscope, auto-reframe, motion
 * tracking, speech-to-text, AI voiceover, lip sync, silence/scene detection, beat
 * sync, Ken Burns, depth mapping, relighting, sky replacement, weather effects,
 * time remapping, frame interpolation, stabilization, and deflicker.
 *
 * All functions are side-effect free and return plain result objects. "status"
 * fields simulate async AI job states for UI display.
 */

export interface GenerativeFillResult {
  direction: string;
  distance: number;
  extendedPixels: number;
}

export interface GenerativeReplaceResult {
  area: string;
  description: string;
  status: string;
}

export interface TextToImageResult {
  prompt: string;
  width: number;
  height: number;
  status: string;
}

export interface TextToVideoResult {
  prompt: string;
  duration: number;
  fps: number;
  status: string;
}

export interface ImageToVideoResult {
  motion: string;
  duration: number;
  status: string;
}

export interface FaceRetouchOptions {
  skinSmooth: number;
  blemish: number;
  eyeBrighten: number;
  teethWhiten: number;
  jawline: number;
  naturalLook: boolean;
}

export interface FaceSwapResult {
  sourceId: string;
  targetId: string;
  status: string;
}

export interface RotoscopeResult {
  subject: string;
  frameRange: [number, number];
  maskFrames: number;
}

export interface AutoReframeResult {
  targetAspect: string;
  subjectTracking: boolean;
  status: string;
}

export interface MotionTrackingResult {
  target: string;
  attachType: string;
  status: string;
}

export interface SpeechToTextResult {
  language: string;
  style: string;
  wordCount: number;
  status: string;
}

export interface AIVoiceoverResult {
  text: string;
  voice: string;
  language: string;
  duration: number;
  status: string;
}

export interface LipSyncResult {
  audioId: string;
  language: string;
  status: string;
}

export interface SilenceDetectResult {
  threshold: number;
  removeFillers: boolean;
  removedSegments: number;
}

export interface SceneDetectResult {
  sensitivity: number;
  scenesDetected: number;
}

export interface BeatSyncResult {
  bpm: number;
  cutOnBeat: boolean;
  cuts: number;
}

export interface KenBurnsResult {
  motion: string;
  zoom: number;
  status: string;
}

export interface DepthMapResult {
  quality: string;
  depthLayers: number;
}

export interface RelightResult {
  direction: number;
  intensity: number;
  color: string;
}

export interface SkyReplaceResult {
  skyType: string;
  adjustReflection: boolean;
  status: string;
}

export interface WeatherEffectResult {
  effect: string;
  intensity: number;
}

export interface TimeRemapResult {
  speed: number;
  mode: string;
  interpolated: boolean;
}

export interface FrameInterpolateResult {
  targetFps: number;
  method: string;
}

export interface StabilizeResult {
  smoothness: number;
  correctRollingShutter: boolean;
}

export interface DeflickerResult {
  sensitivity: number;
  framesProcessed: number;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * Generatively extend an image in a direction by a distance (in pixels).
 */
export function generativeFill(direction: string, distance: number): GenerativeFillResult {
  const validDirections = ["left", "right", "up", "down", "all"];
  const dir = validDirections.includes(direction) ? direction : "all";
  return {
    direction: dir,
    distance: clamp(distance, 0, 1000),
    extendedPixels: Math.round(clamp(distance, 0, 1000) * (dir === "all" ? 4 : 1)),
  };
}

/**
 * Replace a masked area with an AI-generated result matching the description.
 */
export function generativeReplace(area: string, description: string): GenerativeReplaceResult {
  return {
    area: area || "selection",
    description: description || "unspecified",
    status: description ? "completed" : "pending",
  };
}

/**
 * Generate an image from a text prompt at the requested resolution.
 */
export function textToImage(prompt: string, width: number, height: number): TextToImageResult {
  return {
    prompt,
    width: clamp(width, 64, 2048),
    height: clamp(height, 64, 2048),
    status: prompt ? "rendering" : "awaiting-prompt",
  };
}

/**
 * Generate a video from a text prompt with the given duration and frame rate.
 */
export function textToVideo(prompt: string, duration: number, fps: number): TextToVideoResult {
  return {
    prompt,
    duration: clamp(duration, 1, 60),
    fps: clamp(fps, 1, 120),
    status: prompt ? "rendering" : "awaiting-prompt",
  };
}

/**
 * Animate a still image into a video using a camera motion preset.
 */
export function imageToVideo(motion: string, duration: number): ImageToVideoResult {
  const validMotions = ["dolly", "pan", "zoom", "orbit"];
  const normalizedMotion = validMotions.includes(motion) ? motion : "zoom";
  return {
    motion: normalizedMotion,
    duration: clamp(duration, 1, 60),
    status: "rendering",
  };
}

/**
 * Apply AI face retouch adjustments. Returns the normalized parameter record.
 */
export function faceRetouch(options: FaceRetouchOptions): Record<string, number | boolean> {
  return {
    skinSmooth: clamp(options.skinSmooth, 0, 100),
    blemish: clamp(options.blemish, 0, 100),
    eyeBrighten: clamp(options.eyeBrighten, 0, 100),
    teethWhiten: clamp(options.teethWhiten, 0, 100),
    jawline: clamp(options.jawline, 0, 100),
    naturalLook: Boolean(options.naturalLook),
  };
}

/**
 * Swap a source face onto a target subject.
 */
export function faceSwap(sourceId: string, targetId: string): FaceSwapResult {
  return {
    sourceId,
    targetId,
    status: sourceId && targetId ? "completed" : "awaiting-inputs",
  };
}

/**
 * Rotoscope a subject across a frame range, producing per-frame masks.
 */
export function rotoscope(subject: string, frameRange: [number, number]): RotoscopeResult {
  const [start, end] = frameRange;
  const frames = Math.max(0, end - start);
  return {
    subject: subject || "subject",
    frameRange: [start, end],
    maskFrames: frames,
  };
}

/**
 * Auto-reframe media to a target aspect while tracking subjects.
 */
export function autoReframe(targetAspect: string): AutoReframeResult {
  return {
    targetAspect,
    subjectTracking: true,
    status: "completed",
  };
}

/**
 * Track a target and attach an element (text, graphic, or effect) to it.
 */
export function motionTracking(target: string, attachType: string): MotionTrackingResult {
  const validTypes = ["text", "graphic", "effect"];
  const normalizedType = validTypes.includes(attachType) ? attachType : "text";
  return {
    target: target || "selection",
    attachType: normalizedType,
    status: target ? "tracking" : "awaiting-target",
  };
}

/**
 * Transcribe speech to text. Returns an estimated word count based on duration.
 */
export function speechToText(language: string, style: string): SpeechToTextResult {
  const validStyles = ["default", "karaoke", "animated"];
  const normalizedStyle = validStyles.includes(style) ? style : "default";
  return {
    language: language || "en",
    style: normalizedStyle,
    wordCount: 0,
    status: "transcribing",
  };
}

/**
 * Generate an AI voiceover from text in a given voice and language.
 */
export function aiVoiceover(text: string, voice: string, language: string): AIVoiceoverResult {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const duration = words > 0 ? Math.round((words / 150) * 60 * 10) / 10 : 0;
  return {
    text,
    voice: voice || "narrator",
    language: language || "en",
    duration,
    status: text ? "synthesizing" : "awaiting-text",
  };
}

/**
 * Lip-sync a subject to an audio track in a given language.
 */
export function lipSync(audioId: string, language: string): LipSyncResult {
  return {
    audioId,
    language: language || "en",
    status: audioId ? "syncing" : "awaiting-audio",
  };
}

/**
 * Detect silence in audio. Returns the number of removed silent segments.
 */
export function silenceDetect(threshold: number, removeFillers: boolean): SilenceDetectResult {
  return {
    threshold: clamp(threshold, -60, 0),
    removeFillers,
    removedSegments: 0,
  };
}

/**
 * Detect scene changes at a given sensitivity (0-100).
 */
export function sceneDetect(sensitivity: number): SceneDetectResult {
  const s = clamp(sensitivity, 0, 100);
  return {
    sensitivity: s,
    scenesDetected: Math.round(s / 10),
  };
}

/**
 * Sync cuts to a BPM. Returns the estimated number of cuts.
 */
export function beatSync(bpm: number, cutOnBeat: boolean): BeatSyncResult {
  return {
    bpm: clamp(bpm, 40, 240),
    cutOnBeat,
    cuts: cutOnBeat ? Math.round((bpm / 60) * 10) : 0,
  };
}

/**
 * Apply a Ken Burns pan-and-zoom motion.
 */
export function kenBurns(motion: string, zoom: number): KenBurnsResult {
  return {
    motion: motion || "pan-right",
    zoom: clamp(zoom, 0, 100),
    status: "rendering",
  };
}

/**
 * Generate a depth map at the requested quality.
 */
export function depthMap(quality: string): DepthMapResult {
  const validQualities = ["draft", "standard", "high", "ultra"];
  const normalizedQuality = validQualities.includes(quality) ? quality : "standard";
  const layers = normalizedQuality === "ultra" ? 16 : normalizedQuality === "high" ? 8 : 4;
  return { quality: normalizedQuality, depthLayers: layers };
}

/**
 * Relight a scene from a direction (degrees), intensity, and color.
 */
export function relight(direction: number, intensity: number, color: string): RelightResult {
  return {
    direction: clamp(direction, 0, 360),
    intensity: clamp(intensity, 0, 100),
    color: color || "#ffffff",
  };
}

/**
 * Replace the sky with a preset sky type.
 */
export function skyReplace(skyType: string, adjustReflection: boolean): SkyReplaceResult {
  const validTypes = ["sunset", "aurora", "storm", "galaxy", "clear"];
  const normalizedType = validTypes.includes(skyType) ? skyType : "clear";
  return {
    skyType: normalizedType,
    adjustReflection,
    status: "completed",
  };
}

/**
 * Add a weather effect at a given intensity.
 */
export function weatherEffects(effect: string, intensity: number): WeatherEffectResult {
  const validEffects = ["rain", "snow", "fog", "sun-rays", "lens-flares"];
  const normalizedEffect = validEffects.includes(effect) ? effect : "rain";
  return { effect: normalizedEffect, intensity: clamp(intensity, 0, 100) };
}

/**
 * Remap time with a speed multiplier and mode.
 */
export function timeRemap(speed: number, mode: string): TimeRemapResult {
  const validModes = ["speed-ramp", "slow-mo", "reverse", "freeze", "optical-flow"];
  const normalizedMode = validModes.includes(mode) ? mode : "slow-mo";
  return {
    speed: clamp(speed, 0.05, 10),
    mode: normalizedMode,
    interpolated: normalizedMode === "slow-mo" || normalizedMode === "optical-flow",
  };
}

/**
 * Interpolate frames to a target FPS.
 */
export function frameInterpolate(targetFps: number): FrameInterpolateResult {
  return {
    targetFps: clamp(targetFps, 1, 240),
    method: targetFps > 60 ? "optical-flow" : "blend",
  };
}

/**
 * Stabilize footage with a smoothness factor and optional rolling-shutter correction.
 */
export function stabilize(smoothness: number, correctRollingShutter: boolean): StabilizeResult {
  return {
    smoothness: clamp(smoothness, 0, 100),
    correctRollingShutter,
  };
}

/**
 * Deflicker footage at a given sensitivity.
 */
export function deflicker(sensitivity: number): DeflickerResult {
  return {
    sensitivity: clamp(sensitivity, 0, 100),
    framesProcessed: 0,
  };
}

export interface MediaAIToolMeta {
  name: string;
  description: string;
  category: string;
}

/**
 * Metadata for every AI media tool surfaced in the UI.
 */
export const MEDIA_AI_TOOLS: MediaAIToolMeta[] = [
  {
    name: "generative-fill",
    description: "Extend image edges with AI-generated content",
    category: "generative",
  },
  {
    name: "generative-replace",
    description: "Replace objects via text description",
    category: "generative",
  },
  {
    name: "text-to-image",
    description: "Generate images from text prompts",
    category: "generative",
  },
  {
    name: "text-to-video",
    description: "Generate video clips from text prompts",
    category: "generative",
  },
  {
    name: "image-to-video",
    description: "Animate stills with camera motion",
    category: "generative",
  },
  {
    name: "face-retouch",
    description: "AI skin smoothing and feature enhancement",
    category: "portrait",
  },
  { name: "face-swap", description: "Swap faces between subjects", category: "portrait" },
  { name: "rotoscope", description: "Auto-mask subjects across frames", category: "masking" },
  {
    name: "auto-reframe",
    description: "Reframe to any aspect with subject tracking",
    category: "reframing",
  },
  {
    name: "motion-tracking",
    description: "Track and attach elements to motion",
    category: "tracking",
  },
  { name: "speech-to-text", description: "Transcribe and caption audio", category: "audio" },
  { name: "ai-voiceover", description: "Generate natural voice narration", category: "audio" },
  { name: "lip-sync", description: "Sync lip movement to audio tracks", category: "audio" },
  { name: "silence-detect", description: "Detect and remove silent segments", category: "audio" },
  { name: "scene-detect", description: "Auto-detect scene changes", category: "detection" },
  { name: "beat-sync", description: "Cut video to music beats", category: "audio" },
  { name: "ken-burns", description: "Pan-and-zoom motion for stills", category: "motion" },
  { name: "depth-map", description: "Generate depth layers for 3D effects", category: "depth" },
  { name: "relight", description: "Relight scenes with virtual lights", category: "lighting" },
  { name: "sky-replace", description: "Replace skies with presets", category: "environment" },
  {
    name: "weather-effects",
    description: "Add rain, snow, fog, and flares",
    category: "environment",
  },
  { name: "time-remap", description: "Speed ramp and slow motion", category: "motion" },
  {
    name: "frame-interpolate",
    description: "Interpolate to higher frame rates",
    category: "motion",
  },
  { name: "stabilize", description: "Stabilize shaky footage", category: "motion" },
  { name: "deflicker", description: "Remove flicker from footage", category: "motion" },
];
