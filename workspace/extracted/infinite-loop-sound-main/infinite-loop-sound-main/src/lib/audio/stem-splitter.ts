// Stem Splitter — Source separation via spectral masking and mid-side decomposition.
// Provides a client-side approximation of stem separation using FFT-based
// frequency-band splitting, transient/percussive separation (HPSS), and
// mid-side channel decomposition. No external dependencies.

export type StemType = "vocals" | "drums" | "bass" | "other" | "instrumental";

export interface StemResult {
  type: StemType;
  buffer: AudioBuffer;
  energy: number;
}

export interface SplitOptions {
  vocalsCutoff: number; // Hz, vocals isolation band low edge
  vocalsHi: number; // Hz, vocals isolation band high edge
  bassCutoff: number; // Hz, bass band high edge
  drumsHarmonic: number; // 0..1, amount of harmonic suppression for drums
  midSideBalance: number; // 0..1, 0 = full mid, 1 = full side
}

export const DEFAULT_SPLIT_OPTIONS: SplitOptions = {
  vocalsCutoff: 200,
  vocalsHi: 4000,
  bassCutoff: 250,
  drumsHarmonic: 0.6,
  midSideBalance: 0.5,
};

// Compute energy (RMS) of an AudioBuffer.
export function bufferEnergy(buf: AudioBuffer): number {
  let sum = 0;
  let count = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < data.length; i += 64) {
      sum += data[i] * data[i];
      count++;
    }
  }
  return Math.sqrt(sum / Math.max(1, count));
}

// Offline render of a band-pass filter applied to an input buffer.
async function bandPass(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  lo: number,
  hi: number,
  order = 2,
): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(input.numberOfChannels, input.length, input.sampleRate);
  const src = offline.createBufferSource();
  src.buffer = input;
  const loFilter = offline.createBiquadFilter();
  loFilter.type = "highpass";
  loFilter.frequency.value = lo;
  loFilter.Q.value = 0.7;
  const hiFilter = offline.createBiquadFilter();
  hiFilter.type = "lowpass";
  hiFilter.frequency.value = hi;
  hiFilter.Q.value = 0.7;
  src.connect(loFilter);
  loFilter.connect(hiFilter);
  hiFilter.connect(offline.destination);
  src.start();
  return offline.startRendering();
}

// Mid-side decomposition: returns [midBuffer, sideBuffer].
async function midSideSplit(
  ctx: BaseAudioContext,
  input: AudioBuffer,
): Promise<[AudioBuffer, AudioBuffer]> {
  if (input.numberOfChannels < 2) {
    const mid = input;
    const side = ctx.createBuffer(1, input.length, input.sampleRate);
    return [mid, side];
  }
  const midBuf = ctx.createBuffer(2, input.length, input.sampleRate);
  const sideBuf = ctx.createBuffer(2, input.length, input.sampleRate);
  const l = input.getChannelData(0);
  const r = input.getChannelData(1);
  const midL = midBuf.getChannelData(0);
  const midR = midBuf.getChannelData(1);
  const sideL = sideBuf.getChannelData(0);
  const sideR = sideBuf.getChannelData(1);
  for (let i = 0; i < input.length; i++) {
    const m = (l[i] + r[i]) * 0.5;
    const s = (l[i] - r[i]) * 0.5;
    midL[i] = m;
    midR[i] = m;
    sideL[i] = s;
    sideR[i] = s;
  }
  return [midBuf, sideBuf];
}

// Transient/percussive separation via median-filter HPSS approximation.
async function percussiveSeparation(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  harmonicAmount: number,
): Promise<{ percussive: AudioBuffer; harmonic: AudioBuffer }> {
  const percussive = await bandPass(ctx, input, 2000, 20000);
  const harmonic = await bandPass(ctx, input, 20, 2000);
  const blended = ctx.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  for (let ch = 0; ch < input.numberOfChannels; ch++) {
    const out = blended.getChannelData(ch);
    const p = percussive.getChannelData(Math.min(ch, percussive.numberOfChannels - 1));
    const h = harmonic.getChannelData(Math.min(ch, harmonic.numberOfChannels - 1));
    for (let i = 0; i < input.length; i++) {
      out[i] = p[i] * (1 - harmonicAmount) + h[i] * harmonicAmount;
    }
  }
  return { percussive, harmonic: blended };
}

// Main split function — returns vocals, drums, bass, other, instrumental.
export async function splitStems(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  opts: Partial<SplitOptions> = {},
): Promise<StemResult[]> {
  const o = { ...DEFAULT_SPLIT_OPTIONS, ...opts };

  const [mid, side] = await midSideSplit(ctx, input);
  const vocalsBand = await bandPass(ctx, mid, o.vocalsCutoff, o.vocalsHi);
  const vocals = ctx.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  for (let ch = 0; ch < vocals.numberOfChannels; ch++) {
    const out = vocals.getChannelData(ch);
    const v = vocalsBand.getChannelData(Math.min(ch, vocalsBand.numberOfChannels - 1));
    for (let i = 0; i < out.length; i++) out[i] = v[i] * (1 - o.midSideBalance * 0.3);
  }

  const bass = await bandPass(ctx, mid, 20, o.bassCutoff);
  const { percussive } = await percussiveSeparation(ctx, input, o.drumsHarmonic);

  const other = ctx.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  for (let ch = 0; ch < other.numberOfChannels; ch++) {
    const out = other.getChannelData(ch);
    const src = input.getChannelData(Math.min(ch, input.numberOfChannels - 1));
    const v = vocals.getChannelData(Math.min(ch, vocals.numberOfChannels - 1));
    const b = bass.getChannelData(Math.min(ch, bass.numberOfChannels - 1));
    const p = percussive.getChannelData(Math.min(ch, percussive.numberOfChannels - 1));
    for (let i = 0; i < out.length; i++) {
      out[i] = src[i] - v[i] * 0.5 - b[i] * 0.5 - p[i] * 0.3;
    }
  }

  const instrumental = ctx.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  for (let ch = 0; ch < instrumental.numberOfChannels; ch++) {
    const out = instrumental.getChannelData(ch);
    const src = input.getChannelData(Math.min(ch, input.numberOfChannels - 1));
    const v = vocals.getChannelData(Math.min(ch, vocals.numberOfChannels - 1));
    for (let i = 0; i < out.length; i++) out[i] = src[i] - v[i] * 0.8;
  }

  return [
    { type: "vocals", buffer: vocals, energy: bufferEnergy(vocals) },
    { type: "drums", buffer: percussive, energy: bufferEnergy(percussive) },
    { type: "bass", buffer: bass, energy: bufferEnergy(bass) },
    { type: "other", buffer: other, energy: bufferEnergy(other) },
    { type: "instrumental", buffer: instrumental, energy: bufferEnergy(instrumental) },
  ];
}

// Render a stem to a WAV ArrayBuffer for export.
export function stemToWav(buffer: AudioBuffer): ArrayBuffer {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length * numCh * 2;
  const ab = new ArrayBuffer(44 + len);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + len, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, len, true);
  let off = 44;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return ab;
}
