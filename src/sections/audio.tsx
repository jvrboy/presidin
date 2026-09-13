"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { GlassPanel, SectionTitle, ShimmerButton, KpiCard } from "@/components/presidin/glass";
import { Music, Play, Pause, Square, Volume2, Piano, Sliders, Zap, Headphones } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// 88-key piano range: A0 (21) to C8 (108) in MIDI
const PIANO_MIN = 21;
const PIANO_MAX = 108;
const WHITE_KEYS: number[] = [];
const BLACK_KEYS: { note: number; x: number }[] = [];
for (let n = PIANO_MIN; n <= PIANO_MAX; n++) {
  const pc = n % 12;
  if ([0, 2, 4, 5, 7, 9, 11].includes(pc)) WHITE_KEYS.push(n);
}
// Recompute black keys positions
for (let n = PIANO_MIN; n <= PIANO_MAX; n++) {
  const pc = n % 12;
  if ([1, 3, 6, 8, 10].includes(pc)) {
    const whiteIdx = WHITE_KEYS.filter((w) => w < n).length;
    BLACK_KEYS.push({ note: n, x: whiteIdx - 0.3 });
  }
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function midiToName(midi: number) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

// Step sequencer: 16 steps × 4 tracks
const TRACKS = [
  { id: "kick",  name: "Kick",   color: "#f43f5e", defaultPattern: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], synth: "membrane" },
  { id: "snare", name: "Snare",  color: "#f59e0b", defaultPattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], synth: "noise" },
  { id: "hat",   name: "Hat",    color: "#06b6d4", defaultPattern: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], synth: "metal" },
  { id: "bass",  name: "Bass",   color: "#a78bfa", defaultPattern: [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,1], synth: "bass" },
] as const;

const SCALES: Record<string, number[]> = {
  "C minor": [60, 62, 63, 65, 67, 68, 70, 72, 74, 75, 77, 79, 80, 82, 83, 84],
  "C major": [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 82, 84, 86],
  "A minor pentatonic": [57, 60, 62, 63, 65, 67, 69, 72, 74, 75, 77, 79, 81, 84],
  "Amapiano (C)": [60, 63, 65, 67, 70, 72, 75, 77, 79, 82, 84],
  "Chromatic": [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75],
};

