// Advanced Mixing Console — Professional mixing tools with channel strips, buses, sends, and master processing.
// Built on Web Audio API with full routing, EQ, dynamics, and effects per channel.

import { AudioEngine } from "./engine";

// ============= CHANNEL STRIP =============

export interface ChannelStrip {
  id: string;
  name: string;
  type: ChannelType;
  inputGain: number;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  eq: EQBand[];
  compressor: CompressorSettings;
  gate: GateSettings;
  sends: SendEntry[];
  inserts: InsertEffect[];
  outputBus: string;
  color: string;
  height: number;
  width: number;
  meterLevel: number;
  meterPeak: number;
  meterRms: number;
  armed: boolean;
  phaseInvert: boolean;
  stereoWidth: number;
  volumeAutomation: boolean;
  panAutomation: boolean;
}

export type ChannelType = "audio" | "instrument" | "drum" | "bus" | "master" | "aux" | "fx";

export interface EQBand {
  id: string;
  type: EQType;
  frequency: number;
  gain: number;
  q: number;
  enabled: boolean;
}

export type EQType =
  | "lowpass"
  | "highpass"
  | "bandpass"
  | "lowshelf"
  | "highshelf"
  | "peaking"
  | "notch"
  | "allpass";

export interface CompressorSettings {
  enabled: boolean;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  knee: number;
  makeupGain: number;
  sidechainSource?: string;
}

export interface GateSettings {
  enabled: boolean;
  threshold: number;
  attack: number;
  hold: number;
  release: number;
  range: number;
}

export interface SendEntry {
  id: string;
  busId: string;
  level: number;
  pre: boolean;
  enabled: boolean;
}

export interface InsertEffect {
  id: string;
  type: string;
  enabled: boolean;
  params: Record<string, number>;
  mix: number;
}

export interface MixerState {
  channels: ChannelStrip[];
  buses: BusStrip[];
  master: MasterStrip;
  selectedChannelId: string | null;
  showMeters: boolean;
  showEQ: boolean;
  showSends: boolean;
  showDynamics: boolean;
  zoom: number;
}

export interface BusStrip {
  id: string;
  name: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  color: string;
  sends: SendEntry[];
  eq: EQBand[];
  compressor: CompressorSettings;
  outputBus: string;
  meterLevel: number;
}

export interface MasterStrip {
  volume: number;
  pan: number;
  eq: EQBand[];
  compressor: CompressorSettings;
  limiter: LimiterSettings;
  stereoWidth: number;
  meterLevel: number;
  meterPeak: number;
  dithering: boolean;
  ditherBits: number;
}

export interface LimiterSettings {
  enabled: boolean;
  ceiling: number;
  release: number;
  lookahead: number;
}

let channelIdCounter = 0;
export function generateChannelId(): string {
  return `ch-${Date.now()}-${channelIdCounter++}`;
}

export function createDefaultEQ(): EQBand[] {
  return [
    { id: "eq1", type: "highpass", frequency: 20, gain: 0, q: 0.7, enabled: true },
    { id: "eq2", type: "peaking", frequency: 200, gain: 0, q: 1.0, enabled: true },
    { id: "eq3", type: "peaking", frequency: 2000, gain: 0, q: 1.0, enabled: true },
    { id: "eq4", type: "highshelf", frequency: 8000, gain: 0, q: 0.7, enabled: true },
  ];
}

export function createDefaultCompressor(): CompressorSettings {
  return {
    enabled: false,
    threshold: -20,
    ratio: 3,
    attack: 3,
    release: 100,
    knee: 6,
    makeupGain: 0,
  };
}

export function createDefaultGate(): GateSettings {
  return { enabled: false, threshold: -40, attack: 1, hold: 50, release: 100, range: -80 };
}

export function createDefaultLimiter(): LimiterSettings {
  return { enabled: false, ceiling: -0.3, release: 50, lookahead: 3 };
}

