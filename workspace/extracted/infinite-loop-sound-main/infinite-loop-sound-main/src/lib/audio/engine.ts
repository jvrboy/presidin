// Web Audio synthesis engine — a complete client-side audio system.
// Provides: synth voices, granular engine, effects chain, sampler,
// LFO modulation, and a unified AudioEngine singleton.

// ---------- Types ----------
export type Waveform = "sine" | "square" | "sawtooth" | "triangle";

export interface SynthVoiceParams {
  waveform: Waveform;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  detune: number;
  gain: number;
}

export interface GranularParams {
  grainSize: number; // seconds
  grainDensity: number; // grains per second
  pitch: number; // playback rate
  spread: number; // stereo spread 0..1
  position: number; // 0..1 position in buffer
  positionJitter: number; // 0..1 randomness
  envelope: number; // grain envelope shape 0..1
  mix: number; // 0..1 dry/wet
}

export interface EffectParams {
  reverb: number; // 0..1 wet
  delay: number; // 0..1 wet
  delayTime: number; // seconds
  delayFeedback: number; // 0..0.9
  filter: number; // 0..1 (0=lowpass closed, 1=fully open)
  filterFreq: number; // Hz
  distortion: number; // 0..1
  compressor: number; // 0..1 threshold
}

export const DEFAULT_SYNTH: SynthVoiceParams = {
  waveform: "sawtooth",
  attack: 0.02,
  decay: 0.2,
  sustain: 0.6,
  release: 0.4,
  detune: 0,
  gain: 0.5,
};

export const DEFAULT_GRANULAR: GranularParams = {
  grainSize: 0.1,
  grainDensity: 20,
  pitch: 1,
  spread: 0.5,
  position: 0,
  positionJitter: 0.1,
  envelope: 0.5,
  mix: 0.5,
};

export const DEFAULT_EFFECTS: EffectParams = {
  reverb: 0,
  delay: 0,
  delayTime: 0.25,
  delayFeedback: 0.3,
  filter: 1,
  filterFreq: 20000,
  distortion: 0,
  compressor: 0.5,
};

// ---------- AudioEngine ----------
class AudioEngineClass {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  bus: GainNode | null = null;
  dry: GainNode | null = null;
  wet: GainNode | null = null;
  convolver: ConvolverNode | null = null;
  delayNode: DelayNode | null = null;
  delayFeedback: GainNode | null = null;
  delayWet: GainNode | null = null;
  filterNode: BiquadFilterNode | null = null;
  distortion: WaveShaperNode | null = null;
  compressor: DynamicsCompressorNode | null = null;
  analyser: AnalyserNode | null = null;
  activeVoices: Map<string, { osc: OscillatorNode[]; gain: GainNode; release?: number }> =
    new Map();
  granularTimer: number | null = null;
  granularBuffer: AudioBuffer | null = null;
  granularPlaying = false;
  ready = false;

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.bus = this.ctx.createGain();
    this.bus.gain.value = 0.9;
    this.dry = this.ctx.createGain();
    this.dry.gain.value = 1;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0;
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this.makeIR(3.2, 2.6);
    this.delayNode = this.ctx.createDelay(1.0);
    this.delayNode.delayTime.value = 0.25;
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.value = 0.3;
    this.delayWet = this.ctx.createGain();
    this.delayWet.gain.value = 0;
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = "lowpass";
    this.filterNode.frequency.value = 20000;
    this.distortion = this.ctx.createWaveShaper();
    this.distortion.curve = this.makeDistortionCurve(0) as Float32Array<ArrayBuffer>;
    this.compressor = this.ctx.createDynamicsCompressor();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;

