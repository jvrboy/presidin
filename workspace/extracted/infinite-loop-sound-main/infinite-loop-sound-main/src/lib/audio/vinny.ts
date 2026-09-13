// @ts-nocheck
// VINNY — The All-in-One Sound Architect Engine
// Core audio engine implementing 15 sections of sound design, synthesis,
// sampling, effects, modulation, and AI-assisted music creation.

import { AudioEngine, NOTE_FREQS, noteToFreq, SCALES, NOTE_NAMES } from "./engine";

// ============================================================
// SECTION 1: Sound Engine Core — Hybrid Multi-Layer Synthesis
// ============================================================

export type OscShape = "sine" | "sawtooth" | "square" | "triangle" | "noise" | "wavetable";
export type FilterType =
  | "lowpass"
  | "highpass"
  | "bandpass"
  | "notch"
  | "allpass"
  | "comb"
  | "formant";

export interface OscLayer {
  id: string;
  shape: OscShape;
  frequency: number; // Hz, or multiplier of base note
  detune: number; // cents
  volume: number; // 0..1
  phase: number; // 0..1
  unison: number; // 1..7
  unisonSpread: number; // cents
  wavetableIndex: number;
  fmMod: string | null; // id of another osc to FM-modulate with
  fmDepth: number; // 0..1
  ringMod: string | null; // id of ring-mod partner
  pan: number; // -1..1
}

export interface FilterConfig {
  type: FilterType;
  cutoff: number; // Hz
  resonance: number; // Q
  drive: number; // 0..1
  keyTracking: number; // 0..1
  envAmount: number; // -1..1
  formants: number[]; // for formant filter
}

export interface AmpEnvelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  velocitySensitivity: number; // 0..1
  attackCurve: "linear" | "exponential";
}

export interface FilterEnvelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  amount: number; // -1..1
}

export interface SoundEngineConfig {
  oscillators: OscLayer[];
  filter: FilterConfig;
  ampEnv: AmpEnvelope;
  filterEnv: FilterEnvelope;
  glide: number; // portamento time in seconds
  monoMode: boolean;
  legato: boolean;
  pitchBendRange: number; // semitones
  masterVolume: number;
  bitcrush: number; // 0..1
  wavetablePosition: number; // 0..1 morph
}

export function createDefaultSoundEngine(): SoundEngineConfig {
  return {
    oscillators: [
      {
        id: "osc1",
        shape: "sawtooth",
        frequency: 1,
        detune: 0,
        volume: 0.5,
        phase: 0,
        unison: 1,
        unisonSpread: 10,
        wavetableIndex: 0,
        fmMod: null,
        fmDepth: 0,
        ringMod: null,
        pan: 0,
      },
      {
        id: "osc2",
        shape: "square",
        frequency: 1,
        detune: 7,
        volume: 0.3,
        phase: 0,
        unison: 1,
        unisonSpread: 10,
        wavetableIndex: 0,
        fmMod: null,
        fmDepth: 0,
        ringMod: null,
        pan: 0,
      },
      {
        id: "osc3",
        shape: "sine",
        frequency: 0.5,
        detune: -5,
        volume: 0.2,
        phase: 0,
        unison: 1,
        unisonSpread: 10,
        wavetableIndex: 0,
        fmMod: null,
        fmDepth: 0,
        ringMod: null,
        pan: 0,
      },
    ],
    filter: {
      type: "lowpass",
      cutoff: 2000,
      resonance: 1,
      drive: 0,
      keyTracking: 0.5,
      envAmount: 0.3,
      formants: [800, 1200, 2800],
    },
    ampEnv: {
      attack: 0.01,
      decay: 0.2,
      sustain: 0.7,
      release: 0.3,
      velocitySensitivity: 0.5,
      attackCurve: "exponential",
    },
    filterEnv: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.4, amount: 0.5 },
    glide: 0,
    monoMode: false,
    legato: false,
    pitchBendRange: 2,
    masterVolume: 0.8,
    bitcrush: 0,
    wavetablePosition: 0,
  };
}

// ============================================================
// SECTION 2: Text-to-Sound & AI Generation
// ============================================================

export interface TextToSoundParams {
  prompt: string;
  style: "pad" | "pluck" | "bass" | "lead" | "texture" | "percussion" | "vocal" | "cinematic";
  complexity: number; // 0..1
  brightness: number; // 0..1
  warmth: number; // 0..1
  motion: number; // 0..1
  duration: number; // seconds
}

export function createDefaultTextToSound(): TextToSoundParams {
  return {
    prompt: "",
    style: "pad",
    complexity: 0.5,
    brightness: 0.5,
    warmth: 0.5,
    motion: 0.3,
    duration: 4,
  };
}

const SOUND_KEYWORDS: Record<string, Partial<SoundEngineConfig>> = {
  warm: {
    filter: {
      cutoff: 1500,
      resonance: 0.5,
      drive: 0.2,
      keyTracking: 0.3,
      envAmount: 0.2,
      type: "lowpass",
      formants: [],
    },
  },
  bright: {
    filter: {
      cutoff: 8000,
      resonance: 1,
      drive: 0,
      keyTracking: 0.8,
      envAmount: 0.5,
      type: "lowpass",
      formants: [],
    },
  },
  dark: {
    filter: {
      cutoff: 800,
      resonance: 2,
      drive: 0.3,
      keyTracking: 0.2,
      envAmount: 0.1,
      type: "lowpass",
      formants: [],
    },
  },
  aggressive: {
    filter: {
      cutoff: 3000,
      resonance: 4,
      drive: 0.6,
      keyTracking: 0.5,
      envAmount: 0.7,
      type: "lowpass",
      formants: [],
    },
  },
  soft: {
    ampEnv: {
      attack: 0.3,
      decay: 0.5,
      sustain: 0.6,
      release: 0.8,
      velocitySensitivity: 0.7,
      attackCurve: "exponential",
    },
  },
  pluck: {
    ampEnv: {
      attack: 0.001,
      decay: 0.15,
      sustain: 0.0,
      release: 0.2,
      velocitySensitivity: 0.8,
      attackCurve: "linear",
    },
  },
  pad: {
    ampEnv: {
      attack: 0.8,
      decay: 0.3,
      sustain: 0.8,
      release: 1.5,
      velocitySensitivity: 0.3,
      attackCurve: "exponential",
    },
  },
  bass: {
    oscillators: [
      {
        id: "osc1",
        shape: "sawtooth",
        frequency: 0.5,
        detune: 0,
        volume: 0.7,
        phase: 0,
        unison: 3,
        unisonSpread: 20,
        wavetableIndex: 0,
        fmMod: null,
        fmDepth: 0,
        ringMod: null,
        pan: 0,
      },
    ],
  },
  metallic: {
    filter: {
      type: "ringmod",
      cutoff: 2000,
      resonance: 3,
      drive: 0.4,
      keyTracking: 0.5,
      envAmount: 0.3,
      formants: [],
    } as unknown as FilterConfig,
  },
  glassy: {
    filter: {
      cutoff: 6000,
      resonance: 8,
      drive: 0,
      keyTracking: 0.9,
      envAmount: 0.4,
      type: "bandpass",
      formants: [],
    },
  },
  gritty: { bitcrush: 0.3 },
  clean: { bitcrush: 0 },
  spacey: {
    filter: {
      cutoff: 3000,
      resonance: 2,
      drive: 0,
      keyTracking: 0.4,
      envAmount: 0.3,
      type: "lowpass",
      formants: [],
    },
  },
};

