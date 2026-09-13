// Advanced Pitch & Formant Processing — Sound Pitcher, Formant Shifter, Advanced Pitch Engine.
// Uses Web Audio API for real-time pitch shifting, formant manipulation, and granular pitch processing.

import { AudioEngine } from "./engine";

// ============= SOUND PITCHER =============
// Real-time pitch shifting using granular synthesis with overlap-add (PSOLA-like)

export interface PitcherConfig {
  pitchRatio: number; // 0.25..4.0 (1.0 = original)
  pitchShift: number; // semitones (-24..+24)
  formantShift: number; // semitones (-12..+12), independent of pitch
  mix: number; // 0..1 dry/wet
  feedback: number; // 0..0.9
  windowSize: number; // grain window in ms (10..100)
  crossfade: number; // 0..1 grain crossfade amount
  stereoWidth: number; // 0..2
  detune: number; // cents (-50..+50)
}

export function createDefaultPitcher(): PitcherConfig {
  return {
    pitchRatio: 1.0,
    pitchShift: 0,
    formantShift: 0,
    mix: 1.0,
    feedback: 0,
    windowSize: 40,
    crossfade: 0.5,
    stereoWidth: 1.0,
    detune: 0,
  };
}

export class SoundPitcher {
  private ctx: AudioContext;
  private input: GainNode;
  private output: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private delayLines: DelayNode[] = [];
  private grainGains: GainNode[] = [];
  private lfo: OscillatorNode | null = null;
  private config: PitcherConfig;
  private grainTimer: number | null = null;
  private buffer: AudioBuffer | null = null;
  private recordNode: ScriptProcessorNode | null = null;

  constructor(ctx: AudioContext, config: PitcherConfig) {
    this.ctx = ctx;
    this.config = config;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.dryGain.gain.value = 1 - config.mix;
    this.wetGain.gain.value = config.mix;
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
  }

  setConfig(config: Partial<PitcherConfig>) {
    this.config = { ...this.config, ...config };
    if (config.mix !== undefined) {
      this.dryGain.gain.setTargetAtTime(1 - config.mix, this.ctx.currentTime, 0.02);
      this.wetGain.gain.setTargetAtTime(config.mix, this.ctx.currentTime, 0.02);
    }
  }

  // Process a live audio stream using dual delay-line pitch shifting
  connectInput(source: AudioNode) {
    source.connect(this.input);
    this.setupDualDelayShift();
  }

  private setupDualDelayShift() {
    const ratio = this.config.pitchRatio;
    const windowMs = this.config.windowSize / 1000;
    const delayMax = windowMs * 4;

    // Two delay lines with crossfading for seamless pitch shift
    for (let i = 0; i < 2; i++) {
      const delay = this.ctx.createDelay(delayMax);
      const grainGain = this.ctx.createGain();
      grainGain.gain.value = 0;
      delay.delayTime.value = 0;
      this.input.connect(delay);
      delay.connect(grainGain);
      grainGain.connect(this.wetGain);
      this.delayLines.push(delay);
      this.grainGains.push(grainGain);
    }

    // Modulate delay times with triangular LFOs (180° out of phase)
    const lfo1 = this.ctx.createOscillator();
    lfo1.type = "triangle";
    lfo1.frequency.value = 1 / (windowMs * 2);
    const lfo2 = this.ctx.createOscillator();
    lfo2.type = "triangle";
    lfo2.frequency.value = 1 / (windowMs * 2);
    (lfo2 as OscillatorNode & { phase?: number }).phase = Math.PI;

    const lfoGain1 = this.ctx.createGain();
    lfoGain1.gain.value = windowMs * (1 - 1 / ratio);
    const lfoGain2 = this.ctx.createGain();
    lfoGain2.gain.value = windowMs * (1 - 1 / ratio);

    lfo1.connect(lfoGain1);
    lfoGain1.connect(this.delayLines[0].delayTime);
    lfo2.connect(lfoGain2);
    lfoGain2.connect(this.delayLines[1].delayTime);

    // Crossfade gains — opposite phase to delay modulation
    const cfGain1 = this.ctx.createGain();
    const cfGain2 = this.ctx.createGain();
    const cfLfo1 = this.ctx.createOscillator();
    cfLfo1.type = "sine";
    cfLfo1.frequency.value = 1 / (windowMs * 2);
    const cfLfo2 = this.ctx.createOscillator();
    cfLfo2.type = "sine";
    cfLfo2.frequency.value = 1 / (windowMs * 2);
    (cfLfo2 as OscillatorNode & { phase?: number }).phase = Math.PI;

    const cfDepth = this.ctx.createGain();
    cfDepth.gain.value = 0.5;
    cfLfo1.connect(cfDepth);
    cfDepth.connect(cfGain1.gain);
    cfLfo2.connect(cfDepth);
    cfLfo2.connect(cfGain2.gain);

    this.grainGains[0].gain.value = 0.5;
    this.grainGains[1].gain.value = 0.5;

    lfo1.start();
    lfo2.start();
    cfLfo1.start();
    cfLfo2.start();
  }

