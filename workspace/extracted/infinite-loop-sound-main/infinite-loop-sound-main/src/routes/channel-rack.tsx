import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useRef } from "react";
import { ProCard, SectionHeader, MeterBar, StatTile, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Grid,
  Play,
  Square,
  Plus,
  Trash,
  Volume,
  Music,
  Sliders,
  Zap,
  Copy,
  ArrowUpDown,
} from "lucide-react";
import {
  createDefaultChannelRack,
  toggleStep,
  updateStep,
  addChannel,
  removeChannel,
  updateChannel,
  assignSample,
  resizeSteps,
  ChannelRackScheduler,
  type ChannelRackState,
  type ChannelRackChannel,
} from "@/lib/audio/channel-rack";
import { AudioEngine } from "@/lib/audio/engine";
import {
  createBuiltinPack,
  playOneShot,
  type Sample,
  type SamplePack,
} from "@/lib/audio/sample-packs";

export const Route = createFileRoute("/channel-rack")({
  head: () => ({
    meta: [
      { title: "Channel Rack — DivergenceIQ" },
      {
        name: "description",
        content:
          "Step sequencer channel rack with per-channel samples, pitch, pan, velocity, retrigger, swing, and humanize.",
      },
    ],
  }),
  component: ChannelRackPage,
});

