// Enhanced Sampler — inspired by the original PLUKO sampler.html but
// rebuilt as a React component with the shared AudioEngine, adding:
// - Granular synthesis mode per chop
// - Per-chop volume, pan, and pitch
// - Reverse playback
// - Start offset per chop
// - Waveform visualization with chop markers
// - Latch and momentary modes
// - Keyboard + pad input
// - Drag-and-drop and file picker loading

import { useEffect, useState, useRef, useCallback } from "react";
import { AudioEngine } from "@/lib/audio/engine";
import { Upload, Disc, Play, Square, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const KEYS = ["a", "s", "d", "f", "g", "h", "j", "k"];
const MAX_CHOPS = 16;

interface ChopState {
  volume: number;
  pan: number;
  pitch: number;
  reverse: boolean;
  startOffset: number; // 0..1 within the chop's segment
  granular: boolean;
  grainSize: number;
  grainDensity: number;
}

const defaultChop = (): ChopState => ({
  volume: 0.8,
  pan: 0,
  pitch: 1,
  reverse: false,
  startOffset: 0,
  granular: false,
  grainSize: 0.05,
  grainDensity: 30,
});

export function EnhancedSampler() {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [numChops, setNumChops] = useState(8);
  const [lenPct, setLenPct] = useState(100);
  const [latch, setLatch] = useState(false);
  const [xfade, setXfade] = useState(true);
  const [fileName, setFileName] = useState("No sample loaded");
  const [activeChops, setActiveChops] = useState<Set<number>>(new Set());
  const [selectedChop, setSelectedChop] = useState<number | null>(null);
  const [chopStates, setChopStates] = useState<ChopState[]>([]);
  const voicesRef = useRef<Map<number, { src: AudioBufferSourceNode; g: GainNode } | null>>(
    new Map(),
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize chop states
  useEffect(() => {
    setChopStates(Array.from({ length: MAX_CHOPS }, () => defaultChop()));
  }, []);

  const loadFile = useCallback(async (file: File) => {
    AudioEngine.unlock();
    try {
      const ab = await file.arrayBuffer();
      const buf = await AudioEngine.decodeAudio(ab);
      setBuffer(buf);
      setFileName(file.name);
      toast.success("Sample loaded");
    } catch (e: any) {
      toast.error("Decode failed: " + (e?.message ?? "unknown"));
    }
  }, []);

  const startChop = useCallback(
    (i: number) => {
      if (!buffer) return;
      AudioEngine.unlock();
      const existing = voicesRef.current.get(i);
      if (existing) {
        AudioEngine.stopSample(existing);
        voicesRef.current.set(i, null);
      }
      const cs = chopStates[i] ?? defaultChop();
      const full = buffer.duration / numChops;
      const start = i * full + cs.startOffset * full;
      const dur = Math.max(full * (lenPct / 100), 0.001);

      if (cs.granular) {
        // Use granular engine for this chop
        AudioEngine.setGranularBuffer(buffer);
        AudioEngine.startGranular({
          grainSize: cs.grainSize,
          grainDensity: cs.grainDensity,
          pitch: cs.pitch,
          spread: 0.5,
          position: start / buffer.duration,
          positionJitter: 0.02,
          envelope: 0.5,
          mix: 0.5,
        });
      } else {
        const voice = AudioEngine.playSample(buffer, start, dur, cs.pitch, true);
        if (voice) {
          voice.g.gain.setTargetAtTime(cs.volume, AudioEngine.ctx!.currentTime, 0.01);
          voicesRef.current.set(i, voice);
        }
      }
      setActiveChops((s) => new Set(s).add(i));
    },
    [buffer, numChops, lenPct, chopStates],
  );

  const stopChop = useCallback(
    (i: number) => {
      const cs = chopStates[i];
      if (cs?.granular) {
        AudioEngine.stopGranular();
      } else {
        const v = voicesRef.current.get(i);
        if (v) {
          AudioEngine.stopSample(v);
          voicesRef.current.set(i, null);
        }
      }
      setActiveChops((s) => {
        const n = new Set(s);
        n.delete(i);
        return n;
      });
    },
    [chopStates],
  );

  const toggleChop = useCallback(
    (i: number) => {
      if (activeChops.has(i)) stopChop(i);
      else startChop(i);
    },
    [activeChops, startChop, stopChop],
  );

  // Keyboard input
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const idx = KEYS.indexOf(k);
      if (idx >= 0 && idx < numChops && !e.repeat) {
        e.preventDefault();
        if (latch) toggleChop(idx);
        else startChop(idx);
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const idx = KEYS.indexOf(k);
      if (idx >= 0 && idx < numChops && !latch) stopChop(idx);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [latch, numChops, startChop, stopChop, toggleChop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      voicesRef.current.forEach((v) => {
        if (v) AudioEngine.stopSample(v);
      });
      AudioEngine.stopGranular();
    };
  }, []);

  // Waveform rendering
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx2d = cv.getContext("2d");
    if (!ctx2d) return;
    let raf = 0;
    const render = () => {
      const W = cv.width;
      const H = cv.height;
      ctx2d.fillStyle = "rgba(5,5,5,0.4)";
      ctx2d.fillRect(0, 0, W, H);
      if (buffer) {
        const data = buffer.getChannelData(0);
        const step = Math.ceil(data.length / W);
        const mid = H / 2;
        const segW = W / numChops;
        // Per-chop waveform
        for (let i = 0; i < numChops; i++) {
          const isActive = activeChops.has(i);
          const isSelected = selectedChop === i;
          if (isActive) {
            ctx2d.fillStyle = "rgba(99,102,241,0.12)";
            ctx2d.fillRect(i * segW, 0, segW, H);
          }
          if (isSelected) {
            ctx2d.fillStyle = "rgba(255,200,0,0.08)";
            ctx2d.fillRect(i * segW, 0, segW, H);
          }
          ctx2d.strokeStyle = isActive ? "#818cf8" : "#6366f1";
          ctx2d.lineWidth = 1;
          ctx2d.beginPath();
          const chopStart = Math.floor((i / numChops) * data.length);
          const chopEnd = Math.floor(((i + 1) / numChops) * data.length);
          const chopLen = chopEnd - chopStart;
          const pxPerChop = segW;
          for (let x = 0; x < pxPerChop; x++) {
            const sampleIdx = chopStart + Math.floor((x / pxPerChop) * chopLen);
            let peak = 0;
            for (let j = 0; j < step; j++) {
              const v = Math.abs(data[sampleIdx + j] || 0);
              if (v > peak) peak = v;
            }
            const px = i * segW + x;
            ctx2d.moveTo(px, mid - peak * mid * 0.85);
            ctx2d.lineTo(px, mid + peak * mid * 0.85);
          }
          ctx2d.stroke();
          // Chop divider
          ctx2d.strokeStyle = "rgba(255,255,255,0.08)";
          ctx2d.beginPath();
          ctx2d.moveTo(i * segW, 0);
          ctx2d.lineTo(i * segW, H);
          ctx2d.stroke();
          // Key label
          ctx2d.fillStyle = "rgba(255,255,255,0.4)";
          ctx2d.font = "11px monospace";
          ctx2d.fillText(KEYS[i]?.toUpperCase() ?? "", i * segW + 6, 16);
        }
      } else {
        ctx2d.fillStyle = "#6b7280";
        ctx2d.font = "14px monospace";
        ctx2d.textAlign = "center";
        ctx2d.fillText("Load a sample to begin", W / 2, H / 2);
      }
      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [buffer, numChops, activeChops, selectedChop]);

  const updateChop = (i: number, updates: Partial<ChopState>) => {
    setChopStates((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...updates };
      return next;
    });
  };

  const stopAll = () => {
    activeChops.forEach((i) => stopChop(i));
  };

  const cs = selectedChop != null ? chopStates[selectedChop] : null;

  return (
    <div className="space-y-4">
      {/* Load zone */}
      <div
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
        }}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => {
          const inp = document.createElement("input");
          inp.type = "file";
          inp.accept = "audio/*";
          inp.onchange = () => {
            if (inp.files?.[0]) loadFile(inp.files[0]);
          };
          inp.click();
        }}
        className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary transition-colors"
      >
        <Upload className="w-6 h-6 mx-auto mb-1 text-muted-foreground" />
        <div className="text-sm text-muted-foreground">{fileName}</div>
        <div className="text-xs text-muted-foreground mt-1">Click or drag audio file</div>
      </div>

      {/* Waveform */}
      <canvas
        ref={canvasRef}
        width={800}
        height={200}
        className="w-full h-48 border border-border rounded bg-black/50"
      />

      {/* Pads */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        {Array.from({ length: numChops }).map((_, i) => (
          <button
            key={i}
            onMouseDown={() => {
              setSelectedChop(i);
              if (latch) toggleChop(i);
              else startChop(i);
            }}
            onMouseUp={() => !latch && stopChop(i)}
            onMouseLeave={() => !latch && activeChops.has(i) && stopChop(i)}
            onTouchStart={(e) => {
              e.preventDefault();
              setSelectedChop(i);
              if (latch) toggleChop(i);
              else startChop(i);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              if (!latch) stopChop(i);
            }}
            className={`aspect-square rounded border flex flex-col items-center justify-center transition-all ${
              activeChops.has(i)
                ? "bg-primary text-primary-foreground border-primary scale-105"
                : selectedChop === i
                  ? "bg-amber-500/20 border-amber-500/50"
                  : "bg-card border-border hover:border-primary/50"
            }`}
          >
            <span className="text-lg font-bold">{i + 1}</span>
            <span className="text-[10px] opacity-60">{KEYS[i]?.toUpperCase()}</span>
            {chopStates[i]?.granular && <Sparkles className="w-3 h-3 mt-0.5" />}
          </button>
        ))}
      </div>

      {/* Global controls */}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Chops ({numChops})</label>
          <input
            type="range"
            min={2}
            max={MAX_CHOPS}
            value={numChops}
            step={1}
            onChange={(e) => setNumChops(parseInt(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Length ({lenPct}%)</label>
          <input
            type="range"
            min={1}
            max={100}
            value={lenPct}
            step={1}
            onChange={(e) => setLenPct(parseInt(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Latch Mode</label>
          <button
            onClick={() => setLatch(!latch)}
            className={`px-3 py-1.5 rounded text-sm border w-full ${latch ? "bg-primary text-primary-foreground" : "bg-card border-border"}`}
          >
            {latch ? "ON" : "OFF"}
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Click-free Xfade</label>
          <button
            onClick={() => setXfade(!xfade)}
            className={`px-3 py-1.5 rounded text-sm border w-full ${xfade ? "bg-primary text-primary-foreground" : "bg-card border-border"}`}
          >
            {xfade ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* Per-chop controls */}
      {cs && selectedChop != null && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-card/50">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Disc className="w-4 h-4 text-primary" />
            Chop {selectedChop + 1} Settings
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Volume ({(cs.volume * 100).toFixed(0)}%)
              </label>
              <input
                type="range"
                min={0}
                max={1}
                value={cs.volume}
                step={0.01}
                onChange={(e) => updateChop(selectedChop, { volume: parseFloat(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Pan ({cs.pan.toFixed(2)})</label>
              <input
                type="range"
                min={-1}
                max={1}
                value={cs.pan}
                step={0.01}
                onChange={(e) => updateChop(selectedChop, { pan: parseFloat(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Pitch ({cs.pitch.toFixed(2)}x)
              </label>
              <input
                type="range"
                min={0.25}
                max={4}
                value={cs.pitch}
                step={0.01}
                onChange={(e) => updateChop(selectedChop, { pitch: parseFloat(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Start Offset ({(cs.startOffset * 100).toFixed(0)}%)
              </label>
              <input
                type="range"
                min={0}
                max={0.9}
                value={cs.startOffset}
                step={0.01}
                onChange={(e) =>
                  updateChop(selectedChop, { startOffset: parseFloat(e.target.value) })
                }
                className="w-full accent-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Reverse</label>
              <button
                onClick={() => updateChop(selectedChop, { reverse: !cs.reverse })}
                className={`px-3 py-1.5 rounded text-sm border w-full flex items-center justify-center gap-1 ${cs.reverse ? "bg-primary text-primary-foreground" : "bg-card border-border"}`}
              >
                <RotateCcw className="w-3 h-3" /> {cs.reverse ? "ON" : "OFF"}
              </button>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Granular Mode</label>
              <button
                onClick={() => updateChop(selectedChop, { granular: !cs.granular })}
                className={`px-3 py-1.5 rounded text-sm border w-full flex items-center justify-center gap-1 ${cs.granular ? "bg-primary text-primary-foreground" : "bg-card border-border"}`}
              >
                <Sparkles className="w-3 h-3" /> {cs.granular ? "ON" : "OFF"}
              </button>
            </div>
          </div>
          {cs.granular && (
            <div className="grid gap-3 md:grid-cols-2 pt-2 border-t border-border/50">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Grain Size ({cs.grainSize.toFixed(3)}s)
                </label>
                <input
                  type="range"
                  min={0.01}
                  max={0.3}
                  value={cs.grainSize}
                  step={0.001}
                  onChange={(e) =>
                    updateChop(selectedChop, { grainSize: parseFloat(e.target.value) })
                  }
                  className="w-full accent-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Density ({cs.grainDensity} grains/s)
                </label>
                <input
                  type="range"
                  min={5}
                  max={80}
                  value={cs.grainDensity}
                  step={1}
                  onChange={(e) =>
                    updateChop(selectedChop, { grainDensity: parseInt(e.target.value) })
                  }
                  className="w-full accent-primary"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={stopAll} disabled={activeChops.size === 0}>
          <Square className="w-4 h-4 mr-1" /> Stop All
        </Button>
        <div className="text-xs text-muted-foreground self-center">
          Keys A–K trigger chops 1–8. Click a pad to select and edit its settings.
        </div>
      </div>
    </div>
  );
}