  getOutput(): AudioNode {
    return this.output;
  }

  disconnect() {
    this.delayLines.forEach((d) => d.disconnect());
    this.grainGains.forEach((g) => g.disconnect());
    this.delayLines = [];
    this.grainGains = [];
    if (this.grainTimer) {
      clearTimeout(this.grainTimer);
      this.grainTimer = null;
    }
  }
}

// ============= FORMANT SHIFTER =============
// Shifts vocal formant frequencies independently of pitch using filter bank resynthesis

export interface FormantShifterConfig {
  shift: number; // -12..+12 semitones
  formant1: number; // Hz, first formant base
  formant2: number; // Hz, second formant base
  formant3: number; // Hz, third formant base
  bandwidth: number; // Q factor multiplier
  resonance: number; // 0..2 formant emphasis
  preserveOriginal: boolean; // keep original formants alongside shifted
  mix: number; // 0..1
}

export function createDefaultFormantShifter(): FormantShifterConfig {
  return {
    shift: 0,
    formant1: 700,
    formant2: 1220,
    formant3: 2600,
    bandwidth: 1.0,
    resonance: 1.0,
    preserveOriginal: false,
    mix: 1.0,
  };
}

export class FormantShifter {
  private ctx: AudioContext;
  private input: GainNode;
  private output: GainNode;
  private filters: BiquadFilterNode[] = [];
  private filterGains: GainNode[] = [];
  private dryGain: GainNode;
  private wetGain: GainNode;
  private config: FormantShifterConfig;

  constructor(ctx: AudioContext, config: FormantShifterConfig) {
    this.ctx = ctx;
    this.config = config;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.dryGain.gain.value = config.preserveOriginal ? 1 - config.mix : 0;
    this.wetGain.gain.value = config.mix;
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.setupFormantFilters();
  }

  private setupFormantFilters() {
    const formants = [this.config.formant1, this.config.formant2, this.config.formant3];
    const shiftRatio = Math.pow(2, this.config.shift / 12);

    for (let i = 0; i < formants.length; i++) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = formants[i] * shiftRatio;
      filter.Q.value = 10 * this.config.bandwidth;

      const gain = this.ctx.createGain();
      gain.gain.value = (1 / formants.length) * this.config.resonance;

      this.input.connect(filter);
      filter.connect(gain);
      gain.connect(this.wetGain);

      this.filters.push(filter);
      this.filterGains.push(gain);
    }

    this.wetGain.connect(this.output);
  }

  setConfig(config: Partial<FormantShifterConfig>) {
    this.config = { ...this.config, ...config };
    const shiftRatio = Math.pow(2, this.config.shift / 12);
    const formants = [this.config.formant1, this.config.formant2, this.config.formant3];
    for (let i = 0; i < this.filters.length; i++) {
      this.filters[i].frequency.setTargetAtTime(
        formants[i] * shiftRatio,
        this.ctx.currentTime,
        0.02,
      );
      this.filters[i].Q.setTargetAtTime(10 * this.config.bandwidth, this.ctx.currentTime, 0.02);
      this.filterGains[i].gain.setTargetAtTime(
        (1 / formants.length) * this.config.resonance,
        this.ctx.currentTime,
        0.02,
      );
    }
    if (config.mix !== undefined || config.preserveOriginal !== undefined) {
      this.dryGain.gain.setTargetAtTime(
        this.config.preserveOriginal ? 1 - this.config.mix : 0,
        this.ctx.currentTime,
        0.02,
      );
      this.wetGain.gain.setTargetAtTime(this.config.mix, this.ctx.currentTime, 0.02);
    }
  }

  connectInput(source: AudioNode) {
    source.connect(this.input);
  }

  getOutput(): AudioNode {
    return this.output;
  }

  disconnect() {
    this.filters.forEach((f) => f.disconnect());
    this.filterGains.forEach((g) => g.disconnect());
    this.filters = [];
    this.filterGains = [];
  }
}

