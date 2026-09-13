// Advanced Piano Roll Engine — Ultra-advanced per-note slide system with infinite glide.
// Supports per-note pitch, length, velocity, pan, size, and unlimited slide automation.

import { AudioEngine, noteToFreq, NOTE_NAMES, SCALES } from "./engine";

// ============= NOTE MODEL =============

export interface PianoNote {
  id: string;
  midi: number; // MIDI note number (0-127)
  startTick: number; // Position in ticks
  duration: number; // Length in ticks
  velocity: number; // 0-127
  pan: number; // -1 (L) to +1 (R)
  channel: number; // 0-15
  // Ultra-advanced per-note slide system
  slides: NoteSlide[]; // Per-note pitch automation curves
  // Per-note expression
  pitchBend: number; // -8192..+8192 (MIDI pitch bend range)
  microTuning: number; // cents offset (-100..+100)
  gain: number; // per-note gain multiplier (0..2)
  mute: boolean;
  solo: boolean;
  color: string; // visual color for the note
  group: string; // group ID for grouped notes
  locked: boolean; // locked notes can't be moved
  // Advanced expression
  vibrato: number; // 0..1 depth
  vibratoRate: number; // Hz
  tremolo: number; // 0..1 depth
  tremoloRate: number; // Hz
  expression: number; // 0..1 CC11 expression
  breath: number; // 0..1 CC2 breath control
  // Slide automation curves (ultra advanced)
  volumeAutomation: AutomationPoint[];
  panAutomation: AutomationPoint[];
  filterAutomation: AutomationPoint[];
}

export interface NoteSlide {
  id: string;
  startTick: number; // Position within note where slide starts
  endTick: number; // Position within note where slide ends
  startPitch: number; // Starting MIDI note (can be fractional for microtonal)
  endPitch: number; // Ending MIDI note (can be fractional)
  curveType: SlideCurve; // Curve interpolation type
  curveAmount: number; // -1..1 (negative = ease-in, positive = ease-out, 0 = linear)
  infinite: boolean; // If true, slide continues infinitely beyond endPitch
  infiniteDirection: number; // -1 (down) or +1 (up) for infinite slide
  infiniteRate: number; // semitones per tick for infinite slide
  enabled: boolean;
}

export type SlideCurve =
  | "linear"
  | "exponential"
  | "logarithmic"
  | "sine"
  | "scurve"
  | "bounce"
  | "elastic"
  | "step"
  | "custom";

export interface AutomationPoint {
  tick: number;
  value: number;
  curve: SlideCurve;
  curveAmount: number;
}

// ============= PIANO ROLL STATE =============

export interface PianoRollState {
  notes: PianoNote[];
  selectedNoteIds: string[];
  ticksPerPixel: number;
  pixelsPerTick: number;
  pixelsPerSemitone: number;
  totalTicks: number;
  ticksPerBeat: number;
  beatsPerBar: number;
  totalBars: number;
  snapMode: SnapMode;
  zoom: number;
  scrollX: number;
  scrollY: number;
  key: string;
  scale: string;
  showScaleGuides: boolean;
  ghostNotes: boolean;
  playhead: number; // Current playback position in ticks
  playing: boolean;
  loopMode: boolean;
  loopStart: number;
  loopEnd: number;
  currentChannel: number;
  currentInstrument: number;
  trackName: string;
}

export type SnapMode = "off" | "1/1" | "1/2" | "1/4" | "1/8" | "1/16" | "1/32" | "1/64" | "1/128";

export const SNAP_VALUES: Record<SnapMode, number> = {
  off: 1,
  "1/1": 1920,
  "1/2": 960,
  "1/4": 480,
  "1/8": 240,
  "1/16": 120,
  "1/32": 60,
  "1/64": 30,
  "1/128": 15,
};

export function createDefaultPianoRoll(): PianoRollState {
  return {
    notes: [],
    selectedNoteIds: [],
    ticksPerPixel: 0.5,
    pixelsPerTick: 2,
    pixelsPerSemitone: 14,
    totalTicks: 7680,
    ticksPerBeat: 480,
    beatsPerBar: 4,
    totalBars: 4,
    snapMode: "1/16",
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    key: "C",
    scale: "major",
    showScaleGuides: true,
    ghostNotes: false,
    playhead: 0,
    playing: false,
    loopMode: false,
    loopStart: 0,
    loopEnd: 7680,
    currentChannel: 0,
    currentInstrument: 0,
    trackName: "Track 1",
  };
}