export function createDefaultChannel(name: string, type: ChannelType): ChannelStrip {
  const colors: Record<ChannelType, string> = {
    audio: "#10b981",
    instrument: "#3b82f6",
    drum: "#f59e0b",
    bus: "#ec4899",
    master: "#ef4444",
    aux: "#8b5cf6",
    fx: "#6b7280",
  };
  return {
    id: generateChannelId(),
    name,
    type,
    inputGain: 1.0,
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    eq: createDefaultEQ(),
    compressor: createDefaultCompressor(),
    gate: createDefaultGate(),
    sends: [],
    inserts: [],
    outputBus: "master",
    color: colors[type],
    height: 200,
    width: 80,
    meterLevel: 0,
    meterPeak: 0,
    meterRms: 0,
    armed: false,
    phaseInvert: false,
    stereoWidth: 1.0,
    volumeAutomation: false,
    panAutomation: false,
  };
}

export function createDefaultMixer(): MixerState {
  return {
    channels: [
      createDefaultChannel("Kick", "drum"),
      createDefaultChannel("Snare", "drum"),
      createDefaultChannel("Hat", "drum"),
      createDefaultChannel("Bass", "instrument"),
      createDefaultChannel("Lead", "instrument"),
      createDefaultChannel("Pad", "instrument"),
      createDefaultChannel("Audio 1", "audio"),
      createDefaultChannel("Audio 2", "audio"),
    ],
    buses: [
      {
        id: "bus1",
        name: "Reverb Bus",
        volume: 0.7,
        pan: 0,
        mute: false,
        solo: false,
        color: "#8b5cf6",
        sends: [],
        eq: createDefaultEQ(),
        compressor: createDefaultCompressor(),
        outputBus: "master",
        meterLevel: 0,
      },
      {
        id: "bus2",
        name: "Delay Bus",
        volume: 0.6,
        pan: 0,
        mute: false,
        solo: false,
        color: "#ec4899",
        sends: [],
        eq: createDefaultEQ(),
        compressor: createDefaultCompressor(),
        outputBus: "master",
        meterLevel: 0,
      },
    ],
    master: {
      volume: 0.85,
      pan: 0,
      eq: createDefaultEQ(),
      compressor: createDefaultCompressor(),
      limiter: createDefaultLimiter(),
      stereoWidth: 1.0,
      meterLevel: 0,
      meterPeak: 0,
      dithering: false,
      ditherBits: 16,
    },
    selectedChannelId: null,
    showMeters: true,
    showEQ: true,
    showSends: true,
    showDynamics: true,
    zoom: 1,
  };
}

export class MixerEngine {
  private state: MixerState;
  private channelNodes: Map<string, ChannelNodes> = new Map();
  private busNodes: Map<string, BusNodes> = new Map();
  private masterNodes: MasterNodes | null = null;
  private meterInterval: number | null = null;

  constructor(state: MixerState) {
    this.state = state;
  }
  updateState(state: MixerState) {
    this.state = state;
  }

  init() {
    AudioEngine.init();
    if (!AudioEngine.ctx) return;
    this.masterNodes = this.createMasterChain();
    for (const bus of this.state.buses) this.busNodes.set(bus.id, this.createBusChain(bus));
    for (const channel of this.state.channels)
      this.channelNodes.set(channel.id, this.createChannelChain(channel));
    this.startMetering();
  }

  private createChannelChain(channel: ChannelStrip): ChannelNodes {
    const ctx = AudioEngine.ctx!;
    let input = ctx.createGain();
    input.gain.value = channel.inputGain;

    if (channel.phaseInvert) {
      const phase = ctx.createGain();
      phase.gain.value = -1;
      input.connect(phase);
      input = phase;
    }

    const gate = ctx.createDynamicsCompressor();
    gate.threshold.value = channel.gate.threshold;
    gate.ratio.value = 20;
    gate.attack.value = channel.gate.attack / 1000;
    gate.release.value = channel.gate.release / 1000;

    const eqNodes = channel.eq.map((band) => {
      const filter = ctx.createBiquadFilter();
      filter.type = band.type as BiquadFilterType;
      filter.frequency.value = band.frequency;
      filter.gain.value = band.gain;
      filter.Q.value = band.q;
      return filter;
    });

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = channel.compressor.threshold;
    compressor.ratio.value = channel.compressor.ratio;
    compressor.attack.value = channel.compressor.attack / 1000;
    compressor.release.value = channel.compressor.release / 1000;
    compressor.knee.value = channel.compressor.knee;

    const makeupGain = ctx.createGain();
    makeupGain.gain.value =
      channel.compressor.makeupGain > 0 ? Math.pow(10, channel.compressor.makeupGain / 20) : 1;

    const panner = ctx.createStereoPanner();
    panner.pan.value = channel.pan;

    const fader = ctx.createGain();
    fader.gain.value = channel.mute ? 0 : channel.volume;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    let node: AudioNode = input;
    if (channel.gate.enabled) {
      node.connect(gate);
      node = gate;
    }
    for (const eqNode of eqNodes) {
      node.connect(eqNode);
      node = eqNode;
    }
    if (channel.compressor.enabled) {
      node.connect(compressor);
      node = compressor;
    }
    node.connect(makeupGain);
    makeupGain.connect(panner);
    panner.connect(fader);
    fader.connect(analyser);

    const outputBus =
      channel.outputBus === "master"
        ? this.masterNodes!.input
        : this.busNodes.get(channel.outputBus)?.input;
    if (outputBus) fader.connect(outputBus);

    for (const send of channel.sends) {
      if (!send.enabled) continue;
      const sendGain = ctx.createGain();
      sendGain.gain.value = send.level;
      const sendSource = send.pre ? input : fader;
      const busInput = this.busNodes.get(send.busId)?.input;
      if (busInput) {
        sendSource.connect(sendGain);
        sendGain.connect(busInput);
      }
    }

    return { input, gate, eqNodes, compressor, makeupGain, panner, fader, analyser };
  }