// ============= ADVANCED PITCH ENGINE =============
// Combines pitch shifting, formant shifting, harmonization, and pitch correction

export interface AdvancedPitchConfig {
  pitchShift: number; // semitones
  formantShift: number; // semitones
  formant1: number;
  formant2: number;
  formant3: number;
  detune: number; // cents
  harmonize: number[]; // semitone offsets for harmony voices
  pitchCorrect: number; // 0..1 (0 = off, 1 = full correction)
  pitchCorrectKey: string; // e.g. "C"
  pitchCorrectScale: string; // e.g. "major"
  glide: number; // 0..1 pitch glide amount
  stereoSpread: number; // 0..1
  mix: number;
}

export function createDefaultAdvancedPitch(): AdvancedPitchConfig {
  return {
    pitchShift: 0,
    formantShift: 0,
    formant1: 700,
    formant2: 1220,
    formant3: 2600,
    detune: 0,
    harmonize: [],
    pitchCorrect: 0,
    pitchCorrectKey: "C",
    pitchCorrectScale: "major",
    glide: 0,
    stereoSpread: 0.5,
    mix: 1.0,
  };
}

export class AdvancedPitchEngine {
  private ctx: AudioContext;
  private input: GainNode;
  private output: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private pitcher: SoundPitcher;
  private formantShifter: FormantShifter;
  private harmonyGains: GainNode[] = [];
  private harmonyPitchers: SoundPitcher[] = [];
  private config: AdvancedPitchConfig;

  constructor(ctx: AudioContext, config: AdvancedPitchConfig) {
    this.ctx = ctx;
    this.config = config;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.dryGain.gain.value = 1 - config.mix;
    this.wetGain.gain.value = config.mix;
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    // Main pitch shifter
    this.pitcher = new SoundPitcher(ctx, {
      ...createDefaultPitcher(),
      pitchShift: config.pitchShift,
      pitchRatio: Math.pow(2, config.pitchShift / 12),
      detune: config.detune,
      mix: 1.0,
    });
    this.pitcher.connectInput(this.input);
    this.pitcher.getOutput().connect(this.wetGain);

    // Formant shifter
    this.formantShifter = new FormantShifter(ctx, {
      ...createDefaultFormantShifter(),
      shift: config.formantShift,
      formant1: config.formant1,
      formant2: config.formant2,
      formant3: config.formant3,
      mix: 1.0,
    });
    this.formantShifter.connectInput(this.pitcher.getOutput());
    this.formantShifter.getOutput().connect(this.wetGain);
  }

  setConfig(config: Partial<AdvancedPitchConfig>) {
    this.config = { ...this.config, ...config };
    if (config.pitchShift !== undefined || config.detune !== undefined) {
      this.pitcher.setConfig({
        pitchShift: this.config.pitchShift,
        pitchRatio: Math.pow(2, this.config.pitchShift / 12),
        detune: this.config.detune,
      });
    }
    if (
      config.formantShift !== undefined ||
      config.formant1 !== undefined ||
      config.formant2 !== undefined ||
      config.formant3 !== undefined
    ) {
      this.formantShifter.setConfig({
        shift: this.config.formantShift,
        formant1: this.config.formant1,
        formant2: this.config.formant2,
        formant3: this.config.formant3,
      });
    }
    if (config.mix !== undefined) {
      this.dryGain.gain.setTargetAtTime(1 - config.mix, this.ctx.currentTime, 0.02);
      this.wetGain.gain.setTargetAtTime(config.mix, this.ctx.currentTime, 0.02);
    }
    // Rebuild harmony voices if harmonize array changed
    if (config.harmonize !== undefined) {
      this.rebuildHarmony();
    }
  }