function ChannelRackPage() {
  const [state, setState] = useState<ChannelRackState>(createDefaultChannelRack());
  const [pack, setPack] = useState<SamplePack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const schedulerRef = useRef<ChannelRackScheduler | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const ctx = AudioEngine.ctx ?? new AudioContext();
    ctxRef.current = ctx;
    const builtin = createBuiltinPack(ctx);
    setPack(builtin);
    setState((prev) => {
      const next = { ...prev };
      next.channels = prev.channels.map((ch, i) => {
        const sample = builtin.samples[i % builtin.samples.length];
        return assignSample(next, ch.id, sample).channels.find((c) => c.id === ch.id)!;
      });
      return next;
    });
  }, []);

  useEffect(() => {
    if (!ctxRef.current) return;
    schedulerRef.current = new ChannelRackScheduler(ctxRef.current, state);
    schedulerRef.current.onStep = (s) => setCurrentStep(s);
    return () => schedulerRef.current?.stop();
  }, []);

  useEffect(() => {
    schedulerRef.current?.update(state);
  }, [state]);

  const togglePlay = () => {
    if (!ctxRef.current || !schedulerRef.current) return;
    if (playing) {
      schedulerRef.current.stop();
      setPlaying(false);
    } else {
      schedulerRef.current.start();
      setPlaying(true);
    }
  };

  const handleToggleStep = (channelId: string, stepIndex: number) => {
    setState((prev) => ({
      ...prev,
      channels: prev.channels.map((c) => (c.id === channelId ? toggleStep(c, stepIndex) : c)),
    }));
  };

  const handleAddChannel = () => {
    setState((prev) => addChannel(prev, `Channel ${prev.channels.length + 1}`));
  };
  const handleRemoveChannel = (id: string) => {
    setState((prev) => removeChannel(prev, id));
  };
  const handleUpdateChannel = (id: string, patch: Partial<ChannelRackChannel>) => {
    setState((prev) => updateChannel(prev, id, patch));
  };
  const handleResizeSteps = (newSteps: number) => {
    setState((prev) => resizeSteps(prev, newSteps));
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-6">
        <SectionHeader
          title="Channel Rack"
          subtitle="Step sequencer with per-channel samples, velocity, pitch, retrigger, swing, and humanize."
          icon={<Grid className="w-5 h-5" />}
          action={
            <div className="flex gap-2">
              <Badge variant="outline">{state.bpm} BPM</Badge>
              <Badge variant="outline">{state.steps} steps</Badge>
              <Button size="sm" onClick={togglePlay}>
                {playing ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {playing ? "Stop" : "Play"}
              </Button>
            </div>
          }
        />

        <ProCard
          title="Transport"
          description="Global step sequencer controls."
          icon={<Sliders className="w-4 h-4" />}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label>BPM</Label>
              <Input
                type="number"
                value={state.bpm}
                min={60}
                max={200}
                onChange={(e) => setState((p) => ({ ...p, bpm: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Steps</Label>
              <select
                className="w-full bg-background border border-border rounded px-2 py-2 text-sm"
                value={state.steps}
                onChange={(e) => handleResizeSteps(Number(e.target.value))}
              >
                {[8, 16, 32, 64].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Swing {Math.round(state.swing * 100)}%</Label>
              <input
                type="range"
                min={0}
                max={0.75}
                step={0.01}
                value={state.swing}
                onChange={(e) => setState((p) => ({ ...p, swing: Number(e.target.value) }))}
                className="w-full"
              />
            </div>
            <div>
              <Label>Master Vol</Label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={state.masterVolume}
                onChange={(e) => setState((p) => ({ ...p, masterVolume: Number(e.target.value) }))}
                className="w-full"
              />
            </div>
          </div>
        </ProCard>

        <ProCard
          title="Channels"
          description="Per-channel step sequencer."
          icon={<Music className="w-4 h-4" />}
        >
          <div className="space-y-2">
            {state.channels.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center gap-2 p-2 rounded border border-border bg-card"
              >
                <div className="w-32 shrink-0">
                  <Input
                    value={channel.name}
                    onChange={(e) => handleUpdateChannel(channel.id, { name: e.target.value })}
                    className="text-xs"
                  />
                  <div className="flex gap-1 mt-1">
                    <Button
                      size="icon"
                      variant={channel.muted ? "destructive" : "ghost"}
                      className="h-6 w-6"
                      onClick={() => handleUpdateChannel(channel.id, { muted: !channel.muted })}
                    >
                      <Volume className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant={channel.solo ? "default" : "ghost"}
                      className="h-6 w-6"
                      onClick={() => handleUpdateChannel(channel.id, { solo: !channel.solo })}
                    >
                      <Zap className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 hover:text-red-400"
                      onClick={() => handleRemoveChannel(channel.id)}
                    >
                      <Trash className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div
                  className="flex-1 grid gap-1"
                  style={{ gridTemplateColumns: `repeat(${state.steps}, 1fr)` }}
                >
                  {channel.steps.map((step, i) => (
                    <button
                      key={i}
                      onClick={() => handleToggleStep(channel.id, i)}
                      className={`h-8 rounded border transition-all ${
                        step.active
                          ? "border-primary bg-primary/30"
                          : "border-border bg-card hover:bg-card/60"
                      } ${currentStep === i && playing ? "ring-2 ring-primary" : ""}`}
                      style={
                        step.active
                          ? { backgroundColor: channel.color + "40", borderColor: channel.color }
                          : {}
                      }
                      title={`Step ${i + 1} · Velocity ${step.velocity}`}
                    />
                  ))}
                </div>
                <div className="w-24 shrink-0 space-y-1">
                  <Label className="text-[10px]">Volume</Label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={channel.volume}
                    onChange={(e) =>
                      handleUpdateChannel(channel.id, { volume: Number(e.target.value) })
                    }
                    className="w-full"
                  />
                  <Label className="text-[10px]">Humanize</Label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={channel.humanize}
                    onChange={(e) =>
                      handleUpdateChannel(channel.id, { humanize: Number(e.target.value) })
                    }
                    className="w-full"
                  />
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={handleAddChannel}>
            <Plus className="w-4 h-4" /> Add Channel
          </Button>
        </ProCard>

        {state.channels.find((c) => c.id === state.channels[0]?.id) && (
          <ProCard
            title="Step Editor"
            description="Fine-grained per-step control for selected channel."
            icon={<Sliders className="w-4 h-4" />}
          >
            <StepEditor state={state} setState={setState} />
          </ProCard>
        )}
      </div>
    </AppShell>
  );
}

function StepEditor({
  state,
  setState,
}: {
  state: ChannelRackState;
  setState: React.Dispatch<React.SetStateAction<ChannelRackState>>;
}) {
  const [selectedChannel, setSelectedChannel] = useState(state.channels[0]?.id ?? "");
  const [selectedStep, setSelectedStep] = useState(0);
  const channel = state.channels.find((c) => c.id === selectedChannel) ?? state.channels[0];
  const step = channel?.steps[selectedStep];

  if (!channel || !step) return <p className="text-xs text-muted-foreground">No step selected.</p>;

  const update = (patch: Partial<typeof step>) => {
    setState((prev) => ({
      ...prev,
      channels: prev.channels.map((c) =>
        c.id === channel.id
          ? { ...c, steps: c.steps.map((s, i) => (i === selectedStep ? { ...s, ...patch } : s)) }
          : c,
      ),
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <select
          className="bg-background border border-border rounded px-2 py-1 text-sm"
          value={selectedChannel}
          onChange={(e) => setSelectedChannel(e.target.value)}
        >
          {state.channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="bg-background border border-border rounded px-2 py-1 text-sm"
          value={selectedStep}
          onChange={(e) => setSelectedStep(Number(e.target.value))}
        >
          {channel.steps.map((_, i) => (
            <option key={i} value={i}>
              Step {i + 1}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <Label>Velocity {step.velocity}</Label>
          <input
            type="range"
            min={1}
            max={127}
            value={step.velocity}
            onChange={(e) => update({ velocity: Number(e.target.value) })}
            className="w-full"
          />
        </div>
        <div>
          <Label>
            Pitch {step.pitch > 0 ? "+" : ""}
            {step.pitch}
          </Label>
          <input
            type="range"
            min={-24}
            max={24}
            value={step.pitch}
            onChange={(e) => update({ pitch: Number(e.target.value) })}
            className="w-full"
          />
        </div>
        <div>
          <Label>
            Pan {step.pan > 0 ? "R" : "L"} {Math.abs(Math.round(step.pan * 100))}
          </Label>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={step.pan}
            onChange={(e) => update({ pan: Number(e.target.value) })}
            className="w-full"
          />
        </div>
        <div>
          <Label>Retrigger {step.retrigger}x</Label>
          <input
            type="range"
            min={1}
            max={4}
            value={step.retrigger}
            onChange={(e) => update({ retrigger: Number(e.target.value) })}
            className="w-full"
          />
        </div>
        <div>
          <Label>Gain {step.gain.toFixed(2)}</Label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={step.gain}
            onChange={(e) => update({ gain: Number(e.target.value) })}
            className="w-full"
          />
        </div>
        <div className="flex items-end gap-2">
          <Button
            size="sm"
            variant={step.reverse ? "default" : "outline"}
            onClick={() => update({ reverse: !step.reverse })}
          >
            <ArrowUpDown className="w-3 h-3" /> Reverse
          </Button>
          <Button
            size="sm"
            variant={step.active ? "default" : "outline"}
            onClick={() => update({ active: !step.active })}
          >
            <Zap className="w-3 h-3" /> {step.active ? "Active" : "Inactive"}
          </Button>
        </div>
      </div>
    </div>
  );
}