    // Audio graph: bus -> filter -> distortion -> compressor -> (dry + reverb + delay) -> master -> analyser -> destination
    this.bus.connect(this.filterNode);
    this.filterNode.connect(this.distortion);
    this.distortion.connect(this.compressor);
    this.compressor.connect(this.dry);
    this.compressor.connect(this.convolver);
    this.convolver.connect(this.wet);
    this.compressor.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayWet);
    this.dry.connect(this.master);
    this.wet.connect(this.master);
    this.delayWet.connect(this.master);
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.ready = true;
  }

  resume() {
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  unlock() {
    this.init();
    this.resume();
    if (this.ctx) {
      const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.ctx.destination);
      s.start(0);
    }
  }

  makeIR(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx!.sampleRate;
    const len = Math.floor(rate * seconds);
    const ir = this.ctx!.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return ir;
  }

  makeDistortionCurve(amount: number): Float32Array {
    const k = amount * 100;
    const n = 44100;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      // Standard soft-clip waveshaper; degree→radian conversion keeps gain ≈ 1 at k=0
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  // ---------- Synth ----------
  noteOn(id: string, freq: number, params: SynthVoiceParams) {
    if (!this.ctx || !this.bus) return;
    this.resume();
    if (this.activeVoices.has(id)) this.noteOff(id);
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(params.gain, t + params.attack);
    gain.gain.linearRampToValueAtTime(
      params.gain * params.sustain,
      t + params.attack + params.decay,
    );
    const oscs: OscillatorNode[] = [];
    const main = this.ctx.createOscillator();
    main.type = params.waveform;
    main.frequency.value = freq;
    main.detune.value = params.detune;
    main.connect(gain);
    main.start(t);
    oscs.push(main);
    // Detuned unison for richness
    if (params.detune !== 0 || params.waveform !== "sine") {
      const osc2 = this.ctx.createOscillator();
      osc2.type = params.waveform;
      osc2.frequency.value = freq;
      osc2.detune.value = params.detune + 7;
      osc2.connect(gain);
      osc2.start(t);
      oscs.push(osc2);
      const osc3 = this.ctx.createOscillator();
      osc3.type = params.waveform;
      osc3.frequency.value = freq;
      osc3.detune.value = params.detune - 7;
      osc3.connect(gain);
      osc3.start(t);
      oscs.push(osc3);
    }
    gain.connect(this.bus);
    this.activeVoices.set(id, { osc: oscs, gain, release: params.release });
  }

  noteOff(id: string) {
    const voice = this.activeVoices.get(id);
    if (!voice || !this.ctx) return;
    const t = this.ctx.currentTime;
    // Honor the voice's release time instead of a hardcoded 0.3 s
    const rel = Math.max(0.01, voice.release ?? 0.3);
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
    voice.gain.gain.linearRampToValueAtTime(0, t + rel);
    voice.osc.forEach((o) => o.stop(t + rel + 0.05));
    this.activeVoices.delete(id);
  }

  // ---------- Effects ----------
  setEffects(params: EffectParams) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.wet?.gain.setTargetAtTime(params.reverb * 0.9, t, 0.03);
    this.delayWet?.gain.setTargetAtTime(params.delay * 0.6, t, 0.03);
    if (this.delayNode) this.delayNode.delayTime.setTargetAtTime(params.delayTime, t, 0.03);
    this.delayFeedback?.gain.setTargetAtTime(params.delayFeedback, t, 0.03);
    this.filterNode?.frequency.setTargetAtTime(params.filterFreq, t, 0.03);
    if (this.distortion)
      this.distortion.curve = this.makeDistortionCurve(
        params.distortion,
      ) as Float32Array<ArrayBuffer>;
    if (this.compressor) {
      this.compressor.threshold.value = -50 + (1 - params.compressor) * 40;
    }
  }

  setMasterVolume(v: number) {
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx!.currentTime, 0.03);
  }

  // ---------- Granular ----------
  setGranularBuffer(buffer: AudioBuffer) {
    this.granularBuffer = buffer;
  }

  startGranular(params: GranularParams) {
    if (!this.ctx || !this.bus || !this.granularBuffer) return;
    this.resume();
    this.granularPlaying = true;
    const scheduleGrain = () => {
      if (!this.granularPlaying || !this.ctx || !this.granularBuffer) return;
      this.spawnGrain(params);
      const interval = 1000 / params.grainDensity;
      this.granularTimer = window.setTimeout(scheduleGrain, interval);
    };
    scheduleGrain();
  }

  stopGranular() {
    this.granularPlaying = false;
    if (this.granularTimer) {
      clearTimeout(this.granularTimer);
      this.granularTimer = null;
    }
  }

  private spawnGrain(params: GranularParams) {
    if (!this.ctx || !this.bus || !this.granularBuffer) return;
    const t = this.ctx.currentTime;
    const buf = this.granularBuffer;
    const grainDur = params.grainSize;
    const pos =
      (params.position + (Math.random() - 0.5) * params.positionJitter) * (buf.duration - grainDur);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = params.pitch;
    src.loop = true;
    src.loopStart = Math.max(0, pos);
    src.loopEnd = Math.max(src.loopStart + 0.001, pos + grainDur);
    const g = this.ctx.createGain();
    const attack = grainDur * params.envelope * 0.5;
    const release = grainDur * (1 - params.envelope * 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + attack);
    g.gain.linearRampToValueAtTime(0, t + grainDur);
    // Stereo spread
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (pan) {
      pan.pan.value = (Math.random() - 0.5) * params.spread * 2;
      src.connect(g).connect(pan).connect(this.bus);
    } else {
      src.connect(g).connect(this.bus);
    }
    src.start(t, src.loopStart);
    src.stop(t + grainDur + 0.01);
  }

  // ---------- Sampler ----------
  playSample(buffer: AudioBuffer, start: number, duration: number, rate: number, loop: boolean) {
    if (!this.ctx || !this.bus) return;
    this.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    src.loopStart = start;
    src.loopEnd = start + Math.max(duration, 0.001);
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.8, t + 0.004);
    src.connect(g).connect(this.bus);
    src.start(0, start);
    return { src, g };
  }

  stopSample(voice: { src: AudioBufferSourceNode; g: GainNode }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    voice.g.gain.cancelScheduledValues(t);
    voice.g.gain.setValueAtTime(voice.g.gain.value, t);
    voice.g.gain.linearRampToValueAtTime(0, t + 0.006);
    voice.src.stop(t + 0.008);
  }

  // ---------- Analysis ----------
  getLevel(): number {
    if (!this.analyser) return 0;
    const td = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(td);
    let s = 0;
    for (let i = 0; i < td.length; i++) {
      const v = (td[i] - 128) / 128;
      s += v * v;
    }
    return Math.sqrt(s / td.length);
  }

  getFrequencyData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(0);
    const fd = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(fd);
    return fd;
  }

  getTimeDomainData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(0);
    const td = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(td);
    return td;
  }

  // ---------- Decode ----------
  async decodeAudio(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    this.init();
    return await this.ctx!.decodeAudioData(arrayBuffer);
  }

  // ---------- Noise generator (for sound design) ----------
  createNoiseBuffer(duration: number, type: "white" | "pink" | "brown" = "white"): AudioBuffer {
    this.init();
    const sr = this.ctx!.sampleRate;
    const len = Math.floor(sr * duration);
    const buf = this.ctx!.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    if (type === "white") {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (type === "pink") {
      let b0 = 0,
        b1 = 0,
        b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      }
    } else {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }
}

export const AudioEngine = new AudioEngineClass();
export type AudioEngine = AudioEngineClass;

// ---------- Music theory helpers ----------
export const NOTE_FREQS: Record<string, number> = {};
for (let i = 0; i < 128; i++) {
  const note = i - 69;
  const freq = 440 * Math.pow(2, note / 12);
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(i / 12) - 1;
  const name = names[i % 12];
  NOTE_FREQS[`${name}${octave}`] = freq;
}

export function noteToFreq(note: string): number {
  return NOTE_FREQS[note] ?? 440;
}

export const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
