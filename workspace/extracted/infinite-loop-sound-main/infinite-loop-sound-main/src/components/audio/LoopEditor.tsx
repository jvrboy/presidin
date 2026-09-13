import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type LoopMode = "sustain" | "one-shot" | "ping-pong";
export type SnapMode = "off" | "zero" | "zero-slope";

export interface LoopEditorProps {
  buffer: AudioBuffer;
  onExport?: (opts: { start: number; end: number; mode: LoopMode }) => void;
}

function findSnap(ch: Float32Array, target: number, mode: SnapMode, radius = 512) {
  if (mode === "off") return target;
  const lo = Math.max(1, target - radius);
  const hi = Math.min(ch.length - 1, target + radius);
  let best = target;
  let bestScore = Infinity;
  for (let i = lo; i < hi; i++) {
    const a = ch[i - 1],
      b = ch[i];
    if (a === 0 || a < 0 !== b < 0) {
      const slopeOk = mode === "zero" || b > a; // upward zero-cross
      if (slopeOk) {
        const score = Math.abs(i - target);
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }
    }
  }
  return best;
}

export function LoopEditor({ buffer, onExport }: LoopEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0); // in samples
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(buffer.length - 1);
  const [mode, setMode] = useState<LoopMode>("sustain");
  const [snap, setSnap] = useState<SnapMode>("zero-slope");
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [dragging, setDragging] = useState<null | "start" | "end">(null);

  const ch = useMemo(() => buffer.getChannelData(0), [buffer]);

  useEffect(() => {
    setStart(0);
    setEnd(buffer.length - 1);
    setPan(0);
    setZoom(1);
  }, [buffer]);

  const view = useMemo(() => {
    const total = buffer.length;
    const span = Math.max(1, Math.floor(total / zoom));
    const off = Math.max(0, Math.min(total - span, pan));
    return { off, span };
  }, [buffer.length, zoom, pan]);

  const sampleToX = useCallback(
    (s: number, w: number) => {
      return ((s - view.off) / view.span) * w;
    },
    [view],
  );

  const xToSample = useCallback(
    (x: number, w: number) => {
      return Math.round(view.off + (x / w) * view.span);
    },
    [view],
  );

  // Draw waveform
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth,
      h = cv.clientHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const g = cv.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);

    // background
    g.fillStyle = "hsl(var(--card))";
    g.fillRect(0, 0, w, h);

    // center line
    g.strokeStyle = "hsl(var(--border))";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.stroke();

    // waveform min/max per pixel
    const step = view.span / w;
    g.strokeStyle = "hsl(var(--primary))";
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x < w; x++) {
      const i0 = Math.floor(view.off + x * step);
      const i1 = Math.floor(view.off + (x + 1) * step);
      let mn = 1,
        mx = -1;
      for (let i = i0; i < i1 && i < ch.length; i++) {
        const v = ch[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      const y0 = ((1 - mx) * h) / 2;
      const y1 = ((1 - mn) * h) / 2;
      g.moveTo(x + 0.5, y0);
      g.lineTo(x + 0.5, y1);
    }
    g.stroke();

    // loop region highlight
    const sx = sampleToX(start, w);
    const ex = sampleToX(end, w);
    g.fillStyle = "hsl(var(--primary) / 0.12)";
    g.fillRect(sx, 0, Math.max(0, ex - sx), h);

    // start handle
    g.strokeStyle = "hsl(var(--primary))";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(sx, 0);
    g.lineTo(sx, h);
    g.stroke();
    g.fillStyle = "hsl(var(--primary))";
    g.fillRect(sx - 6, 0, 12, 10);
    g.fillRect(sx - 6, h - 10, 12, 10);

    // end handle
    g.strokeStyle = "hsl(var(--destructive))";
    g.beginPath();
    g.moveTo(ex, 0);
    g.lineTo(ex, h);
    g.stroke();
    g.fillStyle = "hsl(var(--destructive))";
    g.fillRect(ex - 6, 0, 12, 10);
    g.fillRect(ex - 6, h - 10, 12, 10);

    // playhead
    if (playing) {
      const px = sampleToX(playhead, w);
      g.strokeStyle = "hsl(var(--foreground))";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(px, 0);
      g.lineTo(px, h);
      g.stroke();
    }
  }, [ch, view, start, end, playhead, playing, sampleToX]);

  // Redraw on resize
  useEffect(() => {
    const ro = new ResizeObserver(() => setPan((p) => p));
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const handlePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current!;
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    const s = xToSample(x, w);
    const sx = sampleToX(start, w);
    const ex = sampleToX(end, w);

    if (e.type === "pointerdown") {
      let d: "start" | "end" | null = null;
      if (Math.abs(x - sx) < Math.abs(x - ex)) d = "start";
      else d = "end";
      if (Math.abs(x - sx) > 30 && Math.abs(x - ex) > 30) d = null;
      if (d) {
        setDragging(d);
        cv.setPointerCapture(e.pointerId);
      }
    } else if (e.type === "pointermove" && dragging) {
      const snapped = findSnap(ch, s, snap);
      if (dragging === "start") setStart(Math.max(0, Math.min(end - 1, snapped)));
      else setEnd(Math.max(start + 1, Math.min(buffer.length - 1, snapped)));
    } else if (e.type === "pointerup" || e.type === "pointercancel") {
      if (dragging) cv.releasePointerCapture(e.pointerId);
      setDragging(null);
    }
  };

  const stop = useCallback(() => {
    srcRef.current?.stop();
    srcRef.current?.disconnect();
    srcRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setPlaying(false);
  }, []);

  const buildPingPong = useCallback((): AudioBuffer => {
    const sr = buffer.sampleRate;
    const nch = buffer.numberOfChannels;
    const loopLen = end - start;
    const total = start + loopLen * 2;
    const ctx = ctxRef.current!;
    const out = ctx.createBuffer(nch, total, sr);
    for (let c = 0; c < nch; c++) {
      const src = buffer.getChannelData(c);
      const dst = out.getChannelData(c);
      for (let i = 0; i < start; i++) dst[i] = src[i];
      for (let i = 0; i < loopLen; i++) dst[start + i] = src[start + i];
      for (let i = 0; i < loopLen; i++) dst[start + loopLen + i] = src[end - i];
    }
    return out;
  }, [buffer, start, end]);

  const play = useCallback(async () => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") await ctx.resume();
    stop();
    const src = ctx.createBufferSource();
    if (mode === "one-shot") {
      src.buffer = buffer;
      src.loop = false;
    } else if (mode === "sustain") {
      src.buffer = buffer;
      src.loop = true;
      src.loopStart = start / buffer.sampleRate;
      src.loopEnd = end / buffer.sampleRate;
    } else {
      src.buffer = buildPingPong();
      src.loop = true;
      src.loopStart = start / buffer.sampleRate;
      src.loopEnd = (start + (end - start) * 2) / buffer.sampleRate;
    }
    src.connect(ctx.destination);
    src.start();
    srcRef.current = src;
    startTimeRef.current = ctx.currentTime;
    setPlaying(true);

    const tick = () => {
      if (!srcRef.current) return;
      const elapsed = ctx.currentTime - startTimeRef.current;
      let sample = Math.floor(elapsed * buffer.sampleRate);
      if (mode === "sustain" && sample > end) {
        const loopLen = end - start;
        sample = start + ((sample - start) % loopLen);
      } else if (mode === "one-shot" && sample >= buffer.length) {
        stop();
        return;
      }
      setPlayhead(sample);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    src.onended = () => {
      if (mode === "one-shot") stop();
    };
  }, [buffer, start, end, mode, buildPingPong, stop]);

  useEffect(() => () => stop(), [stop]);

  const snapNow = () => {
    setStart((s) => findSnap(ch, s, snap === "off" ? "zero" : snap));
    setEnd((e) => findSnap(ch, e, snap === "off" ? "zero" : snap));
  };

  const fmt = (s: number) => `${(s / buffer.sampleRate).toFixed(4)}s (${s})`;

  return (
    <div className="space-y-3">
      <div ref={wrapRef} className="w-full">
        <canvas
          ref={canvasRef}
          className="w-full h-40 rounded border border-border touch-none select-none cursor-ew-resize"
          onPointerDown={handlePointer}
          onPointerMove={handlePointer}
          onPointerUp={handlePointer}
          onPointerCancel={handlePointer}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div>
          <div className="text-muted-foreground mb-1">Zoom {zoom.toFixed(1)}x</div>
          <input
            type="range"
            min={1}
            max={64}
            step={0.5}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <div className="text-muted-foreground mb-1">Pan</div>
          <input
            type="range"
            min={0}
            max={Math.max(0, buffer.length - view.span)}
            value={pan}
            onChange={(e) => setPan(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <div className="text-muted-foreground mb-1">Snap</div>
          <select
            className="w-full bg-background border border-border rounded px-2 py-1"
            value={snap}
            onChange={(e) => setSnap(e.target.value as SnapMode)}
          >
            <option value="off">Off</option>
            <option value="zero">Zero-cross</option>
            <option value="zero-slope">Zero + upward</option>
          </select>
        </div>
        <div>
          <div className="text-muted-foreground mb-1">Loop Mode</div>
          <div className="flex gap-1">
            {(["sustain", "one-shot", "ping-pong"] as LoopMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded border px-2 py-1 text-[10px] ${
                  mode === m ? "border-primary bg-primary/10" : "border-border"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center text-xs">
        <Badge variant="outline">Start {fmt(start)}</Badge>
        <Badge variant="outline">End {fmt(end)}</Badge>
        <Badge variant="outline">Length {((end - start) / buffer.sampleRate).toFixed(4)}s</Badge>
        <Button size="sm" variant="outline" onClick={snapNow}>
          Snap Both
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setStart(0);
            setEnd(buffer.length - 1);
          }}
        >
          Reset
        </Button>
        {playing ? (
          <Button size="sm" onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button size="sm" onClick={play}>
            Preview Loop
          </Button>
        )}
        {onExport && (
          <Button size="sm" variant="default" onClick={() => onExport({ start, end, mode })}>
            Export with Loop Points
          </Button>
        )}
      </div>
    </div>
  );
}