export function parseTextToSound(params: TextToSoundParams): SoundEngineConfig {
  const config = createDefaultSoundEngine();
  const prompt = params.prompt.toLowerCase();
  const styleMap: Record<string, Partial<SoundEngineConfig>> = {
    pad: {
      ampEnv: {
        attack: 0.8,
        decay: 0.3,
        sustain: 0.8,
        release: 1.5,
        velocitySensitivity: 0.3,
        attackCurve: "exponential",
      },
    },
    pluck: {
      ampEnv: {
        attack: 0.001,
        decay: 0.15,
        sustain: 0.0,
        release: 0.2,
        velocitySensitivity: 0.8,
        attackCurve: "linear",
      },
    },
    bass: {
      oscillators: [
        {
          id: "osc1",
          shape: "sawtooth",
          frequency: 0.5,
          detune: 0,
          volume: 0.7,
          phase: 0,
          unison: 3,
          unisonSpread: 20,
          wavetableIndex: 0,
          fmMod: null,
          fmDepth: 0,
          ringMod: null,
          pan: 0,
        },
      ],
    },
    lead: {
      oscillators: [
        {
          id: "osc1",
          shape: "sawtooth",
          frequency: 1,
          detune: 0,
          volume: 0.6,
          phase: 0,
          unison: 3,
          unisonSpread: 15,
          wavetableIndex: 0,
          fmMod: null,
          fmDepth: 0,
          ringMod: null,
          pan: 0,
        },
      ],
    },
    texture: {
      ampEnv: {
        attack: 1.0,
        decay: 0.5,
        sustain: 0.9,
        release: 2.0,
        velocitySensitivity: 0.1,
        attackCurve: "exponential",
      },
    },
    percussion: {
      ampEnv: {
        attack: 0.001,
        decay: 0.05,
        sustain: 0.0,
        release: 0.1,
        velocitySensitivity: 1.0,
        attackCurve: "linear",
      },
    },
    vocal: {
      filter: {
        type: "formant",
        cutoff: 2000,
        resonance: 5,
        drive: 0,
        keyTracking: 0.5,
        envAmount: 0.3,
        formants: [800, 1200, 2800],
      },
    },
    cinematic: {
      ampEnv: {
        attack: 0.5,
        decay: 0.8,
        sustain: 0.7,
        release: 2.0,
        velocitySensitivity: 0.4,
        attackCurve: "exponential",
      },
    },
  };
  const styleDefaults = styleMap[params.style] ?? {};
  Object.assign(config, styleDefaults);
  for (const [keyword, override] of Object.entries(SOUND_KEYWORDS)) {
    if (prompt.includes(keyword)) {
      if (override.filter) Object.assign(config.filter, override.filter);
      if (override.ampEnv) Object.assign(config.ampEnv, override.ampEnv);
      if (override.oscillators) config.oscillators = override.oscillators;
      if (override.bitcrush != null) config.bitcrush = override.bitcrush;
    }
  }
  config.filter.cutoff = 200 + params.brightness * 10000;
  config.ampEnv.attack = 0.001 + (1 - params.complexity) * 0.5;
  config.masterVolume = 0.3 + params.warmth * 0.5;
  if (params.motion > 0.5) config.filter.envAmount = params.motion * 0.8;
  return config;
}

// ============================================================
// SECTION 3: Ultra-Realistic Sound Design
// ============================================================

export type InstrumentType =
  | "piano"
  | "guitar"
  | "violin"
  | "cello"
  | "flute"
  | "trumpet"
  | "drum"
  | "vocal-choir"
  | "vocal-male"
  | "vocal-female"
  | "strings-ensemble"
  | "brass-section"
  | "woodwind"
  | "harp"
  | "marimba"
  | "xylophone"
  | "gong"
  | "thunder"
  | "rain"
  | "wind"
  | "ocean"
  | "fire"
  | "birds"
  | "thunder-rumble"
  | "explosion";

export interface InstrumentModel {
  type: InstrumentType;
  bodyResonance: number;
  stringStiffness: number;
  attackNoise: number;
  harmonicContent: number;
  breathNoise: number;
  bowPressure: number;
  sympatheticResonance: number;
  roomAmbience: number;
}

export function createDefaultInstrument(): InstrumentModel {
  return {
    type: "piano",
    bodyResonance: 0.6,
    stringStiffness: 0.3,
    attackNoise: 0.1,
    harmonicContent: 0.7,
    breathNoise: 0,
    bowPressure: 0,
    sympatheticResonance: 0.4,
    roomAmbience: 0.3,
  };
}

export function instrumentToEngineConfig(inst: InstrumentModel): SoundEngineConfig {
  const config = createDefaultSoundEngine();
  const presets: Partial<Record<InstrumentType, Partial<SoundEngineConfig>>> = {
    piano: {
      oscillators: [
        {
          id: "osc1",
          shape: "triangle",
          frequency: 1,
          detune: 0,
          volume: 0.6,
          phase: 0,
          unison: 1,
          unisonSpread: 0,
          wavetableIndex: 0,
          fmMod: null,
          fmDepth: 0,
          ringMod: null,
          pan: 0,
        },
      ],
      ampEnv: {
        attack: 0.005,
        decay: 1.5,
        sustain: 0.3,
        release: 0.8,
        velocitySensitivity: 0.8,
        attackCurve: "linear",
      },
      filter: {
        type: "lowpass",
        cutoff: 5000,
        resonance: 0.5,
        drive: 0,
        keyTracking: 0.7,
        envAmount: 0.2,
        formants: [],
      },
    },
    guitar: {
      oscillators: [
        {
          id: "osc1",
          shape: "sawtooth",
          frequency: 1,
          detune: 0,
          volume: 0.5,
          phase: 0,
          unison: 2,
          unisonSpread: 5,
          wavetableIndex: 0,
          fmMod: null,
          fmDepth: 0,
          ringMod: null,
          pan: 0,
        },
      ],
      ampEnv: {
        attack: 0.003,
        decay: 0.8,
        sustain: 0.2,
        release: 0.5,
        velocitySensitivity: 0.7,
        attackCurve: "linear",
      },
    },
    violin: {
      oscillators: [
        {
          id: "osc1",
          shape: "sawtooth",
          frequency: 1,
          detune: 0,
          volume: 0.4,
          phase: 0,
          unison: 3,
          unisonSpread: 8,
          wavetableIndex: 0,
          fmMod: null,
          fmDepth: 0,
          ringMod: null,
          pan: 0,
        },
      ],
      ampEnv: {
        attack: 0.1,
        decay: 0.3,
        sustain: 0.8,
        release: 0.4,
        velocitySensitivity: 0.5,
        attackCurve: "exponential",
      },
    },
    cello: {
      oscillators: [
        {
          id: "osc1",
          shape: "sawtooth",
          frequency: 0.5,
          detune: 0,
          volume: 0.5,
          phase: 0,
          unison: 3,
          unisonSpread: 6,
          wavetableIndex: 0,
          fmMod: null,
          fmDepth: 0,
          ringMod: null,
          pan: 0,
        },
      ],
      ampEnv: {
        attack: 0.15,
        decay: 0.4,
        sustain: 0.8,
        release: 0.5,
        velocitySensitivity: 0.5,
        attackCurve: "exponential",
      },
    },
    flute: {
      oscillators: [
        {
          id: "osc1",
          shape: "sine",
          frequency: 1,
          detune: 0,
          volume: 0.5,
          phase: 0,
          unison: 1,
          unisonSpread: 0,
          wavetableIndex: 0,
          fmMod: null,
          fmDepth: 0,
          ringMod: null,
          pan: 0,
        },
      ],
      ampEnv: {
        attack: 0.08,
        decay: 0.1,
        sustain: 0.9,
        release: 0.2,
        velocitySensitivity: 0.6,
        attackCurve: "exponential",
      },
      filter: {
        type: "lowpass",
        cutoff: 4000,
        resonance: 1,
        drive: 0,
        keyTracking: 0.6,
        envAmount: 0.1,
        formants: [],
      },
    },
    trumpet: {
      oscillators: [
        {
          id: "osc1",
          shape: "sawtooth",
          frequency: 1,
          detune: 0,
          volume: 0.5,
          phase: 0,
          unison: 1,
          unisonSpread: 0,
          wavetableIndex: 0,
          fmMod: null,
          fmDepth: 0,
          ringMod: null,
          pan: 0,
        },
      ],
      ampEnv: {
        attack: 0.05,
        decay: 0.2,
        sustain: 0.8,
        release: 0.3,
        velocitySensitivity: 0.7,
        attackCurve: "exponential",
      },
    },
    drum: {
      oscillators: [
        {
          id: "osc1",
          shape: "noise",
          frequency: 1,
          detune: 0,
          volume: 0.6,
          phase: 0,
          unison: 1,
          unisonSpread: 0,
          wavetableIndex: 0,
          fmMod: null,
          fmDepth: 0,
          ringMod: null,
          pan: 0,
        },
      ],
      ampEnv: {
        attack: 0.001,
        decay: 0.1,
        sustain: 0.0,
        release: 0.1,
        velocitySensitivity: 1.0,
        attackCurve: "linear",
      },
    },
    "vocal-choir": {
      oscillators: [
        {
          id: "osc1",
          shape: "sawtooth",
          frequency: 1,
          detune: -5,
          volume: 0.3,
          phase: 0,
          unison: 4,
          unisonSpread: 15,
          wavetableIndex: 0,
          fmMod: null,
          fmDepth: 0,
          ringMod: null,
          pan: -0.3,
        },
        {
          id: "osc2",
          shape: "sawtooth",
          frequency: 1,
          detune: 5,
          volume: 0.3,
          phase: 0,
          unison: 4,
          unisonSpread: 15,
          wavetableIndex: 0,
          fmMod: null,
          fmDepth: 0,
          ringMod: null,
          pan: 0.3,
        },
      ],
      filter: {
        type: "formant",
        cutoff: 2000,
        resonance: 5,
        drive: 0,
        keyTracking: 0.5,
        envAmount: 0.2,
        formants: [800, 1200, 2800],
      },
      ampEnv: {
        attack: 0.3,
        decay: 0.2,
        sustain: 0.9,
        release: 0.8,
        velocitySensitivity: 0.3,
        attackCurve: "exponential",
      },
    },
    "vocal-male": {
      filter: {
        type: "formant",
        cutoff: 1500,
        resonance: 6,
        drive: 0,
        keyTracking: 0.5,
        envAmount: 0.2,
        formants: [600, 1000, 2400],
      },
      ampEnv: {
        attack: 0.1,
        decay: 0.2,
        sustain: 0.9,
        release: 0.5,
        velocitySensitivity: 0.5,
        attackCurve: "exponential",
      },
    },
    "vocal-female": {
      filter: {
        type: "formant",
        cutoff: 2500,
        resonance: 6,
        drive: 0,
        keyTracking: 0.5,
        envAmount: 0.2,
        formants: [800, 1400, 3200],
      },
      ampEnv: {
        attack: 0.1,
        decay: 0.2,
        sustain: 0.9,
        release: 0.5,
        velocitySensitivity: 0.5,
        attackCurve: "exponential",
      },
    },
    "strings-ensemble": {
      oscillators: [
        {
          id: "osc1",
          shape: "sawtooth",
          frequency: 1,
          detune: -7,
          volume: 0.3,
          phase: 0,
          unison: 5,
          unisonSpread: 20,
          wavetableIndex: 0,
          fmMod: null,
          fmDepth: 0,
          ringMod: null,
          pan: -0.2,
        },
        {
          id: "osc2",
          shape: "sawtooth",
          frequency: 1,
          detune: 7,
          volume: 0.3,
          phase: 0,
          unison: 5,
          unisonSpread: 20,
          wavetableIndex: 0,
          fmMod: null,
          fmDepth: 0,
          ringMod: null,
          pan: 0.2,
        },
      ],
      ampEnv: {
        attack: 0.4,
        decay: 0.3,
        sustain: 0.9,
        release: 1.0,
        velocitySensitivity: 0.3,
        attackCurve: "exponential",
      },
    },
    "brass-section": {
      oscillators: [
        {
          id: "osc1",
          shape: "sawtooth",
          frequency: 1,
          detune: 0,
          volume: 0.5,
          phase: 0,
          unison: 3,
          unisonSpread: 10,
          wavetableIndex: 0,
          fmMod: null,
          fmDepth: 0,
          ringMod: null,
          pan: 0,
        },
      ],
      ampEnv: {
        attack: 0.06,
        decay: 0.2,
        sustain: 0.85,
        release: 0.4,
        velocitySensitivity: 0.6,
        attackCurve: "exponential",
      },
    },
    harp: {
      oscillators: [
        {
          id: "osc1",
          shape: "triangle",
          frequency: 1,
          detune: 0,
          volume: 0.5,
          phase: 0,
          unison: 1,
          unisonSpread: 0,
          wavetableIndex: 0,
          fmMod: null,
          fmDepth: 0,
          ringMod: null,
          pan: 0,
        },
      ],
      ampEnv: {
        attack: 0.002,
        decay: 1.2,
        sustain: 0.0,
        release: 0.8,
        velocitySensitivity: 0.7,
        attackCurve: "linear",
      },
    },
    marimba: {
      oscillators: [
        {
          id: "osc1",
          shape: "sine",
          frequency: 1,
          detune: 0,
          volume: 0.5,
          phase: 0,
          unison: 1,
          unisonSpread: 0,
          wavetableIndex: 0,
          fmMod: null,
          fmDepth: 0,
          ringMod: null,
          pan: 0,
        },
      ],
      ampEnv: {
        attack: 0.001,
        decay: 0.5,
        sustain: 0.0,
        release: 0.3,
        velocitySensitivity: 0.8,
        attackCurve: "linear",
      },
    },
  };
  const preset = presets[inst.type] ?? {};
  Object.assign(config, preset);
  if (inst.bodyResonance > 0.5) config.filter.resonance = 1 + inst.bodyResonance * 3;
  if (inst.stringStiffness > 0.5) config.filter.cutoff *= 0.7;
  if (inst.attackNoise > 0.3) {
    config.oscillators.push({
      id: "noise",
      shape: "noise",
      frequency: 1,
      detune: 0,
      volume: inst.attackNoise * 0.3,
      phase: 0,
      unison: 1,
      unisonSpread: 0,
      wavetableIndex: 0,
      fmMod: null,
      fmDepth: 0,
      ringMod: null,
      pan: 0,
    });
  }
  if (inst.breathNoise > 0.3) {
    config.oscillators.push({
      id: "breath",
      shape: "noise",
      frequency: 2,
      detune: 0,
      volume: inst.breathNoise * 0.2,
      phase: 0,
      unison: 1,
      unisonSpread: 0,
      wavetableIndex: 0,
      fmMod: null,
      fmDepth: 0,
      ringMod: null,
      pan: 0,
    });
  }
  return config;
}

