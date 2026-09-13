import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useRef } from "react";
import { ProCard, SectionHeader, StatTile, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Mic,
  Play,
  Square,
  Upload,
  Download,
  Music,
  Sliders,
  RefreshCw,
  Activity,
} from "lucide-react";
import {
  recordVoice,
  synthesizeVoice,
  generateVariations,
  parseLyrics,
  applyVariation,
  type VoiceSample,
  type VoiceSynthOptions,
  type LyricSyllable,
} from "@/lib/audio/voice-synth";
import { AudioEngine } from "@/lib/audio/engine";
import { downloadBlob } from "@/lib/audio/export-engine";
import { stemToWav } from "@/lib/audio/stem-splitter";

export const Route = createFileRoute("/voice-studio")({
  head: () => ({
    meta: [
      { title: "Voice Studio — DivergenceIQ" },
      {
        name: "description",
        content:
          "Singing voice synthesis: record your voice, type lyrics, and generate vocal performances with variations.",
      },
    ],
  }),
  component: VoiceStudioPage,
});

function VoiceStudioPage() {
  const [voice, setVoice] = useState<VoiceSample | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [lyrics, setLyrics] = useState("Hel lo world this is a test");
  const [melody, setMelody] = useState<LyricSyllable[]>([]);
  const [result, setResult] = useState<AudioBuffer | null>(null);
  const [variations, setVariations] = useState<AudioBuffer[]>([]);
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState<VoiceSynthOptions>({
    voiceId: "",
    lyrics: "",
    melody: [],
    tempo: 120,
    variation: "all",
    randomness: 0.5,
    formantShift: 0,
    breathiness: 0.1,
  });
  const ctxRef = useRef<BaseAudioContext | null>(null);

  useEffect(() => {
    ctxRef.current = AudioEngine.ctx ?? new AudioContext();
  }, []);

  useEffect(() => {
    if (lyrics) {
      const parsed = parseLyrics(lyrics, opts.tempo);
      setMelody(parsed);
      setOpts((p) => ({ ...p, lyrics, melody: parsed }));
    }
  }, [lyrics, opts.tempo]);

  const handleRecord = async () => {
    if (!ctxRef.current) return;
    setRecording(true);
    setRecordProgress(0);
    try {
      const v = await recordVoice(ctxRef.current as AudioContext, 5, setRecordProgress);
      setVoice(v);
      setOpts((p) => ({ ...p, voiceId: v.id }));
    } catch (e) {
      console.error(e);
    } finally {
      setRecording(false);
    }
  };

  const handleLoadVoice = async (file: File) => {
    if (!ctxRef.current) return;
    const arrayBuf = await file.arrayBuffer();
    const audioBuf = await ctxRef.current.decodeAudioData(arrayBuf);
    const phonemes = ["ah", "eh", "ee", "oh", "oo"].map((phoneme, i) => ({
      phoneme,
      startSec: (i * audioBuf.length) / 5 / audioBuf.sampleRate,
      endSec: ((i + 1) * audioBuf.length) / 5 / audioBuf.sampleRate,
      bufferOffset: Math.floor((i * audioBuf.length) / 5),
      length: Math.floor(audioBuf.length / 5),
    }));
    setVoice({
      id: crypto.randomUUID(),
      name: file.name,
      buffer: audioBuf,
      phonemes,
      pitchRange: { min: 48, max: 72 },
      formants: { f1: 700, f2: 1220, f3: 2600, pitch: 150 },
    });
  };

  const handleSynthesize = async () => {
    if (!voice || !ctxRef.current) return;
    setBusy(true);
    try {
      setResult(await synthesizeVoice(ctxRef.current, voice, opts));
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handleVariations = async () => {
    if (!voice || !ctxRef.current) return;
    setBusy(true);
    try {
      setVariations(await generateVariations(ctxRef.current, voice, opts, 4));
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handlePlay = (buf: AudioBuffer) => {
    if (!ctxRef.current) return;
    const ctx = ctxRef.current as AudioContext;
    if (ctx.state === "suspended") ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  };

  const handleDownload = (buf: AudioBuffer, name: string) => {
    const wav = stemToWav(buf);
    downloadBlob(new Blob([wav], { type: "audio/wav" }), name);
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="Voice Studio"
          subtitle="Record your voice, type lyrics, and synthesize singing with variations in rhythm, flow, and pitch."
          icon={<Mic className="w-5 h-5" />}
          action={voice && <Badge variant="outline">{voice.name}</Badge>}
        />

        <ProCard
          title="Voice Sample"
          description="Record from microphone or load an existing voice sample."
          icon={<Mic className="w-4 h-4" />}
        >
          <div className="flex gap-2 items-center flex-wrap">
            <Button onClick={handleRecord} disabled={recording}>
              {recording ? `Recording… ${Math.round(recordProgress * 100)}%` : "Record Voice (5s)"}
            </Button>
            <Input
              type="file"
              accept="audio/*"
              onChange={(e) => e.target.files?.[0] && handleLoadVoice(e.target.files[0])}
              className="flex-1"
            />
          </div>
        </ProCard>

        <ProCard
          title="Lyrics & Melody"
          description="Type lyrics and set the melody. Syllables are auto-parsed."
          icon={<Music className="w-4 h-4" />}
        >
          <div className="space-y-3">
            <div>
              <Label>Lyrics</Label>
              <textarea
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm min-h-[80px]"
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Type your lyrics here…"
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label>Tempo {opts.tempo} BPM</Label>
                <input
                  type="range"
                  min={60}
                  max={200}
                  value={opts.tempo}
                  onChange={(e) => setOpts((p) => ({ ...p, tempo: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>
              <div>
                <Label>Variation</Label>
                <select
                  className="w-full bg-background border border-border rounded px-2 py-2 text-sm"
                  value={opts.variation}
                  onChange={(e) =>
                    setOpts((p) => ({
                      ...p,
                      variation: e.target.value as VoiceSynthOptions["variation"],
                    }))
                  }
                >
                  <option value="none">None</option>
                  <option value="rhythm">Rhythm</option>
                  <option value="flow">Flow</option>
                  <option value="pitch">Pitch</option>
                  <option value="all">All</option>
                </select>
              </div>
              <div>
                <Label>Randomness {Math.round(opts.randomness * 100)}%</Label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={opts.randomness}
                  onChange={(e) => setOpts((p) => ({ ...p, randomness: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>
              <div>
                <Label>Formant Shift {opts.formantShift}</Label>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  value={opts.formantShift}
                  onChange={(e) => setOpts((p) => ({ ...p, formantShift: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>
              <div>
                <Label>Breathiness {Math.round(opts.breathiness * 100)}%</Label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={opts.breathiness}
                  onChange={(e) => setOpts((p) => ({ ...p, breathiness: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSynthesize} disabled={!voice || busy}>
                {busy ? "Synthesizing…" : "Synthesize Voice"}
              </Button>
              <Button variant="outline" onClick={handleVariations} disabled={!voice || busy}>
                <RefreshCw className="w-4 h-4" /> Generate 4 Variations
              </Button>
            </div>
          </div>
        </ProCard>

        {melody.length > 0 && (
          <ProCard
            title="Parsed Syllables"
            description={`${melody.length} syllables detected from lyrics.`}
            icon={<Activity className="w-4 h-4" />}
          >
            <div className="flex flex-wrap gap-1">
              {melody.map((s, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {s.text} ({s.phoneme})
                </Badge>
              ))}
            </div>
          </ProCard>
        )}

        {result && (
          <ProCard
            title="Result"
            description="Synthesized vocal performance."
            icon={<Play className="w-4 h-4" />}
          >
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handlePlay(result)}>
                <Play className="w-4 h-4" /> Play
              </Button>
              <Button onClick={() => handleDownload(result, "voice.wav")}>
                <Download className="w-4 h-4" /> Download WAV
              </Button>
            </div>
          </ProCard>
        )}

        {variations.length > 0 && (
          <ProCard
            title="Variations"
            description={`${variations.length} generated variations.`}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {variations.map((v, i) => (
                <div key={i} className="p-2 rounded border border-border bg-card">
                  <div className="text-xs font-semibold mb-1">Variation {i + 1}</div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => handlePlay(v)}>
                      <Play className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(v, `variation-${i + 1}.wav`)}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ProCard>
        )}
      </div>
    </AppShell>
  );
}