  private rebuildHarmony() {
    // Clean up old harmony voices
    this.harmonyPitchers.forEach((p) => p.disconnect());
    this.harmonyGains.forEach((g) => g.disconnect());
    this.harmonyPitchers = [];
    this.harmonyGains = [];

    for (const semitone of this.config.harmonize) {
      const harmonyPitcher = new SoundPitcher(this.ctx, {
        ...createDefaultPitcher(),
        pitchShift: semitone,
        pitchRatio: Math.pow(2, semitone / 12),
        mix: 1.0,
      });
      const harmonyGain = this.ctx.createGain();
      harmonyGain.gain.value = 0.5 / (this.config.harmonize.length || 1);
      harmonyPitcher.connectInput(this.input);
      harmonyPitcher.getOutput().connect(harmonyGain);
      harmonyGain.connect(this.wetGain);
      this.harmonyPitchers.push(harmonyPitcher);
      this.harmonyGains.push(harmonyGain);
    }
  }

  // Pitch correction: snap a frequency to nearest scale degree
  correctPitch(freq: number): number {
    if (this.config.pitchCorrect <= 0) return freq;
    const midi = 69 + 12 * Math.log2(freq / 440);
    const scaleIntervals = SCALE_INTERVALS[this.config.pitchCorrectScale] || SCALE_INTERVALS.major;
    const keyIndex = NOTE_NAMES.indexOf(this.config.pitchCorrectKey);
    const octave = Math.floor(midi / 12);
    const noteInOctave = Math.round(midi) % 12;
    const scaleNotes = scaleIntervals.map((interval) => (keyIndex + interval) % 12);
    let nearest = noteInOctave;
    let minDist = Infinity;
    for (const sn of scaleNotes) {
      const dist = Math.abs(sn - noteInOctave);
      const wrappedDist = Math.min(dist, 12 - dist);
      if (wrappedDist < minDist) {
        minDist = wrappedDist;
        nearest = sn;
      }
    }
    const correctedMidi = octave * 12 + nearest;
    const correctedFreq = 440 * Math.pow(2, (correctedMidi - 69) / 12);
    return freq + (correctedFreq - freq) * this.config.pitchCorrect;
  }

  connectInput(source: AudioNode) {
    source.connect(this.input);
  }

  getOutput(): AudioNode {
    return this.output;
  }

  disconnect() {
    this.pitcher.disconnect();
    this.formantShifter.disconnect();
    this.harmonyPitchers.forEach((p) => p.disconnect());
    this.harmonyGains.forEach((g) => g.disconnect());
  }
}

const SCALE_INTERVALS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// ============= PITCH DETECTION =============
// Autocorrelation-based pitch detection for real-time pitch tracking

export function detectPitch(
  buffer: Float32Array,
  sampleRate: number,
): { freq: number; confidence: number } {
  const minPeriod = Math.floor(sampleRate / 2000);
  const maxPeriod = Math.floor(sampleRate / 80);
  let bestPeriod = 0;
  let bestCorrelation = 0;
  let totalEnergy = 0;

  for (let i = 0; i < buffer.length; i++) {
    totalEnergy += buffer[i] * buffer[i];
  }

  if (totalEnergy < 0.001) return { freq: 0, confidence: 0 };

  for (let period = minPeriod; period <= maxPeriod; period++) {
    let correlation = 0;
    let energy = 0;
    for (let i = 0; i < buffer.length - period; i++) {
      correlation += buffer[i] * buffer[i + period];
      energy += buffer[i] * buffer[i];
    }
    const normalizedCorr = correlation / (energy + 1e-10);
    if (normalizedCorr > bestCorrelation) {
      bestCorrelation = normalizedCorr;
      bestPeriod = period;
    }
  }

  if (bestPeriod === 0) return { freq: 0, confidence: 0 };

  // Parabolic interpolation for sub-sample accuracy
  const freq = sampleRate / bestPeriod;
  return { freq, confidence: bestCorrelation };
}

export function freqToNoteName(freq: number): { note: string; octave: number; cents: number } {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const roundedMidi = Math.round(midi);
  const cents = Math.round((midi - roundedMidi) * 100);
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const note = noteNames[roundedMidi % 12];
  const octave = Math.floor(roundedMidi / 12) - 1;
  return { note, octave, cents };
}