// ============================================================
// SECTION 4: Audio Identifier & Deconstructor
// ============================================================

export interface AudioAnalysis {
  fundamentalFreq: number;
  harmonics: { freq: number; amplitude: number }[];
  noiseContent: number;
  transients: { time: number; intensity: number }[];
  spectralCentroid: number;
  spectralRolloff: number;
  zeroCrossingRate: number;
  dynamicRange: number;
  estimatedInstrument: InstrumentType;
  tempo: number;
  key: string;
  decomposition: { tonal: number; noise: number; transients_pct: number };
}

export async function analyzeAudio(
  engine: AudioEngine,
  audioBuffer: AudioBuffer,
): Promise<AudioAnalysis> {
  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const length = data.length;
  const analyser = engine.ctx.createAnalyser();
  analyser.fftSize = 4096;
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const timeData = new Float32Array(analyser.fftSize);
  const chunk = new Float32Array(Math.min(analyser.fftSize, length));
  for (let i = 0; i < chunk.length; i++) chunk[i] = data[i];
  const buf = engine.ctx.createBuffer(1, chunk.length, sampleRate);
  buf.getChannelData(0).set(chunk);
  const src = engine.ctx.createBufferSource();
  src.buffer = buf;
  src.connect(analyser);
  src.start();
  analyser.getByteFrequencyData(freqData);
  analyser.getFloatTimeDomainData(timeData);
  let peakBin = 0,
    peakVal = 0;
  for (let i = 1; i < freqData.length; i++) {
    if (freqData[i] > peakVal) {
      peakVal = freqData[i];
      peakBin = i;
    }
  }
  const fundamental = (peakBin * sampleRate) / analyser.fftSize;
  const harmonics: { freq: number; amplitude: number }[] = [];
  for (let h = 1; h <= 8; h++) {
    const bin = Math.round((fundamental * h * analyser.fftSize) / sampleRate);
    if (bin < freqData.length)
      harmonics.push({ freq: fundamental * h, amplitude: freqData[bin] / 255 });
  }
  let sumAmp = 0,
    sumWeighted = 0;
  for (let i = 0; i < freqData.length; i++) {
    const f = (i * sampleRate) / analyser.fftSize;
    const a = freqData[i] / 255;
    sumWeighted += f * a;
    sumAmp += a;
  }
  const centroid = sumAmp > 0 ? sumWeighted / sumAmp : 0;
  const totalEnergy = freqData.reduce((a, b) => a + b, 0);
  let cumEnergy = 0,
    rolloffBin = 0;
  for (let i = 0; i < freqData.length; i++) {
    cumEnergy += freqData[i];
    if (cumEnergy >= totalEnergy * 0.85) {
      rolloffBin = i;
      break;
    }
  }
  const rolloff = (rolloffBin * sampleRate) / analyser.fftSize;
  let zc = 0;
  for (let i = 1; i < timeData.length; i++) {
    if (timeData[i] >= 0 !== timeData[i - 1] >= 0) zc++;
  }
  const zcr = zc / (timeData.length / sampleRate);
  let maxVal = 0,
    minVal = Infinity;
  for (let i = 0; i < data.length; i += 100) {
    const v = Math.abs(data[i]);
    if (v > maxVal) maxVal = v;
    if (v > 0 && v < minVal) minVal = v;
  }
  const dr = minVal > 0 ? 20 * Math.log10(maxVal / minVal) : 0;
  const noiseContent = zcr > 5000 ? 0.8 : zcr > 2000 ? 0.4 : 0.1;
  const transients: { time: number; intensity: number }[] = [];
  const windowSize = 256;
  const energies: number[] = [];
  for (let i = 0; i < length - windowSize; i += windowSize) {
    let e = 0;
    for (let j = 0; j < windowSize; j++) e += data[i + j] ** 2;
    energies.push(e / windowSize);
  }
  const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length || 1;
  for (let i = 1; i < energies.length; i++) {
    if (energies[i] > avgEnergy * 2.5 && energies[i] > energies[i - 1] * 1.5) {
      transients.push({ time: (i * windowSize) / sampleRate, intensity: energies[i] / avgEnergy });
    }
  }
  let estimatedInstrument: InstrumentType = "piano";
  if (noiseContent > 0.6) estimatedInstrument = "drum";
  else if (harmonics.length > 5 && harmonics[1]?.amplitude > 0.5) estimatedInstrument = "violin";
  else if (centroid > 5000) estimatedInstrument = "flute";
  else if (centroid < 1000) estimatedInstrument = "cello";
  else if (harmonics.length > 3 && harmonics[1]?.amplitude > 0.3) estimatedInstrument = "trumpet";
  const key =
    fundamental > 0
      ? NOTE_NAMES[Math.round(12 * Math.log2(fundamental / 440)) % 12] + " Major"
      : "Unknown";
  return {
    fundamentalFreq: fundamental,
    harmonics,
    noiseContent,
    transients,
    spectralCentroid: centroid,
    spectralRolloff: rolloff,
    zeroCrossingRate: zcr,
    dynamicRange: dr,
    estimatedInstrument,
    tempo: transients.length > 4 ? Math.round((transients.length / (length / sampleRate)) * 60) : 0,
    key,
    decomposition: {
      tonal: harmonics.length > 3 ? 0.7 : 0.3,
      noise: noiseContent,
      transients_pct: transients.length / Math.max(1, length / sampleRate),
    },
  };
}

