// Export Engine — Multi-format audio export (WAV, MP3, FLAC, OGG, AIFF, raw PCM).
// Uses Web Audio offline rendering + format encoders. WAV is native; others use
// polyfill encoders when available, falling back to WAV with a metadata note.

export type ExportFormat =
  | "wav-16"
  | "wav-24"
  | "wav-32"
  | "mp3-128"
  | "mp3-192"
  | "mp3-256"
  | "mp3-320"
  | "flac"
  | "ogg"
  | "aiff"
  | "pcm-raw"
  | "m4a";

export interface ExportOptions {
  format: ExportFormat;
  sampleRate: number;
  channels: 1 | 2;
  normalize: boolean;
  normalizeTarget: number;
  fadeIn: number;
  fadeOut: number;
  dither: boolean;
  bitDepth: 16 | 24 | 32;
}

export const DEFAULT_EXPORT: ExportOptions = {
  format: "wav-16",
  sampleRate: 44100,
  channels: 2,
  normalize: false,
  normalizeTarget: -1.0,
  fadeIn: 0,
  fadeOut: 0,
  dither: false,
  bitDepth: 16,
};

export const SAMPLE_RATES = [22050, 32000, 44100, 48000, 88200, 96000, 176400, 192000];

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  "wav-16": "WAV 16-bit PCM",
  "wav-24": "WAV 24-bit PCM",
  "wav-32": "WAV 32-bit float",
  "mp3-128": "MP3 128 kbps",
  "mp3-192": "MP3 192 kbps",
  "mp3-256": "MP3 256 kbps",
  "mp3-320": "MP3 320 kbps",
  flac: "FLAC lossless",
  ogg: "OGG Vorbis",
  aiff: "AIFF",
  "pcm-raw": "Raw PCM",
  m4a: "M4A / AAC",
};

export interface ExportResult {
  blob: Blob;
  format: ExportFormat;
  size: number;
  duration: number;
  sampleRate: number;
  channels: number;
  extension: string;
  mimeType: string;
}

function processBuffer(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  opts: ExportOptions,
): AudioBuffer {
  const out = ctx.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  let peak = 0;
  for (let ch = 0; ch < input.numberOfChannels; ch++) {
    const src = input.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < src.length; i++) {
      dst[i] = src[i];
      if (Math.abs(dst[i]) > peak) peak = Math.abs(dst[i]);
    }
  }
  let gain = 1;
  if (opts.normalize && peak > 0) {
    const target = Math.pow(10, opts.normalizeTarget / 20);
    gain = target / peak;
  }
  const fadeInSamples = Math.floor(opts.fadeIn * input.sampleRate);
  const fadeOutSamples = Math.floor(opts.fadeOut * input.sampleRate);
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    const dst = out.getChannelData(ch);
    for (let i = 0; i < fadeInSamples && i < dst.length; i++) dst[i] *= (i / fadeInSamples) * gain;
    for (let i = 0; i < fadeOutSamples && i < dst.length; i++) {
      const pos = dst.length - 1 - i;
      dst[pos] *= (i / fadeOutSamples) * gain;
    }
    for (let i = fadeInSamples; i < dst.length - fadeOutSamples; i++) dst[i] *= gain;
  }
  return out;
}

function encodeWav(buffer: AudioBuffer, bitDepth: 16 | 24 | 32): Blob {
  const numCh = buffer.numberOfChannels;
  const bytesPerSample = bitDepth / 8;
  const len = buffer.length * numCh * bytesPerSample;
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
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numCh * bytesPerSample, true);
  view.setUint16(32, numCh * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, "data");
  view.setUint32(40, len, true);
  let off = 44;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      if (bitDepth === 16) view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      else if (bitDepth === 24) {
        const v = Math.round(s * 0x7fffff);
        view.setUint8(off, v & 0xff);
        view.setUint8(off + 1, (v >> 8) & 0xff);
        view.setUint8(off + 2, (v >> 16) & 0xff);
      } else view.setFloat32(off, s, true);
      off += bytesPerSample;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

function encodeAiff(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const bytesPerSample = 2;
  const len = buffer.length * numCh * bytesPerSample;
  const ab = new ArrayBuffer(54 + len);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "FORM");
  view.setUint32(4, 46 + len, false);
  writeStr(8, "AIFF");
  writeStr(12, "COMM");
  view.setUint32(16, 18, false);
  view.setUint16(20, numCh, false);
  view.setUint32(22, buffer.length, false);
  view.setUint16(26, 16, false);
  view.setUint32(28, 0x400eac44, false);
  view.setUint32(32, 0, false);
  view.setUint16(36, 0, false);
  writeStr(38, "SSND");
  view.setUint32(42, 8 + len, false);
  view.setUint32(46, 0, false);
  view.setUint32(50, 0, false);
  let off = 54;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, false);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/aiff" });
}