// ============= NOTE OPERATIONS =============

let noteIdCounter = 0;
export function generateNoteId(): string {
  return `note-${Date.now()}-${noteIdCounter++}`;
}

let slideIdCounter = 0;
export function generateSlideId(): string {
  return `slide-${Date.now()}-${slideIdCounter++}`;
}

export function createNote(
  midi: number,
  startTick: number,
  duration: number,
  velocity: number = 100,
  pan: number = 0,
  channel: number = 0,
): PianoNote {
  return {
    id: generateNoteId(),
    midi,
    startTick,
    duration,
    velocity,
    pan,
    channel,
    slides: [],
    pitchBend: 0,
    microTuning: 0,
    gain: 1.0,
    mute: false,
    solo: false,
    color: "",
    group: "",
    locked: false,
    vibrato: 0,
    vibratoRate: 5,
    tremolo: 0,
    tremoloRate: 4,
    expression: 1.0,
    breath: 0,
    volumeAutomation: [],
    panAutomation: [],
    filterAutomation: [],
  };
}

// ============= SLIDE SYSTEM (ULTRA ADVANCED) =============

// Create a slide for a note
export function createSlide(
  startTick: number,
  endTick: number,
  startPitch: number,
  endPitch: number,
  curveType: SlideCurve = "linear",
  curveAmount: number = 0,
  infinite: boolean = false,
  infiniteDirection: number = 1,
  infiniteRate: number = 0.01,
): NoteSlide {
  return {
    id: generateSlideId(),
    startTick,
    endTick,
    startPitch,
    endPitch,
    curveType,
    curveAmount,
    infinite,
    infiniteDirection,
    infiniteRate,
    enabled: true,
  };
}

// Evaluate slide pitch at a given tick position
export function evaluateSlide(slide: NoteSlide, tick: number): number {
  if (tick < slide.startTick) return slide.startPitch;
  if (tick >= slide.endTick && !slide.infinite) return slide.endPitch;

  if (slide.infinite && tick >= slide.endTick) {
    const ticksBeyond = tick - slide.endTick;
    return slide.endPitch + slide.infiniteDirection * slide.infiniteRate * ticksBeyond;
  }

  const progress = (tick - slide.startTick) / Math.max(1, slide.endTick - slide.startTick);
  return interpolateCurve(
    slide.startPitch,
    slide.endPitch,
    progress,
    slide.curveType,
    slide.curveAmount,
  );
}

// Curve interpolation functions
export function interpolateCurve(
  start: number,
  end: number,
  progress: number,
  curve: SlideCurve,
  amount: number,
): number {
  const t = Math.max(0, Math.min(1, progress));
  const range = end - start;

  switch (curve) {
    case "linear":
      return start + range * t;

    case "exponential":
      return start + range * (t === 0 ? 0 : Math.pow(2, (t - 1) * (1 + amount * 3)));

    case "logarithmic":
      return (
        start +
        range * (t === 1 ? 1 : Math.log(1 + t * (1 + amount * 3)) / Math.log(2 + amount * 3))
      );

    case "sine":
      return start + range * (0.5 - 0.5 * Math.cos(Math.PI * t * (1 + amount)));

    case "scurve":
      return start + range * (t * t * (3 - 2 * t) + amount * Math.sin(Math.PI * t) * 0.2);

    case "bounce": {
      const bounces = 1 + Math.floor(amount * 4);
      let val = t;
      for (let i = 0; i < bounces; i++) {
        val = Math.abs(val * 2 - 1);
      }
      return start + range * val;
    }

    case "elastic": {
      const elasticity = 1 + amount * 10;
      const decay = Math.pow(2, -elasticity * t);
      const oscillation = Math.sin(t * Math.PI * 2 * (1 + amount * 3));
      return start + range * (1 - decay * (1 + oscillation * 0.5));
    }

    case "step": {
      const steps = Math.max(2, Math.floor(2 + amount * 10));
      return start + (range * Math.floor(t * steps)) / steps;
    }

    case "custom":
      // Custom curve uses amount as a shape parameter
      return start + range * (t + amount * Math.sin(t * Math.PI * 2) * 0.3);

    default:
      return start + range * t;
  }
}

