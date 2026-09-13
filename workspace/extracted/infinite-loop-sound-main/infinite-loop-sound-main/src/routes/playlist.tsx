import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@components/app/AppShell";
import { useEffect, useState, useRef, useCallback } from "react";
import { ProCard, SectionHeader, StatTile, KpiGrid } from "@components/pro";
import { Button } from "@components/ui/button";
import { Badge } from "@components/ui/badge";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import {
  ListMusic,
  Play,
  Square,
  Plus,
  Copy,
  Trash,
  Volume,
  Music,
  Layers,
  Repeat,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  createDefaultPlaylist,
  createDefaultTrack,
  createDefaultClip,
  generateTrackId,
  addClip,
  removeClips,
  moveClip,
  resizeClip,
  duplicateClips,
  addTrack,
  removeTrack,
  moveTrack,
  updateTrack,
  updateClip,
  snapBar,
  type PlaylistState,
  type PlaylistTrack,
  type PlaylistClip,
  type PlaylistSnapMode,
  type TrackType,
  type ClipType,
} from "@lib/audio/playlist";

export const Route = createFileRoute("/playlist")({
  head: () => ({
    meta: [
      { title: "Playlist — DivergenceIQ" },
      {
        name: "description",
        content:
          "Song arrangement playlist with multi-track clips, patterns, automation, and playback.",
      },
    ],
  }),
  component: PlaylistPage,
});

const TRACK_COLORS: Record<TrackType, string> = {
  instrument: "#3b82f6",
  audio: "#10b981",
  drum: "#f59e0b",
  automation: "#8b5cf6",
  bus: "#ec4899",
  marker: "#6b7280",
  tempo: "#ef4444",
};