// ============================================================
// SECTION 5: Sampler & Resampling
// ============================================================

export interface SampleChop {
  id: string;
  start: number;
  end: number;
  pitch: number;
  volume: number;
  pan: number;
  reverse: boolean;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  fade: number;
  granularMode: boolean;
  grainSize: number;
  grainRate: number;
  grainOverlap: number;
  grainPitchJitter: number;
  grainPosJitter: number;
}

export interface SamplerConfig {
  buffer: AudioBuffer | null;
  chopSize: number;
  chopCount: number;
  chops: SampleChop[];
  resampleRate: number;
  bitDepth: number;
  interpolation: "linear" | "cubic" | "none";
  timestretch: number;
  pitchShift: number;
  formantShift: number;
  sliceSensitivity: number;
}

export function createDefaultSampler(): SamplerConfig {
  return {
    buffer: null,
    chopSize: 0.5,
    chopCount: 16,
    chops: [],
    resampleRate: 1,
    bitDepth: 32,
    interpolation: "cubic",
    timestretch: 1,
    pitchShift: 0,
    formantShift: 0,
    sliceSensitivity: 0.5,
  };
}

export function autoChop(buffer: AudioBuffer, chopSize: number): SampleChop[] {
  const chops: SampleChop[] = [];
  const count = Math.floor(buffer.duration / chopSize);
  for (let i = 0; i < count; i++) {
    chops.push({
      id: `chop-${i}`,
      start: i * chopSize,
      end: Math.min((i + 1) * chopSize, buffer.duration),
      pitch: 0,
      volume: 0.8,
      pan: 0,
      reverse: false,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      fade: 0.01,
      granularMode: false,
      grainSize: 50,
      grainRate: 20,
      grainOverlap: 0.5,
      grainPitchJitter: 0,
      grainPosJitter: 0,
    });
  }
  return chops;
}

export function transientSlice(buffer: AudioBuffer, sensitivity: number): SampleChop[] {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const windowSize = 512;
  const energies: number[] = [];
  for (let i = 0; i < data.length - windowSize; i += windowSize) {
    let e = 0;
    for (let j = 0; j < windowSize; j++) e += data[i + j] ** 2;
    energies.push(e);
  }
  const avg = energies.reduce((a, b) => a + b, 0) / energies.length || 1;
  const threshold = avg * (1 + (1 - sensitivity) * 2);
  const chops: SampleChop[] = [];
  let chopStart = 0,
    chopIdx = 0;
  for (let i = 1; i < energies.length; i++) {
    if (energies[i] > threshold && energies[i] > energies[i - 1] * 1.5) {
      const t = (i * windowSize) / sampleRate;
      if (t - chopStart > 0.05) {
        chops.push({
          id: `slice-${chopIdx++}`,
          start: chopStart,
          end: t,
          pitch: 0,
          volume: 0.8,
          pan: 0,
          reverse: false,
          loop: false,
          loopStart: 0,
          loopEnd: 0,
          fade: 0.005,
          granularMode: false,
          grainSize: 50,
          grainRate: 20,
          grainOverlap: 0.5,
          grainPitchJitter: 0,
          grainPosJitter: 0,
        });
        chopStart = t;
      }
    }
  }
  if (chopStart < buffer.duration) {
    chops.push({
      id: `slice-${chopIdx}`,
      start: chopStart,
      end: buffer.duration,
      pitch: 0,
      volume: 0.8,
      pan: 0,
      reverse: false,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      fade: 0.005,
      granularMode: false,
      grainSize: 50,
      grainRate: 20,
      grainOverlap: 0.5,
      grainPitchJitter: 0,
      grainPosJitter: 0,
    });
  }
  return chops;
}

// ============================================================
// SECTION 6: Melody/Harmony/Theory Engine
// ============================================================

export interface TheoryConfig {
  key: string;
  scaleType: string;
  chordProgression: string[];
  voiceLeading: boolean;
  counterpoint: boolean;
  harmonicRhythm: number;
  modulationTarget: string | null;
}

export function createDefaultTheory(): TheoryConfig {
  return {
    key: "C",
    scaleType: "major",
    chordProgression: ["I", "V", "vi", "IV"],
    voiceLeading: true,
    counterpoint: false,
    harmonicRhythm: 4,
    modulationTarget: null,
  };
}

const ROMAN_TO_SEMITONES: Record<string, number> = {
  I: 0,
  II: 2,
  III: 4,
  IV: 5,
  V: 7,
  VI: 9,
  VII: 11,
  i: 0,
  ii: 2,
  iii: 4,
  iv: 5,
  v: 7,
  vi: 9,
  vii: 11,
};

export function chordToNotes(roman: string, key: string, scaleType: string): number[] {
  const keyIdx = NOTE_NAMES.indexOf(key);
  if (keyIdx < 0) return [];
  const scale = SCALES[scaleType] ?? SCALES.major;
  const rootSemitone = ROMAN_TO_SEMITONES[roman] ?? 0;
  const rootMidi = 60 + keyIdx + rootSemitone;
  const degree = scale.indexOf(rootSemitone % 12);
  const third = scale[(degree + 2) % scale.length] + (degree + 2 >= scale.length ? 12 : 0);
  const fifth = scale[(degree + 4) % scale.length] + (degree + 4 >= scale.length ? 12 : 0);
  return [rootMidi, rootMidi + third - rootSemitone, rootMidi + fifth - rootSemitone];
}

export function generateMelody(theory: TheoryConfig, bars: number, seed: number): number[][] {
  const scale = SCALES[theory.scaleType] ?? SCALES.major;
  const keyIdx = NOTE_NAMES.indexOf(theory.key);
  const melody: number[][] = [];
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let bar = 0; bar < bars; bar++) {
    const barNotes: number[] = [];
    for (let i = 0; i < 4; i++) {
      if (rand() > 0.7) {
        barNotes.push(-1);
        continue;
      }
      const degree = Math.floor(rand() * scale.length);
      const octave = Math.floor(rand() * 2);
      barNotes.push(60 + keyIdx + scale[degree] + octave * 12);
    }
    melody.push(barNotes);
  }
  return melody;
}

// ============================================================
// SECTION 7: MIDI & Performance Tools
// ============================================================

export interface MIDIConfig {
  inputDevice: string | null;
  outputDevice: string | null;
  channel: number;
  velocityCurve: "linear" | "exponential" | "logarithmic" | "s-curve";
  velocityMin: number;
  velocityMax: number;
  aftertouchSensitivity: number;
  pitchBendSensitivity: number;
  modWheelCC: number;
  sustainPedal: boolean;
  expressionPedal: boolean;
  mpe: boolean;
  arpeggiator: boolean;
  arpPattern: "up" | "down" | "updown" | "random" | "asplayed";
  arpRate: number;
  arpOctaves: number;
  chordMode: boolean;
  chordShape: "triad" | "seventh" | "sus4" | "add9" | "power";
}

export function createDefaultMIDI(): MIDIConfig {
  return {
    inputDevice: null,
    outputDevice: null,
    channel: 0,
    velocityCurve: "linear",
    velocityMin: 20,
    velocityMax: 127,
    aftertouchSensitivity: 0.5,
    pitchBendSensitivity: 2,
    modWheelCC: 1,
    sustainPedal: true,
    expressionPedal: false,
    mpe: false,
    arpeggiator: false,
    arpPattern: "up",
    arpRate: 8,
    arpOctaves: 1,
    chordMode: false,
    chordShape: "triad",
  };
}

// ============================================================
// SECTION 8: Loop Creation & Reshaping
// ============================================================