// Evaluate all slides for a note at a given tick
export function evaluateNotePitch(note: PianoNote, tick: number): number {
  const noteTick = tick - note.startTick;
  if (noteTick < 0 || noteTick > note.duration) return note.midi;

  let pitch = note.midi + note.microTuning / 100;

  // Apply pitch bend
  if (note.pitchBend !== 0) {
    pitch += (note.pitchBend / 8192) * 2; // ±2 semitones default bend range
  }

  // Apply vibrato
  if (note.vibrato > 0) {
    const vibratoDepth = note.vibrato * 0.5; // up to 0.5 semitones
    const vibratoPhase = Math.sin(2 * Math.PI * note.vibratoRate * (noteTick / 480));
    pitch += vibratoDepth * vibratoPhase;
  }

  // Apply slides
  for (const slide of note.slides) {
    if (!slide.enabled) continue;
    if (noteTick >= slide.startTick && (noteTick <= slide.endTick || slide.infinite)) {
      pitch = evaluateSlide(slide, noteTick);
    }
  }

  return pitch;
}

// Evaluate automation at a given tick
export function evaluateAutomation(points: AutomationPoint[], tick: number): number {
  if (points.length === 0) return 1.0;
  if (points.length === 1) return points[0].value;
  if (tick <= points[0].tick) return points[0].value;
  if (tick >= points[points.length - 1].tick) return points[points.length - 1].value;

  for (let i = 0; i < points.length - 1; i++) {
    if (tick >= points[i].tick && tick <= points[i + 1].tick) {
      const progress = (tick - points[i].tick) / Math.max(1, points[i + 1].tick - points[i].tick);
      return interpolateCurve(
        points[i].value,
        points[i + 1].value,
        progress,
        points[i].curve,
        points[i].curveAmount,
      );
    }
  }
  return points[points.length - 1].value;
}

// ============= NOTE EDITING OPERATIONS =============

export function snapTick(tick: number, snapMode: SnapMode): number {
  const snapValue = SNAP_VALUES[snapMode];
  if (snapValue <= 1) return tick;
  return Math.round(tick / snapValue) * snapValue;
}

export function addNote(state: PianoRollState, note: PianoNote): PianoRollState {
  return { ...state, notes: [...state.notes, note] };
}

export function removeNotes(state: PianoRollState, noteIds: string[]): PianoRollState {
  return {
    ...state,
    notes: state.notes.filter((n) => !noteIds.includes(n.id)),
    selectedNoteIds: state.selectedNoteIds.filter((id) => !noteIds.includes(id)),
  };
}

export function updateNote(
  state: PianoRollState,
  noteId: string,
  updates: Partial<PianoNote>,
): PianoRollState {
  return {
    ...state,
    notes: state.notes.map((n) => (n.id === noteId ? { ...n, ...updates } : n)),
  };
}

export function selectNote(
  state: PianoRollState,
  noteId: string,
  additive: boolean = false,
): PianoRollState {
  if (additive) {
    return {
      ...state,
      selectedNoteIds: state.selectedNoteIds.includes(noteId)
        ? state.selectedNoteIds.filter((id) => id !== noteId)
        : [...state.selectedNoteIds, noteId],
    };
  }
  return { ...state, selectedNoteIds: [noteId] };
}

export function selectAll(state: PianoRollState): PianoRollState {
  return { ...state, selectedNoteIds: state.notes.map((n) => n.id) };
}

export function deselectAll(state: PianoRollState): PianoRollState {
  return { ...state, selectedNoteIds: [] };
}

export function copyNotes(state: PianoRollState, noteIds: string[]): PianoNote[] {
  return state.notes
    .filter((n) => noteIds.includes(n.id))
    .map((n) => ({ ...n, id: generateNoteId() }));
}

export function pasteNotes(
  state: PianoRollState,
  notes: PianoNote[],
  offsetTick: number = 0,
): PianoRollState {
  const pastedNotes = notes.map((n) => ({
    ...n,
    id: generateNoteId(),
    startTick: n.startTick + offsetTick,
    slides: n.slides.map((s) => ({ ...s, id: generateSlideId() })),
  }));
  return {
    ...state,
    notes: [...state.notes, ...pastedNotes],
    selectedNoteIds: pastedNotes.map((n) => n.id),
  };
}

