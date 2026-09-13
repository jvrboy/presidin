import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@components/app/AppShell";
import { useEffect, useState, useRef } from "react";
import { ProCard, SectionHeader, MeterBar, StatTile, KpiGrid } from "@components/pro";
import { Button } from "@components/ui/button";
import { Badge } from "@components/ui/badge";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { Sliders, Volume, Plus, Trash, Music, Activity, Gauge, Layers, Zap } from "lucide-react";
import {
  createDefaultMixer,
  createDefaultChannel,
  generateChannelId,
  dbToGain,
  gainToDb,
  getMeterColor,
  formatDb,
  type MixerState,
  type ChannelStrip,
  type EQBand,
  type EQType,
} from "@lib/audio/advanced-mixer";
import { AudioEngine } from "@lib/audio/engine";

export const Route = createFileRoute("/mixing-tools")({
  head: () => ({
    meta: [
      { title: "Mixing Console — DivergenceIQ" },
      {
        name: "description",
        content:
          "Professional mixing console with channel strips, 4-band EQ, compressor, gate, sends, buses, and master chain.",
      },
    ],
  }),
  component: MixingConsolePage,
});

const EQ_TYPES: EQType[] = [
  "lowpass",
  "highpass",
  "bandpass",
  "lowshelf",
  "highshelf",
  "peaking",
  "notch",
  "allpass",
];

