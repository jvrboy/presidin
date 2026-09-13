import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { ProCard, SectionHeader, MeterBar, StatTile, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Piano as PianoIcon,
  Play,
  Square,
  Plus,
  Copy,
  Trash,
  Scissors,
  Volume,
  Music,
  Sliders,
  Zap,
  Grid,
  ArrowUpDown,
  ZoomIn,
  ZoomOut,
  Magnet,
  Shuffle,
  ArrowRight,
  Layers,
  Lock,
  Unlock,
} from "lucide-react";
import {
  createDefaultPianoRoll,
  createNote,
  createSlide,
  generateNoteId,
  addNote,
  removeNotes,
  updateNote,
  selectNote,
  moveNotes,
  resizeNote,
  transposeNotes,
  changeVelocity,
  changePan,
  changeGain,
  duplicateNotes,
  copyNotes,
  pasteNotes,
  quantizeNotes,
  selectAll,
  deselectAll,
  addSlideToNote,
  removeSlideFromNote,
  updateSlide,
  evaluateNotePitch,
  evaluateSlide,
  interpolateCurve,
  midiToNoteName,
  isInScale,
  getScaleNotes,
  SNAP_VALUES,
  type PianoRollState,
  type PianoNote,
  type NoteSlide,
  type SlideCurve,
  type SnapMode,
} from "@lib/audio/piano-roll";
import { AudioEngine } from "@lib/audio/engine";

export const Route = createFileRoute("/piano-roll")({
  head: () => ({
    meta: [
      { title: "Piano Roll — DivergenceIQ" },
      {
        name: "description",
        content:
          "Advanced piano roll with per-note pitch, length, velocity, pan, ultra-advanced infinite slide system, scale highlighting, quantize, and infinite zoom.",
      },
    ],
  }),
  component: PianoRollPage,
});

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CURVE_TYPES: SlideCurve[] = [
  "linear",
  "exponential",
  "logarithmic",
  "sine",
  "scurve",
  "bounce",
  "elastic",
  "step",
  "custom",
];
const SCALES = [
  "major",
  "minor",
  "pentatonic",
  "blues",
  "chromatic",
  "dorian",
  "mixolydian",
  "lydian",
  "phrygian",
  "locrian",
  "harmonic_minor",
  "melodic_minor",
];
const SNAP_MODES: SnapMode[] = ["off", "1/1", "1/2", "1/4", "1/8", "1/16", "1/32", "1/64", "1/128"];

