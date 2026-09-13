// VINNY Extended Features — Additional AI-powered music creation tools.
// Extends the core Vinny engine with advanced compositional features.

import { SCALES, NOTE_NAMES, noteToFreq } from "./engine";

// 1. AI Melody Generator — Generates melodies based on scale, mood, and complexity
export function generateAIMelody(
  key: string,
  scaleType: string,
  bars: number = 4,
  mood: "happy" | "sad" | "energetic" | "calm" | "dark" = "happy",
  complexity: number = 0.5,
): number[][] {
  const scale = SCALES[scaleType as keyof typeof SCALES] || SCALES.major;
  const keyIndex = NOTE_NAMES.indexOf(key) || 0;
  const notesPerBar = 8;
  const melody: number[][] = [];

  const moodIntervals: Record<string, number[]> = {
    happy: [0, 2, 4, 7, 9],
    sad: [0, 3, 5, 7, 10],
    energetic: [0, 2, 4, 5, 7, 9, 11],
    calm: [0, 2, 4, 7],
    dark: [0, 1, 3, 6, 8],
  };

  const intervals = moodIntervals[mood] || moodIntervals.happy;

  for (let bar = 0; bar < bars; bar++) {
    const barNotes: number[] = [];
    let prevNote = keyIndex + 12; // Start one octave up
    for (let i = 0; i < notesPerBar; i++) {
      if (Math.random() > complexity && i > 0) {
        barNotes.push(-1); // Rest
        continue;
      }
      const interval = intervals[Math.floor(Math.random() * intervals.length)];
      const octave = Math.floor(Math.random() * 2) * 12;
      let note = keyIndex + interval + octave;
      // Smooth voice leading — prefer steps over leaps
      if (Math.abs(note - prevNote) > 7 && Math.random() > 0.3) {
        note = prevNote + (Math.random() > 0.5 ? 2 : -2);
      }
      note = Math.max(0, Math.min(127, note));
      barNotes.push(note);
      prevNote = note;
    }
    melody.push(barNotes);
  }

  return melody;
}

// 2. Chord Progression Generator — Common + custom progressions
export interface ChordProgression {
  name: string;
  chords: number[][];
  romanNumerals: string[];
}

const PROGRESSIONS: Record<string, number[][]> = {
  "I-V-vi-IV": [
    [0, 4, 7],
    [7, 11, 2],
    [9, 0, 4],
    [5, 9, 0],
  ],
  "I-IV-V-I": [
    [0, 4, 7],
    [5, 9, 0],
    [7, 11, 2],
    [0, 4, 7],
  ],
  "ii-V-I": [
    [2, 5, 9],
    [7, 11, 2],
    [0, 4, 7],
  ],
  "I-vi-IV-V": [
    [0, 4, 7],
    [9, 0, 4],
    [5, 9, 0],
    [7, 11, 2],
  ],
  "vi-IV-I-V": [
    [9, 0, 4],
    [5, 9, 0],
    [0, 4, 7],
    [7, 11, 2],
  ],
  "I-iii-IV-V": [
    [0, 4, 7],
    [4, 7, 11],
    [5, 9, 0],
    [7, 11, 2],
  ],
  "i-VII-VI-VII": [
    [0, 3, 7],
    [10, 2, 5],
    [8, 0, 3],
    [10, 2, 5],
  ],
  "i-iv-VII-III": [
    [0, 3, 7],
    [5, 8, 0],
    [10, 2, 5],
    [3, 7, 10],
  ],
};

export function generateProgression(key: string, name: string = "I-V-vi-IV"): ChordProgression {
  const keyIndex = NOTE_NAMES.indexOf(key) || 0;
  const base = PROGRESSIONS[name] || PROGRESSIONS["I-V-vi-IV"];
  const roman = name.split("-");
  const chords = base.map((chord) => chord.map((n) => ((n + keyIndex) % 12) + 48));
  return { name, chords, romanNumerals: roman };
}