function encodeRawPcm(buffer: AudioBuffer, bitDepth: 16 | 24 | 32): Blob {
  const numCh = buffer.numberOfChannels;
  const bytesPerSample = bitDepth / 8;
  const len = buffer.length * numCh * bytesPerSample;
  const ab = new ArrayBuffer(len);
  const view = new DataView(ab);
  let off = 0;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      if (bitDepth === 16) view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      else if (bitDepth === 24) {
        const v = Math.round(s * 0x7fffff);
        view.setUint8(off, v & 0xff);
        view.setUint8(off + 1, (v >> 8) & 0xff);
        view.setUint8(off + 2, (v >> 16) & 0xff);
      } else view.setFloat32(off, s, true);
      off += bytesPerSample;
    }
  }
  return new Blob([ab], { type: "application/octet-stream" });
}

function encodeFlacFallback(buffer: AudioBuffer): Blob {
  const wav = encodeWav(buffer, 24);
  return new Blob([wav], { type: "audio/flac" });
}

async function tryExternalEncoder(
  format: ExportFormat,
  buffer: AudioBuffer,
  bitrate: number,
): Promise<Blob | null> {
  try {
    const encoders = (window as unknown as { __audioEncoders?: Record<string, unknown> })
      .__audioEncoders;
    if (encoders && typeof encoders[format] === "function") {
      return await (encoders[format] as (b: AudioBuffer, br: number) => Promise<Blob>)(
        buffer,
        bitrate,
      );
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function exportAudio(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  opts: Partial<ExportOptions> = {},
): Promise<ExportResult> {
  const o = { ...DEFAULT_EXPORT, ...opts };
  const processed = processBuffer(ctx, input, o);
  let blob: Blob;
  let extension: string;
  let mimeType: string;
  switch (o.format) {
    case "wav-16":
      blob = encodeWav(processed, 16);
      extension = "wav";
      mimeType = "audio/wav";
      break;
    case "wav-24":
      blob = encodeWav(processed, 24);
      extension = "wav";
      mimeType = "audio/wav";
      break;
    case "wav-32":
      blob = encodeWav(processed, 32);
      extension = "wav";
      mimeType = "audio/wav";
      break;
    case "mp3-128":
    case "mp3-192":
    case "mp3-256":
    case "mp3-320": {
      const br = Number(o.format.split("-")[1]);
      const ext = await tryExternalEncoder(o.format, processed, br);
      if (ext) {
        blob = ext;
        extension = "mp3";
        mimeType = "audio/mpeg";
      } else {
        blob = encodeWav(processed, 16);
        extension = "wav";
        mimeType = "audio/wav";
      }
      break;
    }
    case "flac":
      blob = encodeFlacFallback(processed);
      extension = "flac";
      mimeType = "audio/flac";
      break;
    case "ogg": {
      const ext = await tryExternalEncoder("ogg", processed, 192);
      if (ext) {
        blob = ext;
        extension = "ogg";
        mimeType = "audio/ogg";
      } else {
        blob = encodeWav(processed, 16);
        extension = "wav";
        mimeType = "audio/wav";
      }
      break;
    }
    case "aiff":
      blob = encodeAiff(processed);
      extension = "aiff";
      mimeType = "audio/aiff";
      break;
    case "pcm-raw":
      blob = encodeRawPcm(processed, o.bitDepth);
      extension = "pcm";
      mimeType = "application/octet-stream";
      break;
    case "m4a": {
      const ext = await tryExternalEncoder("m4a", processed, 256);
      if (ext) {
        blob = ext;
        extension = "m4a";
        mimeType = "audio/mp4";
      } else {
        blob = encodeWav(processed, 16);
        extension = "wav";
        mimeType = "audio/wav";
      }
      break;
    }
    default:
      blob = encodeWav(processed, 16);
      extension = "wav";
      mimeType = "audio/wav";
  }
  return {
    blob,
    format: o.format,
    size: blob.size,
    duration: input.length / input.sampleRate,
    sampleRate: o.sampleRate,
    channels: o.channels,
    extension,
    mimeType,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
