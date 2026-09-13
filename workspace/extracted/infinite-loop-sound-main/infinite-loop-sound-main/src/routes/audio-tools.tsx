import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useCallback, useRef } from "react";
import { ProCard, SectionHeader, MeterBar, StatTile, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Music,
  Mic,
  Activity,
  Gauge,
  Scissors,
  Waves,
  Hash,
  Radio,
  Volume,
  AudioWaveform,
  Play,
  Upload,
  Zap,
} from "lucide-react";
import { AudioEngine } from "@/lib/audio/engine";
import {
  AudioTools,
  type BPMResult,
  type KeyResult,
  type LUFSResult,
  type SpectrumResult,
} from "@/lib/audio/audio-tools";

export const Route = createFileRoute("/audio-tools")({
  head: () => ({
    meta: [
      { title: "Audio Tools — DivergenceIQ" },
      {
        name: "description",
        content:
          "Professional audio analysis: BPM detection, key detection, LUFS metering, spectrum analysis, stem splitting, and more.",
      },
    ],
  }),
  component: AudioToolsPage,
});

function AudioToolsPage() {
  const engineRef = useRef<AudioEngine | null>(null);
  const toolsRef = useRef<AudioTools | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [bpm, setBpm] = useState<BPMResult | null>(null);
  const [key, setKey] = useState<KeyResult | null>(null);
  const [lufs, setLufs] = useState<LUFSResult | null>(null);
  const [spectrum, setSpectrum] = useState<SpectrumResult | null>(null);
  const [pitch, setPitch] = useState<{ freq: number; confidence: number; note: string } | null>(
    null,
  );
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const engine = AudioEngine;
      engineRef.current = engine;
      toolsRef.current = new AudioTools(engine);
    } catch (e: any) {
      setError("Audio engine initialization failed: " + e?.message);
    }
    return () => {
      try {
        engineRef.current?.ctx?.close?.();
      } catch {}
    };
  }, []);

  const loadFile = useCallback(async (file: File) => {
    if (!engineRef.current) return;
    setLoading("loading");
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      if (!engineRef.current.ctx) throw new Error("Audio context is not initialized");
      const buffer = await engineRef.current.ctx.decodeAudioData(arrayBuffer);
      setAudioBuffer(buffer);
      setBpm(null);
      setKey(null);
      setLufs(null);
      setSpectrum(null);
      setPitch(null);
      setFingerprint(null);
    } catch (e: any) {
      setError("Failed to decode audio: " + e?.message);
    } finally {
      setLoading(null);
    }
  }, []);

  const runAnalysis = useCallback(
    async (type: string) => {
      if (!toolsRef.current || !audioBuffer) return;
      setLoading(type);
      setError(null);
      try {
        switch (type) {
          case "bpm": {
            const result = await toolsRef.current.detectBPM(audioBuffer);
            setBpm(result);
            break;
          }
          case "key": {
            const result = await toolsRef.current.detectKey(audioBuffer);
            setKey(result);
            break;
          }
          case "lufs": {
            const result = await toolsRef.current.measureLUFS(audioBuffer);
            setLufs(result);
            break;
          }
          case "spectrum": {
            const result = await toolsRef.current.analyzeSpectrum(audioBuffer);
            setSpectrum(result);
            break;
          }
          case "pitch": {
            const result = await toolsRef.current.detectPitch(audioBuffer);
            setPitch(result);
            break;
          }
          case "fingerprint": {
            const result = await toolsRef.current.fingerprint(audioBuffer);
            setFingerprint(result);
            break;
          }
        }
      } catch (e: any) {
        setError(`${type} analysis failed: ` + e?.message);
      } finally {
        setLoading(null);
      }
    },
    [audioBuffer],
  );

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <SectionHeader
          title="Audio Analysis Tools"
          subtitle="Professional-grade audio analysis: BPM, key, loudness, spectrum, pitch, and fingerprinting."
          icon={<AudioWaveform className="w-5 h-5" />}
        />

        {error && (
          <div className="rounded-lg border border-bear/30 bg-bear/10 p-3 text-sm text-bear">
            {error}
          </div>
        )}

        <ProCard
          title="Load Audio"
          description="Upload an audio file (WAV, MP3, OGG, FLAC) for analysis."
          icon={<Upload className="w-4 h-4" />}
        >
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadFile(f);
              }}
              className="text-sm"
            />
            {audioBuffer && (
              <Badge variant="outline" className="text-xs">
                {audioBuffer.duration.toFixed(1)}s · {audioBuffer.sampleRate}Hz ·{" "}
                {audioBuffer.numberOfChannels}ch
              </Badge>
            )}
          </div>
        </ProCard>

        {audioBuffer && (
          <>
            <KpiGrid
              tiles={[
                {
                  label: "Duration",
                  value: `${audioBuffer.duration.toFixed(1)}s`,
                  icon: <Play className="w-4 h-4" />,
                  accent: "primary",
                },
                {
                  label: "Sample Rate",
                  value: `${(audioBuffer.sampleRate / 1000).toFixed(1)}kHz`,
                  icon: <Gauge className="w-4 h-4" />,
                  accent: "neutral",
                },
                {
                  label: "Channels",
                  value: audioBuffer.numberOfChannels,
                  icon: <Radio className="w-4 h-4" />,
                  accent: "neutral",
                },
                {
                  label: "Samples",
                  value: audioBuffer.length.toLocaleString(),
                  icon: <Waves className="w-4 h-4" />,
                  accent: "neutral",
                },
              ]}
            />

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { id: "bpm", label: "BPM", icon: <Gauge className="w-4 h-4" /> },
                { id: "key", label: "Key", icon: <Music className="w-4 h-4" /> },
                { id: "lufs", label: "LUFS", icon: <Volume className="w-4 h-4" /> },
                { id: "spectrum", label: "Spectrum", icon: <Activity className="w-4 h-4" /> },
                { id: "pitch", label: "Pitch", icon: <Mic className="w-4 h-4" /> },
                { id: "fingerprint", label: "Fingerprint", icon: <Hash className="w-4 h-4" /> },
              ].map((tool) => (
                <Button
                  key={tool.id}
                  variant="outline"
                  onClick={() => runAnalysis(tool.id)}
                  disabled={loading !== null}
                  className="flex-col h-20 gap-1"
                >
                  {tool.icon}
                  <span className="text-xs">{tool.label}</span>
                </Button>
              ))}
            </div>

            {bpm && (
              <ProCard title="BPM Detection" icon={<Gauge className="w-4 h-4" />}>
                <div className="flex items-center gap-4">
                  <span className="text-4xl font-bold tabular-nums text-primary">{bpm.bpm}</span>
                  <div className="space-y-1">
                    <Badge variant="outline">
                      Confidence: {(bpm.confidence * 100).toFixed(0)}%
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {bpm.beats.length} beats detected
                    </p>
                  </div>
                </div>
                <MeterBar
                  value={bpm.confidence * 100}
                  label="Confidence"
                  color="bull"
                  showValue
                  className="mt-3"
                />
              </ProCard>
            )}

            {key && (
              <ProCard title="Key Detection" icon={<Music className="w-4 h-4" />}>
                <div className="flex items-center gap-4">
                  <span className="text-4xl font-bold text-primary">
                    {key.key} {key.scaleType}
                  </span>
                  <Badge variant="outline">Confidence: {(key.confidence * 100).toFixed(0)}%</Badge>
                </div>
                {key.alternatives.length > 0 && (
                  <div className="mt-3 flex gap-2">
                    <span className="text-xs text-muted-foreground">Alternatives:</span>
                    {key.alternatives.map((alt, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {alt.key} {alt.scaleType} ({(alt.confidence * 100).toFixed(0)}%)
                      </Badge>
                    ))}
                  </div>
                )}
              </ProCard>
            )}

            {lufs && (
              <ProCard title="LUFS Meter" icon={<Volume className="w-4 h-4" />}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatTile
                    label="Integrated"
                    value={`${lufs.integrated.toFixed(1)} LUFS`}
                    accent="primary"
                  />
                  <StatTile
                    label="Short-term"
                    value={`${lufs.shortTerm.toFixed(1)} LUFS`}
                    accent="neutral"
                  />
                  <StatTile
                    label="Momentary"
                    value={`${lufs.momentary.toFixed(1)} LUFS`}
                    accent="neutral"
                  />
                  <StatTile
                    label="True Peak"
                    value={`${lufs.truePeak.toFixed(1)} dB`}
                    accent={lufs.truePeak > 0 ? "bear" : "bull"}
                  />
                </div>
                <MeterBar
                  value={Math.max(0, Math.min(100, ((lufs.integrated + 70) / 70) * 100))}
                  label="Loudness Range"
                  color="warning"
                  className="mt-3"
                />
              </ProCard>
            )}

            {spectrum && (
              <ProCard title="Spectrum Analysis" icon={<Activity className="w-4 h-4" />}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatTile
                    label="Centroid"
                    value={`${spectrum.centroid.toFixed(0)} Hz`}
                    accent="primary"
                  />
                  <StatTile
                    label="Spread"
                    value={`${spectrum.spread.toFixed(0)} Hz`}
                    accent="neutral"
                  />
                  <StatTile
                    label="Flatness"
                    value={spectrum.flatness.toFixed(3)}
                    accent="neutral"
                  />
                  <StatTile
                    label="Rolloff"
                    value={`${spectrum.rolloff.toFixed(0)} Hz`}
                    accent="neutral"
                  />
                </div>
              </ProCard>
            )}

            {pitch && (
              <ProCard title="Pitch Detection" icon={<Mic className="w-4 h-4" />}>
                <div className="flex items-center gap-4">
                  <span className="text-4xl font-bold text-primary">{pitch.note}</span>
                  <div>
                    <Badge variant="outline">{pitch.freq.toFixed(1)} Hz</Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      Confidence: {(pitch.confidence * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              </ProCard>
            )}

            {fingerprint && (
              <ProCard title="Audio Fingerprint" icon={<Hash className="w-4 h-4" />}>
                <p className="text-2xl font-mono font-bold text-primary tracking-wider">
                  {fingerprint}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Unique identifier for this audio file. Use for matching and identification.
                </p>
              </ProCard>
            )}
          </>
        )}

        {!audioBuffer && !loading && (
          <div className="text-center py-12 text-muted-foreground">
            <AudioWaveform className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Upload an audio file to start analysis</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