  private createBusChain(bus: BusStrip): BusNodes {
    const ctx = AudioEngine.ctx!;
    const input = ctx.createGain();
    input.gain.value = bus.volume;

    const panner = ctx.createStereoPanner();
    panner.pan.value = bus.pan;

    const eqNodes = bus.eq.map((band) => {
      const filter = ctx.createBiquadFilter();
      filter.type = band.type as BiquadFilterType;
      filter.frequency.value = band.frequency;
      filter.gain.value = band.gain;
      filter.Q.value = band.q;
      return filter;
    });

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = bus.compressor.threshold;
    compressor.ratio.value = bus.compressor.ratio;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    let node: AudioNode = input;
    for (const eqNode of eqNodes) {
      node.connect(eqNode);
      node = eqNode;
    }
    if (bus.compressor.enabled) {
      node.connect(compressor);
      node = compressor;
    }
    node.connect(panner);
    panner.connect(analyser);
    if (this.masterNodes) analyser.connect(this.masterNodes.input);

    return { input, eqNodes, compressor, panner, analyser };
  }

  private createMasterChain(): MasterNodes {
    const ctx = AudioEngine.ctx!;
    const input = ctx.createGain();
    input.gain.value = this.state.master.volume;

    const panner = ctx.createStereoPanner();
    panner.pan.value = this.state.master.pan;

    const eqNodes = this.state.master.eq.map((band) => {
      const filter = ctx.createBiquadFilter();
      filter.type = band.type as BiquadFilterType;
      filter.frequency.value = band.frequency;
      filter.gain.value = band.gain;
      filter.Q.value = band.q;
      return filter;
    });

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = this.state.master.compressor.threshold;
    compressor.ratio.value = this.state.master.compressor.ratio;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = this.state.master.limiter.ceiling;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = this.state.master.limiter.release / 1000;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;

    let node: AudioNode = input;
    for (const eqNode of eqNodes) {
      node.connect(eqNode);
      node = eqNode;
    }
    if (this.state.master.compressor.enabled) {
      node.connect(compressor);
      node = compressor;
    }
    if (this.state.master.limiter.enabled) {
      node.connect(limiter);
      node = limiter;
    }
    node.connect(panner);
    panner.connect(analyser);
    analyser.connect(AudioEngine.master!);

    return { input, eqNodes, compressor, limiter, panner, analyser };
  }

  private startMetering() {
    this.meterInterval = window.setInterval(() => {
      if (!AudioEngine.ctx) return;
      for (const [id, nodes] of this.channelNodes) {
        const data = new Uint8Array(nodes.analyser.fftSize);
        nodes.analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const channel = this.state.channels.find((c) => c.id === id);
        if (channel) {
          channel.meterLevel = rms;
          channel.meterRms = rms;
          if (rms > channel.meterPeak) channel.meterPeak = rms;
        }
      }
      if (this.masterNodes) {
        const data = new Uint8Array(this.masterNodes.analyser.fftSize);
        this.masterNodes.analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        this.state.master.meterLevel = rms;
        if (rms > this.state.master.meterPeak) this.state.master.meterPeak = rms;
      }
    }, 50);
  }