function PianoRollPage() {
  const [state, setState] = useState<PianoRollState>(createDefaultPianoRoll());
  const [playing, setPlaying] = useState(false);
  const [clipboard, setClipboard] = useState<PianoNote[]>([]);
  const [selectedSlide, setSelectedSlide] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState<"move" | "resize" | "create" | null>(null);
  const [dragStart, setDragStart] = useState<{
    x: number;
    y: number;
    tick: number;
    midi: number;
  } | null>(null);
  const [editingSlideForNote, setEditingSlideForNote] = useState<string | null>(null);
  const [scaleLock, setScaleLock] = useState(false);
  const [showScaleGuides, setShowScaleGuides] = useState(true);
  const [highlightRoot, setHighlightRoot] = useState(true);
  const [velocityMode, setVelocityMode] = useState(false);
  const [gridSubdivision, setGridSubdivision] = useState(4);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);

  const pixelsPerTick = state.pixelsPerTick * canvasZoom;
  const pixelsPerSemitone = state.pixelsPerSemitone;
  const totalWidth = state.totalTicks * pixelsPerTick;
  const totalHeight = 128 * pixelsPerSemitone;
  const keyWidth = 60;

  const zoomIn = useCallback(() => setCanvasZoom((z) => z * 1.5), []);
  const zoomOut = useCallback(() => setCanvasZoom((z) => z / 1.5), []);
  const zoomReset = useCallback(() => setCanvasZoom(1), []);
  const zoomToFill = useCallback(() => {
    const container = canvasRef.current?.parentElement;
    if (!container) return;
    const availW = container.clientWidth - keyWidth - 20;
    setCanvasZoom(availW / (state.totalTicks * state.pixelsPerTick));
  }, [state.totalTicks, state.pixelsPerTick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = totalWidth + keyWidth;
    canvas.height = totalHeight;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, keyWidth, totalHeight);

    for (let midi = 0; midi < 128; midi++) {
      const y = (127 - midi) * pixelsPerSemitone;
      const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
      const inScale = isInScale(midi, state.key, state.scale);
      const isRoot = midi % 12 === NOTE_NAMES.indexOf(state.key);

      if (isBlack) {
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(keyWidth, y, totalWidth, pixelsPerSemitone);
      }

      if (showScaleGuides && inScale) {
        ctx.fillStyle =
          isRoot && highlightRoot ? "rgba(245, 158, 11, 0.12)" : "rgba(59, 130, 246, 0.06)";
        ctx.fillRect(keyWidth, y, totalWidth, pixelsPerSemitone);
      }

      if (midi % 12 === 0) {
        ctx.fillStyle = "#333";
        ctx.fillRect(0, y, keyWidth, pixelsPerSemitone);
        ctx.fillStyle = "#888";
        ctx.font = "9px monospace";
        ctx.fillText(midiToNoteName(midi), 4, y + pixelsPerSemitone - 2);
      } else if (isBlack) {
        ctx.fillStyle = "#222";
        ctx.fillRect(0, y, keyWidth, pixelsPerSemitone);
      } else {
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(0, y, keyWidth, pixelsPerSemitone);
      }

      ctx.strokeStyle = "#222";
      ctx.beginPath();
      ctx.moveTo(keyWidth, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    const ticksPerBar = state.ticksPerBeat * state.beatsPerBar;
    const subTicks = state.ticksPerBeat / gridSubdivision;
    for (let tick = 0; tick < state.totalTicks; tick += subTicks) {
      const x = keyWidth + tick * pixelsPerTick;
      const isBar = tick % ticksPerBar === 0;
      const isBeat = tick % state.ticksPerBeat === 0;
      if (isBar) {
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 1.5;
      } else if (isBeat) {
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1;
      } else {
        ctx.strokeStyle = "#1a1a1a";
        ctx.lineWidth = 0.5;
      }
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, totalHeight);
      ctx.stroke();
    }

    for (const note of state.notes) {
      const x = keyWidth + note.startTick * pixelsPerTick;
      const y = (127 - note.midi) * pixelsPerSemitone;
      const w = Math.max(4, note.duration * pixelsPerTick);
      const h = pixelsPerSemitone - 1;
      const isSelected = state.selectedNoteIds.includes(note.id);
      const inScale = isInScale(note.midi, state.key, state.scale);

      const alpha = note.mute ? 0.3 : 1.0;
      if (isSelected) {
        ctx.fillStyle = "#f59e0b";
      } else if (inScale) {
        ctx.fillStyle = `rgba(59, 130, 246, ${alpha})`;
      } else if (scaleLock) {
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha * 0.5})`;
      } else {
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha * 0.7})`;
      }
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = isSelected ? "#fbbf24" : "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);

      const velHeight = (note.velocity / 127) * h;
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(x, y + h - velHeight, w, velHeight);

      if (note.slides.length > 0) {
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 2;
        for (const slide of note.slides) {
          if (!slide.enabled) continue;
          const slideStartX = x + slide.startTick * pixelsPerTick;
          const slideEndX = x + slide.endTick * pixelsPerTick;
          const startY = (127 - slide.startPitch) * pixelsPerSemitone + h / 2;
          const endY = (127 - slide.endPitch) * pixelsPerSemitone + h / 2;
          ctx.beginPath();
          ctx.moveTo(slideStartX, startY);
          for (let t = slide.startTick; t <= slide.endTick; t += 5) {
            const pitch = evaluateSlide(slide, t);
            const px = x + t * pixelsPerTick;
            const py = (127 - pitch) * pixelsPerSemitone + h / 2;
            ctx.lineTo(px, py);
          }
          ctx.stroke();

          if (slide.infinite) {
            ctx.fillStyle = "#10b981";
            ctx.beginPath();
            ctx.moveTo(slideEndX, endY);
            ctx.lineTo(slideEndX + 8, endY - 4);
            ctx.lineTo(slideEndX + 8, endY + 4);
            ctx.fill();
          }
        }
      }

      if (w > 30) {
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "9px monospace";
        ctx.fillText(midiToNoteName(note.midi), x + 3, y + 10);
      }
    }

    if (playing) {
      const phx = keyWidth + playheadRef.current * pixelsPerTick;
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(phx, 0);
      ctx.lineTo(phx, totalHeight);
      ctx.stroke();
    }
  }, [
    state,
    playing,
    totalWidth,
    totalHeight,
    pixelsPerTick,
    pixelsPerSemitone,
    showScaleGuides,
    highlightRoot,
    gridSubdivision,
    scaleLock,
    canvasZoom,
  ]);

  useEffect(() => {
    if (!playing) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }
    AudioEngine.init();
    AudioEngine.resume();
    const startTime = performance.now();
    const ticksPerMs = (120 * state.ticksPerBeat) / 60000;
    const activeNotes = new Set<string>();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const playhead = elapsed * ticksPerMs;
      playheadRef.current = playhead;

      if (playhead >= state.totalTicks) {
        setPlaying(false);
        activeNotes.forEach((id) => AudioEngine.noteOff(`proll-${id}`));
        activeNotes.clear();
        return;
      }

      for (const note of state.notes) {
        if (note.mute) continue;
        const noteStart = note.startTick;
        const noteEnd = note.startTick + note.duration;
        if (playhead >= noteStart && playhead < noteEnd && !activeNotes.has(note.id)) {
          const pitch = evaluateNotePitch(note, playhead);
          const freq = 440 * Math.pow(2, (pitch - 69) / 12);
          AudioEngine.noteOn(`proll-${note.id}`, freq, {
            waveform: "sawtooth",
            attack: 0.01,
            decay: 0.1,
            sustain: 0.8,
            release: 0.2,
            detune: 0,
            gain: (note.velocity / 127) * note.gain * 0.4,
          });
          activeNotes.add(note.id);
        }
        if (playhead >= noteEnd && activeNotes.has(note.id)) {
          AudioEngine.noteOff(`proll-${note.id}`);
          activeNotes.delete(note.id);
        }
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      activeNotes.forEach((id) => AudioEngine.noteOff(`proll-${id}`));
    };
  }, [playing, state.notes, state.totalTicks, state.ticksPerBeat]);

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < keyWidth) return;

      const tick = (x - keyWidth) / pixelsPerTick;
      let midi = 127 - Math.floor(y / pixelsPerSemitone);
      if (scaleLock && !isInScale(midi, state.key, state.scale)) {
        const scaleNotes = getScaleNotes(state.key, state.scale, 11);
        const nearest = scaleNotes.reduce((prev, curr) =>
          Math.abs(curr - midi) < Math.abs(prev - midi) ? curr : prev,
        );
        midi = nearest;
      }

      const clickedNote = state.notes.find((n) => {
        const nx = keyWidth + n.startTick * pixelsPerTick;
        const ny = (127 - n.midi) * pixelsPerSemitone;
        const nw = n.duration * pixelsPerTick;
        return x >= nx && x <= nx + nw && y >= ny && y <= ny + pixelsPerSemitone;
      });

      if (clickedNote) {
        if (e.shiftKey) {
          setState((s) => selectNote(s, clickedNote.id, true));
        } else {
          setState((s) => selectNote(s, clickedNote.id, false));
        }
        setDragMode(e.altKey ? "resize" : "move");
        setDragStart({ x, y, tick, midi });
      } else {
        const snappedTick =
          Math.round(tick / SNAP_VALUES[state.snapMode]) * SNAP_VALUES[state.snapMode];
        const newNote = createNote(
          midi,
          snappedTick,
          SNAP_VALUES[state.snapMode],
          100,
          0,
          state.currentChannel,
        );
        setState((s) => addNote(s, newNote));
        setState((s) => selectNote(s, newNote.id, false));
        setDragMode("resize");
        setDragStart({ x, y, tick: snappedTick, midi });
      }
    },
    [
      state.notes,
      state.snapMode,
      pixelsPerTick,
      pixelsPerSemitone,
      scaleLock,
      state.key,
      state.scale,
      state.currentChannel,
    ],
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!dragMode || !dragStart) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const deltaTick =
        Math.round((x - dragStart.x) / pixelsPerTick / SNAP_VALUES[state.snapMode]) *
        SNAP_VALUES[state.snapMode];
      const deltaMidi = Math.floor((dragStart.y - y) / pixelsPerSemitone);

      if (dragMode === "move" && state.selectedNoteIds.length > 0) {
        setState((s) => moveNotes(s, s.selectedNoteIds, deltaTick, deltaMidi));
        setDragStart({ ...dragStart, x, y });
      } else if (dragMode === "resize" && state.selectedNoteIds.length === 1) {
        const noteId = state.selectedNoteIds[0];
        const note = state.notes.find((n) => n.id === noteId);
        if (note) {
          const newDur = Math.max(
            SNAP_VALUES[state.snapMode],
            Math.round(
              ((x - keyWidth) / pixelsPerTick - note.startTick) / SNAP_VALUES[state.snapMode],
            ) * SNAP_VALUES[state.snapMode],
          );
          setState((s) => resizeNote(s, noteId, newDur));
        }
      }
    },
    [
      dragMode,
      dragStart,
      state.selectedNoteIds,
      state.notes,
      state.snapMode,
      pixelsPerTick,
      pixelsPerSemitone,
    ],
  );

  const handleCanvasMouseUp = useCallback(() => {
    setDragMode(null);
    setDragStart(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setCanvasZoom((z) => Math.max(0.01, z * factor));
    }
  }, []);

  const humanizeVelocity = useCallback(() => {
    setState((s) => ({
      ...s,
      notes: s.notes.map((n) =>
        s.selectedNoteIds.includes(n.id)
          ? {
              ...n,
              velocity: Math.max(
                1,
                Math.min(127, Math.round(n.velocity + (Math.random() - 0.5) * 20)),
              ),
            }
          : n,
      ),
    }));
  }, [state.selectedNoteIds]);

  const strum = useCallback(() => {
    setState((s) => {
      const selected = s.notes.filter((n) => s.selectedNoteIds.includes(n.id));
      if (selected.length === 0) return s;
      selected.sort((a, b) => a.midi - b.midi);
      const stride = 60;
      return {
        ...s,
        notes: s.notes.map((n) => {
          if (!s.selectedNoteIds.includes(n.id)) return n;
          const idx = selected.findIndex((x) => x.id === n.id);
          return { ...n, startTick: n.startTick + idx * stride };
        }),
      };
    });
  }, [state.selectedNoteIds]);

  const arpeggiate = useCallback(() => {
    setState((s) => {
      const selected = s.notes.filter((n) => s.selectedNoteIds.includes(n.id));
      if (selected.length === 0) return s;
      selected.sort((a, b) => a.midi - b.midi);
      const stride = 120;
      return {
        ...s,
        notes: s.notes.map((n) => {
          if (!s.selectedNoteIds.includes(n.id)) return n;
          const idx = selected.findIndex((x) => x.id === n.id);
          return { ...n, startTick: n.startTick + idx * stride, duration: stride };
        }),
      };
    });
  }, [state.selectedNoteIds]);

  const legato = useCallback(() => {
    setState((s) => {
      const selected = s.notes
        .filter((n) => s.selectedNoteIds.includes(n.id))
        .sort((a, b) => a.startTick - b.startTick);
      if (selected.length < 2) return s;
      const updates = new Map<string, number>();
      for (let i = 0; i < selected.length - 1; i++) {
        const next = selected[i + 1];
        const newDur = next.startTick - selected[i].startTick;
        updates.set(selected[i].id, newDur);
      }
      return {
        ...s,
        notes: s.notes.map((n) => (updates.has(n.id) ? { ...n, duration: updates.get(n.id)! } : n)),
      };
    });
  }, [state.selectedNoteIds]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (state.selectedNoteIds.length > 0) setState((s) => removeNotes(s, s.selectedNoteIds));
      } else if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        setState((s) => selectAll(s));
      } else if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        if (state.selectedNoteIds.length > 0) setState((s) => duplicateNotes(s, s.selectedNoteIds));
      } else if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        if (state.selectedNoteIds.length > 0) setClipboard(copyNotes(state, state.selectedNoteIds));
      } else if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (clipboard.length > 0) setState((s) => pasteNotes(s, clipboard, 480));
      } else if (e.key === "ArrowUp") {
        if (state.selectedNoteIds.length > 0)
          setState((s) => transposeNotes(s, s.selectedNoteIds, 1));
      } else if (e.key === "ArrowDown") {
        if (state.selectedNoteIds.length > 0)
          setState((s) => transposeNotes(s, s.selectedNoteIds, -1));
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "q" || e.key === "Q") {
        if (state.selectedNoteIds.length > 0)
          setState((s) => quantizeNotes(s, s.selectedNoteIds, s.snapMode));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.selectedNoteIds, state.notes, clipboard, zoomIn, zoomOut, state.snapMode]);

  const selectedNote = state.notes.find((n) => n.id === state.selectedNoteIds[0]);
  const scaleNotes = useMemo(
    () => getScaleNotes(state.key, state.scale, 5),
    [state.key, state.scale],
  );

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
        <SectionHeader
          title="Advanced Piano Roll"
          subtitle="Ultra-advanced per-note slide system with infinite glide, scale highlighting, quantize, and infinite zoom."
          icon={<PianoIcon className="w-5 h-5" />}
          action={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={zoomOut} title="Zoom out (Ctrl+-)">
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Badge variant="outline" className="font-mono">
                {(canvasZoom * 100).toFixed(0)}%
              </Badge>
              <Button variant="outline" size="sm" onClick={zoomIn} title="Zoom in (Ctrl+=)">
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={zoomReset}>
                1:1
              </Button>
              <Button variant="outline" size="sm" onClick={zoomToFill}>
                Fit
              </Button>
              <Button
                variant={playing ? "secondary" : "default"}
                onClick={() => setPlaying((p) => !p)}
                className="gap-2"
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
          }
        />

        <ProCard>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Key</Label>
              <select
                value={state.key}
                onChange={(e) => setState((s) => ({ ...s, key: e.target.value }))}
                className="bg-card border border-border rounded px-2 py-1 text-sm"
              >
                {NOTE_NAMES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Scale</Label>
              <select
                value={state.scale}
                onChange={(e) => setState((s) => ({ ...s, scale: e.target.value }))}
                className="bg-card border border-border rounded px-2 py-1 text-sm"
              >
                {SCALES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Snap</Label>
              <select
                value={state.snapMode}
                onChange={(e) => setState((s) => ({ ...s, snapMode: e.target.value as SnapMode }))}
                className="bg-card border border-border rounded px-2 py-1 text-sm"
              >
                {SNAP_MODES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Grid Sub</Label>
              <select
                value={gridSubdivision}
                onChange={(e) => setGridSubdivision(Number(e.target.value))}
                className="bg-card border border-border rounded px-2 py-1 text-sm"
              >
                {[1, 2, 3, 4, 6, 8, 12, 16].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Bars</Label>
              <Input
                type="number"
                min={1}
                max={256}
                value={state.totalBars}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setState((s) => ({
                    ...s,
                    totalBars: v,
                    totalTicks: v * s.ticksPerBeat * s.beatsPerBar,
                  }));
                }}
                className="w-16 font-mono text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Channel</Label>
              <Input
                type="number"
                min={0}
                max={15}
                value={state.currentChannel}
                onChange={(e) =>
                  setState((s) => ({ ...s, currentChannel: Number(e.target.value) }))
                }
                className="w-14 font-mono text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showScaleGuides ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowScaleGuides((v) => !v)}
                className="gap-1"
              >
                <Grid className="w-3 h-3" /> Scale Guides
              </Button>
              <Button
                variant={highlightRoot ? "secondary" : "outline"}
                size="sm"
                onClick={() => setHighlightRoot((v) => !v)}
              >
                Root
              </Button>
              <Button
                variant={scaleLock ? "secondary" : "outline"}
                size="sm"
                onClick={() => setScaleLock((v) => !v)}
                className="gap-1"
              >
                <Lock className="w-3 h-3" /> Scale Lock
              </Button>
              <Button
                variant={velocityMode ? "secondary" : "outline"}
                size="sm"
                onClick={() => setVelocityMode((v) => !v)}
                className="gap-1"
              >
                <Volume className="w-3 h-3" /> Vel Edit
              </Button>
            </div>
          </div>
        </ProCard>

        <ProCard
          title="Tools"
          description="Advanced editing tools for selected notes."
          icon={<Sliders className="w-4 h-4" />}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setState((s) => selectAll(s))}
              className="gap-1"
            >
              <Grid className="w-3 h-3" /> Select All
            </Button>
            <Button variant="outline" size="sm" onClick={() => setState((s) => deselectAll(s))}>
              Deselect
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (state.selectedNoteIds.length > 0)
                  setClipboard(copyNotes(state, state.selectedNoteIds));
              }}
              className="gap-1"
            >
              <Copy className="w-3 h-3" /> Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (clipboard.length > 0) setState((s) => pasteNotes(s, clipboard, 480));
              }}
            >
              Paste
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (state.selectedNoteIds.length > 0)
                  setState((s) => duplicateNotes(s, s.selectedNoteIds));
              }}
              className="gap-1"
            >
              <Plus className="w-3 h-3" /> Dup
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (state.selectedNoteIds.length > 0)
                  setState((s) => removeNotes(s, s.selectedNoteIds));
              }}
              className="gap-1"
            >
              <Trash className="w-3 h-3" /> Del
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (state.selectedNoteIds.length > 0)
                  setState((s) => quantizeNotes(s, s.selectedNoteIds, s.snapMode));
              }}
              className="gap-1"
            >
              <Zap className="w-3 h-3" /> Quantize (Q)
            </Button>
            <Button variant="outline" size="sm" onClick={humanizeVelocity} className="gap-1">
              <Shuffle className="w-3 h-3" /> Humanize
            </Button>
            <Button variant="outline" size="sm" onClick={strum} className="gap-1">
              <ArrowRight className="w-3 h-3" /> Strum
            </Button>
            <Button variant="outline" size="sm" onClick={arpeggiate} className="gap-1">
              <Layers className="w-3 h-3" /> Arpeggiate
            </Button>
            <Button variant="outline" size="sm" onClick={legato} className="gap-1">
              <ArrowRight className="w-3 h-3" /> Legato
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (state.selectedNoteIds.length > 0)
                  setState((s) => transposeNotes(s, s.selectedNoteIds, 12));
              }}
            >
              +Oct
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (state.selectedNoteIds.length > 0)
                  setState((s) => transposeNotes(s, s.selectedNoteIds, -12));
              }}
            >
              -Oct
            </Button>
          </div>
        </ProCard>

        <div
          className="rounded-xl border border-border bg-card overflow-auto"
          style={{ maxHeight: "600px" }}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onWheel={handleWheel}
            style={{ cursor: dragMode === "create" ? "crosshair" : "default" }}
          />
        </div>

        {selectedNote && (
          <ProCard
            title={`Note: ${midiToNoteName(selectedNote.midi)}`}
            description="Per-note properties and ultra-advanced slide system"
            icon={<Sliders className="w-4 h-4" />}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div>
                <Label className="text-xs">MIDI Note</Label>
                <Input
                  type="number"
                  min={0}
                  max={127}
                  value={selectedNote.midi}
                  onChange={(e) =>
                    setState((s) =>
                      updateNote(s, selectedNote.id, {
                        midi: Math.max(0, Math.min(127, parseInt(e.target.value))),
                      }),
                    )
                  }
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Velocity (0-127)</Label>
                <Input
                  type="number"
                  min={0}
                  max={127}
                  value={selectedNote.velocity}
                  onChange={(e) =>
                    setState((s) =>
                      changeVelocity(s, [selectedNote.id], parseFloat(e.target.value)),
                    )
                  }
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Pan (-1 to 1)</Label>
                <Input
                  type="number"
                  min={-1}
                  max={1}
                  step={0.1}
                  value={selectedNote.pan}
                  onChange={(e) =>
                    setState((s) => changePan(s, [selectedNote.id], parseFloat(e.target.value)))
                  }
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Gain (0-2)</Label>
                <Input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={selectedNote.gain}
                  onChange={(e) =>
                    setState((s) => changeGain(s, [selectedNote.id], parseFloat(e.target.value)))
                  }
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Length (ticks)</Label>
                <Input
                  type="number"
                  min={15}
                  value={selectedNote.duration}
                  onChange={(e) =>
                    setState((s) => resizeNote(s, selectedNote.id, parseInt(e.target.value)))
                  }
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Micro-tune (cents)</Label>
                <Input
                  type="number"
                  min={-100}
                  max={100}
                  step={1}
                  value={selectedNote.microTuning}
                  onChange={(e) =>
                    setState((s) =>
                      updateNote(s, selectedNote.id, { microTuning: parseFloat(e.target.value) }),
                    )
                  }
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Vibrato Depth</Label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedNote.vibrato}
                  onChange={(e) =>
                    setState((s) =>
                      updateNote(s, selectedNote.id, { vibrato: parseFloat(e.target.value) }),
                    )
                  }
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Vibrato Rate (Hz)</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  step={0.1}
                  value={selectedNote.vibratoRate}
                  onChange={(e) =>
                    setState((s) =>
                      updateNote(s, selectedNote.id, { vibratoRate: parseFloat(e.target.value) }),
                    )
                  }
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Tremolo Depth</Label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedNote.tremolo}
                  onChange={(e) =>
                    setState((s) =>
                      updateNote(s, selectedNote.id, { tremolo: parseFloat(e.target.value) }),
                    )
                  }
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Expression</Label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedNote.expression}
                  onChange={(e) =>
                    setState((s) =>
                      updateNote(s, selectedNote.id, { expression: parseFloat(e.target.value) }),
                    )
                  }
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  variant={selectedNote.mute ? "secondary" : "outline"}
                  size="sm"
                  onClick={() =>
                    setState((s) => updateNote(s, selectedNote.id, { mute: !selectedNote.mute }))
                  }
                >
                  Mute
                </Button>
                <Button
                  variant={selectedNote.solo ? "secondary" : "outline"}
                  size="sm"
                  onClick={() =>
                    setState((s) => updateNote(s, selectedNote.id, { solo: !selectedNote.solo }))
                  }
                >
                  Solo
                </Button>
                <Button
                  variant={selectedNote.locked ? "secondary" : "outline"}
                  size="sm"
                  onClick={() =>
                    setState((s) =>
                      updateNote(s, selectedNote.id, { locked: !selectedNote.locked }),
                    )
                  }
                >
                  {selectedNote.locked ? (
                    <Lock className="w-3 h-3" />
                  ) : (
                    <Unlock className="w-3 h-3" />
                  )}{" "}
                  Lock
                </Button>
              </div>
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <ArrowUpDown className="w-4 h-4" /> Per-Note Slides (Ultra-Advanced)
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const slide = createSlide(
                      0,
                      selectedNote.duration,
                      selectedNote.midi,
                      selectedNote.midi + 7,
                      "linear",
                      0,
                      false,
                      1,
                      0.01,
                    );
                    setState((s) => addSlideToNote(s, selectedNote.id, slide));
                  }}
                  className="gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Slide
                </Button>
              </div>
              {selectedNote.slides.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No slides. Add a slide to create pitch automation with curves and infinite glide.
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedNote.slides.map((slide) => (
                    <div
                      key={slide.id}
                      className="rounded-lg border border-border bg-card p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <Badge variant={slide.infinite ? "default" : "outline"} className="text-xs">
                          {slide.infinite ? "INFINITE SLIDE" : "Slide"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setState((s) => removeSlideFromNote(s, selectedNote.id, slide.id))
                          }
                          className="h-6 px-2"
                        >
                          <Trash className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div>
                          <Label className="text-xs">Start Pitch</Label>
                          <Input
                            type="number"
                            step={0.01}
                            value={slide.startPitch}
                            onChange={(e) =>
                              setState((s) =>
                                updateSlide(s, selectedNote.id, slide.id, {
                                  startPitch: parseFloat(e.target.value),
                                }),
                              )
                            }
                            className="font-mono text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">End Pitch</Label>
                          <Input
                            type="number"
                            step={0.01}
                            value={slide.endPitch}
                            onChange={(e) =>
                              setState((s) =>
                                updateSlide(s, selectedNote.id, slide.id, {
                                  endPitch: parseFloat(e.target.value),
                                }),
                              )
                            }
                            className="font-mono text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Start Tick</Label>
                          <Input
                            type="number"
                            min={0}
                            value={slide.startTick}
                            onChange={(e) =>
                              setState((s) =>
                                updateSlide(s, selectedNote.id, slide.id, {
                                  startTick: parseInt(e.target.value),
                                }),
                              )
                            }
                            className="font-mono text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">End Tick</Label>
                          <Input
                            type="number"
                            min={0}
                            value={slide.endTick}
                            onChange={(e) =>
                              setState((s) =>
                                updateSlide(s, selectedNote.id, slide.id, {
                                  endTick: parseInt(e.target.value),
                                }),
                              )
                            }
                            className="font-mono text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Curve Type</Label>
                          <select
                            value={slide.curveType}
                            onChange={(e) =>
                              setState((s) =>
                                updateSlide(s, selectedNote.id, slide.id, {
                                  curveType: e.target.value as SlideCurve,
                                }),
                              )
                            }
                            className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm"
                          >
                            {CURVE_TYPES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs">Curve Amount</Label>
                          <Input
                            type="number"
                            min={-1}
                            max={1}
                            step={0.1}
                            value={slide.curveAmount}
                            onChange={(e) =>
                              setState((s) =>
                                updateSlide(s, selectedNote.id, slide.id, {
                                  curveAmount: parseFloat(e.target.value),
                                }),
                              )
                            }
                            className="font-mono text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Infinite Rate</Label>
                          <Input
                            type="number"
                            min={0}
                            step={0.001}
                            value={slide.infiniteRate}
                            onChange={(e) =>
                              setState((s) =>
                                updateSlide(s, selectedNote.id, slide.id, {
                                  infiniteRate: parseFloat(e.target.value),
                                }),
                              )
                            }
                            className="font-mono text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Infinite Dir</Label>
                          <select
                            value={slide.infiniteDirection}
                            onChange={(e) =>
                              setState((s) =>
                                updateSlide(s, selectedNote.id, slide.id, {
                                  infiniteDirection: parseInt(e.target.value),
                                }),
                              )
                            }
                            className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm"
                          >
                            <option value={1}>Up (+1)</option>
                            <option value={-1}>Down (-1)</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          variant={slide.infinite ? "secondary" : "outline"}
                          size="sm"
                          onClick={() =>
                            setState((s) =>
                              updateSlide(s, selectedNote.id, slide.id, {
                                infinite: !slide.infinite,
                              }),
                            )
                          }
                        >
                          {slide.infinite ? "Infinite: ON" : "Infinite: OFF"}
                        </Button>
                        <Button
                          variant={slide.enabled ? "secondary" : "outline"}
                          size="sm"
                          onClick={() =>
                            setState((s) =>
                              updateSlide(s, selectedNote.id, slide.id, {
                                enabled: !slide.enabled,
                              }),
                            )
                          }
                        >
                          {slide.enabled ? "Enabled" : "Disabled"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ProCard>
        )}

        <KpiGrid
          tiles={[
            {
              label: "Total Notes",
              value: state.notes.length,
              icon: <Music className="w-4 h-4" />,
              accent: "primary",
            },
            {
              label: "Selected",
              value: state.selectedNoteIds.length,
              icon: <Grid className="w-4 h-4" />,
              accent: "neutral",
            },
            {
              label: "Total Slides",
              value: state.notes.reduce((sum, n) => sum + n.slides.length, 0),
              icon: <ArrowUpDown className="w-4 h-4" />,
              accent: "bull",
            },
            {
              label: "Infinite Slides",
              value: state.notes.reduce(
                (sum, n) => sum + n.slides.filter((s) => s.infinite).length,
                0,
              ),
              icon: <Zap className="w-4 h-4" />,
              accent: "warning",
            },
          ]}
        />
      </div>
    </AppShell>
  );
}
