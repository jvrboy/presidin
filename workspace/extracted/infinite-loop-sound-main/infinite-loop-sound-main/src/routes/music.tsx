// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  AudioEngine,
  DEFAULT_SYNTH,
  DEFAULT_GRANULAR,
  DEFAULT_EFFECTS,
  NOTE_NAMES,
  SCALES,
  noteToFreq,
  type SynthVoiceParams,
  type GranularParams,
  type EffectParams,
  type Waveform,
} from "@/lib/audio/engine";
import { SequencerEngine, createDefaultSequencer } from "@/lib/audio/sequencer";
import { MIDIInput, midiToNoteName, midiToFreq } from "@/lib/audio/midi";
import { AudioRecorder } from "@/lib/audio/recorder";
import { ModulationEngine } from "@/lib/audio/modulation";
import { Visualizer } from "@/lib/audio/visualizer";
import { VinnyPlugin } from "@/components/app/VinnyPlugin";
import {
  Music,
  Piano,
  Waves,
  Sparkles,
  Sliders,
  Volume,
  Play,
  Square,
  Upload,
  Mic,
  Radio,
  Disc,
  AudioWaveform as WaveIcon,
  Grid,
  Activity,
  Settings,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/music")({
  head: () => ({
    meta: [
      { title: "Music Studio — Infinite Loop Sound" },
      {
        name: "description",
        content:
          "Complete music synthesis studio: synthesizer, sampler, granular engine, sound design tools, effects rack, sequencer, MIDI, VINNY plugin, visualizer, recorder, and modulation.",
      },
    ],
  }),
  component: MusicPage,
});