export function AudioSection() {
  const [tab, setTab] = useState("piano");
  const [ready, setReady] = useState(false);
  const [volume, setVolume] = useState(75);
  const [error, setError] = useState<string | null>(null);

  // Piano roll
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [scale, setScale] = useState("C minor");
  const [instrument, setInstrument] = useState("sine");

  // Step sequencer
  const [patterns, setPatterns] = useState<Record<string, number[]>>(
    Object.fromEntries(TRACKS.map((t) => [t.id, [...t.defaultPattern]]))
  );
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);

  const synthsRef = useRef<any>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Tone.js
  const initTone = useCallback(async () => {
    if (ready) return;
    try {
      const Tone: any = await import("tone");
      Tone.getContext().rawContext.resume();
      const masterVol = new Tone.Volume(volume === 0 ? -Infinity : (volume - 100) * 0.4).toDestination();
      synthsRef.current = {
        Tone,
        masterVol,
        membrane: new Tone.MembraneSynth().connect(masterVol),
        noise: new Tone.NoiseSynth({ volume: -10 }).connect(masterVol),
        metal: new Tone.MetalSynth({ volume: -20, envelope: { attack: 0.001, decay: 0.05, release: 0.01 } }).connect(masterVol),
        bass: new Tone.MonoSynth({ oscillator: { type: "sawtooth" }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.5 }, filter: { type: "lowpass", frequency: 200 } }).connect(masterVol),
        piano: new Tone.PolySynth(Tone.Synth, { oscillator: { type: instrument }, envelope: { attack: 0.005, decay: 0.3, sustain: 0.2, release: 1 } }).connect(masterVol),
      };
      setReady(true);
      setError(null);
    } catch (err: any) {
      setError(`Audio init failed: ${err.message}`);
    }
  }, [ready, volume, instrument]);

  // Update master volume
  useEffect(() => {
    if (synthsRef.current) {
      synthsRef.current.masterVol.volume.value = volume === 0 ? -Infinity : (volume - 100) * 0.4;
    }
  }, [volume]);

  // Update instrument
  useEffect(() => {
    if (synthsRef.current?.piano) {
      synthsRef.current.piano.set({ oscillator: { type: instrument } });
    }
  }, [instrument]);

  // Step sequencer loop
  useEffect(() => {
    if (!playing || !ready) return;
    const stepDur = 60000 / bpm / 4; // 16th note
    intervalRef.current = setInterval(() => {
      setStep((s) => {
        const next = (s + 1) % 16;
        // Trigger notes for this step
        for (const track of TRACKS) {
          if (patterns[track.id][next]) {
            const synth = synthsRef.current?.[track.synth];
            if (!synth) continue;
            try {
              if (track.synth === "membrane") synth.triggerAttackRelease("C1", "8n");
              else if (track.synth === "noise") synth.triggerAttackRelease("8n");
              else if (track.synth === "metal") synth.triggerAttackRelease("C5", "16n");
              else if (track.synth === "bass") synth.triggerAttackRelease("C2", "8n");
            } catch {}
          }
        }
        return next;
      });
    }, stepDur);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, ready, bpm, patterns]);

  const playNote = (midi: number) => {
    if (!synthsRef.current?.piano) return;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    try {
      synthsRef.current.piano.triggerAttackRelease(freq, "8n");
      setActiveNotes((s) => new Set(s).add(midi));
      setTimeout(() => {
        setActiveNotes((s) => {
          const ns = new Set(s);
          ns.delete(midi);
          return ns;
        });
      }, 200);
    } catch {}
  };

  const toggleStep = (trackId: string, idx: number) => {
    setPatterns((p) => {
      const np = { ...p };
      np[trackId] = [...np[trackId]];
      np[trackId][idx] = np[trackId][idx] ? 0 : 1;
      return np;
    });
  };

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="VINNY Audio Engine"
        subtitle="Piano roll · Step sequencer · Mixers · FX · MIDI composer (Tone.js)"
        icon={<Music className="h-5 w-5" />}
        right={
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <Slider value={[volume]} onValueChange={(v) => setVolume(v[0])} max={100} step={1} className="w-24" />
            <span className="tnum text-xs w-8">{volume}%</span>
          </div>
        }
      />

      {!ready && (
        <GlassPanel className="py-8 text-center">
          <Headphones className="mx-auto h-10 w-10 text-violet-400" />
          <h3 className="mt-3 text-base font-semibold">Initialize Audio Engine</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            VINNY uses Web Audio API (via Tone.js). Click below to enable audio — required by all browsers.
          </p>
          <ShimmerButton onClick={initTone} className="mt-4">
            <Zap className="h-4 w-4" />
            Initialize Audio
          </ShimmerButton>
          {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
        </GlassPanel>
      )}

      {ready && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="BPM" value={bpm} delta="tempo" deltaType="neutral" icon={<Music className="h-4 w-4" />} />
            <KpiCard label="Scale" value={scale.split(" ")[0]} delta={scale.split(" ").slice(1).join(" ")} deltaType="neutral" icon={<Piano className="h-4 w-4" />} />
            <KpiCard label="Tracks" value={TRACKS.length} delta="drum + bass" deltaType="neutral" icon={<Sliders className="h-4 w-4" />} />
            <KpiCard label="Steps" value={16} delta="per pattern" deltaType="neutral" icon={<Music className="h-4 w-4" />} />
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-2 max-w-md">
              <TabsTrigger value="piano">Piano Roll</TabsTrigger>
              <TabsTrigger value="sequencer">Step Sequencer</TabsTrigger>
            </TabsList>

            {/* Piano Roll */}
            <TabsContent value="piano" className="space-y-3">
              <GlassPanel veil>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Scale:</span>
                    <Select value={scale} onValueChange={setScale}>
                      <SelectTrigger className="h-8 w-40 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(SCALES).map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Instrument:</span>
                    <Select value={instrument} onValueChange={setInstrument}>
                      <SelectTrigger className="h-8 w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sine">Sine</SelectItem>
                        <SelectItem value="triangle">Triangle</SelectItem>
                        <SelectItem value="sawtooth">Sawtooth</SelectItem>
                        <SelectItem value="square">Square</SelectItem>
                        <SelectItem value="fatsine">Fat Sine</SelectItem>
                        <SelectItem value="fmsine">FM Sine</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Piano keyboard */}
                <div className="overflow-x-auto scroll-fancy">
                  <div className="relative h-32 min-w-[1200px]">
                    {/* White keys */}
                    <div className="absolute inset-0 flex">
                      {WHITE_KEYS.map((n, i) => {
                        const inScale = SCALES[scale].includes(n);
                        const active = activeNotes.has(n);
                        const isC = n % 12 === 0;
                        return (
                          <button
                            key={n}
                            onMouseDown={() => playNote(n)}
                            className={`flex-1 border-r border-b border-border/60 ${
                              active
                                ? "bg-violet-500"
                                : inScale
                                ? "bg-violet-500/10 hover:bg-violet-500/30"
                                : "bg-secondary/30 hover:bg-secondary/50"
                            } ${isC ? "border-r-2 border-r-violet-500/30" : ""}`}
                          >
                            {isC && (
                              <span className="absolute bottom-1 text-[9px] text-muted-foreground">
                                {midiToName(n)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {/* Black keys */}
                    <div className="absolute inset-0 pointer-events-none">
                      {BLACK_KEYS.map((b) => {
                        const active = activeNotes.has(b.note);
                        const inScale = SCALES[scale].includes(b.note);
                        const totalWhite = WHITE_KEYS.length;
                        const left = (b.x / totalWhite) * 100;
                        const width = (0.6 / totalWhite) * 100;
                        return (
                          <button
                            key={b.note}
                            onMouseDown={(e) => { e.stopPropagation(); playNote(b.note); }}
                            className={`absolute top-0 h-3/4 pointer-events-auto rounded-b-md border border-black/60 ${
                              active
                                ? "bg-violet-400"
                                : inScale
                                ? "bg-gradient-to-b from-violet-700 to-violet-900 hover:from-violet-600 hover:to-violet-800"
                                : "bg-gradient-to-b from-slate-800 to-slate-950 hover:from-slate-700 hover:to-slate-900"
                            }`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Click keys to play · Highlighted keys belong to the {scale} scale</span>
                  <span>88-key range: A0 → C8</span>
                </div>
              </GlassPanel>
            </TabsContent>

            {/* Step Sequencer */}
            <TabsContent value="sequencer" className="space-y-3">
              <GlassPanel veil>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ShimmerButton
                      onClick={() => setPlaying(!playing)}
                      className="!px-3 !py-1.5 !text-xs"
                    >
                      {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      {playing ? "Pause" : "Play"}
                    </ShimmerButton>
                    <button
                      onClick={() => { setPlaying(false); setStep(0); }}
                      className="rounded-md bg-secondary/50 p-2 hover:bg-secondary"
                      title="Stop"
                    >
                      <Square className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">BPM:</span>
                    <Slider value={[bpm]} onValueChange={(v) => setBpm(v[0])} min={60} max={200} className="w-32" />
                    <span className="tnum text-sm font-semibold w-8">{bpm}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {TRACKS.map((track) => (
                    <div key={track.id} className="flex items-center gap-2">
                      <div className="w-20 shrink-0 text-xs">
                        <div className="font-semibold" style={{ color: track.color }}>{track.name}</div>
                        <div className="text-[10px] text-muted-foreground capitalize">{track.synth}</div>
                      </div>
                      <div className="flex-1 grid grid-cols-16 gap-1" style={{ gridTemplateColumns: "repeat(16, 1fr)" }}>
                        {patterns[track.id].map((on, i) => {
                          const isCurrent = playing && step === i;
                          const isBeat = i % 4 === 0;
                          return (
                            <button
                              key={i}
                              onClick={() => toggleStep(track.id, i)}
                              className={`aspect-square rounded-md border transition-all ${
                                on
                                  ? "border-transparent shadow-lg"
                                  : isBeat
                                  ? "border-border/60 bg-secondary/40 hover:bg-secondary/60"
                                  : "border-border/30 bg-secondary/20 hover:bg-secondary/40"
                              } ${isCurrent ? "ring-2 ring-violet-400 ring-offset-1 ring-offset-background" : ""}`}
                              style={on ? { backgroundColor: track.color, boxShadow: `0 0 12px ${track.color}40` } : {}}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Click cells to toggle · 16 steps per pattern</span>
                  <span>Step: {step + 1}/16</span>
                </div>
              </GlassPanel>

              <GlassPanel veil>
                <h3 className="mb-2 text-sm font-semibold">VINNY Engine Capabilities</h3>
                <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
                  {[
                    "Piano Roll (88 keys, infinite slide)",
                    "Step Sequencer (16-step × 4 tracks)",
                    "Polyphonic Synth (6 oscillator types)",
                    "Membrane / Noise / Metal / Bass synths",
                    "Volume master",
                    "Scale-aware key highlighting",
                    "5 built-in scales (incl. Amapiano)",
                    "Real-time playback at user-defined BPM",
                  ].map((cap) => (
                    <div key={cap} className="rounded-md bg-secondary/30 p-2 ring-1 ring-border/30">
                      ✓ {cap}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Full VINNY engine (from infinite-loop-sound) includes: 30+ audio FX, stem splitter, advanced mixer with 4-band EQ + sidechain compressor + noise gate, MIDI tools (parse/export/transform/generate), AI melody, chord progression, arpeggiator, harmonizer, song structure. Available as opt-in extension module.
                </p>
              </GlassPanel>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