function MixingConsolePage() {
  const [state, setState] = useState<MixerState>(createDefaultMixer());
  const [selectedCh, setSelectedCh] = useState<string | null>(null);
  const meterIntervalRef = useRef<number | null>(null);
  const [meters, setMeters] = useState<Record<string, number>>({});

  // Simulated metering (since we don't have real audio routing in preview)
  useEffect(() => {
    meterIntervalRef.current = window.setInterval(() => {
      setMeters((prev) => {
        const next: Record<string, number> = {};
        for (const ch of state.channels) {
          const base = ch.mute ? 0 : ch.volume * 0.3;
          next[ch.id] = base + Math.random() * 0.1 * (ch.volume > 0 ? 1 : 0);
        }
        next["master"] = state.master.volume * 0.3 + Math.random() * 0.1;
        return next;
      });
    }, 100);
    return () => {
      if (meterIntervalRef.current) clearInterval(meterIntervalRef.current);
    };
  }, [state.channels, state.master.volume]);

  const addChannel = () => {
    const ch = createDefaultChannel(`Channel ${state.channels.length + 1}`, "audio");
    setState((s) => ({ ...s, channels: [...s.channels, ch] }));
  };

  const removeChannel = (id: string) => {
    setState((s) => ({ ...s, channels: s.channels.filter((c) => c.id !== id) }));
    if (selectedCh === id) setSelectedCh(null);
  };

  const updateChannel = (id: string, updates: Partial<ChannelStrip>) => {
    setState((s) => ({
      ...s,
      channels: s.channels.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
  };

  const updateEQ = (chId: string, bandIdx: number, updates: Partial<EQBand>) => {
    setState((s) => ({
      ...s,
      channels: s.channels.map((c) =>
        c.id === chId
          ? {
              ...c,
              eq: c.eq.map((b, i) => (i === bandIdx ? { ...b, ...updates } : b)),
            }
          : c,
      ),
    }));
  };

  const selectedChannel = state.channels.find((c) => c.id === selectedCh);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
        <SectionHeader
          title="Advanced Mixing Console"
          subtitle="Professional channel strips with 4-band parametric EQ, compressor, gate, sends, and master chain."
          icon={<Sliders className="w-5 h-5" />}
          action={
            <Button onClick={addChannel} className="gap-2">
              <Plus className="w-4 h-4" /> Add Channel
            </Button>
          }
        />

        {/* Channel Strips */}
        <div className="flex gap-2 overflow-x-auto pb-4">
          {state.channels.map((ch) => (
            <div
              key={ch.id}
              className={`flex-shrink-0 rounded-xl border bg-card p-2 transition-all cursor-pointer ${selectedCh === ch.id ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"}`}
              style={{ width: 90 }}
              onClick={() => setSelectedCh(ch.id)}
            >
              {/* Channel name */}
              <div className="flex items-center gap-1 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ background: ch.color }} />
                <span className="text-xs font-medium truncate">{ch.name}</span>
              </div>

              {/* Meter */}
              <div className="h-32 w-3 bg-muted rounded-full mx-auto mb-2 relative overflow-hidden">
                <div
                  className="absolute bottom-0 w-full rounded-full transition-all duration-75"
                  style={{
                    height: `${(meters[ch.id] || 0) * 100}%`,
                    background: getMeterColor(meters[ch.id] || 0),
                  }}
                />
              </div>

              {/* Pan */}
              <input
                type="range"
                min={-1}
                max={1}
                step={0.1}
                value={ch.pan}
                onChange={(e) => updateChannel(ch.id, { pan: parseFloat(e.target.value) })}
                className="w-full h-1 mb-1"
                onClick={(e) => e.stopPropagation()}
              />

              {/* Volume fader */}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={ch.volume}
                onChange={(e) => updateChannel(ch.id, { volume: parseFloat(e.target.value) })}
                className="w-full h-1 mb-2"
                onClick={(e) => e.stopPropagation()}
              />

              {/* Mute/Solo */}
              <div className="flex gap-1">
                <Button
                  variant={ch.mute ? "secondary" : "outline"}
                  size="sm"
                  className="flex-1 h-6 text-[10px]"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateChannel(ch.id, { mute: !ch.mute });
                  }}
                >
                  M
                </Button>
                <Button
                  variant={ch.solo ? "secondary" : "outline"}
                  size="sm"
                  className="flex-1 h-6 text-[10px]"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateChannel(ch.id, { solo: !ch.solo });
                  }}
                >
                  S
                </Button>
              </div>

              {/* Delete */}
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-5 mt-1 text-[10px]"
                onClick={(e) => {
                  e.stopPropagation();
                  removeChannel(ch.id);
                }}
              >
                <Trash className="w-2.5 h-2.5" />
              </Button>
            </div>
          ))}

          {/* Master Strip */}
          <div
            className="flex-shrink-0 rounded-xl border-2 border-primary bg-card p-2"
            style={{ width: 90 }}
          >
            <div className="flex items-center gap-1 mb-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-xs font-bold">Master</span>
            </div>
            <div className="h-32 w-3 bg-muted rounded-full mx-auto mb-2 relative overflow-hidden">
              <div
                className="absolute bottom-0 w-full rounded-full transition-all duration-75"
                style={{
                  height: `${(meters["master"] || 0) * 100}%`,
                  background: getMeterColor(meters["master"] || 0),
                }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={state.master.volume}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  master: { ...s.master, volume: parseFloat(e.target.value) },
                }))
              }
              className="w-full h-1 mb-2"
            />
            <Badge variant="outline" className="text-[10px] w-full justify-center">
              {formatDb(gainToDb(state.master.volume))}
            </Badge>
          </div>
        </div>

        {/* Selected Channel Details */}
        {selectedChannel && (
          <ProCard
            title={`Channel: ${selectedChannel.name}`}
            description="EQ, dynamics, and routing"
            icon={<Sliders className="w-4 h-4" />}
          >
            {/* EQ */}
            <div className="mb-4">
              <h4 className="text-sm font-semibold mb-2">4-Band Parametric EQ</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {selectedChannel.eq.map((band, i) => (
                  <div
                    key={band.id}
                    className="rounded-lg border border-border bg-card p-2 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        Band {i + 1}
                      </span>
                      <Button
                        variant={band.enabled ? "secondary" : "ghost"}
                        size="sm"
                        className="h-4 px-1 text-[9px]"
                        onClick={() => updateEQ(selectedChannel.id, i, { enabled: !band.enabled })}
                      >
                        {band.enabled ? "ON" : "OFF"}
                      </Button>
                    </div>
                    <select
                      value={band.type}
                      onChange={(e) =>
                        updateEQ(selectedChannel.id, i, { type: e.target.value as EQType })
                      }
                      className="w-full bg-card border border-border rounded px-1 py-0.5 text-[10px]"
                    >
                      {EQ_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <div>
                      <Label className="text-[9px]">Freq: {band.frequency}Hz</Label>
                      <input
                        type="range"
                        min={20}
                        max={20000}
                        step={1}
                        value={band.frequency}
                        onChange={(e) =>
                          updateEQ(selectedChannel.id, i, { frequency: parseInt(e.target.value) })
                        }
                        className="w-full h-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[9px]">
                        Gain: {band.gain > 0 ? "+" : ""}
                        {band.gain}dB
                      </Label>
                      <input
                        type="range"
                        min={-24}
                        max={24}
                        step={0.5}
                        value={band.gain}
                        onChange={(e) =>
                          updateEQ(selectedChannel.id, i, { gain: parseFloat(e.target.value) })
                        }
                        className="w-full h-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[9px]">Q: {band.q.toFixed(1)}</Label>
                      <input
                        type="range"
                        min={0.1}
                        max={10}
                        step={0.1}
                        value={band.q}
                        onChange={(e) =>
                          updateEQ(selectedChannel.id, i, { q: parseFloat(e.target.value) })
                        }
                        className="w-full h-1"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Compressor */}
            <div className="mb-4 border-t border-border pt-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold">Compressor</h4>
                <Button
                  variant={selectedChannel.compressor.enabled ? "secondary" : "outline"}
                  size="sm"
                  onClick={() =>
                    updateChannel(selectedChannel.id, {
                      compressor: {
                        ...selectedChannel.compressor,
                        enabled: !selectedChannel.compressor.enabled,
                      },
                    })
                  }
                >
                  {selectedChannel.compressor.enabled ? "Enabled" : "Disabled"}
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">
                    Threshold: {selectedChannel.compressor.threshold}dB
                  </Label>
                  <input
                    type="range"
                    min={-60}
                    max={0}
                    step={1}
                    value={selectedChannel.compressor.threshold}
                    onChange={(e) =>
                      updateChannel(selectedChannel.id, {
                        compressor: {
                          ...selectedChannel.compressor,
                          threshold: parseFloat(e.target.value),
                        },
                      })
                    }
                    className="w-full h-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Ratio: {selectedChannel.compressor.ratio}:1</Label>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={0.5}
                    value={selectedChannel.compressor.ratio}
                    onChange={(e) =>
                      updateChannel(selectedChannel.id, {
                        compressor: {
                          ...selectedChannel.compressor,
                          ratio: parseFloat(e.target.value),
                        },
                      })
                    }
                    className="w-full h-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Attack: {selectedChannel.compressor.attack}ms</Label>
                  <input
                    type="range"
                    min={0.1}
                    max={100}
                    step={0.1}
                    value={selectedChannel.compressor.attack}
                    onChange={(e) =>
                      updateChannel(selectedChannel.id, {
                        compressor: {
                          ...selectedChannel.compressor,
                          attack: parseFloat(e.target.value),
                        },
                      })
                    }
                    className="w-full h-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Release: {selectedChannel.compressor.release}ms</Label>
                  <input
                    type="range"
                    min={10}
                    max={1000}
                    step={10}
                    value={selectedChannel.compressor.release}
                    onChange={(e) =>
                      updateChannel(selectedChannel.id, {
                        compressor: {
                          ...selectedChannel.compressor,
                          release: parseFloat(e.target.value),
                        },
                      })
                    }
                    className="w-full h-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Knee: {selectedChannel.compressor.knee}dB</Label>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={1}
                    value={selectedChannel.compressor.knee}
                    onChange={(e) =>
                      updateChannel(selectedChannel.id, {
                        compressor: {
                          ...selectedChannel.compressor,
                          knee: parseFloat(e.target.value),
                        },
                      })
                    }
                    className="w-full h-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    Makeup: +{selectedChannel.compressor.makeupGain}dB
                  </Label>
                  <input
                    type="range"
                    min={0}
                    max={24}
                    step={0.5}
                    value={selectedChannel.compressor.makeupGain}
                    onChange={(e) =>
                      updateChannel(selectedChannel.id, {
                        compressor: {
                          ...selectedChannel.compressor,
                          makeupGain: parseFloat(e.target.value),
                        },
                      })
                    }
                    className="w-full h-1"
                  />
                </div>
              </div>
            </div>

            {/* Gate */}
            <div className="mb-4 border-t border-border pt-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold">Noise Gate</h4>
                <Button
                  variant={selectedChannel.gate.enabled ? "secondary" : "outline"}
                  size="sm"
                  onClick={() =>
                    updateChannel(selectedChannel.id, {
                      gate: { ...selectedChannel.gate, enabled: !selectedChannel.gate.enabled },
                    })
                  }
                >
                  {selectedChannel.gate.enabled ? "Enabled" : "Disabled"}
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Threshold: {selectedChannel.gate.threshold}dB</Label>
                  <input
                    type="range"
                    min={-80}
                    max={0}
                    step={1}
                    value={selectedChannel.gate.threshold}
                    onChange={(e) =>
                      updateChannel(selectedChannel.id, {
                        gate: { ...selectedChannel.gate, threshold: parseFloat(e.target.value) },
                      })
                    }
                    className="w-full h-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Attack: {selectedChannel.gate.attack}ms</Label>
                  <input
                    type="range"
                    min={0.1}
                    max={100}
                    step={0.1}
                    value={selectedChannel.gate.attack}
                    onChange={(e) =>
                      updateChannel(selectedChannel.id, {
                        gate: { ...selectedChannel.gate, attack: parseFloat(e.target.value) },
                      })
                    }
                    className="w-full h-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Hold: {selectedChannel.gate.hold}ms</Label>
                  <input
                    type="range"
                    min={0}
                    max={500}
                    step={10}
                    value={selectedChannel.gate.hold}
                    onChange={(e) =>
                      updateChannel(selectedChannel.id, {
                        gate: { ...selectedChannel.gate, hold: parseFloat(e.target.value) },
                      })
                    }
                    className="w-full h-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Release: {selectedChannel.gate.release}ms</Label>
                  <input
                    type="range"
                    min={10}
                    max={1000}
                    step={10}
                    value={selectedChannel.gate.release}
                    onChange={(e) =>
                      updateChannel(selectedChannel.id, {
                        gate: { ...selectedChannel.gate, release: parseFloat(e.target.value) },
                      })
                    }
                    className="w-full h-1"
                  />
                </div>
              </div>
            </div>

            {/* Other settings */}
            <div className="border-t border-border pt-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">
                    Input Gain: {selectedChannel.inputGain.toFixed(2)}
                  </Label>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={selectedChannel.inputGain}
                    onChange={(e) =>
                      updateChannel(selectedChannel.id, { inputGain: parseFloat(e.target.value) })
                    }
                    className="w-full h-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    Stereo Width: {selectedChannel.stereoWidth.toFixed(1)}
                  </Label>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={selectedChannel.stereoWidth}
                    onChange={(e) =>
                      updateChannel(selectedChannel.id, { stereoWidth: parseFloat(e.target.value) })
                    }
                    className="w-full h-1"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    variant={selectedChannel.phaseInvert ? "secondary" : "outline"}
                    size="sm"
                    onClick={() =>
                      updateChannel(selectedChannel.id, {
                        phaseInvert: !selectedChannel.phaseInvert,
                      })
                    }
                  >
                    {selectedChannel.phaseInvert ? "Phase: Inverted" : "Phase: Normal"}
                  </Button>
                </div>
                <div className="flex items-end">
                  <Button
                    variant={selectedChannel.armed ? "secondary" : "outline"}
                    size="sm"
                    onClick={() =>
                      updateChannel(selectedChannel.id, { armed: !selectedChannel.armed })
                    }
                  >
                    {selectedChannel.armed ? "Armed" : "Not Armed"}
                  </Button>
                </div>
              </div>
            </div>
          </ProCard>
        )}

        {/* Master Settings */}
        <ProCard
          title="Master Chain"
          description="Master EQ, compressor, limiter, and stereo width"
          icon={<Volume className="w-4 h-4" />}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">
                Master Volume: {formatDb(gainToDb(state.master.volume))}
              </Label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={state.master.volume}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    master: { ...s.master, volume: parseFloat(e.target.value) },
                  }))
                }
                className="w-full h-1"
              />
            </div>
            <div>
              <Label className="text-xs">Stereo Width: {state.master.stereoWidth.toFixed(1)}</Label>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={state.master.stereoWidth}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    master: { ...s.master, stereoWidth: parseFloat(e.target.value) },
                  }))
                }
                className="w-full h-1"
              />
            </div>
            <div>
              <Label className="text-xs">Limiter Ceiling: {state.master.limiter.ceiling}dB</Label>
              <input
                type="range"
                min={-6}
                max={0}
                step={0.1}
                value={state.master.limiter.ceiling}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    master: {
                      ...s.master,
                      limiter: { ...s.master.limiter, ceiling: parseFloat(e.target.value) },
                    },
                  }))
                }
                className="w-full h-1"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant={state.master.limiter.enabled ? "secondary" : "outline"}
                size="sm"
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    master: {
                      ...s.master,
                      limiter: { ...s.master.limiter, enabled: !s.master.limiter.enabled },
                    },
                  }))
                }
              >
                {state.master.limiter.enabled ? "Limiter: ON" : "Limiter: OFF"}
              </Button>
              <Button
                variant={state.master.compressor.enabled ? "secondary" : "outline"}
                size="sm"
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    master: {
                      ...s.master,
                      compressor: { ...s.master.compressor, enabled: !s.master.compressor.enabled },
                    },
                  }))
                }
              >
                {state.master.compressor.enabled ? "Comp: ON" : "Comp: OFF"}
              </Button>
            </div>
          </div>
        </ProCard>

        {/* Stats */}
        <KpiGrid
          tiles={[
            {
              label: "Channels",
              value: state.channels.length,
              icon: <Layers className="w-4 h-4" />,
              accent: "primary",
            },
            {
              label: "Buses",
              value: state.buses.length,
              icon: <Layers className="w-4 h-4" />,
              accent: "neutral",
            },
            {
              label: "Master Vol",
              value: formatDb(gainToDb(state.master.volume)),
              icon: <Volume className="w-4 h-4" />,
              accent: "bull",
            },
            {
              label: "Limiter",
              value: state.master.limiter.enabled ? "ON" : "OFF",
              icon: <Zap className="w-4 h-4" />,
              accent: state.master.limiter.enabled ? "warning" : "neutral",
            },
          ]}
        />
      </div>
    </AppShell>
  );
}