export interface LoopConfig {
  length: number;
  tempo: number;
  slices: number;
  swing: number;
  humanize: number;
  reverseMode: "off" | "full" | "every-other" | "random";
  stutter: number;
  gate: number;
  pitchVariation: number;
  timeSignature: [number, number];
  resample: number;
  bitcrush: number;
  warpmode: "beats" | "time" | "repitch" | "texture";
  fade: number;
}

export function createDefaultLoop(): LoopConfig {
  return {
    length: 4,
    tempo: 120,
    slices: 16,
    swing: 0,
    humanize: 0,
    reverseMode: "off",
    stutter: 0,
    gate: 1,
    pitchVariation: 0,
    timeSignature: [4, 4],
    resample: 1,
    bitcrush: 0,
    warpmode: "beats",
    fade: 0.01,
  };
}

// ============================================================
// SECTION 9: Effects Rack
// ============================================================

export type FXType =
  | "compressor"
  | "limiter"
  | "gate"
  | "expander"
  | "eq3"
  | "eq8"
  | "dynamic-eq"
  | "reverb"
  | "delay"
  | "chorus"
  | "phaser"
  | "flanger"
  | "tremolo"
  | "distortion"
  | "fuzz"
  | "overdrive"
  | "bitcrush"
  | "saturation"
  | "amp"
  | "cabinet"
  | "halfspeed"
  | "tremolo-pick"
  | "vibrato"
  | "autopan"
  | "portal"
  | "shimmer"
  | "freeze"
  | "reverse"
  | "granular-fx"
  | "vocoder"
  | "pitch-shift"
  | "harmonizer"
  | "formant"
  | "stereo-widener"
  | "mid-side"
  | "transient-shaper";

export interface FXSlot {
  id: string;
  type: FXType;
  enabled: boolean;
  mix: number;
  params: Record<string, number>;
}
export interface EffectsRack {
  slots: (FXSlot | null)[];
  routing: "serial" | "parallel" | "custom";
  customRouting: number[][];
  masterGain: number;
}

export function createDefaultFX(type: FXType): FXSlot {
  const defaults: Record<FXType, Record<string, number>> = {
    compressor: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25, knee: 6, makeup: 1 },
    limiter: { threshold: -1, release: 0.05, lookahead: 0.003 },
    gate: { threshold: -40, attack: 0.001, release: 0.1, range: -80 },
    expander: { threshold: -30, ratio: 2, attack: 0.005, release: 0.2, range: -20 },
    eq3: {
      lowGain: 0,
      lowFreq: 100,
      midGain: 0,
      midFreq: 1000,
      midQ: 1,
      highGain: 0,
      highFreq: 8000,
    },
    eq8: { g: 0, g2: 0, g3: 0, g4: 0, g5: 0, g6: 0, g7: 0, g8: 0 },
    "dynamic-eq": { threshold: -20, freq: 2000, q: 1, range: -6, attack: 0.01, release: 0.1 },
    reverb: { decay: 2, predelay: 0.02, size: 0.5, damping: 0.5, width: 1, mix: 0.3 },
    delay: {
      time: 0.375,
      feedback: 0.35,
      tone: 0.5,
      mix: 0.25,
      pingpong: 0,
      modDepth: 0,
      modRate: 0,
    },
    chorus: { rate: 0.5, depth: 0.3, mix: 0.3, voices: 3 },
    phaser: { rate: 0.5, depth: 0.5, feedback: 0.3, mix: 0.3, stages: 4 },
    flanger: { rate: 0.3, depth: 0.5, feedback: 0.4, mix: 0.3 },
    tremolo: { rate: 5, depth: 0.5, shape: 0, mix: 1 },
    distortion: { drive: 0.5, tone: 0.5, mix: 1 },
    fuzz: { drive: 0.8, tone: 0.3, mix: 1 },
    overdrive: { drive: 0.3, tone: 0.6, mix: 1 },
    bitcrush: { bits: 8, rate: 0.5, mix: 1 },
    saturation: { drive: 0.3, mix: 1, character: 0.5 },
    amp: { model: 0, gain: 0.5, bass: 0.5, mid: 0.5, treble: 0.5, presence: 0.5 },
    cabinet: { model: 0, size: 0.5 },
    halfspeed: { mix: 0.5 },
    "tremolo-pick": { rate: 8, depth: 0.8 },
    vibrato: { rate: 5, depth: 0.3 },
    autopan: { rate: 2, depth: 0.5 },
    portal: { size: 0.5, pitch: 0, feedback: 0.3, mix: 0.5 },
    shimmer: { pitch: 12, decay: 3, mix: 0.3 },
    freeze: { mix: 0.5 },
    reverse: { mix: 0.5 },
    "granular-fx": { grainSize: 50, rate: 20, pitch: 0, mix: 0.3 },
    vocoder: { bands: 16, formantShift: 0, mix: 0.5 },
    "pitch-shift": { pitch: 7, mix: 1 },
    harmonizer: { pitch1: 7, pitch2: -5, mix1: 0.5, mix2: 0.5 },
    formant: { shift: 0, width: 1 },
    "stereo-widener": { width: 1.5, lowWidth: 0.5, freq: 200 },
    "mid-side": { midGain: 0, sideGain: 0 },
    "transient-shaper": { attack: 1, sustain: 1 },
  };
  return {
    id: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    enabled: true,
    mix: 0.5,
    params: defaults[type] ?? {},
  };
}

export function createDefaultEffectsRack(): EffectsRack {
  return {
    slots: [
      createDefaultFX("compressor"),
      createDefaultFX("eq3"),
      createDefaultFX("reverb"),
      createDefaultFX("delay"),
      null,
      null,
      null,
      null,
    ],
    routing: "serial",
    customRouting: [],
    masterGain: 0.8,
  };
}

// ============================================================
// SECTION 10: Modulation System
// ============================================================

export type LFOWave = "sine" | "triangle" | "saw" | "square" | "random" | "s&h" | "custom";

export interface LFO {
  id: string;
  rate: number;
  depth: number;
  shape: LFOWave;
  phase: number;
  sync: boolean;
  tempoDiv: string;
  customWave: number[];
}
export interface Envelope {
  id: string;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  loop: boolean;
  loopMode: "fwd" | "bwd" | "fwd-bwd";
}
export interface ModRouting {
  source: string;
  target: string;
  depth: number;
  enabled: boolean;
}
export interface ModulationSystem {
  lfos: LFO[];
  envelopes: Envelope[];
  routings: ModRouting[];
  velocityTo: string[];
  aftertouchTo: string[];
  keytrackTo: string[];
}

export function createDefaultLFO(): LFO {
  return {
    id: `lfo-${Date.now()}`,
    rate: 2,
    depth: 0.5,
    shape: "sine",
    phase: 0,
    sync: false,
    tempoDiv: "1/4",
    customWave: [],
  };
}
export function createDefaultEnvelope(): Envelope {
  return {
    id: `env-${Date.now()}`,
    attack: 0.01,
    decay: 0.2,
    sustain: 0.7,
    release: 0.3,
    loop: false,
    loopMode: "fwd",
  };
}
export function createDefaultModulation(): ModulationSystem {
  return {
    lfos: [createDefaultLFO()],
    envelopes: [createDefaultEnvelope()],
    routings: [{ source: "lfo-1", target: "filter.cutoff", depth: 0.3, enabled: true }],
    velocityTo: ["ampEnv.attack", "filter.cutoff"],
    aftertouchTo: ["filter.cutoff"],
    keytrackTo: ["filter.cutoff"],
  };
}

// ============================================================
// SECTION 11: Mixer & Routing
// ============================================================

export interface MixerChannel {
  id: string;
  name: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  sends: { auxId: string; level: number }[];
  insertFX: string[];
  color: string;
  inputSource: string;
}
export interface MixerConfig {
  channels: MixerChannel[];
  auxChannels: MixerChannel[];
  masterVolume: number;
  masterPan: number;
  masterFX: string[];
  routingMatrix: Record<string, string>;
}

export function createDefaultMixer(): MixerConfig {
  return {
    channels: [
      {
        id: "ch1",
        name: "Osc 1",
        volume: 0.7,
        pan: 0,
        mute: false,
        solo: false,
        sends: [],
        insertFX: [],
        color: "#3b82f6",
        inputSource: "osc1",
      },
      {
        id: "ch2",
        name: "Osc 2",
        volume: 0.5,
        pan: 0,
        mute: false,
        solo: false,
        sends: [],
        insertFX: [],
        color: "#10b981",
        inputSource: "osc2",
      },
      {
        id: "ch3",
        name: "Osc 3",
        volume: 0.3,
        pan: 0,
        mute: false,
        solo: false,
        sends: [],
        insertFX: [],
        color: "#f59e0b",
        inputSource: "osc3",
      },
      {
        id: "ch4",
        name: "Sampler",
        volume: 0.7,
        pan: 0,
        mute: false,
        solo: false,
        sends: [],
        insertFX: [],
        color: "#ef4444",
        inputSource: "sampler",
      },
    ],
    auxChannels: [
      {
        id: "aux1",
        name: "Reverb Send",
        volume: 0.5,
        pan: 0,
        mute: false,
        solo: false,
        sends: [],
        insertFX: [],
        color: "#8b5cf6",
        inputSource: "master",
      },
      {
        id: "aux2",
        name: "Delay Send",
        volume: 0.5,
        pan: 0,
        mute: false,
        solo: false,
        sends: [],
        insertFX: [],
        color: "#ec4899",
        inputSource: "master",
      },
    ],
    masterVolume: 0.8,
    masterPan: 0,
    masterFX: [],
    routingMatrix: {},
  };
}