export function duplicateNotes(state: PianoRollState, noteIds: string[]): PianoRollState {
  const notesToDup = state.notes.filter((n) => noteIds.includes(n.id));
  const duplicated = notesToDup.map((n) => ({
    ...n,
    id: generateNoteId(),
    startTick: n.startTick + n.duration,
    slides: n.slides.map((s) => ({ ...s, id: generateSlideId() })),
  }));
  return {
    ...state,
    notes: [...state.notes, ...duplicated],
    selectedNoteIds: duplicated.map((n) => n.id),
  };
}

export function moveNotes(
  state: PianoRollState,
  noteIds: string[],
  deltaTick: number,
  deltaMidi: number,
): PianoRollState {
  return {
    ...state,
    notes: state.notes.map((n) => {
      if (!noteIds.includes(n.id) || n.locked) return n;
      return {
        ...n,
        startTick: snapTick(n.startTick + deltaTick, state.snapMode),
        midi: Math.max(0, Math.min(127, n.midi + deltaMidi)),
      };
    }),
  };
}

export function resizeNote(
  state: PianoRollState,
  noteId: string,
  newDuration: number,
): PianoRollState {
  return {
    ...state,
    notes: state.notes.map((n) =>
      n.id === noteId && !n.locked
        ? { ...n, duration: Math.max(15, snapTick(newDuration, state.snapMode)) }
        : n,
    ),
  };
}

export function transposeNotes(
  state: PianoRollState,
  noteIds: string[],
  semitones: number,
): PianoRollState {
  return {
    ...state,
    notes: state.notes.map((n) =>
      noteIds.includes(n.id) && !n.locked
        ? { ...n, midi: Math.max(0, Math.min(127, n.midi + semitones)) }
        : n,
    ),
  };
}

export function changeVelocity(
  state: PianoRollState,
  noteIds: string[],
  velocity: number,
): PianoRollState {
  return {
    ...state,
    notes: state.notes.map((n) =>
      noteIds.includes(n.id)
        ? { ...n, velocity: Math.max(0, Math.min(127, Math.round(velocity))) }
        : n,
    ),
  };
}

export function changePan(state: PianoRollState, noteIds: string[], pan: number): PianoRollState {
  return {
    ...state,
    notes: state.notes.map((n) =>
      noteIds.includes(n.id) ? { ...n, pan: Math.max(-1, Math.min(1, pan)) } : n,
    ),
  };
}

export function changeGain(state: PianoRollState, noteIds: string[], gain: number): PianoRollState {
  return {
    ...state,
    notes: state.notes.map((n) =>
      noteIds.includes(n.id) ? { ...n, gain: Math.max(0, Math.min(2, gain)) } : n,
    ),
  };
}

// ============= SLIDE OPERATIONS =============

export function addSlideToNote(
  state: PianoRollState,
  noteId: string,
  slide: NoteSlide,
): PianoRollState {
  return {
    ...state,
    notes: state.notes.map((n) => (n.id === noteId ? { ...n, slides: [...n.slides, slide] } : n)),
  };
}

export function removeSlideFromNote(
  state: PianoRollState,
  noteId: string,
  slideId: string,
): PianoRollState {
  return {
    ...state,
    notes: state.notes.map((n) =>
      n.id === noteId ? { ...n, slides: n.slides.filter((s) => s.id !== slideId) } : n,
    ),
  };
}

export function updateSlide(
  state: PianoRollState,
  noteId: string,
  slideId: string,
  updates: Partial<NoteSlide>,
): PianoRollState {
  return {
    ...state,
    notes: state.notes.map((n) =>
      n.id === noteId
        ? { ...n, slides: n.slides.map((s) => (s.id === slideId ? { ...s, ...updates } : s)) }
        : n,
    ),
  };
}

// ============= QUANTIZE =============

export function quantizeNotes(
  state: PianoRollState,
  noteIds: string[],
  snapMode: SnapMode,
): PianoRollState {
  return {
    ...state,
    notes: state.notes.map((n) =>
      noteIds.includes(n.id) && !n.locked
        ? { ...n, startTick: snapTick(n.startTick, snapMode) }
        : n,
    ),
  };
}

// ============= SCALE HELPERS =============

