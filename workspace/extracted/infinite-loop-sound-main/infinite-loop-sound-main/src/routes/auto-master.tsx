import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useRef } from "react";
import { ProCard, SectionHeader, StatTile, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gauge, Upload, Download, Play, Sliders, Activity, Zap, Music } from "lucide-react";
import {
  autoMaster,
  autoMix,
  MASTER_PRESETS,
  type MasterPreset,
  type MasterResult,
} from "@/lib/audio/auto-master";
import { AudioEngine } from "@/lib/audio/engine";
import { downloadBlob } from "@/lib/audio/export-engine";
import { stemToWav } from "@/lib/audio/stem-splitter";
import type { StemResult } from "@/lib/audio/stem-splitter";

export const Route = createFileRoute("/auto-master")({
  head: () => ({
    meta: [
      { title: "Auto Master — DivergenceIQ" },
      {
        name: "description",
        content:
          "Automatic mixing and mastering with 6 presets, loudness normalization, EQ balancing, and stereo imaging.",
      },
    ],
  }),
  component: AutoMasterPage,
});

function AutoMasterPage() {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [stems, setStems] = useState<StemResult[]>([]);
  const [preset, setPreset] = useState<MasterPreset>(MASTER_PRESETS[1]);
  const [result, setResult] = useState<MasterResult | null>(null);
  const [busy, setBusy] = useState(false);
  const ctxRef = useRef<BaseAudioContext | null>(null);

  useEffect(() => {
    ctxRef.current = AudioEngine.ctx ?? new AudioContext();
  }, []);

  const handleFile = async (file: File) => {
    if (!ctxRef.current) return;
    const arrayBuf = await file.arrayBuffer();
    const audioBuf = await ctxRef.current.decodeAudioData(arrayBuf);
    setBuffer(audioBuf);
    setResult(null);
  };

  const handleMaster = async () => {
    if (!buffer || !ctxRef.current) return;
    setBusy(true);
    try {
      setResult(await autoMaster(ctxRef.current, buffer, preset));
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handleMixMaster = async () => {
    if (stems.length === 0 || !ctxRef.current) return;
    setBusy(true);
    try {
      setResult(await autoMix(ctxRef.current, stems, preset));
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const wav = stemToWav(result.buffer);
    downloadBlob(new Blob([wav], { type: "audio/wav" }), `mastered-${preset.id}.wav`);
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

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="Auto Mixing & Mastering"
          subtitle="Intelligent gain staging, EQ balancing, compression, stereo imaging, and loudness normalization."
          icon={<Gauge className="w-5 h-5" />}
          action={buffer && <Badge variant="outline">{buffer.duration.toFixed(1)}s</Badge>}
        />

        <ProCard
          title="Import Audio"
          description="Load a stereo mix or stems for mastering."
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
              <Button onClick={handleMaster} disabled={busy}>
                {busy ? "Processing…" : "Master"}
              </Button>
            )}
            {stems.length > 0 && (
              <Button variant="outline" onClick={handleMixMaster} disabled={busy}>
                Mix & Master Stems
              </Button>
            )}
          </div>
        </ProCard>

        <ProCard
          title="Mastering Presets"
          description="Choose a target sound profile."
          icon={<Sliders className="w-4 h-4" />}
        >
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {MASTER_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p)}
                className={`text-left rounded-lg border p-4 transition-all ${
                  preset.id === p.id
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-card/80"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{p.name}</span>
                  {preset.id === p.id && <Badge variant="outline">ACTIVE</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                <div className="text-[10px] text-muted-foreground mt-2">
                  Target {p.targetLufs} LUFS · Peak {p.truePeak}dB
                </div>
              </button>
            ))}
          </div>
        </ProCard>

        {result && (
          <ProCard
            title="Mastering Result"
            description="Loudness analysis and export."
            icon={<Activity className="w-4 h-4" />}
          >
            <KpiGrid
              tiles={[
                { label: "Measured LUFS", value: result.measuredLufs.toFixed(1) },
                { label: "True Peak", value: `${result.measuredPeak.toFixed(1)} dB` },
                { label: "Gain Reduction", value: `${result.gainReduction.toFixed(1)} dB` },
                { label: "Processing", value: `${result.durationMs} ms` },
              ]}
            />
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={() => handlePlay(result.buffer)}>
                <Play className="w-4 h-4" /> Play Mastered
              </Button>
              <Button onClick={handleDownload}>
                <Download className="w-4 h-4" /> Download WAV
              </Button>
            </div>
          </ProCard>
        )}
      </div>
    </AppShell>
  );
}
