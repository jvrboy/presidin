// One-Shot Sampler — Record, load, and trigger one-shot samples.
// Provides recording from microphone, trimming, normalization, and mapping to pads.

import { AudioEngine } from "./engine";
import { renderWaveformPeaks } from "./sample-packs";

export interface OneShotPad {
  id: string;
  name: string;
  buffer: AudioBuffer | null;
  key: string;
  midiNote: number;
  color: string;
  pitch: number;
  pan: number;
  gain: number;
  reverse: boolean;
  startOffset: number;
  endOffset: number;
  loopMode: boolean;
  reverb: number;
  delay: number;
  filter: number;
  durationSec: number;
  waveform: number[];
}

export interface OneShotState {
  pads: OneShotPad[];
  selectedPadId: string | null;
  masterVolume: number;
  recordMode: boolean;
  recordingBuffer: AudioBuffer | null;
  isRecording: boolean;
}

export function createDefaultPad(index: number): OneShotPad {
  const keys = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "w", "e", "r", "t", "y", "u"];
  const colors = [
    "#ef4444",
    "#f97316",
    "#f59e0b",
    "#eab308",
    "#84cc16",
    "#22c55e",
    "#10b981",
    "#14b8a6",
    "#06b6d4",
    "#3b82f6",
    "#6366f1",
    "#8b5cf6",
    "#a855f7",
    "#d946ef",
    "#ec4899",
    "#f43f5e",
  ];
  return {
    id: crypto.randomUUID(),
    name: `Pad ${index + 1}`,
    buffer: null,
    key: keys[index % keys.length] || `pad${index}`,
    midiNote: 36 + index,
    color: colors[index % colors.length],
    pitch: 0,
    pan: 0,
    gain: 1,
    reverse: false,
    startOffset: 0,
    endOffset: 1,
    loopMode: false,
    reverb: 0,
    delay: 0,
    filter: 1,
    durationSec: 0,
    waveform: [],
  };
}

export function createDefaultOneShotState(padCount = 16): OneShotState {
  return {
    pads: Array.from({ length: padCount }, (_, i) => createDefaultPad(i)),
    selectedPadId: null,
    masterVolume: 0.8,
    recordMode: false,
    recordingBuffer: null,
    isRecording: false,
  };
}

export async function recordOneShot(
  ctx: AudioContext,
  durationSec: number,
  onProgress?: (pct: number) => void,
): Promise<AudioBuffer> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
  return new Promise((resolve, reject) => {
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: "audio/webm" });
      const arrayBuf = await blob.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      resolve(audioBuf);
    };
    mediaRecorder.onerror = (e) => reject(e);
    mediaRecorder.start();
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      onProgress?.(Math.min(1, elapsed / durationSec));
      if (elapsed >= durationSec) {
        clearInterval(interval);
        mediaRecorder.stop();
      }
    }, 50);
  });
}

export async function loadPadSample(
  ctx: AudioContext,
  file: File,
): Promise<{ buffer: AudioBuffer; waveform: number[]; durationSec: number }> {
  const arrayBuf = await file.arrayBuffer();
  const audioBuf = await ctx.decodeAudioData(arrayBuf);
  return {
    buffer: audioBuf,
    waveform: renderWaveformPeaks(audioBuf, 200),
    durationSec: audioBuf.duration,
  };
}

export function trimBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  startOffset: number,
  endOffset: number,
): AudioBuffer {
  const start = Math.floor(buffer.length * startOffset);
  const end = Math.floor(buffer.length * endOffset);
  const len = Math.max(1, end - start);
  const out = ctx.createBuffer(buffer.numberOfChannels, len, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < len; i++) dst[i] = src[start + i];
  }
  return out;
}

export function normalizeBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  targetDb = -1,
): AudioBuffer {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
    }
  }
  if (peak === 0) return buffer;
  const target = Math.pow(10, targetDb / 20);
  const gain = target / peak;
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < src.length; i++) dst[i] = src[i] * gain;
  }
  return out;
}

export function reverseBuffer(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i];
  }
  return out;
}

export function playPad(
  ctx: AudioContext,
  pad: OneShotPad,
  opts: { gain?: number; startTime?: number } = {},
): void {
  if (!pad.buffer) return;
  const src = ctx.createBufferSource();
  const trimmed =
    pad.startOffset > 0 || pad.endOffset < 1
      ? trimBuffer(ctx, pad.buffer, pad.startOffset, pad.endOffset)
      : pad.buffer;
  const finalBuffer = pad.reverse ? reverseBuffer(ctx, trimmed) : trimmed;
  src.buffer = finalBuffer;
  src.playbackRate.value = Math.pow(2, pad.pitch / 12);
  src.loop = pad.loopMode;
  const gain = ctx.createGain();
  gain.gain.value = (opts.gain ?? 1) * pad.gain;
  const panner = ctx.createStereoPanner();
  panner.pan.value = pad.pan;
  let last: AudioNode = gain;
  if (pad.filter < 1) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 200 + pad.filter * 18000;
    last.connect(filter);
    last = filter;
  }
  if (pad.reverb > 0) {
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.1;
    const fb = ctx.createGain();
    fb.gain.value = pad.reverb * 0.4;
    delay.connect(fb);
    fb.connect(delay);
    last.connect(delay);
    last = delay;
  }
  if (pad.delay > 0) {
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.25;
    const fb = ctx.createGain();
    fb.gain.value = pad.delay * 0.3;
    delay.connect(fb);
    fb.connect(delay);
    last.connect(delay);
    last = delay;
  }
  src.connect(gain);
  last.connect(panner);
  panner.connect(ctx.destination);
  src.start(opts.startTime ?? ctx.currentTime);

  // Schedule teardown so feedback loops and the per-hit graph don't
  // accumulate in the live context across pad hits
  const durationSec = pad.loopMode
    ? 10 // looping pads: tear the tail down after a generous window
    : finalBuffer.duration / Math.max(0.01, src.playbackRate.value) + 2;
  window.setTimeout(
    () => {
      try {
        if (pad.reverb > 0 || pad.delay > 0) last.disconnect();
        panner.disconnect(ctx.destination);
      } catch {}
    },
    Math.ceil(durationSec * 1000),
  );
}

export function updatePad(
  state: OneShotState,
  padId: string,
  patch: Partial<OneShotPad>,
): OneShotState {
  return { ...state, pads: state.pads.map((p) => (p.id === padId ? { ...p, ...patch } : p)) };
}

export function assignPadBuffer(
  state: OneShotState,
  padId: string,
  buffer: AudioBuffer,
): OneShotState {
  return {
    ...state,
    pads: state.pads.map((p) =>
      p.id === padId
        ? { ...p, buffer, durationSec: buffer.duration, waveform: renderWaveformPeaks(buffer, 200) }
        : p,
    ),
  };
}