export function isInScale(midi: number, key: string, scaleType: string): boolean {
  const scale = SCALES[scaleType as keyof typeof SCALES] || SCALES.major;
  const keyIndex = NOTE_NAMES.indexOf(key);
  if (keyIndex < 0) return true;
  const noteInOctave = midi % 12;
  return scale.some((interval) => (keyIndex + interval) % 12 === noteInOctave);
}

export function getScaleNotes(key: string, scaleType: string, octaveRange: number = 5): number[] {
  const scale = SCALES[scaleType as keyof typeof SCALES] || SCALES.major;
  const keyIndex = NOTE_NAMES.indexOf(key);
  const notes: number[] = [];
  for (let oct = 0; oct < octaveRange; oct++) {
    for (const interval of scale) {
      // Keep the raw interval so notes stay ordered and in-key across octaves
      // (wrapping % 12 collapsed the leading tone an octave below the root)
      const midi = (oct + 2) * 12 + keyIndex + interval;
      if (midi >= 0 && midi <= 127) notes.push(midi);
    }
  }
  return notes.sort((a, b) => a - b);
}

export function midiToNoteName(midi: number): string {
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

// ============= PLAYBACK =============

export class PianoRollPlayer {
  private engine: typeof AudioEngine;
  private state: PianoRollState;
  private playhead = 0;
  private playing = false;
  private timer: number | null = null;
  private activeNoteIds: Set<string> = new Set();
  private startTime = 0;
  private ticksPerMs = 0;

  constructor(state: PianoRollState) {
    this.state = state;
    this.engine = AudioEngine;
  }

  updateState(state: PianoRollState) {
    this.state = state;
  }

  play() {
    if (this.playing) return;
    AudioEngine.init();
    AudioEngine.resume();
    this.playing = true;
    this.playhead = this.state.loopMode ? this.state.loopStart : 0;
    this.startTime = performance.now();
    const bpm = 120;
    this.ticksPerMs = (bpm * this.state.ticksPerBeat) / 60000;
    this.schedule();
  }

  stop() {
    this.playing = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.activeNoteIds.forEach((id) => {
      this.engine.noteOff(`proll-${id}`);
    });
    this.activeNoteIds.clear();
  }

  private schedule = () => {
    if (!this.playing) return;
    const now = performance.now();
    const elapsed = now - this.startTime;
    this.playhead = elapsed * this.ticksPerMs;

    if (this.state.loopMode && this.playhead >= this.state.loopEnd) {
      this.playhead = this.state.loopStart;
      this.startTime = now - this.playhead / this.ticksPerMs;
      this.activeNoteIds.forEach((id) => this.engine.noteOff(`proll-${id}`));
      this.activeNoteIds.clear();
    }

    if (this.playhead >= this.state.totalTicks) {
      this.stop();
      return;
    }

    // Trigger notes that should start
    for (const note of this.state.notes) {
      if (note.mute) continue;
      const hasSolo = this.state.notes.some((n) => n.solo);
      if (hasSolo && !note.solo) continue;

      const noteStart = note.startTick;
      const noteEnd = note.startTick + note.duration;

      if (
        this.playhead >= noteStart &&
        this.playhead < noteEnd &&
        !this.activeNoteIds.has(note.id)
      ) {
        const pitch = evaluateNotePitch(note, this.playhead);
        const freq = 440 * Math.pow(2, (pitch - 69) / 12);
        const volAutomation = evaluateAutomation(note.volumeAutomation, this.playhead - noteStart);
        const gain = (note.velocity / 127) * note.gain * volAutomation * 0.5;

        this.engine.noteOn(`proll-${note.id}`, freq, {
          waveform: "sawtooth",
          attack: 0.01,
          decay: 0.1,
          sustain: 0.8,
          release: 0.2,
          // Micro-tuning is already baked into `pitch` by evaluateNotePitch;
          // passing it again via detune (and ×10!) double-applied it
          detune: 0,
          gain,
        });
        this.activeNoteIds.add(note.id);
      }

      // Stop notes that have ended
      if (this.playhead >= noteEnd && this.activeNoteIds.has(note.id)) {
        this.engine.noteOff(`proll-${note.id}`);
        this.activeNoteIds.delete(note.id);
      }
    }

    this.timer = window.setTimeout(this.schedule, 5);
  };

  getPlayhead(): number {
    return this.playhead;
  }

  isPlaying(): boolean {
    return this.playing;
  }
}
