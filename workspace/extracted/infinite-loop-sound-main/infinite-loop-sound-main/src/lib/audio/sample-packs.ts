// Sample Packs — Local folder import, sample pack management, and one-shot sample loading.
// Uses File System Access API where available, falling back to file input.

export interface SamplePack {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  samples: Sample[];
  createdAt: number;
  source: "builtin" | "local" | "folder";
  folderHandle?: FileSystemDirectoryHandle;
}

export interface Sample {
  id: string;
  name: string;
  packId: string;
  category:
    | "kick"
    | "snare"
    | "hihat"
    | "perc"
    | "bass"
    | "synth"
    | "vocal"
    | "fx"
    | "loop"
    | "one-shot"
    | "instrument";
  buffer?: AudioBuffer;
  file?: File;
  url?: string;
  sizeBytes: number;
  durationSec: number;
  bpm?: number;
  key?: string;
  tags: string[];
  waveform?: number[];
}

export interface SampleCategory {
  id: string;
  name: string;
  icon: string;
}

export const SAMPLE_CATEGORIES: SampleCategory[] = [
  { id: "kick", name: "Kicks", icon: "Circle" },
  { id: "snare", name: "Snares", icon: "CircleDot" },
  { id: "hihat", name: "Hi-Hats", icon: "Disc" },
  { id: "perc", name: "Percussion", icon: "Disc" },
  { id: "bass", name: "Bass", icon: "Activity" },
  { id: "synth", name: "Synths", icon: "WaveSine" },
  { id: "vocal", name: "Vocals", icon: "Mic" },
  { id: "fx", name: "FX", icon: "Sparkles" },
  { id: "loop", name: "Loops", icon: "Repeat" },
  { id: "one-shot", name: "One-Shots", icon: "Zap" },
  { id: "instrument", name: "Instruments", icon: "Piano" },
];

const PACKS_KEY = "diq.sample-packs.v1";

export function createBuiltinPack(ctx: BaseAudioContext): SamplePack {
  const samples: Sample[] = [];
  const makeTone = (
    name: string,
    freq: number,
    dur: number,
    category: Sample["category"],
    decay: number = 0.3,
  ): Sample => {
    const buf = ctx.createBuffer(1, Math.floor(dur * ctx.sampleRate), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t / decay);
      d[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.7;
    }
    return {
      id: crypto.randomUUID(),
      name,
      packId: "builtin",
      category,
      buffer: buf,
      sizeBytes: buf.length * 4,
      durationSec: dur,
      tags: ["builtin", "generated"],
    };
  };
  samples.push(makeTone("Kick 808", 60, 0.5, "kick", 0.2));
  samples.push(makeTone("Kick Punch", 80, 0.3, "kick", 0.15));
  samples.push(makeTone("Snare Hit", 200, 0.2, "snare", 0.1));
  samples.push(makeTone("Hi-Hat Closed", 8000, 0.05, "hihat", 0.03));
  samples.push(makeTone("Hi-Hat Open", 8000, 0.2, "hihat", 0.1));
  samples.push(makeTone("Clap", 2000, 0.15, "perc", 0.08));
  samples.push(makeTone("Bass Sub", 50, 1.0, "bass", 0.5));
  samples.push(makeTone("Synth Lead", 440, 0.5, "synth", 0.3));
  return {
    id: "builtin",
    name: "Builtin Sounds",
    description: "Generated demo samples — no external assets required.",
    category: "builtin",
    tags: ["builtin", "demo"],
    samples,
    createdAt: Date.now(),
    source: "builtin",
  };
}

export async function loadSampleFile(
  ctx: BaseAudioContext,
  file: File,
  packId: string,
): Promise<Sample> {
  const arrayBuf = await file.arrayBuffer();
  const audioBuf = await ctx.decodeAudioData(arrayBuf);
  const category = guessCategory(file.name);
  return {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.[^.]+$/, ""),
    packId,
    category,
    file,
    buffer: audioBuf,
    url: URL.createObjectURL(file),
    sizeBytes: file.size,
    durationSec: audioBuf.duration,
    tags: ["local"],
    waveform: renderWaveformPeaks(audioBuf, 200),
  };
}

export function guessCategory(filename: string): Sample["category"] {
  const n = filename.toLowerCase();
  if (n.includes("kick") || n.includes("808")) return "kick";
  if (n.includes("snare") || n.includes("clap")) return "snare";
  if (n.includes("hat") || n.includes("hihat") || n.includes("hh")) return "hihat";
  if (n.includes("perc") || n.includes("rim") || n.includes("tom")) return "perc";
  if (n.includes("bass") || n.includes("sub")) return "bass";
  if (n.includes("synth") || n.includes("lead") || n.includes("pad")) return "synth";
  if (n.includes("vocal") || n.includes("vox") || n.includes("voice")) return "vocal";
  if (n.includes("fx") || n.includes("riser") || n.includes("impact")) return "fx";
  if (n.includes("loop")) return "loop";
  if (n.includes("oneshot") || n.includes("one-shot")) return "one-shot";
  if (n.includes("piano") || n.includes("guitar") || n.includes("instrument")) return "instrument";
  return "one-shot";
}

