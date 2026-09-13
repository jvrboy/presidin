// Playlist / Song Arrangement Engine — Multi-track arrangement with patterns, clips, and automation.
// Provides a full DAW-style playlist for arranging patterns, audio clips, and automation across tracks.

import { AudioEngine } from "./engine";

// ============= CLIP TYPES =============

export interface PlaylistClip {
  id: string;
  trackId: string;
  name: string;
  startBar: number; // Starting bar position (can be fractional for fine positioning)
  lengthBars: number; // Duration in bars
  type: ClipType;
  color: string;
  // Pattern reference (for MIDI pattern clips)
  patternId?: string;
  // Audio buffer (for audio clips)
  audioBuffer?: AudioBuffer;
  audioStartOffset?: number; // Start offset within the audio buffer (seconds)
  audioLength?: number; // Length of audio to play (seconds)
  // Automation data (for automation clips)
  automationPoints?: AutomationPoint[];
  automationTarget?: string;
  // Clip-specific settings
  volume: number; // 0..2
  pan: number; // -1..1
  muted: boolean;
  solo: boolean;
  // Loop settings
  looped: boolean;
  loopStartBar?: number;
  loopLengthBars?: number;
  // Fade settings
  fadeInBars: number;
  fadeOutBars: number;
  // Stretch settings
  timeStretch: number; // 0.5..2.0 (1.0 = original)
  pitchShift: number; // semitones
}

export type ClipType = "pattern" | "audio" | "automation" | "marker" | "tempo";

export interface AutomationPoint {
  bar: number;
  value: number;
  curve: "linear" | "step" | "smooth";
}

// ============= TRACK TYPES =============

export interface PlaylistTrack {
  id: string;
  name: string;
  type: TrackType;
  color: string;
  height: number;
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  // Track routing
  outputTrackId?: string; // Send to another track (bus routing)
  // Insert effects
  effects: TrackEffect[];
  // Visual settings
  collapsed: boolean;
  hidden: boolean;
  locked: boolean;
}

export type TrackType = "instrument" | "audio" | "drum" | "automation" | "bus" | "marker" | "tempo";

export interface TrackEffect {
  id: string;
  type: string;
  enabled: boolean;
  params: Record<string, number>;
  mix: number;
}

// ============= PLAYLIST STATE =============

export interface PlaylistState {
  tracks: PlaylistTrack[];
  clips: PlaylistClip[];
  selectedClipIds: string[];
  totalBars: number;
  beatsPerBar: number;
  bpm: number;
  playhead: number; // Current position in bars
  playing: boolean;
  loopMode: boolean;
  loopStartBar: number;
  loopEndBar: number;
  snapMode: PlaylistSnapMode;
  zoom: number;
  scrollX: number;
  scrollY: number;
  trackHeight: number;
  showGrid: boolean;
  showRuler: boolean;
  showMixer: boolean;
  masterVolume: number;
  masterPan: number;
}

export type PlaylistSnapMode = "bar" | "1/2" | "1/4" | "1/8" | "1/16" | "off";

export const PLAYLIST_SNAP_VALUES: Record<PlaylistSnapMode, number> = {
  bar: 1,
  "1/2": 0.5,
  "1/4": 0.25,
  "1/8": 0.125,
  "1/16": 0.0625,
  off: 0.001,
};

// ============= DEFAULTS =============

let clipIdCounter = 0;
export function generateClipId(): string {
  return `clip-${Date.now()}-${clipIdCounter++}`;
}

let trackIdCounter = 0;
export function generateTrackId(): string {
  return `track-${Date.now()}-${trackIdCounter++}`;
}

export function createDefaultTrack(id: string, name: string, type: TrackType): PlaylistTrack {
  const colors: Record<TrackType, string> = {
    instrument: "#3b82f6",
    audio: "#10b981",
    drum: "#f59e0b",
    automation: "#8b5cf6",
    bus: "#ec4899",
    marker: "#6b7280",
    tempo: "#ef4444",
  };
  return {
    id,
    name,
    type,
    color: colors[type],
    height: 64,
    muted: false,
    solo: false,
    volume: 1.0,
    pan: 0,
    effects: [],
    collapsed: false,
    hidden: false,
    locked: false,
  };
}

export function createDefaultClip(
  trackId: string,
  name: string,
  startBar: number,
  lengthBars: number,
  type: ClipType = "pattern",
): PlaylistClip {
  const colors: Record<ClipType, string> = {
    pattern: "#3b82f6",
    audio: "#10b981",
    automation: "#8b5cf6",
    marker: "#6b7280",
    tempo: "#ef4444",
  };
  return {
    id: generateClipId(),
    trackId,
    name,
    startBar,
    lengthBars,
    type,
    color: colors[type],
    volume: 1.0,
    pan: 0,
    muted: false,
    solo: false,
    looped: false,
    fadeInBars: 0,
    fadeOutBars: 0,
    timeStretch: 1.0,
    pitchShift: 0,
  };
}

