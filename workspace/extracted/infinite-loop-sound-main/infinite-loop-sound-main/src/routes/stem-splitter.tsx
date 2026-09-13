import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useRef } from "react";
import { ProCard, SectionHeader, StatTile, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scissors, Upload, Download, Play, Activity, Layers, Sliders } from "lucide-react";
import {
  splitStems,
  stemToWav,
  DEFAULT_SPLIT_OPTIONS,
  type SplitOptions,
  type StemResult,
  type StemType,
} from "@/lib/audio/stem-splitter";
import { AudioEngine } from "@/lib/audio/engine";
import { downloadBlob } from "@/lib/audio/export-engine";

export const Route = createFileRoute("/stem-splitter")({
  head: () => ({
    meta: [
      { title: "Stem Splitter — DivergenceIQ" },
      {
        name: "description",
        content:
          "AI-powered source separation: split any audio into vocals, drums, bass, other, and instrumental stems.",
      },
    ],
  }),
  component: StemSplitterPage,
});

const STEM_COLORS: Record<StemType, string> = {
  vocals: "#ec4899",
  drums: "#f59e0b",
  bass: "#3b82f6",
  other: "#10b981",
  instrumental: "#8b5cf6",
};

function StemSplitterPage() {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [stems, setStems] = useState<StemResult[]>([]);
  const [opts, setOpts] = useState<SplitOptions>(DEFAULT_SPLIT_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const ctxRef = useRef<BaseAudioContext | null>(null);

  useEffect(() => {
    ctxRef.current = AudioEngine.ctx ?? new AudioContext();
  }, []);

  const handleFile = async (file: File) => {
    if (!ctxRef.current) return;
    const arrayBuf = await file.arrayBuffer();
    const audioBuf = await ctxRef.current.decodeAudioData(arrayBuf);
    setBuffer(audioBuf);
    setStems([]);
  };

  const handleSplit = async () => {
    if (!buffer || !ctxRef.current) return;
    setBusy(true);
    setProgress(0);
    try {
      const result = await splitStems(ctxRef.current, buffer, opts);
      setStems(result);
      setProgress(1);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = (stem: StemResult) => {
    const wav = stemToWav(stem.buffer);
    downloadBlob(new Blob([wav], { type: "audio/wav" }), `${stem.type}.wav`);
  };

  const handlePlayStem = (stem: StemResult) => {
    if (!ctxRef.current) return;
    const ctx = ctxRef.current as AudioContext;
    if (ctx.state === "suspended") ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = stem.buffer;
    src.connect(ctx.destination);
    src.start();
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="Stem Splitter"
          subtitle="Source separation — split audio into vocals, drums, bass, other, and instrumental stems."
          icon={<Scissors className="w-5 h-5" />}
          action={
            buffer && (
              <Badge variant="outline">
                {buffer.duration.toFixed(1)}s · {buffer.sampleRate}Hz
              </Badge>
            )
          }
        />

        <ProCard
          title="Import Audio"
          description="Load an audio file to split into stems."
          icon={<Upload className="w-4 h-4" />}
        >
          <div className="flex gap-2 items-center">
            <Input
              type="file"
              accept="audio/*"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="flex-1"
            />
            {buffer && (
              <Button onClick={handleSplit} disabled={busy}>
                {busy ? `Splitting… ${Math.round(progress * 100)}%` : "Split Stems"}
              </Button>
            )}
          </div>
        </ProCard>

        <ProCard
          title="Split Settings"
          description="Fine-tune the stem separation parameters."
          icon={<Sliders className="w-4 h-4" />}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label>Vocals Low {opts.vocalsCutoff}Hz</Label>
              <input
                type="range"
                min={50}
                max={500}
                value={opts.vocalsCutoff}
                onChange={(e) => setOpts((p) => ({ ...p, vocalsCutoff: Number(e.target.value) }))}
                className="w-full"
              />
            </div>
            <div>
              <Label>Vocals High {opts.vocalsHi}Hz</Label>
              <input
                type="range"
                min={2000}
                max={8000}
                value={opts.vocalsHi}
                onChange={(e) => setOpts((p) => ({ ...p, vocalsHi: Number(e.target.value) }))}
                className="w-full"
              />
            </div>
            <div>
              <Label>Bass Cutoff {opts.bassCutoff}Hz</Label>
              <input
                type="range"
                min={100}
                max={500}
                value={opts.bassCutoff}
                onChange={(e) => setOpts((p) => ({ ...p, bassCutoff: Number(e.target.value) }))}
                className="w-full"
              />
            </div>
            <div>
              <Label>Drums Harmonic {Math.round(opts.drumsHarmonic * 100)}%</Label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={opts.drumsHarmonic}
                onChange={(e) => setOpts((p) => ({ ...p, drumsHarmonic: Number(e.target.value) }))}
                className="w-full"
              />
            </div>
          </div>
        </ProCard>

        {stems.length > 0 && (
          <ProCard
            title="Stems"
            description={`${stems.length} separated stems ready for playback and export.`}
            icon={<Layers className="w-4 h-4" />}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {stems.map((stem) => (
                <div key={stem.type} className="p-3 rounded border border-border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: STEM_COLORS[stem.type] }}
                      />
                      <span className="text-sm font-semibold capitalize">{stem.type}</span>
                    </div>
                    <Badge variant="outline">{stem.energy.toFixed(3)} RMS</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handlePlayStem(stem)}>
                      <Play className="w-3 h-3" /> Play
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDownload(stem)}>
                      <Download className="w-3 h-3" /> WAV
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
