// Audio Skills — Skills powering the chat agent's audio production capabilities.
// These skills let the chat agent generate sounds, songs, analyze audio, and
// control the VINNY audio engine, piano roll, channel rack, and more.

import { AudioEngine } from "@/lib/audio/engine";
import {
  createDefaultPianoRoll,
  createNote,
  addNote,
  type PianoRollState,
} from "@/lib/audio/piano-roll";
import {
  createDefaultChannelRack,
  createDefaultChannelRack as createRack,
  type ChannelRackState,
} from "@/lib/audio/channel-rack";
import { createDefaultPlaylist, addTrack, addClip, type PlaylistState } from "@/lib/audio/playlist";
import { createDefaultMixer, type MixerState } from "@/lib/audio/advanced-mixer";
import { parseMidi, exportMidi, transformMidi, type MidiFile } from "@/lib/audio/midi-tools";
import { splitStems, type SplitOptions } from "@/lib/audio/stem-splitter";
import { autoMaster, MASTER_PRESETS } from "@/lib/audio/auto-master";
import { exportAudio, type ExportFormat } from "@/lib/audio/export-engine";
import { synthesizeVoice, parseLyrics, type VoiceSynthOptions } from "@/lib/audio/voice-synth";
import { createBuiltinPack, playOneShot, type Sample } from "@/lib/audio/sample-packs";
import type { Skill, SkillContext, SkillResult, SkillCategory } from "@/lib/skills/list";

export type AudioSkillCategory =
  | "Audio Synthesis"
  | "Music Production"
  | "Audio Analysis"
  | "Audio Export"
  | "Voice & Vocals"
  | "Samples & Packs";

async function ensureCtx(): Promise<AudioContext> {
  const ctx = AudioEngine.ctx ?? new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  return ctx as AudioContext;
}