export function createDefaultPlaylist(): PlaylistState {
  const tracks: PlaylistTrack[] = [
    createDefaultTrack(generateTrackId(), "Drums", "drum"),
    createDefaultTrack(generateTrackId(), "Bass", "instrument"),
    createDefaultTrack(generateTrackId(), "Lead", "instrument"),
    createDefaultTrack(generateTrackId(), "Pad", "instrument"),
    createDefaultTrack(generateTrackId(), "Audio 1", "audio"),
    createDefaultTrack(generateTrackId(), "Automation", "automation"),
  ];

  return {
    tracks,
    clips: [],
    selectedClipIds: [],
    totalBars: 32,
    beatsPerBar: 4,
    bpm: 120,
    playhead: 0,
    playing: false,
    loopMode: false,
    loopStartBar: 0,
    loopEndBar: 32,
    snapMode: "1/4",
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    trackHeight: 64,
    showGrid: true,
    showRuler: true,
    showMixer: false,
    masterVolume: 0.8,
    masterPan: 0,
  };
}

// ============= CLIP OPERATIONS =============

export function addClip(state: PlaylistState, clip: PlaylistClip): PlaylistState {
  return { ...state, clips: [...state.clips, clip] };
}

export function removeClips(state: PlaylistState, clipIds: string[]): PlaylistState {
  return {
    ...state,
    clips: state.clips.filter((c) => !clipIds.includes(c.id)),
    selectedClipIds: state.selectedClipIds.filter((id) => !clipIds.includes(id)),
  };
}

export function updateClip(
  state: PlaylistState,
  clipId: string,
  updates: Partial<PlaylistClip>,
): PlaylistState {
  return {
    ...state,
    clips: state.clips.map((c) => (c.id === clipId ? { ...c, ...updates } : c)),
  };
}

export function moveClip(
  state: PlaylistState,
  clipId: string,
  deltaBar: number,
  deltaTrack: number,
): PlaylistState {
  const snapValue = PLAYLIST_SNAP_VALUES[state.snapMode];
  return {
    ...state,
    clips: state.clips.map((c) => {
      if (c.id !== clipId) return c;
      const newTrackIndex = state.tracks.findIndex((t) => t.id === c.trackId) + deltaTrack;
      const newTrack = state.tracks[Math.max(0, Math.min(state.tracks.length - 1, newTrackIndex))];
      return {
        ...c,
        startBar: Math.max(0, Math.round((c.startBar + deltaBar) / snapValue) * snapValue),
        trackId: newTrack ? newTrack.id : c.trackId,
      };
    }),
  };
}

export function resizeClip(
  state: PlaylistState,
  clipId: string,
  newLengthBars: number,
): PlaylistState {
  const snapValue = PLAYLIST_SNAP_VALUES[state.snapMode];
  return {
    ...state,
    clips: state.clips.map((c) =>
      c.id === clipId
        ? {
            ...c,
            lengthBars: Math.max(snapValue, Math.round(newLengthBars / snapValue) * snapValue),
          }
        : c,
    ),
  };
}

export function duplicateClips(state: PlaylistState, clipIds: string[]): PlaylistState {
  const clipsToDup = state.clips.filter((c) => clipIds.includes(c.id));
  const duplicated = clipsToDup.map((c) => ({
    ...c,
    id: generateClipId(),
    startBar: c.startBar + c.lengthBars,
  }));
  return {
    ...state,
    clips: [...state.clips, ...duplicated],
    selectedClipIds: duplicated.map((c) => c.id),
  };
}

export function copyClips(state: PlaylistState, clipIds: string[]): PlaylistClip[] {
  return state.clips
    .filter((c) => clipIds.includes(c.id))
    .map((c) => ({ ...c, id: generateClipId() }));
}

export function pasteClips(
  state: PlaylistState,
  clips: PlaylistClip[],
  offsetBar: number = 0,
): PlaylistState {
  const pastedClips = clips.map((c) => ({
    ...c,
    id: generateClipId(),
    startBar: c.startBar + offsetBar,
  }));
  return {
    ...state,
    clips: [...state.clips, ...pastedClips],
    selectedClipIds: pastedClips.map((c) => c.id),
  };
}

// ============= TRACK OPERATIONS =============

export function addTrack(state: PlaylistState, track: PlaylistTrack): PlaylistState {
  return { ...state, tracks: [...state.tracks, track] };
}