export function renderWaveformPeaks(buffer: AudioBuffer, peaks: number): number[] {
  const data = buffer.getChannelData(0);
  const block = Math.floor(data.length / peaks);
  const result: number[] = [];
  for (let i = 0; i < peaks; i++) {
    let max = 0;
    for (let j = 0; j < block; j++) {
      const v = Math.abs(data[i * block + j] || 0);
      if (v > max) max = v;
    }
    result.push(max);
  }
  return result;
}

export async function importFolder(
  ctx: BaseAudioContext,
  onProgress?: (loaded: number, total: number) => void,
): Promise<SamplePack | null> {
  if (!("showDirectoryPicker" in window))
    throw new Error("File System Access API not supported. Use file input instead.");
  const dirHandle = await (
    window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
  ).showDirectoryPicker();
  const samples: Sample[] = [];
  const audioExts = [".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aiff", ".aac"];
  const files: File[] = [];
  for await (const entry of (
    dirHandle as unknown as { values: () => AsyncIterable<FileSystemHandle> }
  ).values()) {
    if (entry.kind === "file") {
      const file = await (entry as FileSystemFileHandle).getFile();
      if (audioExts.some((ext) => file.name.toLowerCase().endsWith(ext))) files.push(file);
    }
  }
  for (let i = 0; i < files.length; i++) {
    try {
      samples.push(await loadSampleFile(ctx, files[i], "folder-import"));
    } catch (e) {
      console.warn("Failed to load", files[i].name, e);
    }
    onProgress?.(i + 1, files.length);
  }
  return {
    id: crypto.randomUUID(),
    name: dirHandle.name,
    description: `Imported from ${dirHandle.name}`,
    category: "local",
    tags: ["local", "folder"],
    samples,
    createdAt: Date.now(),
    source: "folder",
    folderHandle: dirHandle,
  };
}

export async function importFiles(
  ctx: BaseAudioContext,
  files: FileList,
  onProgress?: (loaded: number, total: number) => void,
): Promise<SamplePack> {
  const samples: Sample[] = [];
  const audioExts = [".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aiff", ".aac"];
  const audioFiles = Array.from(files).filter((f) =>
    audioExts.some((ext) => f.name.toLowerCase().endsWith(ext)),
  );
  for (let i = 0; i < audioFiles.length; i++) {
    try {
      samples.push(await loadSampleFile(ctx, audioFiles[i], "file-import"));
    } catch (e) {
      console.warn("Failed to load", audioFiles[i].name, e);
    }
    onProgress?.(i + 1, audioFiles.length);
  }
  return {
    id: crypto.randomUUID(),
    name: `Import ${new Date().toLocaleString()}`,
    description: `${audioFiles.length} files imported`,
    category: "local",
    tags: ["local", "import"],
    samples,
    createdAt: Date.now(),
    source: "local",
  };
}

export function savePackMetadata(pack: SamplePack) {
  const packs = readPackMetadata();
  const meta = {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    category: pack.category,
    tags: pack.tags,
    createdAt: pack.createdAt,
    source: pack.source,
    sampleCount: pack.samples.length,
  };
  const existing = packs.findIndex((p) => p.id === pack.id);
  if (existing >= 0) packs[existing] = meta;
  else packs.push(meta);
  localStorage.setItem(PACKS_KEY, JSON.stringify(packs));
}

export function readPackMetadata(): Array<{
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  createdAt: number;
  source: string;
  sampleCount: number;
}> {
  try {
    return JSON.parse(localStorage.getItem(PACKS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function playOneShot(
  ctx: AudioContext,
  sample: Sample,
  opts: { gain?: number; pitch?: number; pan?: number; startTime?: number } = {},
): void {
  if (!sample.buffer) return;
  const src = ctx.createBufferSource();
  src.buffer = sample.buffer;
  src.playbackRate.value = opts.pitch ? Math.pow(2, opts.pitch / 12) : 1;
  const gain = ctx.createGain();
  gain.gain.value = opts.gain ?? 1;
  let lastNode: AudioNode = gain;
  if (opts.pan !== undefined) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = opts.pan;
    lastNode.connect(panner);
    lastNode = panner;
  }
  src.connect(gain);
  lastNode.connect(ctx.destination);
  src.start(opts.startTime ?? ctx.currentTime);
}
