import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useRef } from "react";
import { ProCard, SectionHeader, StatTile, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Upload, Play, Sliders, Activity, FileAudio, Music } from "lucide-react";
import {
  exportAudio,
  downloadBlob,
  FORMAT_LABELS,
  SAMPLE_RATES,
  DEFAULT_EXPORT,
  type ExportFormat,
  type ExportOptions,
  type ExportResult,
} from "@/lib/audio/export-engine";
import { AudioEngine } from "@/lib/audio/engine";
import { LoopEditor } from "@/components/audio/LoopEditor";
import { writeWavWithLoop, downloadWav } from "@/lib/audio/wav-loop";

export const Route = createFileRoute("/export-studio")({
  head: () => ({
    meta: [
      { title: "Export Studio — DivergenceIQ" },
      {
        name: "description",
        content:
          "Multi-format audio export: WAV (16/24/32-bit), MP3, FLAC, OGG, AIFF, raw PCM, M4A at all sample rates.",
      },
    ],
  }),
  component: ExportStudioPage,
});

function ExportStudioPage() {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [opts, setOpts] = useState<ExportOptions>(DEFAULT_EXPORT);
  const [result, setResult] = useState<ExportResult | null>(null);
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

  const handleExport = async () => {
    if (!buffer || !ctxRef.current) return;
    setBusy(true);
    try {
      setResult(await exportAudio(ctxRef.current, buffer, opts));
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    downloadBlob(result.blob, `export-${Date.now()}.${result.extension}`);
  };

  const formats: ExportFormat[] = [
    "wav-16",
    "wav-24",
    "wav-32",
    "mp3-128",
    "mp3-192",
    "mp3-256",
    "mp3-320",
    "flac",
    "ogg",
    "aiff",
    "pcm-raw",
    "m4a",
  ];

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="Export Studio"
          subtitle="Multi-format audio export — WAV (16/24/32-bit), MP3, FLAC, OGG, AIFF, raw PCM, M4A at all sample rates."
          icon={<Download className="w-5 h-5" />}
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
          description="Load an audio file to export."
          icon={<Upload className="w-4 h-4" />}
        >
          <Input
            type="file"
            accept="audio/*"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </ProCard>

        {buffer && (
          <ProCard
            title="Loop Point Editor"
            description="Drag the start and end handles on the waveform to set loop points. Snap to zero-crossings for click-free loops, preview all three loop modes, then export as WAV with embedded smpl loop chunk that any DAW will recognize."
            icon={<Activity className="w-4 h-4" />}
          >
            <LoopEditor
              buffer={buffer}
              onExport={({ start, end, mode }) => {
                const loopType = mode === "ping-pong" ? 1 : 0;
                const ab = writeWavWithLoop(buffer, start, end, loopType);
                downloadWav(ab, `loop-${mode}-${Date.now()}.wav`);
              }}
            />
          </ProCard>
        )}

        <ProCard
          title="Export Settings"
          description="Choose format, sample rate, and processing options."
          icon={<Sliders className="w-4 h-4" />}
        >
          <div className="space-y-4">
            <div>
              <Label>Format</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                {formats.map((f) => (
                  <button
                    key={f}
                    onClick={() => setOpts((p) => ({ ...p, format: f }))}
                    className={`text-left rounded border p-2 text-xs transition-all ${
                      opts.format === f
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:bg-card/80"
                    }`}
                  >
                    {FORMAT_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label>Sample Rate</Label>
                <select
                  className="w-full bg-background border border-border rounded px-2 py-2 text-sm"
                  value={opts.sampleRate}
                  onChange={(e) => setOpts((p) => ({ ...p, sampleRate: Number(e.target.value) }))}
                >
                  {SAMPLE_RATES.map((sr) => (
                    <option key={sr} value={sr}>
                      {sr} Hz
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Channels</Label>
                <select
                  className="w-full bg-background border border-border rounded px-2 py-2 text-sm"
                  value={opts.channels}
                  onChange={(e) =>
                    setOpts((p) => ({ ...p, channels: Number(e.target.value) as 1 | 2 }))
                  }
                >
                  <option value={1}>Mono</option>
                  <option value={2}>Stereo</option>
                </select>
              </div>
              <div>
                <Label>Bit Depth</Label>
                <select
                  className="w-full bg-background border border-border rounded px-2 py-2 text-sm"
                  value={opts.bitDepth}
                  onChange={(e) =>
                    setOpts((p) => ({ ...p, bitDepth: Number(e.target.value) as 16 | 24 | 32 }))
                  }
                >
                  <option value={16}>16-bit</option>
                  <option value={24}>24-bit</option>
                  <option value={32}>32-bit float</option>
                </select>
              </div>
              <div>
                <Label>Normalize Target {opts.normalizeTarget}dB</Label>
                <input
                  type="range"
                  min={-6}
                  max={0}
                  step={0.1}
                  value={opts.normalizeTarget}
                  onChange={(e) =>
                    setOpts((p) => ({ ...p, normalizeTarget: Number(e.target.value) }))
                  }
                  className="w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label>Fade In {opts.fadeIn}s</Label>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={0.1}
                  value={opts.fadeIn}
                  onChange={(e) => setOpts((p) => ({ ...p, fadeIn: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>
              <div>
                <Label>Fade Out {opts.fadeOut}s</Label>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={0.1}
                  value={opts.fadeOut}
                  onChange={(e) => setOpts((p) => ({ ...p, fadeOut: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>
              <div className="flex items-end">
                <Button
                  size="sm"
                  variant={opts.normalize ? "default" : "outline"}
                  onClick={() => setOpts((p) => ({ ...p, normalize: !p.normalize }))}
                >
                  {opts.normalize ? "Normalize ON" : "Normalize OFF"}
                </Button>
              </div>
              <div className="flex items-end">
                <Button
                  size="sm"
                  variant={opts.dither ? "default" : "outline"}
                  onClick={() => setOpts((p) => ({ ...p, dither: !p.dither }))}
                >
                  {opts.dither ? "Dither ON" : "Dither OFF"}
                </Button>
              </div>
            </div>

            <Button onClick={handleExport} disabled={!buffer || busy}>
              {busy ? "Exporting…" : "Export Audio"}
            </Button>
          </div>
        </ProCard>

        {result && (
          <ProCard
            title="Export Result"
            description="Ready to download."
            icon={<FileAudio className="w-4 h-4" />}
          >
            <KpiGrid
              tiles={[
                { label: "Format", value: FORMAT_LABELS[result.format] },
                { label: "Size", value: `${(result.size / 1024 / 1024).toFixed(2)} MB` },
                { label: "Duration", value: `${result.duration.toFixed(1)}s` },
                { label: "Sample Rate", value: `${result.sampleRate} Hz` },
              ]}
            />
            <div className="flex gap-2 mt-4">
              <Button onClick={handleDownload}>
                <Download className="w-4 h-4" /> Download {result.extension.toUpperCase()}
              </Button>
            </div>
          </ProCard>
        )}
      </div>
    </AppShell>
  );
}