export function removeTrack(state: PlaylistState, trackId: string): PlaylistState {
  return {
    ...state,
    tracks: state.tracks.filter((t) => t.id !== trackId),
    clips: state.clips.filter((c) => c.trackId !== trackId),
  };
}

export function updateTrack(
  state: PlaylistState,
  trackId: string,
  updates: Partial<PlaylistTrack>,
): PlaylistState {
  return {
    ...state,
    tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t)),
  };
}

export function moveTrack(
  state: PlaylistState,
  trackId: string,
  direction: "up" | "down",
): PlaylistState {
  const index = state.tracks.findIndex((t) => t.id === trackId);
  if (index < 0) return state;
  const newIndex = direction === "up" ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= state.tracks.length) return state;
  const tracks = [...state.tracks];
  [tracks[index], tracks[newIndex]] = [tracks[newIndex], tracks[index]];
  return { ...state, tracks };
}

// ============= SNAP =============

export function snapBar(bar: number, snapMode: PlaylistSnapMode): number {
  const snapValue = PLAYLIST_SNAP_VALUES[snapMode];
  return Math.round(bar / snapValue) * snapValue;
}

// ============= PLAYBACK =============

export class PlaylistPlayer {
  private state: PlaylistState;
  private playhead = 0;
  private playing = false;
  private timer: number | null = null;
  private startTime = 0;
  private barDurationMs = 0;
  private activeSources: Map<string, { src: AudioBufferSourceNode; gain: GainNode }> = new Map();

  constructor(state: PlaylistState) {
    this.state = state;
  }

  updateState(state: PlaylistState) {
    this.state = state;
    this.barDurationMs = (60000 / this.state.bpm) * this.state.beatsPerBar;
  }

  play() {
    if (this.playing) return;
    AudioEngine.init();
    AudioEngine.resume();
    this.playing = true;
    this.playhead = this.state.loopMode ? this.state.loopStartBar : 0;
    this.startTime = performance.now();
    this.barDurationMs = (60000 / this.state.bpm) * this.state.beatsPerBar;
    this.schedule();
  }

  stop() {
    this.playing = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.stopAllSources();
  }

  private stopAllSources() {
    this.activeSources.forEach(({ src, gain }) => {
      try {
        const t = AudioEngine.ctx!.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setTargetAtTime(0, t, 0.01);
        src.stop(t + 0.05);
      } catch {}
    });
    this.activeSources.clear();
  }

  private schedule = () => {
    if (!this.playing) return;
    const now = performance.now();
    const elapsed = now - this.startTime;
    this.playhead = elapsed / this.barDurationMs;

    if (this.state.loopMode && this.playhead >= this.state.loopEndBar) {
      // Stop all active sources so clips don't overlap across loop cycles
      this.stopAllSources();
      this.playhead = this.state.loopStartBar;
      this.startTime = now - this.playhead * this.barDurationMs;
    }

    if (this.playhead >= this.state.totalBars) {
      this.stop();
      return;
    }

    // Trigger audio clips
    for (const clip of this.state.clips) {
      if (clip.muted) continue;
      const track = this.state.tracks.find((t) => t.id === clip.trackId);
      if (!track || track.muted) continue;

      const hasSolo = this.state.tracks.some((t) => t.solo);
      if (hasSolo && !track.solo) continue;

      const clipStart = clip.startBar;
      const clipEnd = clip.startBar + clip.lengthBars;

      if (
        this.playhead >= clipStart &&
        this.playhead < clipEnd &&
        !this.activeSources.has(clip.id)
      ) {
        if (clip.audioBuffer && AudioEngine.ctx) {
          const src = AudioEngine.ctx.createBufferSource();
          src.buffer = clip.audioBuffer;
          src.playbackRate.value = clip.timeStretch || 1.0;
          const gain = AudioEngine.ctx.createGain();
          gain.gain.value = clip.volume * track.volume * 0.5;
          const pan = AudioEngine.ctx.createStereoPanner();
          pan.pan.value = clip.pan + track.pan;
          src.connect(gain).connect(pan).connect(AudioEngine.bus!);
          src.start(0, clip.audioStartOffset || 0);
          this.activeSources.set(clip.id, { src, gain });
        }
      }

      if (this.playhead >= clipEnd && this.activeSources.has(clip.id)) {
        const { src, gain } = this.activeSources.get(clip.id)!;
        try {
          const t = AudioEngine.ctx!.currentTime;
          gain.gain.setTargetAtTime(0, t, 0.01);
          src.stop(t + 0.05);
        } catch {}
        this.activeSources.delete(clip.id);
      }
    }

    this.timer = window.setTimeout(this.schedule, 10);
  };

  getPlayhead(): number {
    return this.playhead;
  }

  isPlaying(): boolean {
    return this.playing;
  }
}
