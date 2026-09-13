// Step Sequencer — a 16-step polyrhythmic sequencer with per-step control.
// Supports multiple tracks (drum + synth), swing, and pattern chaining.

import { AudioEngine, noteToFreq, type Waveform } from "./engine";

export interface StepData {
  active: boolean;
  note: string;
  velocity: number; // 0..1
  gate: number; // 0..1 (percentage of step duration)
  accent: boolean;
  glide: boolean;
}

export interface SequencerTrack {
  id: string;
  name: string;
  type: "drum" | "synth";
  steps: StepData[];
  waveform?: Waveform;
  muted: boolean;
  volume: number;
}

export interface SequencerState {
  tracks: SequencerTrack[];
  bpm: number;
  swing: number; // 0..0.75
  currentStep: number;
  playing: boolean;
  stepsPerBeat: number;
  totalSteps: number;
}

export const DRUM_NAMES = ["Kick", "Snare", "Hat", "Clap", "Tom", "Rim", "Crash", "Perc"];

export function createDefaultTrack(
  id: string,
  name: string,
  type: "drum" | "synth",
  steps = 16,
): SequencerTrack {
  return {
    id,
    name,
    type,
    steps: Array.from({ length: steps }, () => ({
      active: false,
      note: type === "drum" ? "C4" : "C4",
      velocity: 0.8,
      gate: 0.8,
      accent: false,
      glide: false,
    })),
    waveform: type === "synth" ? "sawtooth" : undefined,
    muted: false,
    volume: 0.7,
  };
}

export function createDefaultSequencer(): SequencerState {
  const tracks: SequencerTrack[] = [
    createDefaultTrack("kick", "Kick", "drum"),
    createDefaultTrack("snare", "Snare", "drum"),
    createDefaultTrack("hat", "Hat", "drum"),
    createDefaultTrack("bass", "Bass", "synth"),
    createDefaultTrack("lead", "Lead", "synth"),
  ];
  // Default kick pattern
  [0, 4, 8, 12].forEach((i) => (tracks[0].steps[i].active = true));
  // Default snare pattern
  [4, 12].forEach((i) => (tracks[1].steps[i].active = true));
  // Default hat pattern
  [0, 2, 4, 6, 8, 10, 12, 14].forEach((i) => (tracks[2].steps[i].active = true));
  // Default bass
  tracks[3].steps[0].active = true;
  tracks[3].steps[0].note = "C2";
  tracks[3].steps[3].active = true;
  tracks[3].steps[3].note = "C2";
  tracks[3].steps[6].active = true;
  tracks[3].steps[6].note = "G2";
  tracks[3].steps[10].active = true;
  tracks[3].steps[10].note = "F2";
  return {
    tracks,
    bpm: 120,
    swing: 0,
    currentStep: 0,
    playing: false,
    stepsPerBeat: 4,
    totalSteps: 16,
  };
}

