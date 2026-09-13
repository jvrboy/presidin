import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useRef, useCallback } from "react";
import { ProCard, SectionHeader, MeterBar, StatTile, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Mic,
  Music,
  Waves,
  Activity,
  Upload,
  Play,
  Square,
  Sliders,
  AudioWaveform,
  Volume,
} from "lucide-react";
import { AudioEngine } from "@lib/audio/engine";
import {
  SoundPitcher,
  FormantShifter,
  AdvancedPitchEngine,
  createDefaultPitcher,
  createDefaultFormantShifter,
  createDefaultAdvancedPitch,
  detectPitch,
  freqToNoteName,
  type PitcherConfig,
  type FormantShifterConfig,
  type AdvancedPitchConfig,
} from "@lib/audio/pitch-formant";

export const Route = createFileRoute("/pitch-tools")({
  head: () => ({
    meta: [
      { title: "Pitch & Formant Tools — DivergenceIQ" },
      {
        name: "description",
        content:
          "Sound Pitcher, Formant Shifter, and Advanced Pitch Engine with harmonization and pitch correction.",
      },
    ],
  }),
  component: PitchToolsPage,
});

function PitchToolsPage() {
  const ctxRef = useRef<AudioContext | null>(null);
  const pitcherRef = useRef<SoundPitcher | null>(null);
  const formantRef = useRef<FormantShifter | null>(null);
  const advancedRef = useRef<AdvancedPitchEngine | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pitcherCfg, setPitcherCfg] = useState<PitcherConfig>(createDefaultPitcher());
  const [formantCfg, setFormantCfg] = useState<FormantShifterConfig>(createDefaultFormantShifter());
  const [advancedCfg, setAdvancedCfg] = useState<AdvancedPitchConfig>(createDefaultAdvancedPitch());
  const [detectedPitch, setDetectedPitch] = useState<{
    note: string;
    freq: number;
    cents: number;
    confidence: number;
  } | null>(null);
  const [mode, setMode] = useState<"pitcher" | "formant" | "advanced">("pitcher");

  useEffect(() => {
    try {
      AudioEngine.init();
      ctxRef.current = AudioEngine.ctx;
    } catch (e: any) {
      setError("Audio init failed: " + e?.message);
    }
    return () => {
      stopPlayback();
    };
  }, []);

  const loadFile = useCallback(async (file: File) => {
    if (!ctxRef.current) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = await ctxRef.current.decodeAudioData(arrayBuffer);
      setAudioBuffer(buffer);
      setError(null);
    } catch (e: any) {
      setError("Failed to decode: " + e?.message);
    }
  }, []);

  const stopPlayback = () => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {}
      sourceRef.current = null;
    }
    pitcherRef.current?.disconnect();
    formantRef.current?.disconnect();
    advancedRef.current?.disconnect();
    pitcherRef.current = null;
    formantRef.current = null;
    advancedRef.current = null;
    setPlaying(false);
  };

  const playWithPitcher = () => {
    if (!ctxRef.current || !audioBuffer) return;
    stopPlayback();
    AudioEngine.resume();
    const ctx = ctxRef.current;
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    const pitcher = new SoundPitcher(ctx, pitcherCfg);
    pitcher.connectInput(source);
    pitcher.getOutput().connect(ctx.destination);
    source.start();
    sourceRef.current = source;
    pitcherRef.current = pitcher;
    setPlaying(true);
  };

  const playWithFormant = () => {
    if (!ctxRef.current || !audioBuffer) return;
    stopPlayback();
    AudioEngine.resume();
    const ctx = ctxRef.current;
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    const formant = new FormantShifter(ctx, formantCfg);
    formant.connectInput(source);
    formant.getOutput().connect(ctx.destination);
    source.start();
    sourceRef.current = source;
    formantRef.current = formant;
    setPlaying(true);
  };

  const playWithAdvanced = () => {
    if (!ctxRef.current || !audioBuffer) return;
    stopPlayback();
    AudioEngine.resume();
    const ctx = ctxRef.current;
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    const engine = new AdvancedPitchEngine(ctx, advancedCfg);
    engine.connectInput(source);
    engine.getOutput().connect(ctx.destination);
    source.start();
    sourceRef.current = source;
    advancedRef.current = engine;
    setPlaying(true);
  };

  const play = () => {
    if (mode === "pitcher") playWithPitcher();
    else if (mode === "formant") playWithFormant();
    else playWithAdvanced();
  };

  const runPitchDetection = () => {
    if (!ctxRef.current || !audioBuffer) return;
    const channelData = audioBuffer.getChannelData(0);
    const sampleSize = Math.min(4096, channelData.length);
    const samples = new Float32Array(sampleSize);
    for (let i = 0; i < sampleSize; i++) samples[i] = channelData[i];
    const result = detectPitch(samples, audioBuffer.sampleRate);
    if (result.freq > 0) {
      const noteInfo = freqToNoteName(result.freq);
      setDetectedPitch({
        note: `${noteInfo.note}${noteInfo.octave}`,
        freq: result.freq,
        cents: noteInfo.cents,
        confidence: result.confidence,
      });
    } else {
      setDetectedPitch(null);
      setError("No pitch detected (silence or noise)");
    }
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <SectionHeader
          title="Pitch & Formant Tools"
          subtitle="Sound Pitcher, Formant Shifter, and Advanced Pitch Engine with harmonization and pitch correction."
          icon={<Sliders className="w-5 h-5" />}
        />

        {error && (
          <div className="rounded-lg border border-bear/30 bg-bear/10 p-3 text-sm text-bear">
            {error}
          </div>
        )}

        <ProCard
          title="Load Audio"
          description="Upload an audio file to process"
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
                {audioBuffer.duration.toFixed(1)}s · {(audioBuffer.sampleRate / 1000).toFixed(1)}kHz
                · {audioBuffer.numberOfChannels}ch
              </Badge>
            )}
          </div>
        </ProCard>

        {audioBuffer && (
          <>
            <div className="flex gap-2">
              <Button
                variant={mode === "pitcher" ? "default" : "outline"}
                onClick={() => setMode("pitcher")}
                className="gap-2"
              >
                <Waves className="w-4 h-4" /> Sound Pitcher
              </Button>
              <Button
                variant={mode === "formant" ? "default" : "outline"}
                onClick={() => setMode("formant")}
                className="gap-2"
              >
                <Mic className="w-4 h-4" /> Formant Shifter
              </Button>
              <Button
                variant={mode === "advanced" ? "default" : "outline"}
                onClick={() => setMode("advanced")}
                className="gap-2"
              >
                <AudioWaveform className="w-4 h-4" /> Advanced Pitch
              </Button>
              <Button
                variant={playing ? "secondary" : "default"}
                onClick={playing ? stopPlayback : play}
                className="gap-2 ml-auto"
              >
                {playing ? (
                  <>
                    <Square className="w-4 h-4" /> Stop
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" /> Play
                  </>
                )}
              </Button>
            </div>

            {mode === "pitcher" && (
              <ProCard
                title="Sound Pitcher"
                description="Granular pitch shifting with dual delay-line PSOLA"
                icon={<Waves className="w-4 h-4" />}
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Pitch Shift (semitones)</Label>
                    <Input
                      type="number"
                      min={-24}
                      max={24}
                      step={1}
                      value={pitcherCfg.pitchShift}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setPitcherCfg({
                          ...pitcherCfg,
                          pitchShift: v,
                          pitchRatio: Math.pow(2, v / 12),
                        });
                        pitcherRef.current?.setConfig({
                          pitchShift: v,
                          pitchRatio: Math.pow(2, v / 12),
                        });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Detune (cents)</Label>
                    <Input
                      type="number"
                      min={-50}
                      max={50}
                      step={1}
                      value={pitcherCfg.detune}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setPitcherCfg({ ...pitcherCfg, detune: v });
                        pitcherRef.current?.setConfig({ detune: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Window Size (ms)</Label>
                    <Input
                      type="number"
                      min={10}
                      max={100}
                      step={5}
                      value={pitcherCfg.windowSize}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setPitcherCfg({ ...pitcherCfg, windowSize: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Mix</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={pitcherCfg.mix}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setPitcherCfg({ ...pitcherCfg, mix: v });
                        pitcherRef.current?.setConfig({ mix: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Stereo Width</Label>
                    <Input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={pitcherCfg.stereoWidth}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setPitcherCfg({ ...pitcherCfg, stereoWidth: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Crossfade</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={pitcherCfg.crossfade}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setPitcherCfg({ ...pitcherCfg, crossfade: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Feedback</Label>
                    <Input
                      type="number"
                      min={0}
                      max={0.9}
                      step={0.05}
                      value={pitcherCfg.feedback}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setPitcherCfg({ ...pitcherCfg, feedback: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <MeterBar
                    value={((pitcherCfg.pitchShift + 24) / 48) * 100}
                    label="Pitch Position"
                    color="primary"
                    showValue
                  />
                </div>
              </ProCard>
            )}

            {mode === "formant" && (
              <ProCard
                title="Formant Shifter"
                description="Shift vocal formant frequencies independently of pitch"
                icon={<Mic className="w-4 h-4" />}
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Formant Shift (semitones)</Label>
                    <Input
                      type="number"
                      min={-12}
                      max={12}
                      step={1}
                      value={formantCfg.shift}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setFormantCfg({ ...formantCfg, shift: v });
                        formantRef.current?.setConfig({ shift: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Formant 1 (Hz)</Label>
                    <Input
                      type="number"
                      min={200}
                      max={1500}
                      step={10}
                      value={formantCfg.formant1}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setFormantCfg({ ...formantCfg, formant1: v });
                        formantRef.current?.setConfig({ formant1: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Formant 2 (Hz)</Label>
                    <Input
                      type="number"
                      min={500}
                      max={3000}
                      step={10}
                      value={formantCfg.formant2}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setFormantCfg({ ...formantCfg, formant2: v });
                        formantRef.current?.setConfig({ formant2: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Formant 3 (Hz)</Label>
                    <Input
                      type="number"
                      min={1000}
                      max={5000}
                      step={10}
                      value={formantCfg.formant3}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setFormantCfg({ ...formantCfg, formant3: v });
                        formantRef.current?.setConfig({ formant3: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Bandwidth (Q multiplier)</Label>
                    <Input
                      type="number"
                      min={0.1}
                      max={5}
                      step={0.1}
                      value={formantCfg.bandwidth}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setFormantCfg({ ...formantCfg, bandwidth: v });
                        formantRef.current?.setConfig({ bandwidth: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Resonance</Label>
                    <Input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={formantCfg.resonance}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setFormantCfg({ ...formantCfg, resonance: v });
                        formantRef.current?.setConfig({ resonance: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Mix</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={formantCfg.mix}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setFormantCfg({ ...formantCfg, mix: v });
                        formantRef.current?.setConfig({ mix: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        const p = !formantCfg.preserveOriginal;
                        setFormantCfg({ ...formantCfg, preserveOriginal: p });
                        formantRef.current?.setConfig({ preserveOriginal: p });
                      }}
                    >
                      {formantCfg.preserveOriginal
                        ? "Preserve Original: ON"
                        : "Preserve Original: OFF"}
                    </Button>
                  </div>
                </div>
              </ProCard>
            )}

            {mode === "advanced" && (
              <ProCard
                title="Advanced Pitch Engine"
                description="Pitch + Formant + Harmonization + Pitch Correction"
                icon={<AudioWaveform className="w-4 h-4" />}
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Pitch Shift (semitones)</Label>
                    <Input
                      type="number"
                      min={-24}
                      max={24}
                      step={1}
                      value={advancedCfg.pitchShift}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setAdvancedCfg({ ...advancedCfg, pitchShift: v });
                        advancedRef.current?.setConfig({ pitchShift: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Formant Shift (semitones)</Label>
                    <Input
                      type="number"
                      min={-12}
                      max={12}
                      step={1}
                      value={advancedCfg.formantShift}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setAdvancedCfg({ ...advancedCfg, formantShift: v });
                        advancedRef.current?.setConfig({ formantShift: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Detune (cents)</Label>
                    <Input
                      type="number"
                      min={-50}
                      max={50}
                      step={1}
                      value={advancedCfg.detune}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setAdvancedCfg({ ...advancedCfg, detune: v });
                        advancedRef.current?.setConfig({ detune: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Glide</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={advancedCfg.glide}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setAdvancedCfg({ ...advancedCfg, glide: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Pitch Correct</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={advancedCfg.pitchCorrect}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setAdvancedCfg({ ...advancedCfg, pitchCorrect: v });
                        advancedRef.current?.setConfig({ pitchCorrect: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Correct Key</Label>
                    <select
                      value={advancedCfg.pitchCorrectKey}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAdvancedCfg({ ...advancedCfg, pitchCorrectKey: v });
                        advancedRef.current?.setConfig({ pitchCorrectKey: v });
                      }}
                      className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm"
                    >
                      {["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].map(
                        (k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Correct Scale</Label>
                    <select
                      value={advancedCfg.pitchCorrectScale}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAdvancedCfg({ ...advancedCfg, pitchCorrectScale: v });
                        advancedRef.current?.setConfig({ pitchCorrectScale: v });
                      }}
                      className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm"
                    >
                      {[
                        "major",
                        "minor",
                        "pentatonic",
                        "blues",
                        "chromatic",
                        "dorian",
                        "mixolydian",
                      ].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Stereo Spread</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={advancedCfg.stereoSpread}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setAdvancedCfg({ ...advancedCfg, stereoSpread: v });
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <Label className="text-xs">
                    Harmonization (semitone offsets, comma-separated)
                  </Label>
                  <Input
                    value={advancedCfg.harmonize.join(",")}
                    onChange={(e) => {
                      const arr = e.target.value
                        .split(",")
                        .map((s) => parseInt(s.trim()))
                        .filter((n) => !isNaN(n));
                      setAdvancedCfg({ ...advancedCfg, harmonize: arr });
                      advancedRef.current?.setConfig({ harmonize: arr });
                    }}
                    placeholder="e.g. 3,7,12 for major triad harmony"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Examples: 3,7 (third + fifth), 12 (octave), -5,-3 (below harmony)
                  </p>
                </div>
              </ProCard>
            )}

            <ProCard
              title="Pitch Detection"
              description="Real-time pitch detection using autocorrelation"
              icon={<Activity className="w-4 h-4" />}
            >
              <Button onClick={runPitchDetection} variant="outline" className="gap-2">
                <Mic className="w-4 h-4" /> Detect Pitch
              </Button>
              {detectedPitch && (
                <KpiGrid
                  tiles={[
                    {
                      label: "Detected Note",
                      value: detectedPitch.note,
                      sub: `${detectedPitch.cents > 0 ? "+" : ""}${detectedPitch.cents} cents`,
                      icon: <Music className="w-4 h-4" />,
                      accent: "primary",
                    },
                    {
                      label: "Frequency",
                      value: `${detectedPitch.freq.toFixed(1)} Hz`,
                      icon: <Waves className="w-4 h-4" />,
                      accent: "neutral",
                    },
                    {
                      label: "Confidence",
                      value: `${(detectedPitch.confidence * 100).toFixed(0)}%`,
                      icon: <Activity className="w-4 h-4" />,
                      accent: "bull",
                    },
                  ]}
                />
              )}
            </ProCard>
          </>
        )}

        {!audioBuffer && (
          <div className="text-center py-12 text-muted-foreground">
            <Sliders className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Upload an audio file to start processing</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
