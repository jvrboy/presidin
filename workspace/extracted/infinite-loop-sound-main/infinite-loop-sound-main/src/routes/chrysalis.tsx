import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Dna, Sparkles, Waves, Crosshair, Play, Pause, RotateCcw, Save } from "lucide-react";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/chrysalis")({
  head: () => ({ meta: [{ title: "CHRYSALIS — Sonic DNA Forge — DivergenceIQ" }] }),
  component: ChrysalisPage,
});

type Genome = {
  id: string;
  name: string;
  generation: number;
  traits: {
    harmonic: number;
    brightness: number;
    attack: number;
    decay: number;
    noise: number;
    modulation: number;
    spectralTilt: number;
    transientShape: number;
  };
  waveform: number[];
  rating: number;
  parentIds: string[];
};

type Branch = { genome: Genome; children: Genome[] };

function generateWaveform(traits: Genome["traits"], length = 256): number[] {
  const wave: number[] = [];
  for (let i = 0; i < length; i++) {
    const t = i / length;
    let sample = 0;
    for (let h = 1; h <= 8; h++) {
      const amp = Math.pow(traits.harmonic, h - 1) * (1 - traits.spectralTilt * 0.1 * h);
      sample += amp * Math.sin(2 * Math.PI * h * t + traits.modulation * Math.sin(t * 10));
    }
    const env =
      Math.exp(-t * (1 + traits.decay * 10)) * (1 - Math.exp(-t * 50 * (1 + traits.attack)));
    const noise = (Math.random() - 0.5) * traits.noise * 0.3;
    sample = sample * env * (0.5 + traits.brightness * 0.5) + noise;
    wave.push(Math.max(-1, Math.min(1, sample)));
  }
  return wave;
}

function randomGenome(name: string, generation = 0, parentIds: string[] = []): Genome {
  const traits = {
    harmonic: 0.3 + Math.random() * 0.5,
    brightness: Math.random(),
    attack: Math.random(),
    decay: 0.2 + Math.random() * 0.6,
    noise: Math.random() * 0.3,
    modulation: Math.random() * 0.5,
    spectralTilt: Math.random() * 0.8,
    transientShape: Math.random(),
  };
  return {
    id: `genome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    generation,
    traits,
    waveform: generateWaveform(traits),
    rating: 0,
    parentIds,
  };
}

function mutateGenome(parent: Genome, mutationRate = 0.3): Genome {
  const traits = { ...parent.traits };
  (Object.keys(traits) as Array<keyof typeof traits>).forEach((key) => {
    if (Math.random() < mutationRate) {
      const delta = (Math.random() - 0.5) * 0.3;
      traits[key] = Math.max(0, Math.min(1, traits[key] + delta));
    }
  });
  return {
    id: `genome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `${parent.name}.${Math.random().toString(36).slice(2, 4)}`,
    generation: parent.generation + 1,
    traits,
    waveform: generateWaveform(traits),
    rating: 0,
    parentIds: [parent.id],
  };
}