// ---------- Drum synthesis ----------
function playKick(velocity: number) {
  const ctx = AudioEngine.ctx;
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  gain.gain.setValueAtTime(velocity * 0.8, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(gain).connect(AudioEngine.bus!);
  osc.start(t);
  osc.stop(t + 0.35);
}

function playSnare(velocity: number) {
  const ctx = AudioEngine.ctx;
  if (!ctx) return;
  const t = ctx.currentTime;
  const noise = ctx.createBufferSource();
  noise.buffer = AudioEngine.createNoiseBuffer(0.2, "white");
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(velocity * 0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  noise.connect(filter).connect(gain).connect(AudioEngine.bus!);
  noise.start(t);
  noise.stop(t + 0.2);
  // Tonal component
  const osc = ctx.createOscillator();
  osc.frequency.value = 180;
  const og = ctx.createGain();
  og.gain.setValueAtTime(velocity * 0.3, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  osc.connect(og).connect(AudioEngine.bus!);
  osc.start(t);
  osc.stop(t + 0.12);
}

function playHat(velocity: number) {
  const ctx = AudioEngine.ctx;
  if (!ctx) return;
  const t = ctx.currentTime;
  const noise = ctx.createBufferSource();
  noise.buffer = AudioEngine.createNoiseBuffer(0.05, "white");
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 7000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(velocity * 0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  noise.connect(filter).connect(gain).connect(AudioEngine.bus!);
  noise.start(t);
  noise.stop(t + 0.06);
}

function playDrum(name: string, velocity: number) {
  switch (name.toLowerCase()) {
    case "kick":
      playKick(velocity);
      break;
    case "snare":
      playSnare(velocity);
      break;
    case "hat":
      playHat(velocity);
      break;
    case "clap":
      playSnare(velocity * 0.7);
      break;
    case "tom":
      playKick(velocity * 0.5);
      break;
    case "rim":
      playHat(velocity * 0.4);
      break;
    case "crash":
      playHat(velocity * 0.6);
      break;
    default:
      playHat(velocity);
      break;
  }
}

// ---------- Sequencer Engine ----------
export class SequencerEngine {
  state: SequencerState;
  private timer: number | null = null;
  private pendingTimeouts: Set<number> = new Set();
  private nextStepTime = 0;
  private lookahead = 25; // ms
  private scheduleAheadTime = 0.1; // seconds

  constructor(state: SequencerState) {
    this.state = state;
  }

  start() {
    AudioEngine.unlock();
    this.state.playing = true;
    this.state.currentStep = 0;
    this.nextStepTime = AudioEngine.ctx?.currentTime ?? 0;
    this.scheduler();
  }

  stop() {
    this.state.playing = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // Cancel drum/note callbacks that are still queued
    for (const id of this.pendingTimeouts) clearTimeout(id);
    this.pendingTimeouts.clear();
  }

  private getStepDuration(): number {
    return 60 / this.state.bpm / this.state.stepsPerBeat;
  }

  private scheduler = () => {
    if (!this.state.playing || !AudioEngine.ctx) return;
    const stepDur = this.getStepDuration();
    while (this.nextStepTime < AudioEngine.ctx.currentTime + this.scheduleAheadTime) {
      // Swing delays offbeat (odd) steps; the grid itself stays constant
      const swingOffset = this.state.currentStep % 2 === 1 ? this.state.swing * stepDur * 0.5 : 0;
      this.scheduleStep(this.state.currentStep, this.nextStepTime + swingOffset);
      this.nextStepTime += stepDur;
      this.state.currentStep = (this.state.currentStep + 1) % this.state.totalSteps;
    }
    this.timer = window.setTimeout(this.scheduler, this.lookahead);
  };

  private scheduleStep(step: number, time: number) {
    for (const track of this.state.tracks) {
      if (track.muted) continue;
      const s = track.steps[step];
      if (!s.active) continue;
      const vel = s.accent ? s.velocity * 1.3 : s.velocity;
      if (track.type === "drum") {
        this.scheduleDrum(track.name, vel, time);
      } else {
        this.scheduleSynth(track, s, vel, time);
      }
    }
  }

  private scheduleDrum(name: string, velocity: number, time: number) {
    const ctx = AudioEngine.ctx;
    if (!ctx) return;
    const delay = Math.max(0, time - ctx.currentTime);
    const id = window.setTimeout(() => {
      this.pendingTimeouts.delete(id);
      if (this.state.playing || delay < 0.05) playDrum(name, velocity);
    }, delay * 1000);
    this.pendingTimeouts.add(id);
  }

  private scheduleSynth(track: SequencerTrack, step: StepData, velocity: number, time: number) {
    const ctx = AudioEngine.ctx;
    if (!ctx) return;
    const freq = noteToFreq(step.note);
    const stepDur = this.getStepDuration();
    const gateDur = stepDur * step.gate;
    const delay = Math.max(0, time - ctx.currentTime);
    const id = window.setTimeout(() => {
      this.pendingTimeouts.delete(id);
      AudioEngine.noteOn(`seq-${track.id}-${time}`, freq, {
        waveform: track.waveform ?? "sawtooth",
        attack: 0.01,
        decay: 0.05,
        sustain: 0.7,
        release: 0.1,
        detune: 0,
        gain: velocity * track.volume,
      });
      const offId = window.setTimeout(() => {
        this.pendingTimeouts.delete(offId);
        AudioEngine.noteOff(`seq-${track.id}-${time}`);
      }, gateDur * 1000);
      this.pendingTimeouts.add(offId);
    }, delay * 1000);
    this.pendingTimeouts.add(id);
  }

  setBpm(bpm: number) {
    this.state.bpm = bpm;
  }
  setSwing(swing: number) {
    this.state.swing = swing;
  }
  toggleStep(trackId: string, step: number) {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (track) track.steps[step].active = !track.steps[step].active;
  }
  setStepNote(trackId: string, step: number, note: string) {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (track) track.steps[step].note = note;
  }
  toggleMute(trackId: string) {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (track) track.muted = !track.muted;
  }
}