// ============================================================
// SECTION 12: Stems/Export & Mastering
// ============================================================

export interface ExportConfig {
  format: "wav" | "mp3" | "flac" | "ogg" | "aiff";
  sampleRate: number;
  bitDepth: number;
  channels: "mono" | "stereo";
  normalize: boolean;
  normalizeTarget: number;
  dither: boolean;
  ditherType: "triangular" | "rectangular" | "noise-shaped";
  stems: boolean;
  stemList: string[];
  masterChain: string[];
  loudnessTarget: number;
  truePeak: number;
}

export function createDefaultExport(): ExportConfig {
  return {
    format: "wav",
    sampleRate: 48000,
    bitDepth: 24,
    channels: "stereo",
    normalize: true,
    normalizeTarget: -1,
    dither: true,
    ditherType: "triangular",
    stems: false,
    stemList: [],
    masterChain: [],
    loudnessTarget: -14,
    truePeak: -1,
  };
}

// ============================================================
// SECTION 13: Visualizer & Analysis
// ============================================================

export type VizMode =
  | "spectrum"
  | "spectrogram"
  | "oscilloscope"
  | "vectorscope"
  | "loudness"
  | "sonogram"
  | "phase"
  | "waterfall"
  | "radial"
  | "3d-bars";

export interface VisualizerConfig {
  mode: VizMode;
  fftSize: number;
  smoothing: number;
  colorScheme: "classic" | "fire" | "ice" | "neon" | "mono" | "rainbow" | "viridis";
  scale: "linear" | "logarithmic";
  decay: number;
  peakHold: boolean;
  freeze: boolean;
  overlay: boolean;
}

export function createDefaultVisualizer(): VisualizerConfig {
  return {
    mode: "spectrum",
    fftSize: 2048,
    smoothing: 0.8,
    colorScheme: "neon",
    scale: "logarithmic",
    decay: 0.95,
    peakHold: true,
    freeze: false,
    overlay: false,
  };
}

// ============================================================
// SECTION 14: Workflow & Intelligence
// ============================================================

export interface WorkflowConfig {
  autoArrange: boolean;
  smartSuggestions: boolean;
  chordAssist: boolean;
  melodyAssist: boolean;
  mixAssist: boolean;
  presetMorph: boolean;
  aarMode: boolean;
  collaboration: boolean;
  versionHistory: boolean;
  undoStack: number;
  macroRecord: boolean;
  smartSearch: boolean;
  contextAware: boolean;
}

export function createDefaultWorkflow(): WorkflowConfig {
  return {
    autoArrange: false,
    smartSuggestions: true,
    chordAssist: true,
    melodyAssist: true,
    mixAssist: true,
    presetMorph: false,
    aarMode: false,
    collaboration: false,
    versionHistory: true,
    undoStack: 50,
    macroRecord: false,
    smartSearch: true,
    contextAware: true,
  };
}

export interface SmartSuggestion {
  type: "chord" | "melody" | "mix" | "fx" | "arrangement" | "sound";
  description: string;
  params: Record<string, unknown>;
  confidence: number;
}

export function generateSuggestions(
  theory: TheoryConfig,
  engine: SoundEngineConfig,
): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = [];
  suggestions.push({
    type: "chord",
    description: `Try ii-V-I in ${theory.key} ${theory.scaleType} for a classic jazz progression`,
    params: { progression: ["ii", "V", "I"] },
    confidence: 0.8,
  });
  if (engine.filter.cutoff < 1000)
    suggestions.push({
      type: "mix",
      description:
        "Filter cutoff is low — consider adding brightness with a high-shelf EQ or increasing cutoff",
      params: { action: "increase-cutoff" },
      confidence: 0.7,
    });
  if (engine.ampEnv.release > 1)
    suggestions.push({
      type: "fx",
      description: "Long release detected — a reverb send would complement the sustain",
      params: { fx: "reverb", mix: 0.2 },
      confidence: 0.6,
    });
  if (engine.oscillators.length === 1)
    suggestions.push({
      type: "sound",
      description: "Only one oscillator — add a detuned layer for richness",
      params: { action: "add-osc", detune: 7 },
      confidence: 0.75,
    });
  return suggestions;
}

// ============================================================
// SECTION 15: Unique VINNY-Only Features
// ============================================================

export interface TimeMachineState {
  snapshots: { time: number; config: SoundEngineConfig; label: string }[];
  current: number;
  isPlaying: boolean;
  playbackSpeed: number;
}
export function createDefaultTimeMachine(): TimeMachineState {
  return { snapshots: [], current: -1, isPlaying: false, playbackSpeed: 1 };
}
export function takeSnapshot(
  tm: TimeMachineState,
  config: SoundEngineConfig,
  label: string,
): TimeMachineState {
  return {
    ...tm,
    snapshots: [...tm.snapshots, { time: Date.now(), config: { ...config }, label }],
    current: tm.snapshots.length,
  };
}

export type Genre =
  | "trap"
  | "lofi"
  | "house"
  | "techno"
  | "dnb"
  | "ambient"
  | "rock"
  | "jazz"
  | "classical"
  | "pop"
  | "rnb"
  | "metal"
  | "folk"
  | "reggae"
  | "blues";

