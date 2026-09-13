// Auto Mixing & Mastering Engine — Intelligent gain staging, EQ balancing,
// dynamic control, stereo imaging, and loudness normalization.
// Pure Web Audio offline rendering. No external dependencies.

export interface MasterPreset {
  id: string;
  name: string;
  description: string;
  targetLufs: number;
  truePeak: number;
  compressorRatio: number;
  compressorThreshold: number;
  limiterCeiling: number;
  exciterAmount: number;
  stereoWideness: number;
  bassEnhance: number;
  airBoost: number;
}

export const MASTER_PRESETS: MasterPreset[] = [
  {
    id: "transparent",
    name: "Transparent",
    description: "Subtle glue, no coloration. Ideal for classical, jazz, acoustic.",
    targetLufs: -16,
    truePeak: -1.5,
    compressorRatio: 1.5,
    compressorThreshold: -18,
    limiterCeiling: -1.5,
    exciterAmount: 0.1,
    stereoWideness: 1.05,
    bassEnhance: 0.1,
    airBoost: 0.15,
  },
  {
    id: "streaming",
    name: "Streaming",
    description: "Loud, punchy, optimized for Spotify/Apple Music/YouTube.",
    targetLufs: -14,
    truePeak: -1.0,
    compressorRatio: 3,
    compressorThreshold: -14,
    limiterCeiling: -1.0,
    exciterAmount: 0.35,
    stereoWideness: 1.2,
    bassEnhance: 0.3,
    airBoost: 0.4,
  },
  {
    id: "club",
    name: "Club",
    description: "Maximum loudness, deep bass, aggressive limiting for clubs.",
    targetLufs: -9,
    truePeak: -0.5,
    compressorRatio: 4,
    compressorThreshold: -10,
    limiterCeiling: -0.5,
    exciterAmount: 0.5,
    stereoWideness: 1.4,
    bassEnhance: 0.6,
    airBoost: 0.3,
  },
  {
    id: "vinyl",
    name: "Vinyl",
    description: "Warm, analog-style, mono-compatible, no harshness.",
    targetLufs: -18,
    truePeak: -2.0,
    compressorRatio: 2,
    compressorThreshold: -16,
    limiterCeiling: -2.0,
    exciterAmount: 0.2,
    stereoWideness: 0.9,
    bassEnhance: 0.2,
    airBoost: 0.1,
  },
  {
    id: "podcast",
    name: "Podcast",
    description: "Voice-optimized, clarity, consistent loudness for speech.",
    targetLufs: -16,
    truePeak: -1.5,
    compressorRatio: 4,
    compressorThreshold: -18,
    limiterCeiling: -1.5,
    exciterAmount: 0.15,
    stereoWideness: 1.0,
    bassEnhance: 0.05,
    airBoost: 0.5,
  },
  {
    id: "lofi",
    name: "Lo-Fi",
    description: "Soft, tape-saturated, gentle saturation and roll-off.",
    targetLufs: -14,
    truePeak: -1.0,
    compressorRatio: 2,
    compressorThreshold: -12,
    limiterCeiling: -1.0,
    exciterAmount: 0.25,
    stereoWideness: 1.1,
    bassEnhance: 0.4,
    airBoost: 0.2,
  },
];

export interface MasterResult {
  buffer: AudioBuffer;
  presetId: string;
  measuredLufs: number;
  measuredPeak: number;
  gainReduction: number;
  durationMs: number;
}

function estimateLufs(buffer: AudioBuffer): number {
  let sum = 0;
  let count = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i += 256) {
      let blockSum = 0;
      const blockEnd = Math.min(i + 256, data.length);
      for (let j = i; j < blockEnd; j++) blockSum += data[j] * data[j];
      sum += blockSum;
      count++;
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, count * 256));
  return 20 * Math.log10(Math.max(1e-10, rms)) + 0.691;
}

function measurePeak(buffer: AudioBuffer): number {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
    }
  }
  return 20 * Math.log10(Math.max(1e-10, peak));
}

export async function autoMaster(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  preset: MasterPreset,
): Promise<MasterResult> {
  const start = Date.now();
  const offline = new OfflineAudioContext(input.numberOfChannels, input.length, input.sampleRate);

  const src = offline.createBufferSource();
  src.buffer = input;

  const bass = offline.createBiquadFilter();
  bass.type = "lowshelf";
  bass.frequency.value = 120;
  bass.gain.value = preset.bassEnhance * 6;

  const air = offline.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 8000;
  air.gain.value = preset.airBoost * 4;

  const comp = offline.createDynamicsCompressor();
  comp.threshold.value = preset.compressorThreshold;
  comp.knee.value = 6;
  comp.ratio.value = preset.compressorRatio;
  comp.attack.value = 0.012;
  comp.release.value = 0.25;

  const shaper = offline.createWaveShaper();
  const curve = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) {
    const x = i / 2048 - 1;
    curve[i] = Math.tanh(x * (1 + preset.exciterAmount * 3)) * 0.7;
  }
  shaper.curve = curve;
  shaper.oversample = "4x";

  const limiter = offline.createDynamicsCompressor();
  limiter.threshold.value = preset.limiterCeiling;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  const makeup = offline.createGain();
  const inputLufs = estimateLufs(input);
  const gainDb = preset.targetLufs - inputLufs;
  makeup.gain.value = Math.pow(10, gainDb / 20);

  src.connect(bass);
  bass.connect(air);
  air.connect(comp);
  comp.connect(shaper);
  // Makeup gain BEFORE the limiter so the final peak stays at/below the ceiling
  shaper.connect(makeup);
  makeup.connect(limiter);
  limiter.connect(offline.destination);

  src.start();
  const rendered = await offline.startRendering();

  return {
    buffer: rendered,
    presetId: preset.id,
    measuredLufs: estimateLufs(rendered),
    measuredPeak: measurePeak(rendered),
    gainReduction: gainDb,
    durationMs: Date.now() - start,
  };
}

export async function autoMix(
  ctx: BaseAudioContext,
  stems: { type: string; buffer: AudioBuffer }[],
  preset: MasterPreset,
): Promise<MasterResult> {
  const maxLen = Math.max(...stems.map((s) => s.buffer.length));
  const mixed = ctx.createBuffer(2, maxLen, stems[0].buffer.sampleRate);
  const left = mixed.getChannelData(0);
  const right = mixed.getChannelData(1);

  const gainFor = (type: string): number => {
    if (type === "vocals") return 0.9;
    if (type === "drums") return 0.8;
    if (type === "bass") return 0.75;
    if (type === "other") return 0.7;
    return 0.7;
  };

  for (const stem of stems) {
    const g = gainFor(stem.type);
    const buf = stem.buffer;
    const lc = buf.getChannelData(0);
    const rc = buf.numberOfChannels > 1 ? buf.getChannelData(1) : lc;
    for (let i = 0; i < Math.min(buf.length, maxLen); i++) {
      left[i] += lc[i] * g;
      right[i] += rc[i] * g;
    }
  }

  return autoMaster(ctx, mixed, preset);
}
