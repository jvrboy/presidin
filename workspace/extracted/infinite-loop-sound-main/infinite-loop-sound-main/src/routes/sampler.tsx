import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useRef } from "react";
import { ProCard, SectionHeader, StatTile, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap, Play, Upload, Mic, Sliders, Activity, ArrowUpDown } from "lucide-react";
import {
  createDefaultOneShotState,
  recordOneShot,
  loadPadSample,
  playPad,
  updatePad,
  assignPadBuffer,
  trimBuffer,
  normalizeBuffer,
  reverseBuffer,
  type OneShotState,
  type OneShotPad,
} from "@/lib/audio/oneshot-sampler";
import { AudioEngine } from "@/lib/audio/engine";

export const Route = createFileRoute("/sampler")({
  head: () => ({
    meta: [
      { title: "One-Shot Sampler — DivergenceIQ" },
      {
        name: "description",
        content:
          "Record and trigger one-shot samples with pitch, pan, reverse, trim, normalize, and effects.",
      },
    ],
  }),
  component: SamplerPage,
});

function SamplerPage() {
  const [state, setState] = useState<OneShotState>(createDefaultOneShotState());
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [selectedPad, setSelectedPad] = useState<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    ctxRef.current = AudioEngine.ctx ?? new AudioContext();
  }, []);

  const pad = state.pads.find((p) => p.id === selectedPad) ?? null;

  const handleRecord = async () => {
    if (!ctxRef.current) return;
    setRecording(true);
    setRecordProgress(0);
    try {
      const buf = await recordOneShot(ctxRef.current, 3, setRecordProgress);
      if (selectedPad) {
        setState((s) => assignPadBuffer(s, selectedPad, buf));
      } else {
        const firstEmpty = state.pads.find((p) => !p.buffer);
        if (firstEmpty) {
          setState((s) => assignPadBuffer(s, firstEmpty.id, buf));
          setSelectedPad(firstEmpty.id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRecording(false);
    }
  };

  const handleLoadFile = async (file: File) => {
    if (!ctxRef.current || !selectedPad) return;
    try {
      const { buffer } = await loadPadSample(ctxRef.current, file);
      setState((s) => assignPadBuffer(s, selectedPad, buffer));
    } catch (e) {
      console.error(e);
    }
  };

  const handlePlay = (padId: string) => {
    if (!ctxRef.current) return;
    const p = state.pads.find((x) => x.id === padId);
    if (!p) return;
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    playPad(ctxRef.current, p);
  };

  const handleUpdate = (patch: Partial<OneShotPad>) => {
    if (!selectedPad) return;
    setState((s) => updatePad(s, selectedPad, patch));
  };

  const handleTrim = () => {
    if (!ctxRef.current || !pad?.buffer) return;
    const trimmed = trimBuffer(ctxRef.current, pad.buffer, pad.startOffset, pad.endOffset);
    setState((s) => assignPadBuffer(s, pad.id, trimmed));
  };

  const handleNormalize = () => {
    if (!ctxRef.current || !pad?.buffer) return;
    const norm = normalizeBuffer(ctxRef.current, pad.buffer);
    setState((s) => assignPadBuffer(s, pad.id, norm));
  };

  const handleReverse = () => {
    if (!ctxRef.current || !pad?.buffer) return;
    const rev = reverseBuffer(ctxRef.current, pad.buffer);
    setState((s) => assignPadBuffer(s, pad.id, rev));
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="One-Shot Sampler"
          subtitle="Record and trigger one-shot samples with pitch, pan, reverse, trim, normalize, and effects."
          icon={<Zap className="w-5 h-5" />}
          action={<Badge variant="outline">{state.pads.length} pads</Badge>}
        />

        <ProCard
          title="Pad Grid"
          description="Click a pad to select, click again to play."
          icon={<Zap className="w-4 h-4" />}
        >
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            {state.pads.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setSelectedPad(p.id)}
                onDoubleClick={() => handlePlay(p.id)}
                className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center transition-all ${
                  selectedPad === p.id ? "border-primary" : "border-border"
                } ${p.buffer ? "" : "opacity-40"}`}
                style={{
                  backgroundColor: p.color + "20",
                  borderColor: selectedPad === p.id ? p.color : undefined,
                }}
              >
                <span className="text-xs font-bold" style={{ color: p.color }}>
                  {i + 1}
                </span>
                <span className="text-[10px] text-muted-foreground">{p.key}</span>
                {p.buffer && <Play className="w-3 h-3 mt-1" />}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <Button onClick={handleRecord} disabled={recording}>
              <Mic className="w-4 h-4" />{" "}
              {recording ? `Recording… ${Math.round(recordProgress * 100)}%` : "Record (3s)"}
            </Button>
            {selectedPad && (
              <Input
                type="file"
                accept="audio/*"
                onChange={(e) => e.target.files?.[0] && handleLoadFile(e.target.files[0])}
                className="flex-1"
              />
            )}
          </div>
        </ProCard>

        {pad && (
          <ProCard
            title={`Pad: ${pad.name}`}
            description="Edit pad playback and sample settings."
            icon={<Sliders className="w-4 h-4" />}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>
                    Pitch {pad.pitch > 0 ? "+" : ""}
                    {pad.pitch}
                  </Label>
                  <input
                    type="range"
                    min={-24}
                    max={24}
                    value={pad.pitch}
                    onChange={(e) => handleUpdate({ pitch: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>
                    Pan {pad.pan > 0 ? "R" : "L"} {Math.abs(Math.round(pad.pan * 100))}
                  </Label>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={pad.pan}
                    onChange={(e) => handleUpdate({ pan: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Gain {pad.gain.toFixed(2)}</Label>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.01}
                    value={pad.gain}
                    onChange={(e) => handleUpdate({ gain: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Filter {Math.round(pad.filter * 100)}%</Label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={pad.filter}
                    onChange={(e) => handleUpdate({ filter: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Reverb {Math.round(pad.reverb * 100)}%</Label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={pad.reverb}
                    onChange={(e) => handleUpdate({ reverb: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Delay {Math.round(pad.delay * 100)}%</Label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={pad.delay}
                    onChange={(e) => handleUpdate({ delay: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Start {Math.round(pad.startOffset * 100)}%</Label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={pad.startOffset}
                    onChange={(e) => handleUpdate({ startOffset: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>End {Math.round(pad.endOffset * 100)}%</Label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={pad.endOffset}
                    onChange={(e) => handleUpdate({ endOffset: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => handlePlay(pad.id)} disabled={!pad.buffer}>
                  <Play className="w-4 h-4" /> Play
                </Button>
                <Button variant="outline" onClick={handleTrim} disabled={!pad.buffer}>
                  Trim
                </Button>
                <Button variant="outline" onClick={handleNormalize} disabled={!pad.buffer}>
                  Normalize
                </Button>
                <Button
                  variant={pad.reverse ? "default" : "outline"}
                  onClick={handleReverse}
                  disabled={!pad.buffer}
                >
                  <ArrowUpDown className="w-4 h-4" /> Reverse
                </Button>
                <Button
                  variant={pad.loopMode ? "default" : "outline"}
                  onClick={() => handleUpdate({ loopMode: !pad.loopMode })}
                >
                  Loop
                </Button>
              </div>

              {pad.buffer && (
                <div className="text-xs text-muted-foreground">
                  Duration: {pad.durationSec.toFixed(2)}s · Waveform peaks: {pad.waveform.length}
                </div>
              )}
            </div>
          </ProCard>
        )}
      </div>
    </AppShell>
  );
}