const GENRE_PRESETS: Record<Genre, Partial<SoundEngineConfig>> = {
  trap: {
    ampEnv: {
      attack: 0.005,
      decay: 0.3,
      sustain: 0.5,
      release: 0.2,
      velocitySensitivity: 0.8,
      attackCurve: "linear",
    },
    filter: {
      cutoff: 1500,
      resonance: 3,
      drive: 0.3,
      keyTracking: 0.5,
      envAmount: 0.5,
      type: "lowpass",
      formants: [],
    },
  },
  lofi: {
    ampEnv: {
      attack: 0.05,
      decay: 0.5,
      sustain: 0.6,
      release: 0.8,
      velocitySensitivity: 0.3,
      attackCurve: "exponential",
    },
    filter: {
      cutoff: 2000,
      resonance: 0.5,
      drive: 0.2,
      keyTracking: 0.3,
      envAmount: 0.2,
      type: "lowpass",
      formants: [],
    },
    bitcrush: 0.15,
  },
  house: {
    ampEnv: {
      attack: 0.01,
      decay: 0.2,
      sustain: 0.8,
      release: 0.3,
      velocitySensitivity: 0.5,
      attackCurve: "exponential",
    },
    filter: {
      cutoff: 3000,
      resonance: 2,
      drive: 0.1,
      keyTracking: 0.5,
      envAmount: 0.4,
      type: "lowpass",
      formants: [],
    },
  },
  techno: {
    ampEnv: {
      attack: 0.005,
      decay: 0.15,
      sustain: 0.7,
      release: 0.1,
      velocitySensitivity: 0.6,
      attackCurve: "linear",
    },
    filter: {
      cutoff: 2000,
      resonance: 4,
      drive: 0.4,
      keyTracking: 0.5,
      envAmount: 0.6,
      type: "lowpass",
      formants: [],
    },
  },
  dnb: {
    ampEnv: {
      attack: 0.001,
      decay: 0.1,
      sustain: 0.3,
      release: 0.15,
      velocitySensitivity: 0.9,
      attackCurve: "linear",
    },
    filter: {
      cutoff: 4000,
      resonance: 2,
      drive: 0.2,
      keyTracking: 0.6,
      envAmount: 0.5,
      type: "lowpass",
      formants: [],
    },
  },
  ambient: {
    ampEnv: {
      attack: 1.5,
      decay: 1.0,
      sustain: 0.9,
      release: 3.0,
      velocitySensitivity: 0.1,
      attackCurve: "exponential",
    },
    filter: {
      cutoff: 2500,
      resonance: 1,
      drive: 0,
      keyTracking: 0.3,
      envAmount: 0.3,
      type: "lowpass",
      formants: [],
    },
  },
  rock: {
    ampEnv: {
      attack: 0.003,
      decay: 0.2,
      sustain: 0.6,
      release: 0.4,
      velocitySensitivity: 0.7,
      attackCurve: "linear",
    },
    filter: {
      cutoff: 3500,
      resonance: 1,
      drive: 0.5,
      keyTracking: 0.5,
      envAmount: 0.3,
      type: "lowpass",
      formants: [],
    },
  },
  jazz: {
    ampEnv: {
      attack: 0.01,
      decay: 0.5,
      sustain: 0.5,
      release: 0.6,
      velocitySensitivity: 0.6,
      attackCurve: "exponential",
    },
    filter: {
      cutoff: 4000,
      resonance: 0.5,
      drive: 0,
      keyTracking: 0.6,
      envAmount: 0.2,
      type: "lowpass",
      formants: [],
    },
  },
  classical: {
    ampEnv: {
      attack: 0.05,
      decay: 0.8,
      sustain: 0.4,
      release: 1.5,
      velocitySensitivity: 0.8,
      attackCurve: "exponential",
    },
    filter: {
      cutoff: 6000,
      resonance: 0.5,
      drive: 0,
      keyTracking: 0.7,
      envAmount: 0.1,
      type: "lowpass",
      formants: [],
    },
  },
  pop: {
    ampEnv: {
      attack: 0.01,
      decay: 0.3,
      sustain: 0.7,
      release: 0.5,
      velocitySensitivity: 0.6,
      attackCurve: "exponential",
    },
    filter: {
      cutoff: 4000,
      resonance: 1,
      drive: 0.1,
      keyTracking: 0.5,
      envAmount: 0.3,
      type: "lowpass",
      formants: [],
    },
  },
  rnb: {
    ampEnv: {
      attack: 0.02,
      decay: 0.4,
      sustain: 0.7,
      release: 0.6,
      velocitySensitivity: 0.5,
      attackCurve: "exponential",
    },
    filter: {
      cutoff: 3000,
      resonance: 1.5,
      drive: 0.2,
      keyTracking: 0.5,
      envAmount: 0.3,
      type: "lowpass",
      formants: [],
    },
  },
  metal: {
    ampEnv: {
      attack: 0.001,
      decay: 0.15,
      sustain: 0.5,
      release: 0.2,
      velocitySensitivity: 0.8,
      attackCurve: "linear",
    },
    filter: {
      cutoff: 5000,
      resonance: 2,
      drive: 0.7,
      keyTracking: 0.5,
      envAmount: 0.4,
      type: "lowpass",
      formants: [],
    },
  },
  folk: {
    ampEnv: {
      attack: 0.005,
      decay: 0.6,
      sustain: 0.3,
      release: 0.8,
      velocitySensitivity: 0.7,
      attackCurve: "linear",
    },
    filter: {
      cutoff: 5000,
      resonance: 0.5,
      drive: 0,
      keyTracking: 0.6,
      envAmount: 0.2,
      type: "lowpass",
      formants: [],
    },
  },
  reggae: {
    ampEnv: {
      attack: 0.003,
      decay: 0.3,
      sustain: 0.4,
      release: 0.4,
      velocitySensitivity: 0.6,
      attackCurve: "linear",
    },
    filter: {
      cutoff: 3500,
      resonance: 1,
      drive: 0.1,
      keyTracking: 0.5,
      envAmount: 0.3,
      type: "lowpass",
      formants: [],
    },
  },
  blues: {
    ampEnv: {
      attack: 0.01,
      decay: 0.4,
      sustain: 0.5,
      release: 0.5,
      velocitySensitivity: 0.7,
      attackCurve: "exponential",
    },
    filter: {
      cutoff: 4000,
      resonance: 1,
      drive: 0.2,
      keyTracking: 0.5,
      envAmount: 0.3,
      type: "lowpass",
      formants: [],
    },
  },
};

export function migrateGenre(config: SoundEngineConfig, genre: Genre): SoundEngineConfig {
  const preset = GENRE_PRESETS[genre];
  return {
    ...config,
    ...preset,
    filter: { ...config.filter, ...preset.filter },
    ampEnv: { ...config.ampEnv, ...preset.ampEnv },
  };
}

export type Vibe =
  | "happy"
  | "sad"
  | "energetic"
  | "calm"
  | "dark"
  | "mysterious"
  | "epic"
  | "nostalgic"
  | "aggressive"
  | "dreamy"
  | "tense"
  | "uplifting";

const VIBE_MAP: Record<
  Vibe,
  { scaleType: string; tempo: number; filterCutoff: number; reverb: number }
> = {
  happy: { scaleType: "major", tempo: 128, filterCutoff: 5000, reverb: 0.2 },
  sad: { scaleType: "minor", tempo: 70, filterCutoff: 2000, reverb: 0.4 },
  energetic: { scaleType: "major", tempo: 140, filterCutoff: 6000, reverb: 0.15 },
  calm: { scaleType: "majorPentatonic", tempo: 60, filterCutoff: 3000, reverb: 0.5 },
  dark: { scaleType: "phrygian", tempo: 90, filterCutoff: 1500, reverb: 0.3 },
  mysterious: { scaleType: "harmonicMinor", tempo: 80, filterCutoff: 2500, reverb: 0.45 },
  epic: { scaleType: "major", tempo: 120, filterCutoff: 4000, reverb: 0.6 },
  nostalgic: { scaleType: "major", tempo: 85, filterCutoff: 2500, reverb: 0.35 },
  aggressive: { scaleType: "minor", tempo: 160, filterCutoff: 4000, reverb: 0.1 },
  dreamy: { scaleType: "lydian", tempo: 75, filterCutoff: 3500, reverb: 0.55 },
  tense: { scaleType: "minor", tempo: 100, filterCutoff: 2000, reverb: 0.25 },
  uplifting: { scaleType: "major", tempo: 130, filterCutoff: 5500, reverb: 0.3 },
};

export function applyVibe(
  config: SoundEngineConfig,
  theory: TheoryConfig,
  vibe: Vibe,
): { config: SoundEngineConfig; theory: TheoryConfig; tempo: number; reverb: number } {
  const v = VIBE_MAP[vibe];
  return {
    config: { ...config, filter: { ...config.filter, cutoff: v.filterCutoff } },
    theory: { ...theory, scaleType: v.scaleType },
    tempo: v.tempo,
    reverb: v.reverb,
  };
}

export interface PerformConfig {
  sceneCount: number;
  currentScene: number;
  scenes: { name: string; config: SoundEngineConfig; fx: EffectsRack }[];
  crossfadeTime: number;
  macroKnobs: number[];
  midiMapping: Record<number, string>;
  instantRecall: boolean;
}
export function createDefaultPerform(): PerformConfig {
  return {
    sceneCount: 8,
    currentScene: 0,
    scenes: [],
    crossfadeTime: 0.1,
    macroKnobs: [0, 0, 0, 0, 0, 0, 0, 0],
    midiMapping: {},
    instantRecall: true,
  };
}

export interface SoundDNA {
  hash: string;
  traits: {
    brightness: number;
    warmth: number;
    complexity: number;
    movement: number;
    richness: number;
    punch: number;
    space: number;
    aggression: number;
  };
  parentHash: string | null;
  generation: number;
  mutations: string[];
}
export function computeDNA(config: SoundEngineConfig, fx: EffectsRack): SoundDNA {
  const traits = {
    brightness: Math.min(1, config.filter.cutoff / 10000),
    warmth: 1 - Math.min(1, config.filter.cutoff / 5000),
    complexity: Math.min(1, config.oscillators.length / 5),
    movement: config.filter.envAmount,
    richness: Math.min(1, config.oscillators.reduce((a, o) => a + o.unison, 0) / 15),
    punch: 1 - config.ampEnv.attack * 10,
    space: fx.slots.filter((s) => s?.type === "reverb").length > 0 ? 0.5 : 0,
    aggression: config.filter.drive,
  };
  return {
    hash: Object.values(traits)
      .map((v) => v.toFixed(2))
      .join("-")
      .slice(0, 32),
    traits,
    parentHash: null,
    generation: 0,
    mutations: [],
  };
}

export interface AdaptiveMix {
  enabled: boolean;
  targetLoudness: number;
  autoEQ: boolean;
  autoBalance: boolean;
  autoDuck: boolean;
  sidechainSource: string | null;
  sidechainThreshold: number;
  sidechainRatio: number;
  autoMaster: boolean;
}
export function createDefaultAdaptiveMix(): AdaptiveMix {
  return {
    enabled: false,
    targetLoudness: -14,
    autoEQ: true,
    autoBalance: true,
    autoDuck: false,
    sidechainSource: null,
    sidechainThreshold: -20,
    sidechainRatio: 4,
    autoMaster: false,
  };
}

export interface InfiniteVariation {
  enabled: boolean;
  paramRange: number;
  mutationRate: number;
  lockParams: string[];
  evolveEvery: number;
  currentVariation: number;
}
export function createDefaultInfiniteVariation(): InfiniteVariation {
  return {
    enabled: false,
    paramRange: 0.2,
    mutationRate: 0.3,
    lockParams: [],
    evolveEvery: 4,
    currentVariation: 0,
  };
}