function crossbreed(a: Genome, b: Genome): Genome {
  const traits = {} as Genome["traits"];
  (Object.keys(a.traits) as Array<keyof Genome["traits"]>).forEach((key) => {
    const blend = Math.random();
    traits[key] = a.traits[key] * blend + b.traits[key] * (1 - blend);
  });
  return {
    id: `genome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `${a.name.slice(0, 3)}x${b.name.slice(0, 3)}`,
    generation: Math.max(a.generation, b.generation) + 1,
    traits,
    waveform: generateWaveform(traits),
    rating: 0,
    parentIds: [a.id, b.id],
  };
}

function extractGenomeFromAudio(samples: number[]): Genome {
  if (samples.length < 32) return randomGenome("captured");
  const n = Math.min(256, samples.length);
  const slice = samples.slice(0, n);
  const mean = slice.reduce((a, b) => a + b, 0) / n;
  const centered = slice.map((s) => s - mean);
  const peak = Math.max(...centered.map((s) => Math.abs(s))) || 1;
  const normalized = centered.map((s) => s / peak);

  let energy = 0;
  let highEnergy = 0;
  let lowEnergy = 0;
  for (let i = 0; i < normalized.length; i++) {
    energy += normalized[i] * normalized[i];
    if (i > normalized.length / 2) highEnergy += normalized[i] * normalized[i];
    else lowEnergy += normalized[i] * normalized[i];
  }
  const brightness = highEnergy / (energy || 1);
  const spectralTilt = 1 - lowEnergy / (energy || 1);

  let zeroCrossings = 0;
  for (let i = 1; i < normalized.length; i++) {
    if (normalized[i] >= 0 !== normalized[i - 1] >= 0) zeroCrossings++;
  }
  const harmonic = Math.max(0, 1 - zeroCrossings / (normalized.length / 4));

  const attack = Math.abs(normalized[0]);
  let decay = 0;
  for (let i = 1; i < normalized.length; i++) {
    if (Math.abs(normalized[i]) < Math.abs(normalized[i - 1])) decay++;
  }
  decay = decay / normalized.length;

  const noise = Math.max(0, 1 - harmonic) * 0.3;
  const modulation = (zeroCrossings / normalized.length) * 0.5;
  const transientShape = attack;

  const traits = {
    harmonic: Math.max(0, Math.min(1, harmonic)),
    brightness: Math.max(0, Math.min(1, brightness)),
    attack: Math.max(0, Math.min(1, attack)),
    decay: Math.max(0, Math.min(1, decay)),
    noise: Math.max(0, Math.min(1, noise)),
    modulation: Math.max(0, Math.min(1, modulation)),
    spectralTilt: Math.max(0, Math.min(1, spectralTilt)),
    transientShape: Math.max(0, Math.min(1, transientShape)),
  };

  return {
    id: `genome-${Date.now()}-captured`,
    name: "captured",
    generation: 0,
    traits,
    waveform: generateWaveform(traits),
    rating: 0,
    parentIds: [],
  };
}

function ChrysalisPage() {
  const [rootGenome, setRootGenome] = useState<Genome | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedGenome, setSelectedGenome] = useState<Genome | null>(null);
  const [crossPollA, setCrossPollA] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioSamples, setAudioSamples] = useState<number[]>([]);
  const [greenhouse, setGreenhouse] = useState<Genome[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef<number>(0);
  const recordingRef = useRef(false);

  const sowSeed = useCallback(() => {
    const seed = randomGenome("seed-0");
    setRootGenome(seed);
    const mutations = Array.from({ length: 8 }, () => mutateGenome(seed));
    setBranches([{ genome: seed, children: mutations }]);
    setSelectedGenome(seed);
  }, []);

  const evolve = useCallback(() => {
    if (!branches.length) return;
    const rated = branches[0].children.map((g) => ({ g, score: g.rating }));
    const sorted = rated.sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, 3).map((r) => r.g);
    const newChildren: Genome[] = [];
    for (const parent of top) {
      for (let i = 0; i < 3; i++) {
        const child = mutateGenome(parent, 0.25 + (1 - parent.rating) * 0.2);
        newChildren.push(child);
      }
    }
    const hybrids: Genome[] = [];
    for (let i = 0; i < top.length - 1; i++) {
      hybrids.push(crossbreed(top[i], top[i + 1]));
    }
    setBranches([{ genome: top[0], children: [...newChildren, ...hybrids].slice(0, 9) }]);
    toast.success(`Generation ${top[0].generation + 1} evolved`);
  }, [branches]);

  const rateGenome = (id: string, rating: number) => {
    setBranches(
      branches.map((b) => ({
        ...b,
        children: b.children.map((g) => (g.id === id ? { ...g, rating } : g)),
      })),
    );
  };

  const handleCrossPoll = (id: string) => {
    if (!crossPollA) {
      setCrossPollA(id);
      toast.info("Select second branch to cross-pollinate");
    } else {
      const a = branches[0].children.find((g) => g.id === crossPollA);
      const b = branches[0].children.find((g) => g.id === id);
      if (a && b) {
        const hybrid = crossbreed(a, b);
        setBranches([
          {
            genome: hybrid,
            children: [
              hybrid,
              mutateGenome(hybrid, 0.4),
              mutateGenome(hybrid, 0.4),
              mutateGenome(hybrid, 0.4),
              mutateGenome(hybrid, 0.4),
              mutateGenome(hybrid, 0.4),
              mutateGenome(hybrid, 0.4),
              mutateGenome(hybrid, 0.4),
              mutateGenome(hybrid, 0.4),
            ].slice(0, 9),
          },
        ]);
        toast.success(`Hybrid born: ${hybrid.name}`);
      }
      setCrossPollA(null);
    }
  };

  const playGenome = useCallback((genome: Genome) => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    const duration = 1.5;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const wf = genome.waveform;
    for (let i = 0; i < data.length; i++) {
      const idx = (i / data.length) * wf.length;
      const i0 = Math.floor(idx);
      const i1 = Math.min(wf.length - 1, i0 + 1);
      const frac = idx - i0;
      data[i] = (wf[i0] * (1 - frac) + wf[i1] * frac) * 0.3 * Math.exp((-i / data.length) * 2);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    source.connect(gain).connect(ctx.destination);
    source.start();
    setIsPlaying(true);
    source.onended = () => setIsPlaying(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      recordingRef.current = true;
      setRecording(true);
      const samples: number[] = [];
      const data = new Uint8Array(analyser.frequencyBinCount);
      const collect = () => {
        if (!recordingRef.current) return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        samples.push(avg / 128 - 1);
        if (samples.length < 256) {
          animRef.current = requestAnimationFrame(collect);
        } else {
          setAudioSamples(samples);
          setRecording(false);
        }
      };
      collect();
    } catch (e) {
      toast.error("Microphone access denied");
    }
  }, []);

  const stopRecording = useCallback(() => {
    recordingRef.current = false;
    setRecording(false);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (animRef.current) cancelAnimationFrame(animRef.current);
  }, []);

  const captureFromAudio = () => {
    if (audioSamples.length < 32) {
      toast.error("Not enough audio captured");
      return;
    }
    const genome = extractGenomeFromAudio(audioSamples);
    setRootGenome(genome);
    const mutations = Array.from({ length: 8 }, () => mutateGenome(genome));
    setBranches([{ genome, children: mutations }]);
    setSelectedGenome(genome);
    toast.success("Sonic genome extracted from audio!");
  };

  const saveToGreenhouse = (genome: Genome) => {
    setGreenhouse([...greenhouse, genome]);
    toast.success(`${genome.name} saved to Greenhouse`);
  };

  useEffect(() => {
    if (!canvasRef.current || !selectedGenome) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const wf = selectedGenome.waveform;
    let frame = 0;
    let raf = 0;
    const render = () => {
      ctx.fillStyle = "#0b1020";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      const step = w / wf.length;
      ctx.lineWidth = 2;
      const gradient = ctx.createLinearGradient(0, 0, w, 0);
      gradient.addColorStop(0, "#06b6d4");
      gradient.addColorStop(0.5, "#a78bfa");
      gradient.addColorStop(1, "#f59e0b");
      ctx.strokeStyle = gradient;
      ctx.beginPath();
      for (let i = 0; i < wf.length; i++) {
        const x = i * step;
        const breathe = Math.sin(frame * 0.02 + i * 0.05) * 2;
        const y = h / 2 + wf[i] * (h / 3) + breathe;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = "rgba(6, 182, 212, 0.1)";
      ctx.beginPath();
      for (let i = 0; i < wf.length; i++) {
        const x = i * step;
        const y = h / 2 + wf[i] * (h / 3);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();
      frame++;
      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [selectedGenome]);

  const traitLabels: Array<{ key: keyof Genome["traits"]; label: string }> = [
    { key: "harmonic", label: "Harmonic" },
    { key: "brightness", label: "Brightness" },
    { key: "attack", label: "Attack" },
    { key: "decay", label: "Decay" },
    { key: "noise", label: "Noise" },
    { key: "modulation", label: "Modulation" },
    { key: "spectralTilt", label: "Spectral Tilt" },
    { key: "transientShape", label: "Transient" },
  ];

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Dna className="w-6 h-6 text-primary" /> CHRYSALIS
            <span className="text-sm font-normal text-muted-foreground">Sonic DNA Forge</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Capture any sound, extract its sonic genome, cultivate mutations, and cross-pollinate
            hybrids in an evolutionary sound garden.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="bg-card border border-border p-6 rounded-lg space-y-4">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Capture & Plant
            </div>
            <button
              onClick={sowSeed}
              className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition flex items-center justify-center gap-2"
            >
              <Dna className="w-4 h-4" /> Sow Random Seed
            </button>
            <div className="border-t border-border pt-4 space-y-3">
              <div className="text-xs font-medium text-muted-foreground">
                Or capture from microphone:
              </div>
              {!recording ? (
                <button
                  onClick={startRecording}
                  className="w-full px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent transition flex items-center justify-center gap-2"
                >
                  <Waves className="w-4 h-4" /> Start Recording
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="w-full px-4 py-2 border border-bear/40 rounded-lg text-sm font-medium text-bear hover:bg-bear/10 transition flex items-center justify-center gap-2"
                >
                  <Pause className="w-4 h-4" /> Stop Recording
                </button>
              )}
              {audioSamples.length > 0 && (
                <button
                  onClick={captureFromAudio}
                  className="w-full px-4 py-2 bg-primary/10 text-primary border border-primary/30 rounded-lg text-sm font-medium hover:bg-primary/20 transition flex items-center justify-center gap-2"
                >
                  <Crosshair className="w-4 h-4" /> Extract Genome ({audioSamples.length} samples)
                </button>
              )}
            </div>
          </div>

          <div className="bg-card border border-border p-4 rounded-lg">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Waves className="w-4 h-4" /> Waveform Preview
            </div>
            <canvas
              ref={canvasRef}
              width={400}
              height={200}
              className="w-full rounded bg-[#0b1020]"
            />
            {selectedGenome && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => playGenome(selectedGenome)}
                  disabled={isPlaying}
                  className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" /> {isPlaying ? "Playing..." : "Play"}
                </button>
                <button
                  onClick={() => saveToGreenhouse(selectedGenome)}
                  className="px-3 py-2 border border-border rounded text-sm font-medium hover:bg-accent transition flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" /> Save
                </button>
              </div>
            )}
          </div>

          {selectedGenome && (
            <div className="bg-card border border-border p-4 rounded-lg space-y-3">
              <div className="text-sm font-semibold">Sonic Genome Card</div>
              <div className="text-xs text-muted-foreground font-mono">
                {selectedGenome.name} · Gen {selectedGenome.generation}
              </div>
              <div className="space-y-2">
                {traitLabels.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs w-20 text-muted-foreground">{label}</span>
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-cyan-500 to-amber-500"
                        style={{ width: `${selectedGenome.traits[key] * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono w-8 text-right">
                      {selectedGenome.traits[key].toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {branches.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">
                Evolutionary Garden — Generation {branches[0].genome.generation + 1}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={evolve}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> Evolve Next Gen
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {branches[0].children.map((genome) => (
                <div
                  key={genome.id}
                  onClick={() => setSelectedGenome(genome)}
                  className={`bg-card border rounded-lg p-3 cursor-pointer transition-all hover:border-primary/40 ${selectedGenome?.id === genome.id ? "border-primary ring-1 ring-primary/30" : "border-border"} ${crossPollA === genome.id ? "ring-2 ring-amber-400" : ""}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold">{genome.name}</span>
                    {genome.rating > 0 && (
                      <span className="text-xs text-amber-400">★{genome.rating}</span>
                    )}
                  </div>
                  <div className="h-12 flex items-center justify-center">
                    <svg viewBox="0 0 100 30" className="w-full h-full">
                      <polyline
                        fill="none"
                        stroke={genome.rating > 0 ? "#f59e0b" : "#06b6d4"}
                        strokeWidth="1.5"
                        points={genome.waveform
                          .slice(0, 50)
                          .map((v, i) => `${i * 2},${15 + v * 12}`)
                          .join(" ")}
                      />
                    </svg>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-1">
                      {[1, 2, 3].map((r) => (
                        <button
                          key={r}
                          onClick={(e) => {
                            e.stopPropagation();
                            rateGenome(genome.id, r);
                          }}
                          className={`w-5 h-5 rounded text-[10px] font-bold ${genome.rating === r ? "bg-amber-400 text-black" : "bg-muted text-muted-foreground hover:bg-amber-400/30"}`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCrossPoll(genome.id);
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded ${crossPollA === genome.id ? "bg-amber-400 text-black" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                    >
                      {crossPollA === genome.id ? "B" : "x"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {greenhouse.length > 0 && (
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-sm font-semibold mb-3">
              Greenhouse ({greenhouse.length} patches)
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {greenhouse.map((g) => (
                <div
                  key={g.id}
                  className="bg-background border border-border rounded p-2 text-center cursor-pointer hover:border-primary/40"
                  onClick={() => {
                    setSelectedGenome(g);
                    playGenome(g);
                  }}
                >
                  <div className="font-mono text-[10px] truncate">{g.name}</div>
                  <div className="text-[9px] text-muted-foreground">Gen {g.generation}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