export const PROGRESSION_NAMES = Object.keys(PROGRESSIONS);

// 3. Pattern Sequencer — Step-based drum/gate sequencer
export interface PatternStep {
  active: boolean;
  velocity: number;
  note: number;
}

export function createEmptyPattern(steps: number = 16, tracks: number = 4): PatternStep[][] {
  return Array.from({ length: tracks }, () =>
    Array.from({ length: steps }, (_, i) => ({
      active: false,
      velocity: 100,
      note: 60 + (i % 12),
    })),
  );
}

export function generateDrumPattern(
  genre: "trap" | "lofi" | "house" | "techno" | "dnb" = "house",
  steps: number = 16,
): PatternStep[][] {
  const pattern = createEmptyPattern(steps, 4);

  const patterns: Record<string, number[]> = {
    trap: [0, 6, 7, 10],
    lofi: [0, 4, 8, 12],
    house: [0, 4, 8, 12],
    techno: [0, 2, 4, 6, 8, 10, 12, 14],
    dnb: [0, 5, 8, 13],
  };

  // Kick (track 0)
  patterns[genre].forEach((step) => {
    if (step < steps) pattern[0][step].active = true;
  });

  // Snare (track 1) — on beats 2 and 4
  [4, 12].forEach((step) => {
    if (step < steps) pattern[1][step].active = true;
  });

  // Hi-hat (track 2) — every other step
  for (let i = 0; i < steps; i += 2) {
    pattern[2][i].active = true;
    pattern[2][i].velocity = 60 + Math.random() * 40;
  }

  // Open hat (track 3) — off-beats
  [2, 6, 10, 14].forEach((step) => {
    if (step < steps) pattern[3][step].active = true;
  });

  return pattern;
}

// 4. Arpeggiator Engine — Multiple arp patterns
export type ArpPattern = "up" | "down" | "updown" | "random" | "chord" | "updown2";

export function generateArpeggio(
  notes: number[],
  pattern: ArpPattern = "up",
  octaves: number = 2,
  steps: number = 16,
): number[] {
  const result: number[] = [];
  const allNotes: number[] = [];
  for (let oct = 0; oct < octaves; oct++) {
    for (const n of notes) {
      allNotes.push(n + oct * 12);
    }
  }

  for (let i = 0; i < steps; i++) {
    let idx: number;
    switch (pattern) {
      case "up":
        idx = i % allNotes.length;
        break;
      case "down":
        idx = allNotes.length - 1 - (i % allNotes.length);
        break;
      case "updown": {
        const cycle = allNotes.length * 2 - 2;
        const pos = i % cycle;
        idx = pos < allNotes.length ? pos : cycle - pos;
        break;
      }
      case "updown2": {
        const cycle2 = allNotes.length * 2;
        idx = i % cycle2 < allNotes.length ? i % allNotes.length : cycle2 - 1 - (i % cycle2);
        break;
      }
      case "random":
        idx = Math.floor(Math.random() * allNotes.length);
        break;
      case "chord":
        idx = i % allNotes.length;
        break;
    }
    result.push(allNotes[idx]);
  }

  return result;
}

// 5. Bass Line Generator — Genre-aware bass patterns
export function generateBassLine(
  key: string,
  scaleType: string,
  genre: "trap" | "lofi" | "house" | "techno" | "dnb" = "house",
  bars: number = 4,
): number[][] {
  const keyIndex = NOTE_NAMES.indexOf(key) || 0;
  const bass: number[][] = [];

  const patterns: Record<string, number[]> = {
    trap: [0, 0, 0, 3, 0, 0, 5, 0],
    lofi: [0, -1, 3, -1, 5, -1, 3, -1],
    house: [0, 0, 3, 0, 5, 5, 3, 0],
    techno: [0, 0, 0, 0, 0, 0, 0, 3],
    dnb: [0, -1, -1, 0, -1, 5, -1, 0],
  };

  const pattern = patterns[genre] || patterns.house;

  for (let bar = 0; bar < bars; bar++) {
    const barNotes = pattern.map(
      (interval) => (interval >= 0 ? keyIndex + interval + 36 : -1), // -1 = rest, octave 3
    );
    bass.push(barNotes);
  }

  return bass;
}