export const AUDIO_SKILLS: Skill[] = [
  {
    id: "generate-tone",
    name: "Generate Tone",
    category: "Audio Synthesis" as SkillCategory,
    description: "Generate a pure tone at a specified frequency, duration, and waveform.",
    trigger: "keyword",
    keywords: ["tone", "beep", "sine", "generate sound", "make a sound"],
    exec: async ({ args }) => {
      const freq = Number(args?.freq || 440);
      const dur = Number(args?.duration || 1);
      const waveform = (args?.waveform as string) || "sine";
      const ctx = await ensureCtx();
      const osc = ctx.createOscillator();
      osc.type = waveform as OscillatorType;
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
      return { ok: true, output: `Generated ${waveform} tone at ${freq}Hz for ${dur}s.` };
    },
  },
  {
    id: "generate-melody",
    name: "Generate Melody",
    category: "Audio Synthesis" as SkillCategory,
    description: "Generate a melody from a sequence of MIDI notes with specified tempo.",
    trigger: "keyword",
    keywords: ["melody", "tune", "sequence of notes", "play notes"],
    exec: async ({ args }) => {
      const notes = (args?.notes as number[]) || [60, 62, 64, 65, 67, 69, 71, 72];
      const tempo = Number(args?.tempo || 120);
      const ctx = await ensureCtx();
      const noteDur = 60 / tempo;
      notes.forEach((midi, i) => {
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        const start = ctx.currentTime + i * noteDur;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.3, start + 0.01);
        gain.gain.linearRampToValueAtTime(0, start + noteDur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + noteDur);
      });
      return {
        ok: true,
        output: `Playing melody: ${notes.map((n) => n).join(", ")} at ${tempo} BPM.`,
      };
    },
  },
  {
    id: "generate-chord",
    name: "Generate Chord",
    category: "Audio Synthesis" as SkillCategory,
    description:
      "Generate a chord from a root note and chord type (major, minor, diminished, augmented, 7th, maj7, min7).",
    trigger: "keyword",
    keywords: ["chord", "harmony", "triad", "play chord"],
    exec: async ({ args }) => {
      const root = Number(args?.root || 60);
      const type = (args?.type as string) || "major";
      const intervals: Record<string, number[]> = {
        major: [0, 4, 7],
        minor: [0, 3, 7],
        diminished: [0, 3, 6],
        augmented: [0, 4, 8],
        "7th": [0, 4, 7, 10],
        maj7: [0, 4, 7, 11],
        min7: [0, 3, 7, 10],
      };
      const ivs = intervals[type] || intervals.major;
      const ctx = await ensureCtx();
      const dur = 2;
      ivs.forEach((iv) => {
        const freq = 440 * Math.pow(2, (root + iv - 69) / 12);
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + dur);
      });
      return { ok: true, output: `Playing ${type} chord with root ${root}.` };
    },
  },
  {
    id: "generate-drum-pattern",
    name: "Generate Drum Pattern",
    category: "Audio Synthesis" as SkillCategory,
    description:
      "Generate a drum pattern using kick, snare, and hi-hat synthesis at a specified tempo.",
    trigger: "keyword",
    keywords: ["drum", "beat", "rhythm", "drum pattern", "make a beat"],
    exec: async ({ args }) => {
      const tempo = Number(args?.tempo || 120);
      const bars = Number(args?.bars || 2);
      const ctx = await ensureCtx();
      const beatDur = 60 / tempo;
      const stepsPerBar = 16;
      const totalSteps = bars * stepsPerBar;

      const playKick = (t: number) => {
        const osc = ctx.createOscillator();
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.2);
      };
      const playSnare = (t: number) => {
        const noise = ctx.createBufferSource();
        const buf = ctx.createBuffer(1, 4410, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        noise.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 1000;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(t);
        noise.stop(t + 0.1);
      };
      const playHat = (t: number) => {
        const noise = ctx.createBufferSource();
        const buf = ctx.createBuffer(1, 2205, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        noise.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 7000;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(t);
        noise.stop(t + 0.05);
      };

      for (let i = 0; i < totalSteps; i++) {
        const t = ctx.currentTime + i * (beatDur / 4);
        if (i % 4 === 0) playKick(t);
        if (i % 8 === 4) playSnare(t);
        if (i % 2 === 0) playHat(t);
      }
      return { ok: true, output: `Playing ${bars}-bar drum pattern at ${tempo} BPM.` };
    },
  },
  {
    id: "generate-song",
    name: "Generate Song",
    category: "Music Production" as SkillCategory,
    description:
      "Generate a complete song with melody, chords, and drums at a specified tempo and key.",
    trigger: "keyword",
    keywords: ["song", "make a song", "create a song", "full song", "compose"],
    exec: async ({ args }) => {
      const tempo = Number(args?.tempo || 120);
      const key = Number(args?.key || 60);
      const bars = Number(args?.bars || 4);
      const ctx = await ensureCtx();
      const beatDur = 60 / tempo;
      const progressions = [
        [0, 7, 9, 5],
        [0, 5, 9, 7],
        [0, 4, 7, 2],
      ];
      const prog = progressions[Math.floor(Math.random() * progressions.length)];
      const chordIntervals = [0, 4, 7];

      for (let bar = 0; bar < bars; bar++) {
        const chordRoot = key + prog[bar % prog.length];
        const barStart = ctx.currentTime + bar * beatDur * 4;
        chordIntervals.forEach((iv) => {
          const freq = 440 * Math.pow(2, (chordRoot + iv - 69) / 12);
          const osc = ctx.createOscillator();
          osc.type = "triangle";
          osc.frequency.value = freq;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0, barStart);
          gain.gain.linearRampToValueAtTime(0.15, barStart + 0.1);
          gain.gain.linearRampToValueAtTime(0, barStart + beatDur * 4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(barStart);
          osc.stop(barStart + beatDur * 4);
        });
        for (let beat = 0; beat < 4; beat++) {
          if (Math.random() > 0.3) {
            const scaleNote = chordRoot + [0, 2, 4, 7, 9, 12][Math.floor(Math.random() * 6)];
            const freq = 440 * Math.pow(2, (scaleNote - 69) / 12);
            const osc = ctx.createOscillator();
            osc.type = "sine";
            osc.frequency.value = freq;
            const gain = ctx.createGain();
            const t = barStart + beat * beatDur;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
            gain.gain.linearRampToValueAtTime(0, t + beatDur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + beatDur);
          }
        }
      }
      return { ok: true, output: `Generated ${bars}-bar song at ${tempo} BPM in key ${key}.` };
    },
  },
  {
    id: "analyze-frequency",
    name: "Analyze Frequency",
    category: "Audio Analysis" as SkillCategory,
    description: "Analyze the frequency spectrum of an audio buffer and return peak frequencies.",
    trigger: "keyword",
    keywords: ["analyze frequency", "spectrum", "fft", "frequency analysis"],
    exec: async () => ({
      ok: true,
      output:
        "Frequency analysis requires an audio buffer. Load a file in the Sampler or Stem Splitter to analyze.",
    }),
  },
  {
    id: "split-stems",
    name: "Split Stems",
    category: "Audio Analysis" as SkillCategory,
    description: "Split an audio file into vocals, drums, bass, other, and instrumental stems.",
    trigger: "keyword",
    keywords: ["split stems", "stem separation", "separate vocals", "isolate drums"],
    exec: async () => ({
      ok: true,
      output:
        "Open /stem-splitter to upload an audio file and split it into stems. The chat agent can describe the process but cannot access local files directly.",
    }),
  },
  {
    id: "export-audio",
    name: "Export Audio",
    category: "Audio Export" as SkillCategory,
    description: "Export audio to WAV, MP3, FLAC, OGG, AIFF, or raw PCM at any sample rate.",
    trigger: "keyword",
    keywords: ["export", "render", "bounce", "convert audio"],
    exec: async ({ args }) => {
      const format = (args?.format as ExportFormat) || "wav-16";
      return {
        ok: true,
        output: `To export audio as ${format}, open /export-studio and load your audio file. Choose format, sample rate, and processing options.`,
      };
    },
  },
  {
    id: "midi-import",
    name: "MIDI Import",
    category: "Audio Export" as SkillCategory,
    description: "Import a MIDI file and parse its tracks, notes, and tempo.",
    trigger: "keyword",
    keywords: ["import midi", "load midi", "parse midi"],
    exec: async () => ({
      ok: true,
      output:
        "MIDI import is available in the Piano Roll and Playlist. Use the import button to load a .mid file.",
    }),
  },
  {
    id: "midi-export",
    name: "MIDI Export",
    category: "Audio Export" as SkillCategory,
    description: "Export piano roll notes to a MIDI file.",
    trigger: "keyword",
    keywords: ["export midi", "save midi", "midi export"],
    exec: async () => ({
      ok: true,
      output:
        "MIDI export is available in the Piano Roll. Use the export button to save notes as a .mid file.",
    }),
  },
  {
    id: "synthesize-voice",
    name: "Synthesize Voice",
    category: "Voice & Vocals" as SkillCategory,
    description: "Synthesize a singing voice from recorded audio and typed lyrics with variations.",
    trigger: "keyword",
    keywords: ["sing", "voice", "vocal", "lyrics", "synthesize voice"],
    exec: async ({ args }) => {
      const lyrics = (args?.lyrics as string) || "Hello world";
      return {
        ok: true,
        output: `To synthesize singing voice with lyrics "${lyrics}", open /voice-studio. Record or load a voice sample, type your lyrics, and generate variations.`,
      };
    },
  },
  {
    id: "generate-vocal-variations",
    name: "Generate Vocal Variations",
    category: "Voice & Vocals" as SkillCategory,
    description:
      "Generate multiple variations of a vocal performance with different rhythm, flow, and pitch.",
    trigger: "keyword",
    keywords: ["vocal variations", "voice variations", "different flow", "regenerate vocal"],
    exec: async () => ({
      ok: true,
      output:
        "Open /voice-studio and click 'Generate 4 Variations' after recording your voice and typing lyrics. Each variation has different rhythm, flow, and pitch.",
    }),
  },
  {
    id: "play-sample",
    name: "Play Sample",
    category: "Samples & Packs" as SkillCategory,
    description: "Trigger a one-shot sample from the sample pack library.",
    trigger: "keyword",
    keywords: ["play sample", "trigger sample", "one shot", "oneshot"],
    exec: async ({ args }) => {
      const name = (args?.name as string) || "kick";
      const ctx = await ensureCtx();
      const pack = createBuiltinPack(ctx);
      const sample =
        pack.samples.find((s) => s.name.toLowerCase().includes(name.toLowerCase())) ||
        pack.samples[0];
      if (sample) {
        playOneShot(ctx, sample);
        return { ok: true, output: `Playing sample: ${sample.name}` };
      }
      return { ok: false, error: `No sample matching "${name}" found.` };
    },
  },
  {
    id: "list-sample-packs",
    name: "List Sample Packs",
    category: "Samples & Packs" as SkillCategory,
    description: "List all available sample packs and their contents.",
    trigger: "on-demand",
    exec: async () => {
      const ctx = await ensureCtx();
      const pack = createBuiltinPack(ctx);
      return {
        ok: true,
        output: `Builtin pack: ${pack.name} with ${pack.samples.length} samples:\n${pack.samples.map((s) => `  - ${s.name} (${s.category}, ${s.durationSec.toFixed(1)}s)`).join("\n")}`,
      };
    },
  },
  {
    id: "create-piano-roll",
    name: "Create Piano Roll",
    category: "Music Production" as SkillCategory,
    description: "Create a new piano roll pattern with specified notes and tempo.",
    trigger: "keyword",
    keywords: ["piano roll", "create pattern", "midi pattern"],
    exec: async ({ args }) => {
      const notes = (args?.notes as number[]) || [60, 64, 67, 72];
      const state = createDefaultPianoRoll();
      notes.forEach((midi, i) => {
        const note = createNote(midi, i * 480, 240, 100);
        addNote(state, note);
      });
      return {
        ok: true,
        output: `Created piano roll pattern with ${notes.length} notes. Open /piano-roll to view and edit.`,
      };
    },
  },
  {
    id: "create-channel-rack",
    name: "Create Channel Rack",
    category: "Music Production" as SkillCategory,
    description: "Create a channel rack step sequencer pattern.",
    trigger: "keyword",
    keywords: ["channel rack", "step sequencer", "drum machine"],
    exec: async () => {
      const rack = createRack();
      return {
        ok: true,
        output: `Created channel rack with ${rack.channels.length} channels and ${rack.steps} steps. Open /channel-rack to view and edit.`,
      };
    },
  },
  {
    id: "create-playlist",
    name: "Create Playlist",
    category: "Music Production" as SkillCategory,
    description: "Create a playlist arrangement with tracks and clips.",
    trigger: "keyword",
    keywords: ["playlist", "arrangement", "song arrangement"],
    exec: async () => {
      const playlist = createDefaultPlaylist();
      return {
        ok: true,
        output: `Created playlist with ${playlist.tracks.length} tracks. Open /playlist to view and edit.`,
      };
    },
  },
  {
    id: "auto-master",
    name: "Auto Master",
    category: "Music Production" as SkillCategory,
    description:
      "Apply automatic mastering with a chosen preset (transparent, streaming, club, vinyl, podcast, lofi).",
    trigger: "keyword",
    keywords: ["master", "mastering", "auto master", "loudness"],
    exec: async ({ args }) => {
      const presetId = (args?.preset as string) || "streaming";
      const preset = MASTER_PRESETS.find((p) => p.id === presetId) || MASTER_PRESETS[1];
      return {
        ok: true,
        output: `Auto mastering with "${preset.name}" preset: target ${preset.targetLufs} LUFS, true peak ${preset.truePeak}dB. Open /auto-master to process an audio file.`,
      };
    },
  },
];