  stopMetering() {
    if (this.meterInterval) {
      clearInterval(this.meterInterval);
      this.meterInterval = null;
    }
  }
  getChannelInput(id: string): GainNode | null {
    return this.channelNodes.get(id)?.input ?? null;
  }
  setChannelVolume(id: string, volume: number) {
    const n = this.channelNodes.get(id);
    if (n) n.fader.gain.setTargetAtTime(volume, AudioEngine.ctx!.currentTime, 0.02);
  }
  setChannelPan(id: string, pan: number) {
    const n = this.channelNodes.get(id);
    if (n) n.panner.pan.setTargetAtTime(pan, AudioEngine.ctx!.currentTime, 0.02);
  }
  setChannelMute(id: string, mute: boolean) {
    const n = this.channelNodes.get(id);
    if (n) {
      // Restore the channel's stored volume on unmute, not unity
      const target = mute ? 0 : n.fader.gain.value === 0 ? 1 : n.fader.gain.value;
      const stored = this.state.channels.find((c) => c.id === id)?.volume ?? 1;
      n.fader.gain.setTargetAtTime(mute ? 0 : stored || target, AudioEngine.ctx!.currentTime, 0.02);
    }
  }

  updateEQ(channelId: string, bandIndex: number, freq: number, gain: number, q: number) {
    const nodes = this.channelNodes.get(channelId);
    if (nodes && nodes.eqNodes[bandIndex]) {
      const t = AudioEngine.ctx!.currentTime;
      nodes.eqNodes[bandIndex].frequency.setTargetAtTime(freq, t, 0.02);
      nodes.eqNodes[bandIndex].gain.setTargetAtTime(gain, t, 0.02);
      nodes.eqNodes[bandIndex].Q.setTargetAtTime(q, t, 0.02);
    }
  }

  disconnect() {
    this.stopMetering();
    this.channelNodes.forEach((nodes) => {
      // Disconnect every node in the strip, not just some of them
      nodes.input.disconnect();
      nodes.gate.disconnect();
      nodes.eqNodes.forEach((n) => n.disconnect());
      nodes.compressor.disconnect();
      nodes.makeupGain.disconnect();
      nodes.panner.disconnect();
      nodes.fader.disconnect();
      try {
        nodes.analyser.disconnect();
      } catch {}
    });
    this.busNodes.forEach((bus) => {
      bus.input.disconnect();
      bus.eqNodes.forEach((n) => n.disconnect());
      bus.compressor.disconnect();
      bus.panner.disconnect();
      try {
        bus.analyser.disconnect();
      } catch {}
    });
    if (this.masterNodes) {
      this.masterNodes.input.disconnect();
      this.masterNodes.eqNodes.forEach((n) => n.disconnect());
      this.masterNodes.compressor.disconnect();
      this.masterNodes.limiter.disconnect();
      this.masterNodes.panner.disconnect();
      try {
        this.masterNodes.analyser.disconnect();
      } catch {}
    }
    this.channelNodes.clear();
    this.busNodes.clear();
    this.masterNodes = null;
  }
}

export interface ChannelNodes {
  input: GainNode;
  gate: DynamicsCompressorNode;
  eqNodes: BiquadFilterNode[];
  compressor: DynamicsCompressorNode;
  makeupGain: GainNode;
  panner: StereoPannerNode;
  fader: GainNode;
  analyser: AnalyserNode;
}
export interface BusNodes {
  input: GainNode;
  eqNodes: BiquadFilterNode[];
  compressor: DynamicsCompressorNode;
  panner: StereoPannerNode;
  analyser: AnalyserNode;
}
export interface MasterNodes {
  input: GainNode;
  eqNodes: BiquadFilterNode[];
  compressor: DynamicsCompressorNode;
  limiter: DynamicsCompressorNode;
  panner: StereoPannerNode;
  analyser: AnalyserNode;
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}
export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(0.0001, gain));
}
export function getMeterColor(level: number): string {
  if (level > 0.9) return "#ef4444";
  if (level > 0.7) return "#f59e0b";
  if (level > 0.5) return "#10b981";
  return "#3b82f6";
}
export function formatDb(db: number): string {
  const sign = db >= 0 ? "+" : "";
  return `${sign}${db.toFixed(1)} dB`;
}