function MusicPage() {
  const [activeTab, setActiveTab] = useState("synth");
  const [unlocked, setUnlocked] = useState(false);

  const unlock = useCallback(() => {
    AudioEngine.unlock();
    setUnlocked(true);
  }, []);

  useEffect(() => {
    const handler = () => {
      if (!unlocked) unlock();
    };
    window.addEventListener("click", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [unlocked, unlock]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Music className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold">Music Studio</h1>
          {!unlocked && (
            <Button size="sm" onClick={unlock}>
              <Volume className="w-4 h-4 mr-1" /> Enable Audio
            </Button>
          )}
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="synth" className="text-xs">
              <Piano className="w-3.5 h-3.5 mr-1" /> Synthesizer
            </TabsTrigger>
            <TabsTrigger value="sampler" className="text-xs">
              <Disc className="w-3.5 h-3.5 mr-1" /> Sampler
            </TabsTrigger>
            <TabsTrigger value="granular" className="text-xs">
              <Sparkles className="w-3.5 h-3.5 mr-1" /> Granular
            </TabsTrigger>
            <TabsTrigger value="sounddesign" className="text-xs">
              <WaveIcon className="w-3.5 h-3.5 mr-1" /> Sound Design
            </TabsTrigger>
            <TabsTrigger value="effects" className="text-xs">
              <Sliders className="w-3.5 h-3.5 mr-1" /> Effects
            </TabsTrigger>
            <TabsTrigger value="sequencer" className="text-xs">
              <Grid className="w-3.5 h-3.5 mr-1" /> Sequencer
            </TabsTrigger>
            <TabsTrigger value="midi" className="text-xs">
              <Music className="w-3.5 h-3.5 mr-1" /> MIDI
            </TabsTrigger>
            <TabsTrigger value="vinny" className="text-xs">
              <Zap className="w-3.5 h-3.5 mr-1" /> VINNY
            </TabsTrigger>
            <TabsTrigger value="visualizer" className="text-xs">
              <Activity className="w-3.5 h-3.5 mr-1" /> Visualizer
            </TabsTrigger>
            <TabsTrigger value="recorder" className="text-xs">
              <Mic className="w-3.5 h-3.5 mr-1" /> Recorder
            </TabsTrigger>
            <TabsTrigger value="modulation" className="text-xs">
              <Settings className="w-3.5 h-3.5 mr-1" /> Modulation
            </TabsTrigger>
          </TabsList>
          <TabsContent value="synth">
            <SynthesizerTab />
          </TabsContent>
          <TabsContent value="sampler">
            <SamplerTab />
          </TabsContent>
          <TabsContent value="granular">
            <GranularTab />
          </TabsContent>
          <TabsContent value="sounddesign">
            <SoundDesignTab />
          </TabsContent>
          <TabsContent value="effects">
            <EffectsTab />
          </TabsContent>
          <TabsContent value="sequencer">
            <SequencerTab />
          </TabsContent>
          <TabsContent value="midi">
            <MIDITab />
          </TabsContent>
          <TabsContent value="vinny">
            <VinnyTab />
          </TabsContent>
          <TabsContent value="visualizer">
            <VisualizerTab />
          </TabsContent>
          <TabsContent value="recorder">
            <RecorderTab />
          </TabsContent>
          <TabsContent value="modulation">
            <ModulationTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

// ---------- Synthesizer Tab ----------
function SynthesizerTab() {
  const [params, setParams] = useState<SynthVoiceParams>(DEFAULT_SYNTH);
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const [scale, setScale] = useState("major");
  const [baseOctave, setBaseOctave] = useState(4);

  const handleNoteOn = (note: string) => {
    AudioEngine.unlock();
    const freq = noteToFreq(note);
    AudioEngine.noteOn(note, freq, params);
    setActiveNotes((s) => new Set(s).add(note));
  };
  const handleNoteOff = (note: string) => {
    AudioEngine.noteOff(note);
    setActiveNotes((s) => {
      const n = new Set(s);
      n.delete(note);
      return n;
    });
  };

  useEffect(() => {
    const keyMap: Record<string, string> = {
      a: "C4",
      w: "C#4",
      s: "D4",
      e: "D#4",
      d: "E4",
      f: "F4",
      t: "F#4",
      g: "G4",
      y: "G#4",
      h: "A4",
      u: "A#4",
      j: "B4",
      k: "C5",
      o: "C#5",
      l: "D5",
    };
    const down = (e: KeyboardEvent) => {
      const note = keyMap[e.key.toLowerCase()];
      if (note && !e.repeat) {
        e.preventDefault();
        handleNoteOn(note);
      }
    };
    const up = (e: KeyboardEvent) => {
      const note = keyMap[e.key.toLowerCase()];
      if (note) handleNoteOff(note);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [params]);

  const whiteKeys = NOTE_NAMES.filter((n) => !n.includes("#"));
  const blackKeys = NOTE_NAMES.filter((n) => n.includes("#"));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Piano className="w-4 h-4 text-primary" /> Synthesizer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <ParamControl label="Waveform">
              <select
                value={params.waveform}
                onChange={(e) => setParams({ ...params, waveform: e.target.value as Waveform })}
                className="bg-card border border-border rounded px-2 py-1 text-sm w-full"
              >
                <option value="sine">Sine</option>
                <option value="square">Square</option>
                <option value="sawtooth">Sawtooth</option>
                <option value="triangle">Triangle</option>
              </select>
            </ParamControl>
            <ParamControl label={`Attack (${params.attack.toFixed(3)}s)`}>
              <Slider
                value={params.attack}
                min={0}
                max={2}
                step={0.01}
                onChange={(v) => setParams({ ...params, attack: v })}
              />
            </ParamControl>
            <ParamControl label={`Decay (${params.decay.toFixed(3)}s)`}>
              <Slider
                value={params.decay}
                min={0}
                max={2}
                step={0.01}
                onChange={(v) => setParams({ ...params, decay: v })}
              />
            </ParamControl>
            <ParamControl label={`Sustain (${params.sustain.toFixed(2)})`}>
              <Slider
                value={params.sustain}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => setParams({ ...params, sustain: v })}
              />
            </ParamControl>
            <ParamControl label={`Release (${params.release.toFixed(3)}s)`}>
              <Slider
                value={params.release}
                min={0}
                max={3}
                step={0.01}
                onChange={(v) => setParams({ ...params, release: v })}
              />
            </ParamControl>
            <ParamControl label={`Detune (${params.detune} cents)`}>
              <Slider
                value={params.detune}
                min={-50}
                max={50}
                step={1}
                onChange={(v) => setParams({ ...params, detune: v })}
              />
            </ParamControl>
            <ParamControl label={`Gain (${params.gain.toFixed(2)})`}>
              <Slider
                value={params.gain}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => setParams({ ...params, gain: v })}
              />
            </ParamControl>
            <ParamControl label="Scale">
              <select
                value={scale}
                onChange={(e) => setScale(e.target.value)}
                className="bg-card border border-border rounded px-2 py-1 text-sm w-full"
              >
                {Object.keys(SCALES).map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </ParamControl>
            <ParamControl label={`Base Octave (${baseOctave})`}>
              <Slider
                value={baseOctave}
                min={2}
                max={6}
                step={1}
                onChange={(v) => setBaseOctave(v)}
              />
            </ParamControl>
          </div>
          <div className="relative h-32 select-none">
            <div className="flex h-full">
              {whiteKeys.map((note, i) => {
                const fullNote = `${note}${baseOctave + Math.floor(i / 7)}`;
                const isActive = activeNotes.has(fullNote);
                return (
                  <button
                    key={fullNote}
                    onMouseDown={() => handleNoteOn(fullNote)}
                    onMouseUp={() => handleNoteOff(fullNote)}
                    onMouseLeave={() => activeNotes.has(fullNote) && handleNoteOff(fullNote)}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      handleNoteOn(fullNote);
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      handleNoteOff(fullNote);
                    }}
                    className={`flex-1 border border-border rounded-b flex items-end justify-center pb-2 text-xs transition-colors ${isActive ? "bg-primary text-primary-foreground" : "bg-white/90 text-black hover:bg-white"}`}
                  >
                    {note}
                  </button>
                );
              })}
            </div>
            <div className="absolute inset-0 flex pointer-events-none">
              {whiteKeys.map((_, i) => {
                const noteName = blackKeys[i % 7];
                if (!noteName) return <div key={i} className="flex-1" />;
                const fullNote = `${noteName}${baseOctave + Math.floor(i / 7)}`;
                const isActive = activeNotes.has(fullNote);
                return (
                  <div key={i} className="flex-1 relative">
                    <button
                      onMouseDown={() => handleNoteOn(fullNote)}
                      onMouseUp={() => handleNoteOff(fullNote)}
                      onTouchStart={(e) => {
                        e.preventDefault();
                        handleNoteOn(fullNote);
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        handleNoteOff(fullNote);
                      }}
                      className={`absolute right-0 top-0 w-[60%] h-[60%] -mr-[30%] rounded-b z-10 pointer-events-auto text-[10px] flex items-end justify-center pb-1 transition-colors ${isActive ? "bg-primary text-primary-foreground" : "bg-black/90 text-white/60 hover:bg-black"}`}
                    >
                      {noteName}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Play with keyboard: A-K for white keys, W/E/T/Y/U/O for black keys
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Sampler Tab ----------
function SamplerTab() {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [activeChops, setActiveChops] = useState<Set<number>>(new Set());
  const [numChops, setNumChops] = useState(8);
  const [lenPct, setLenPct] = useState(100);
  const [rate, setRate] = useState(1);
  const [latch, setLatch] = useState(false);
  const [fileName, setFileName] = useState("No sample loaded");
  const voicesRef = useRef<Map<number, { src: AudioBufferSourceNode; g: GainNode }>>(new Map());

  const loadFile = useCallback(async (file: File) => {
    AudioEngine.unlock();
    try {
      const ab = await file.arrayBuffer();
      const buf = await AudioEngine.decodeAudio(ab);
      setBuffer(buf);
      setFileName(file.name);
      toast.success(`Loaded: ${file.name}`);
    } catch {
      toast.error("Failed to load audio file");
    }
  }, []);

  const playChop = (i: number) => {
    if (!buffer) return;
    AudioEngine.unlock();
    const chopLen = buffer.duration / numChops;
    const start = i * chopLen;
    const dur = (chopLen * lenPct) / 100;
    const src = AudioEngine.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = AudioEngine.ctx.createGain();
    g.gain.value = 0.7;
    src.connect(g);
    g.connect(AudioEngine.master);
    src.start(0, start, dur);
    voicesRef.current.set(i, { src: src, g });
    setActiveChops((s) => new Set(s).add(i));
    src.onended = () => {
      setActiveChops((s) => {
        const n = new Set(s);
        n.delete(i);
        return n;
      });
      voicesRef.current.delete(i);
    };
  };

  const stopChop = (i: number) => {
    const v = voicesRef.current.get(i);
    if (v) {
      v.src.stop();
      voicesRef.current.delete(i);
    }
    setActiveChops((s) => {
      const n = new Set(s);
      n.delete(i);
      return n;
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Disc className="w-4 h-4 text-primary" /> Sampler
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) loadFile(f);
                }}
              />
              <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-sm hover:bg-primary/20">
                <Upload className="w-4 h-4" /> Load Sample
              </span>
            </label>
            <span className="text-sm text-muted-foreground truncate">{fileName}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <ParamControl label={`Chops (${numChops})`}>
              <Slider value={numChops} min={2} max={32} step={1} onChange={setNumChops} />
            </ParamControl>
            <ParamControl label={`Length (${lenPct}%)`}>
              <Slider value={lenPct} min={5} max={100} step={1} onChange={setLenPct} />
            </ParamControl>
            <ParamControl label={`Rate (${rate.toFixed(2)}x)`}>
              <Slider value={rate} min={0.25} max={4} step={0.01} onChange={setRate} />
            </ParamControl>
            <ParamControl label="Latch Mode">
              <Button
                size="sm"
                variant={latch ? "default" : "outline"}
                onClick={() => setLatch(!latch)}
              >
                {latch ? "ON" : "OFF"}
              </Button>
            </ParamControl>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {Array.from({ length: numChops }, (_, i) => (
              <button
                key={i}
                onMouseDown={() => playChop(i)}
                onMouseUp={() => !latch && stopChop(i)}
                onMouseLeave={() => !latch && activeChops.has(i) && stopChop(i)}
                className={`aspect-square rounded-lg border transition-colors flex items-center justify-center text-sm font-mono ${activeChops.has(i) ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-primary/10"}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Granular Tab ----------
function GranularTab() {
  const [params, setParams] = useState<GranularParams>(DEFAULT_GRANULAR);
  const [playing, setPlaying] = useState(false);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);

  const loadFile = useCallback(async (file: File) => {
    AudioEngine.unlock();
    try {
      const ab = await file.arrayBuffer();
      const buf = await AudioEngine.decodeAudio(ab);
      setBuffer(buf);
      toast.success(`Loaded: ${file.name}`);
    } catch {
      toast.error("Failed to load audio");
    }
  }, []);

  const togglePlay = () => {
    AudioEngine.unlock();
    if (playing) {
      AudioEngine.stopGranular();
      setPlaying(false);
    } else {
      if (buffer) AudioEngine.startGranular(buffer, params);
      else AudioEngine.startGranular(null, params);
      setPlaying(true);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Granular Synthesis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) loadFile(f);
                }}
              />
              <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-sm hover:bg-primary/20">
                <Upload className="w-4 h-4" /> Load Audio
              </span>
            </label>
            <Button size="sm" onClick={togglePlay}>
              {playing ? (
                <>
                  <Square className="w-4 h-4 mr-1" /> Stop
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-1" /> Play
                </>
              )}
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <ParamControl label={`Grain Size (${params.grainSize}ms)`}>
              <Slider
                value={params.grainSize}
                min={5}
                max={500}
                step={1}
                onChange={(v) => setParams({ ...params, grainSize: v })}
              />
            </ParamControl>
            <ParamControl label={`Grain Rate (${params.grainRate.toFixed(1)}Hz)`}>
              <Slider
                value={params.grainRate}
                min={1}
                max={100}
                step={0.1}
                onChange={(v) => setParams({ ...params, grainRate: v })}
              />
            </ParamControl>
            <ParamControl label={`Pitch (${params.pitch.toFixed(1)} st)`}>
              <Slider
                value={params.pitch}
                min={-24}
                max={24}
                step={0.1}
                onChange={(v) => setParams({ ...params, pitch: v })}
              />
            </ParamControl>
            <ParamControl label={`Position (${(params.position * 100).toFixed(0)}%)`}>
              <Slider
                value={params.position}
                min={0}
                max={1}
                step={0.001}
                onChange={(v) => setParams({ ...params, position: v })}
              />
            </ParamControl>
            <ParamControl label={`Spread (${(params.spread * 100).toFixed(0)}%)`}>
              <Slider
                value={params.spread}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => setParams({ ...params, spread: v })}
              />
            </ParamControl>
            <ParamControl label={`Overlap (${params.overlap.toFixed(1)}x)`}>
              <Slider
                value={params.overlap}
                min={0.1}
                max={10}
                step={0.1}
                onChange={(v) => setParams({ ...params, overlap: v })}
              />
            </ParamControl>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Sound Design Tab ----------
function SoundDesignTab() {
  const [noiseType, setNoiseType] = useState("white");
  const [playing, setPlaying] = useState(false);
  const [droneFreq, setDroneFreq] = useState(55);
  const [subVol, setSubVol] = useState(0.5);

  const playNoise = () => {
    AudioEngine.unlock();
    if (playing) {
      AudioEngine.stopSample("noise");
      setPlaying(false);
    } else {
      AudioEngine.playSample("noise", noiseType);
      setPlaying(true);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <WaveIcon className="w-4 h-4 text-primary" /> Sound Design Tools
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Noise Generator</label>
            <div className="flex gap-2">
              <select
                value={noiseType}
                onChange={(e) => setNoiseType(e.target.value)}
                className="bg-card border border-border rounded px-2 py-1 text-sm"
              >
                <option value="white">White</option>
                <option value="pink">Pink</option>
                <option value="brown">Brown</option>
              </select>
              <Button size="sm" onClick={playNoise}>
                {playing ? "Stop" : "Play"}
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Drone Generator</label>
            <ParamControl label={`Frequency (${droneFreq}Hz)`}>
              <Slider value={droneFreq} min={20} max={200} step={1} onChange={setDroneFreq} />
            </ParamControl>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Sub Bass</label>
            <ParamControl label={`Volume (${subVol.toFixed(2)})`}>
              <Slider value={subVol} min={0} max={1} step={0.01} onChange={setSubVol} />
            </ParamControl>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Effects Tab ----------
function EffectsTab() {
  const [effects, setEffects] = useState<EffectParams>(DEFAULT_EFFECTS);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Sliders className="w-4 h-4 text-primary" /> Effects Rack
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <ParamControl label={`Reverb (${(effects.reverb * 100).toFixed(0)}%)`}>
              <Slider
                value={effects.reverb}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => {
                  setEffects({ ...effects, reverb: v });
                  AudioEngine.setEffects(effects);
                }}
              />
            </ParamControl>
            <ParamControl label={`Delay (${(effects.delay * 100).toFixed(0)}%)`}>
              <Slider
                value={effects.delay}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => {
                  setEffects({ ...effects, delay: v });
                  AudioEngine.setEffects(effects);
                }}
              />
            </ParamControl>
            <ParamControl label={`Filter Freq (${effects.filterFreq}Hz)`}>
              <Slider
                value={effects.filterFreq}
                min={100}
                max={8000}
                step={10}
                onChange={(v) => {
                  setEffects({ ...effects, filterFreq: v });
                  AudioEngine.setEffects(effects);
                }}
              />
            </ParamControl>
            <ParamControl label={`Distortion (${(effects.distortion * 100).toFixed(0)}%)`}>
              <Slider
                value={effects.distortion}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => {
                  setEffects({ ...effects, distortion: v });
                  AudioEngine.setEffects(effects);
                }}
              />
            </ParamControl>
            <ParamControl label={`Compressor (${(effects.compressor * 100).toFixed(0)}%)`}>
              <Slider
                value={effects.compressor}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => {
                  setEffects({ ...effects, compressor: v });
                  AudioEngine.setEffects(effects);
                }}
              />
            </ParamControl>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Sequencer Tab ----------
function SequencerTab() {
  const seqRef = useRef<SequencerEngine | null>(null);
  const [playing, setPlaying] = useState(false);
  const [seq, setSeq] = useState(createDefaultSequencer());
  const [currentStep, setCurrentStep] = useState(-1);

  if (!seqRef.current) seqRef.current = new SequencerEngine(AudioEngine);

  const toggle = () => {
    AudioEngine.unlock();
    if (playing) {
      seqRef.current?.stop();
      setPlaying(false);
      setCurrentStep(-1);
    } else {
      seqRef.current?.start();
      setPlaying(true);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Grid className="w-4 h-4 text-primary" /> Step Sequencer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={toggle}>
              {playing ? (
                <>
                  <Square className="w-4 h-4 mr-1" /> Stop
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-1" /> Play
                </>
              )}
            </Button>
            <ParamControl label={`Tempo (${seq.tempo} BPM)`}>
              <Slider
                value={seq.tempo}
                min={60}
                max={200}
                step={1}
                onChange={(v) => {
                  setSeq({ ...seq, tempo: v });
                  seqRef.current?.setTempo(v);
                }}
              />
            </ParamControl>
            <ParamControl label={`Swing (${(seq.swing * 100).toFixed(0)}%)`}>
              <Slider
                value={seq.swing}
                min={0}
                max={0.75}
                step={0.01}
                onChange={(v) => {
                  setSeq({ ...seq, swing: v });
                  seqRef.current?.setSwing(v);
                }}
              />
            </ParamControl>
          </div>
          <div className="space-y-2">
            {seq.tracks.map((track, ti) => (
              <div key={ti} className="flex items-center gap-2">
                <span className="text-xs w-16 truncate">{track.name}</span>
                <div className="flex gap-1 flex-1">
                  {track.steps.map((step, si) => (
                    <button
                      key={si}
                      onClick={() => {
                        const newSteps = [...track.steps];
                        newSteps[si] = { ...step, active: !step.active };
                        const newTracks = seq.tracks.map((t, j) =>
                          j === ti ? { ...t, steps: newSteps } : t,
                        );
                        setSeq({ ...seq, tracks: newTracks });
                        seqRef.current?.updateTrack(ti, { steps: newSteps });
                      }}
                      className={`flex-1 aspect-square rounded border transition-colors ${step.active ? "bg-primary border-primary" : "bg-card border-border hover:bg-primary/10"} ${currentStep === si ? "ring-2 ring-cyan-400" : ""}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- MIDI Tab ----------
function MIDITab() {
  const midiRef = useRef<MIDIInput | null>(null);
  const [status, setStatus] = useState("Not connected");
  const [lastNote, setLastNote] = useState("");

  const connect = async () => {
    try {
      if (!midiRef.current) midiRef.current = new MIDIInput();
      await midiRef.current.init((msg) => {
        if (msg.type === "noteon") {
          AudioEngine.unlock();
          AudioEngine.noteOn(midiToNoteName(msg.note), midiToFreq(msg.note), DEFAULT_SYNTH);
          setLastNote(`${midiToNoteName(msg.note)} vel: ${msg.velocity}`);
        } else if (msg.type === "noteoff") {
          AudioEngine.noteOff(midiToNoteName(msg.note));
        }
        setStatus(`Connected — ${msg.type} note: ${msg.note}`);
      });
      setStatus("MIDI connected");
    } catch {
      setStatus("MIDI not available");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Music className="w-4 h-4 text-primary" /> MIDI Input
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button size="sm" onClick={connect}>
            <Radio className="w-4 h-4 mr-1" /> Connect MIDI
          </Button>
          <div className="text-sm text-muted-foreground">Status: {status}</div>
          {lastNote && <div className="text-sm text-primary">Last: {lastNote}</div>}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- VINNY Tab ----------
function VinnyTab() {
  return <VinnyPlugin engine={AudioEngine} />;
}

// ---------- Visualizer Tab ----------
function VisualizerTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<Visualizer | null>(null);
  const [mode, setMode] = useState("spectrum");

  useEffect(() => {
    AudioEngine.unlock();
    if (!canvasRef.current) return;
    if (!vizRef.current) vizRef.current = new Visualizer(AudioEngine.ctx, AudioEngine.master);
    vizRef.current.attach(canvasRef.current);
    vizRef.current.setConfig({
      mode: mode as never,
      fftSize: 2048,
      smoothing: 0.8,
      color: "#06b4d4",
    });
    vizRef.current.start();
    return () => vizRef.current?.stop();
  }, [mode]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Visualizer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="bg-card border border-border rounded px-2 py-1 text-sm"
          >
            <option value="spectrum">Spectrum Bars</option>
            <option value="spectrogram">Spectrogram</option>
            <option value="oscilloscope">Oscilloscope</option>
            <option value="vectorscope">Vectorscope</option>
            <option value="loudness">Loudness Meter</option>
          </select>
          <canvas
            ref={canvasRef}
            width={800}
            height={400}
            className="w-full bg-black/50 rounded-lg border border-border"
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Recorder Tab ----------
function RecorderTab() {
  const recorderRef = useRef<AudioRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const toggleRecord = async () => {
    AudioEngine.unlock();
    if (recording) {
      const blob = await recorderRef.current?.stop();
      setRecording(false);
      if (blob) {
        AudioRecorder.downloadBlob(blob, `recording-${Date.now()}.wav`);
        toast.success("Recording saved");
      }
    } else {
      if (!recorderRef.current)
        recorderRef.current = new AudioRecorder(AudioEngine.ctx, AudioEngine.master);
      await recorderRef.current.start();
      setRecording(true);
      AudioRecorder.recordDuration(recorderRef.current, setElapsed);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Mic className="w-4 h-4 text-primary" /> Audio Recorder
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button size="sm" onClick={toggleRecord} variant={recording ? "destructive" : "default"}>
            {recording ? (
              <>
                <Square className="w-4 h-4 mr-1" /> Stop ({elapsed.toFixed(1)}s)
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 mr-1" /> Record
              </>
            )}
          </Button>
          <div className="text-sm text-muted-foreground">
            Records master output as WAV file (16-bit PCM).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Modulation Tab ----------
function ModulationTab() {
  const modRef = useRef<ModulationEngine | null>(null);
  const [lfoRate, setLfoRate] = useState(2);
  const [lfoDepth, setLfoDepth] = useState(0.3);
  const [target, setTarget] = useState("filter");

  useEffect(() => {
    AudioEngine.unlock();
    if (!modRef.current) modRef.current = new ModulationEngine(AudioEngine.ctx, AudioEngine.master);
    modRef.current.updateLFO(0, { rate: lfoRate, depth: lfoDepth });
  }, [lfoRate, lfoDepth]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" /> Modulation Matrix
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <ParamControl label={`LFO Rate (${lfoRate.toFixed(1)}Hz)`}>
              <Slider value={lfoRate} min={0.1} max={20} step={0.1} onChange={setLfoRate} />
            </ParamControl>
            <ParamControl label={`LFO Depth (${lfoDepth.toFixed(2)})`}>
              <Slider value={lfoDepth} min={0} max={1} step={0.01} onChange={setLfoDepth} />
            </ParamControl>
            <ParamControl label="Target">
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="bg-card border border-border rounded px-2 py-1 text-sm w-full"
              >
                <option value="filter">Filter</option>
                <option value="volume">Volume</option>
                <option value="delay">Delay</option>
                <option value="reverb">Reverb</option>
                <option value="distortion">Distortion</option>
              </select>
            </ParamControl>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Shared Components ----------
function ParamControl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
    />
  );
}