export function evolveConfig(config: SoundEngineConfig, iv: InfiniteVariation): SoundEngineConfig {
  if (!iv.enabled) return config;
  const newConfig = {
    ...config,
    filter: { ...config.filter },
    ampEnv: { ...config.ampEnv },
    oscillators: config.oscillators.map((o) => ({ ...o })),
  };
  const mutate = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v + (Math.random() - 0.5) * iv.paramRange * (max - min)));
  if (!iv.lockParams.includes("filter.cutoff"))
    newConfig.filter.cutoff = mutate(newConfig.filter.cutoff, 200, 12000);
  if (!iv.lockParams.includes("filter.resonance"))
    newConfig.filter.resonance = mutate(newConfig.filter.resonance, 0.1, 10);
  if (!iv.lockParams.includes("ampEnv.attack"))
    newConfig.ampEnv.attack = mutate(newConfig.ampEnv.attack, 0.001, 2);
  if (!iv.lockParams.includes("ampEnv.release"))
    newConfig.ampEnv.release = mutate(newConfig.ampEnv.release, 0.01, 3);
  newConfig.oscillators = newConfig.oscillators.map((o) => {
    if (!iv.lockParams.includes(`osc.${o.id}.detune`)) o.detune = mutate(o.detune, -50, 50);
    return o;
  });
  return newConfig;
}

export interface ReverseProducer {
  enabled: boolean;
  targetGenre: Genre;
  targetVibe: Vibe;
  referenceTrack: string | null;
  analysisSteps: string[];
}
export function createDefaultReverseProducer(): ReverseProducer {
  return {
    enabled: false,
    targetGenre: "house",
    targetVibe: "energetic",
    referenceTrack: null,
    analysisSteps: [],
  };
}

export interface CrossModalLearning {
  enabled: boolean;
  audioToVisual: boolean;
  visualToAudio: boolean;
  textToAudio: boolean;
  gestureToAudio: boolean;
  modelPath: string | null;
  trainingData: string[];
}
export function createDefaultCrossModal(): CrossModalLearning {
  return {
    enabled: false,
    audioToVisual: false,
    visualToAudio: false,
    textToAudio: true,
    gestureToAudio: false,
    modelPath: null,
    trainingData: [],
  };
}

export interface ScaleGuardian {
  enabled: boolean;
  autoCorrect: boolean;
  highlightOutOfScale: boolean;
  suggestInScale: boolean;
  snapMode: "off" | "soft" | "hard";
  customScale: number[] | null;
}
export function createDefaultScaleGuardian(): ScaleGuardian {
  return {
    enabled: true,
    autoCorrect: false,
    highlightOutOfScale: true,
    suggestInScale: true,
    snapMode: "soft",
    customScale: null,
  };
}

export function isNoteInScale(midi: number, key: string, scaleType: string): boolean {
  const keyIdx = NOTE_NAMES.indexOf(key);
  if (keyIdx < 0) return true;
  const scale = SCALES[scaleType] ?? SCALES.major;
  const note = (((midi - keyIdx) % 12) + 12) % 12;
  return scale.includes(note);
}

export function snapToScale(midi: number, key: string, scaleType: string): number {
  const keyIdx = NOTE_NAMES.indexOf(key);
  if (keyIdx < 0) return midi;
  const scale = SCALES[scaleType] ?? SCALES.major;
  const note = (((midi - keyIdx) % 12) + 12) % 12;
  if (scale.includes(note)) return midi;
  let nearest = scale[0],
    minDist = 12;
  for (const s of scale) {
    const dist = Math.min(Math.abs(s - note), 12 - Math.abs(s - note));
    if (dist < minDist) {
      minDist = dist;
      nearest = s;
    }
  }
  return midi - note + nearest + keyIdx;
}

// ============================================================
// VINNY Master State
// ============================================================

export interface VinnyState {
  soundEngine: SoundEngineConfig;
  textToSound: TextToSoundParams;
  instrument: InstrumentModel;
  sampler: SamplerConfig;
  theory: TheoryConfig;
  midi: MIDIConfig;
  loop: LoopConfig;
  effects: EffectsRack;
  modulation: ModulationSystem;
  mixer: MixerConfig;
  exportConfig: ExportConfig;
  visualizer: VisualizerConfig;
  workflow: WorkflowConfig;
  timeMachine: TimeMachineState;
  perform: PerformConfig;
  adaptiveMix: AdaptiveMix;
  infiniteVariation: InfiniteVariation;
  reverseProducer: ReverseProducer;
  crossModal: CrossModalLearning;
  scaleGuardian: ScaleGuardian;
}

export function createDefaultVinnyState(): VinnyState {
  return {
    soundEngine: createDefaultSoundEngine(),
    textToSound: createDefaultTextToSound(),
    instrument: createDefaultInstrument(),
    sampler: createDefaultSampler(),
    theory: createDefaultTheory(),
    midi: createDefaultMIDI(),
    loop: createDefaultLoop(),
    effects: createDefaultEffectsRack(),
    modulation: createDefaultModulation(),
    mixer: createDefaultMixer(),
    exportConfig: createDefaultExport(),
    visualizer: createDefaultVisualizer(),
    workflow: createDefaultWorkflow(),
    timeMachine: createDefaultTimeMachine(),
    perform: createDefaultPerform(),
    adaptiveMix: createDefaultAdaptiveMix(),
    infiniteVariation: createDefaultInfiniteVariation(),
    reverseProducer: createDefaultReverseProducer(),
    crossModal: createDefaultCrossModal(),
    scaleGuardian: createDefaultScaleGuardian(),
  };
}

// ============================================================
// VINNY Audio Controller — bridges state to AudioEngine
// ============================================================

export class VinnyController {
  engine: AudioEngine;
  state: VinnyState;
  activeNotes: Map<number, { osc: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode }> =
    new Map();

  constructor(engine: AudioEngine, state?: VinnyState) {
    this.engine = engine;
    this.state = state ?? createDefaultVinnyState();
  }

  noteOn(midi: number, velocity: number = 0.8) {
    const freq = noteToFreq(midi);
    const cfg = this.state.soundEngine;
    const now = this.engine.ctx.currentTime;
    const gain = this.engine.ctx.createGain();
    const filter = this.engine.ctx.createBiquadFilter();
    filter.type =
      cfg.filter.type === "lowpass"
        ? "lowpass"
        : cfg.filter.type === "highpass"
          ? "highpass"
          : cfg.filter.type === "bandpass"
            ? "bandpass"
            : "lowpass";
    filter.frequency.value = cfg.filter.cutoff;
    filter.Q.value = cfg.filter.resonance;
    filter.connect(gain);
    gain.connect(this.engine.master);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(velocity * cfg.masterVolume, now + cfg.ampEnv.attack);
    gain.gain.linearRampToValueAtTime(
      velocity * cfg.masterVolume * cfg.ampEnv.sustain,
      now + cfg.ampEnv.attack + cfg.ampEnv.decay,
    );
    const oscs: OscillatorNode[] = [];
    for (const layer of cfg.oscillators) {
      if (layer.shape === "noise") continue;
      for (let u = 0; u < layer.unison; u++) {
        const osc = this.engine.ctx.createOscillator();
        osc.type = layer.shape === "wavetable" ? "sawtooth" : layer.shape;
        osc.frequency.value = freq * layer.frequency;
        osc.detune.value = layer.detune + (u - (layer.unison - 1) / 2) * layer.unisonSpread;
        const oscGain = this.engine.ctx.createGain();
        oscGain.gain.value = layer.volume / layer.unison;
        osc.connect(oscGain);
        oscGain.connect(filter);
        osc.start(now);
        oscs.push(osc);
      }
    }
    this.activeNotes.set(midi, { osc: oscs, gain, filter });
  }

  noteOff(midi: number) {
    const note = this.activeNotes.get(midi);
    if (!note) return;
    const now = this.engine.ctx.currentTime;
    const cfg = this.state.soundEngine;
    note.gain.gain.cancelScheduledValues(now);
    note.gain.gain.setValueAtTime(note.gain.gain.value, now);
    note.gain.gain.linearRampToValueAtTime(0, now + cfg.ampEnv.release);
    note.osc.forEach((o) => o.stop(now + cfg.ampEnv.release + 0.01));
    this.activeNotes.delete(midi);
  }

  allNotesOff() {
    for (const midi of this.activeNotes.keys()) this.noteOff(midi);
  }
  updateState(state: VinnyState) {
    this.state = state;
  }
  applyGenre(genre: Genre) {
    this.state.soundEngine = migrateGenre(this.state.soundEngine, genre);
  }
  applyVibe(vibe: Vibe) {
    const r = applyVibe(this.state.soundEngine, this.state.theory, vibe);
    this.state.soundEngine = r.config;
    this.state.theory = r.theory;
  }
  generateFromText() {
    this.state.soundEngine = parseTextToSound(this.state.textToSound);
  }
  loadInstrument() {
    this.state.soundEngine = instrumentToEngineConfig(this.state.instrument);
  }
}