function PlaylistPage() {
  const [state, setState] = useState<PlaylistState>(createDefaultPlaylist());
  const [playing, setPlaying] = useState(false);
  const [dragClip, setDragClip] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const playheadRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const pxPerBar = 40 * state.zoom;
  const trackHeight = state.trackHeight;
  const totalWidth = state.totalBars * pxPerBar;
  const rulerHeight = 30;
  const labelWidth = 140;

  // Playback
  useEffect(() => {
    if (!playing) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }
    const barDurationMs = (60000 / state.bpm) * state.beatsPerBar;
    const startTime = performance.now();
    const animate = () => {
      const elapsed = performance.now() - startTime;
      playheadRef.current = elapsed / barDurationMs;
      if (playheadRef.current >= state.totalBars) {
        setPlaying(false);
        return;
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [playing, state.bpm, state.beatsPerBar, state.totalBars]);

  const handleAddTrack = (type: TrackType) => {
    const id = generateTrackId();
    const name = type.charAt(0).toUpperCase() + type.slice(1);
    setState((s) =>
      addTrack(
        s,
        createDefaultTrack(
          id,
          `${name} ${s.tracks.filter((t) => t.type === type).length + 1}`,
          type,
        ),
      ),
    );
  };

  const handleAddClip = (trackId: string) => {
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const clip = createDefaultClip(
      trackId,
      `${track.name} Clip`,
      0,
      4,
      track.type === "drum" ? "pattern" : track.type === "audio" ? "audio" : "pattern",
    );
    setState((s) => addClip(s, clip));
  };

  const handleClipClick = (e: React.MouseEvent, clip: PlaylistClip) => {
    e.stopPropagation();
    setState((s) => ({ ...s, selectedClipIds: [clip.id] }));
  };

  const handleClipDoubleClick = (e: React.MouseEvent, clip: PlaylistClip) => {
    e.stopPropagation();
    setState((s) => duplicateClips(s, [clip.id]));
  };

  const handleClipMouseDown = (e: React.MouseEvent, clip: PlaylistClip) => {
    setDragClip(clip.id);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragClip || !dragStart) return;
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      const deltaBars = Math.round(deltaX / pxPerBar);
      const deltaTrack = Math.round(deltaY / trackHeight);
      if (deltaBars !== 0 || deltaTrack !== 0) {
        setState((s) => moveClip(s, dragClip, deltaBars, deltaTrack));
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    },
    [dragClip, dragStart, pxPerBar, trackHeight],
  );

  const handleMouseUp = () => {
    setDragClip(null);
    setDragStart(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Delete" && state.selectedClipIds.length > 0) {
        setState((s) => removeClips(s, s.selectedClipIds));
      } else if ((e.ctrlKey || e.metaKey) && e.key === "d" && state.selectedClipIds.length > 0) {
        e.preventDefault();
        setState((s) => duplicateClips(s, s.selectedClipIds));
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.selectedClipIds]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
        <SectionHeader
          title="Playlist — Song Arrangement"
          subtitle="Multi-track arrangement with clips, patterns, audio, automation, and full playback control."
          icon={<ListMusic className="w-5 h-5" />}
          action={
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setState((s) => ({ ...s, zoom: Math.max(0.25, s.zoom - 0.25) }))}
                className="gap-1"
              >
                <ZoomOut className="w-3 h-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setState((s) => ({ ...s, zoom: Math.min(4, s.zoom + 0.25) }))}
                className="gap-1"
              >
                <ZoomIn className="w-3 h-3" />
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

        {/* Toolbar */}
        <ProCard>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs">BPM</Label>
              <Input
                type="number"
                min={40}
                max={300}
                value={state.bpm}
                onChange={(e) => setState((s) => ({ ...s, bpm: parseInt(e.target.value) || 120 }))}
                className="w-16 font-mono text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Bars</Label>
              <Input
                type="number"
                min={1}
                max={512}
                value={state.totalBars}
                onChange={(e) =>
                  setState((s) => ({ ...s, totalBars: parseInt(e.target.value) || 32 }))
                }
                className="w-16 font-mono text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Snap</Label>
              <select
                value={state.snapMode}
                onChange={(e) =>
                  setState((s) => ({ ...s, snapMode: e.target.value as PlaylistSnapMode }))
                }
                className="bg-card border border-border rounded px-2 py-1 text-sm"
              >
                {["bar", "1/2", "1/4", "1/8", "1/16", "off"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Add Track</Label>
              {(["drum", "instrument", "audio", "automation", "bus"] as TrackType[]).map((t) => (
                <Button
                  key={t}
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddTrack(t)}
                  className="gap-1"
                >
                  <Plus className="w-3 h-3" /> {t}
                </Button>
              ))}
            </div>
            {state.selectedClipIds.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setState((s) => duplicateClips(s, s.selectedClipIds))}
                className="gap-1"
              >
                <Copy className="w-3 h-3" /> Duplicate
              </Button>
            )}
            {state.selectedClipIds.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setState((s) => removeClips(s, s.selectedClipIds))}
                className="gap-1"
              >
                <Trash className="w-3 h-3" /> Delete
              </Button>
            )}
          </div>
        </ProCard>

        {/* Playlist Grid */}
        <div
          className="rounded-xl border border-border bg-card overflow-auto"
          style={{ maxHeight: "600px" }}
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <div
            style={{
              width: totalWidth + labelWidth,
              minHeight: rulerHeight + state.tracks.length * trackHeight,
            }}
          >
            {/* Ruler */}
            <div className="sticky top-0 z-10 flex" style={{ height: rulerHeight }}>
              <div
                className="bg-card border-b border-r border-border flex items-center px-2"
                style={{ width: labelWidth }}
              >
                <span className="text-xs font-semibold text-muted-foreground">Tracks</span>
              </div>
              <div
                className="bg-card border-b border-border relative"
                style={{ width: totalWidth }}
              >
                {Array.from({ length: state.totalBars + 1 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 border-l border-border/50 flex items-center pl-1"
                    style={{ left: i * pxPerBar, width: pxPerBar }}
                  >
                    <span className="text-[10px] font-mono text-muted-foreground">{i + 1}</span>
                  </div>
                ))}
                {/* Playhead */}
                {playing && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-bull z-20"
                    style={{ left: playheadRef.current * pxPerBar }}
                  />
                )}
              </div>
            </div>

            {/* Tracks */}
            {state.tracks.map((track, ti) => (
              <div key={track.id} className="flex" style={{ height: trackHeight }}>
                {/* Track label */}
                <div
                  className="border-r border-b border-border bg-card flex flex-col justify-between p-1.5"
                  style={{ width: labelWidth }}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: track.color }} />
                    <span className="text-xs font-medium truncate">{track.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant={track.muted ? "secondary" : "ghost"}
                      size="sm"
                      className="h-5 px-1 text-[10px]"
                      onClick={() =>
                        setState((s) => updateTrack(s, track.id, { muted: !track.muted }))
                      }
                    >
                      M
                    </Button>
                    <Button
                      variant={track.solo ? "secondary" : "ghost"}
                      size="sm"
                      className="h-5 px-1 text-[10px]"
                      onClick={() =>
                        setState((s) => updateTrack(s, track.id, { solo: !track.solo }))
                      }
                    >
                      S
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-[10px]"
                      onClick={() => setState((s) => moveTrack(s, track.id, "up"))}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-[10px]"
                      onClick={() => setState((s) => moveTrack(s, track.id, "down"))}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-[10px]"
                      onClick={() => setState((s) => removeTrack(s, track.id))}
                    >
                      <Trash className="w-2.5 h-2.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-[10px]"
                      onClick={() => handleAddClip(track.id)}
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                </div>
                {/* Track lane */}
                <div
                  className="border-b border-border relative"
                  style={{
                    width: totalWidth,
                    backgroundColor: ti % 2 === 0 ? "#0d0d0d" : "#111111",
                  }}
                >
                  {/* Grid lines */}
                  {Array.from({ length: state.totalBars + 1 }, (_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-border/20"
                      style={{ left: i * pxPerBar }}
                    />
                  ))}
                  {/* Clips */}
                  {state.clips
                    .filter((c) => c.trackId === track.id)
                    .map((clip) => {
                      const x = clip.startBar * pxPerBar;
                      const w = clip.lengthBars * pxPerBar;
                      const isSelected = state.selectedClipIds.includes(clip.id);
                      return (
                        <div
                          key={clip.id}
                          className={`absolute rounded cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary" : ""} ${clip.muted ? "opacity-40" : ""}`}
                          style={{
                            left: x,
                            width: Math.max(20, w - 2),
                            top: 4,
                            height: trackHeight - 8,
                            background: clip.color + "40",
                            borderLeft: `3px solid ${clip.color}`,
                          }}
                          onClick={(e) => handleClipClick(e, clip)}
                          onDoubleClick={(e) => handleClipDoubleClick(e, clip)}
                          onMouseDown={(e) => handleClipMouseDown(e, clip)}
                        >
                          <div className="px-1.5 py-1 text-[10px] text-white/80 truncate font-medium">
                            {clip.name}
                          </div>
                          {clip.looped && (
                            <Repeat className="w-2.5 h-2.5 text-white/40 absolute top-1 right-1" />
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Selected clip properties */}
        {state.selectedClipIds.length === 1 &&
          (() => {
            const clip = state.clips.find((c) => c.id === state.selectedClipIds[0]);
            if (!clip) return null;
            return (
              <ProCard
                title={`Clip: ${clip.name}`}
                description="Clip properties"
                icon={<Layers className="w-4 h-4" />}
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={clip.name}
                      onChange={(e) =>
                        setState((s) => updateClip(s, clip.id, { name: e.target.value }))
                      }
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Start Bar</Label>
                    <Input
                      type="number"
                      step={0.25}
                      value={clip.startBar}
                      onChange={(e) =>
                        setState((s) =>
                          updateClip(s, clip.id, { startBar: parseFloat(e.target.value) }),
                        )
                      }
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Length (bars)</Label>
                    <Input
                      type="number"
                      step={0.25}
                      value={clip.lengthBars}
                      onChange={(e) =>
                        setState((s) => resizeClip(s, clip.id, parseFloat(e.target.value)))
                      }
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Volume</Label>
                    <Input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={clip.volume}
                      onChange={(e) =>
                        setState((s) =>
                          updateClip(s, clip.id, { volume: parseFloat(e.target.value) }),
                        )
                      }
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Pan</Label>
                    <Input
                      type="number"
                      min={-1}
                      max={1}
                      step={0.1}
                      value={clip.pan}
                      onChange={(e) =>
                        setState((s) => updateClip(s, clip.id, { pan: parseFloat(e.target.value) }))
                      }
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Fade In (bars)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.25}
                      value={clip.fadeInBars}
                      onChange={(e) =>
                        setState((s) =>
                          updateClip(s, clip.id, { fadeInBars: parseFloat(e.target.value) }),
                        )
                      }
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Fade Out (bars)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.25}
                      value={clip.fadeOutBars}
                      onChange={(e) =>
                        setState((s) =>
                          updateClip(s, clip.id, { fadeOutBars: parseFloat(e.target.value) }),
                        )
                      }
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Time Stretch</Label>
                    <Input
                      type="number"
                      min={0.5}
                      max={2}
                      step={0.05}
                      value={clip.timeStretch}
                      onChange={(e) =>
                        setState((s) =>
                          updateClip(s, clip.id, { timeStretch: parseFloat(e.target.value) }),
                        )
                      }
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Pitch Shift (semi)</Label>
                    <Input
                      type="number"
                      min={-24}
                      max={24}
                      value={clip.pitchShift}
                      onChange={(e) =>
                        setState((s) =>
                          updateClip(s, clip.id, { pitchShift: parseInt(e.target.value) }),
                        )
                      }
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button
                      variant={clip.muted ? "secondary" : "outline"}
                      size="sm"
                      onClick={() =>
                        setState((s) => updateClip(s, clip.id, { muted: !clip.muted }))
                      }
                    >
                      Mute
                    </Button>
                    <Button
                      variant={clip.looped ? "secondary" : "outline"}
                      size="sm"
                      onClick={() =>
                        setState((s) => updateClip(s, clip.id, { looped: !clip.looped }))
                      }
                      className="gap-1"
                    >
                      <Repeat className="w-3 h-3" /> Loop
                    </Button>
                  </div>
                </div>
              </ProCard>
            );
          })()}

        {/* Stats */}
        <KpiGrid
          tiles={[
            {
              label: "Tracks",
              value: state.tracks.length,
              icon: <Layers className="w-4 h-4" />,
              accent: "primary",
            },
            {
              label: "Clips",
              value: state.clips.length,
              icon: <ListMusic className="w-4 h-4" />,
              accent: "neutral",
            },
            {
              label: "Total Bars",
              value: state.totalBars,
              icon: <Music className="w-4 h-4" />,
              accent: "bull",
            },
            {
              label: "BPM",
              value: state.bpm,
              icon: <Volume className="w-4 h-4" />,
              accent: "warning",
            },
          ]}
        />
      </div>
    </AppShell>
  );
}