// 6. Scale Finder — Find compatible scales for a set of notes
export function findScales(notes: number[]): string[] {
  const noteSet = new Set(notes.map((n) => n % 12));
  const compatible: string[] = [];

  for (const [scaleName, intervals] of Object.entries(SCALES)) {
    const scaleNotes = new Set((intervals as number[]).map((i) => i % 12));
    let compatible2 = true;
    for (const note of noteSet) {
      if (!scaleNotes.has(note)) {
        compatible2 = false;
        break;
      }
    }
    if (compatible2) compatible.push(scaleName);
  }

  return compatible;
}

// 7. Harmonizer — Generate harmony notes for a melody
export function harmonize(melody: number[], intervals: number[] = [3, 5]): number[][] {
  return melody.map((note) => {
    if (note < 0) return [-1, -1];
    return intervals.map((interval) => note + interval);
  });
}

// 8. Rhythm Generator — Euclidean rhythm patterns
export function generateEuclideanRhythm(
  steps: number,
  pulses: number,
  rotation: number = 0,
): boolean[] {
  const rhythm: boolean[] = new Array(steps).fill(false);
  const bucketSize = pulses / steps;
  let bucket = rotation * bucketSize;

  for (let i = 0; i < steps; i++) {
    bucket += bucketSize;
    if (bucket >= 1) {
      rhythm[i] = true;
      bucket -= 1;
    }
  }

  return rhythm;
}

// 9. Voice Leading Optimizer — Minimize voice leading distance
export function optimizeVoiceLeading(chords: number[][]): number[][] {
  if (chords.length === 0) return chords;
  const result: number[][] = [chords[0].map((n) => n + 48)];

  for (let i = 1; i < chords.length; i++) {
    const prevChord = result[i - 1];
    const currentChord = chords[i];
    const optimized = currentChord.map((note, j) => {
      const prevNote = prevChord[j] || prevChord[0];
      let bestNote = note + 48;
      let bestDist = Math.abs(bestNote - prevNote);
      for (let oct = -2; oct <= 2; oct++) {
        const candidate = note + 48 + oct * 12;
        const dist = Math.abs(candidate - prevNote);
        if (dist < bestDist) {
          bestDist = dist;
          bestNote = candidate;
        }
      }
      return bestNote;
    });
    result.push(optimized);
  }

  return result;
}

// 10. Song Structure Generator — Arrangement suggestions
export interface SongSection {
  name: string;
  bars: number;
  energy: number;
}

export function generateSongStructure(genre: string = "pop"): SongSection[] {
  const structures: Record<string, string[]> = {
    pop: ["intro", "verse", "chorus", "verse", "chorus", "bridge", "chorus", "outro"],
    trap: ["intro", "hook", "verse", "hook", "verse", "hook", "outro"],
    lofi: ["intro", "loop", "loop", "bridge", "loop", "outro"],
    house: ["intro", "build", "drop", "breakdown", "drop", "outro"],
    techno: ["intro", "build", "drive", "break", "drive", "outro"],
    ambient: ["intro", "evolve", "peak", "fade", "outro"],
  };

  const sections = structures[genre] || structures.pop;
  const energyMap: Record<string, number> = {
    intro: 0.2,
    verse: 0.4,
    chorus: 0.9,
    hook: 0.85,
    bridge: 0.6,
    build: 0.5,
    drop: 1.0,
    breakdown: 0.3,
    drive: 0.8,
    break: 0.2,
    loop: 0.5,
    evolve: 0.5,
    peak: 0.9,
    fade: 0.3,
    outro: 0.2,
  };

  return sections.map((name, i) => ({
    name,
    bars: name === "intro" || name === "outro" ? 4 : 8,
    energy: energyMap[name] || 0.5,
  }));
}
