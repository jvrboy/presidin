// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from "react";
import { AudioEngine, noteToFreq, NOTE_NAMES, SCALES } from "@/lib/audio/engine";
import {
  VinnyState,
  VinnyController,
  createDefaultVinnyState,
  createDefaultFX,
  createDefaultLFO,
  createDefaultEnvelope,
  computeDNA,
  generateSuggestions,
  takeSnapshot,
  migrateGenre,
  applyVibe,
  parseTextToSound,
  instrumentToEngineConfig,
  autoChop,
  transientSlice,
  chordToNotes,
  generateMelody,
  isNoteInScale,
  snapToScale,
  evolveConfig,
  analyzeAudio,
  type FXType,
  type FXSlot,
  type Genre,
  type Vibe,
  type InstrumentType,
  type OscShape,
  type FilterType,
  type LFOWave,
  type VizMode,
  type SmartSuggestion,
} from "@/lib/audio/vinny";

const SECTIONS = [
  { id: "engine", label: "Sound Engine" },
  { id: "text2sound", label: "Text-to-Sound" },
  { id: "instruments", label: "Sound Design" },
  { id: "identifier", label: "Audio ID" },
  { id: "sampler", label: "Sampler" },
  { id: "theory", label: "Theory" },
  { id: "midi", label: "MIDI" },
  { id: "loops", label: "Loops" },
  { id: "effects", label: "Effects Rack" },
  { id: "modulation", label: "Modulation" },
  { id: "mixer", label: "Mixer" },
  { id: "export", label: "Export" },
  { id: "visualizer", label: "Visualizer" },
  { id: "workflow", label: "Workflow AI" },
  { id: "vinny-features", label: "VINNY Features" },
] as const;

const GENRES: Genre[] = [
  "trap",
  "lofi",
  "house",
  "techno",
  "dnb",
  "ambient",
  "rock",
  "jazz",
  "classical",
  "pop",
  "rnb",
  "metal",
  "folk",
  "reggae",
  "blues",
];
const VIBES: Vibe[] = [
  "happy",
  "sad",
  "energetic",
  "calm",
  "dark",
  "mysterious",
  "epic",
  "nostalgic",
  "aggressive",
  "dreamy",
  "tense",
  "uplifting",
];
const INSTRUMENTS: InstrumentType[] = [
  "piano",
  "guitar",
  "violin",
  "cello",
  "flute",
  "trumpet",
  "drum",
  "vocal-choir",
  "vocal-male",
  "vocal-female",
  "strings-ensemble",
  "brass-section",
  "harp",
  "marimba",
];
const FX_TYPES: FXType[] = [
  "compressor",
  "limiter",
  "gate",
  "expander",
  "eq3",
  "eq8",
  "dynamic-eq",
  "reverb",
  "delay",
  "chorus",
  "phaser",
  "flanger",
  "tremolo",
  "distortion",
  "fuzz",
  "overdrive",
  "bitcrush",
  "saturation",
  "amp",
  "cabinet",
  "halfspeed",
  "vibrato",
  "autopan",
  "portal",
  "shimmer",
  "freeze",
  "reverse",
  "granular-fx",
  "vocoder",
  "pitch-shift",
  "harmonizer",
  "formant",
  "stereo-widener",
  "mid-side",
  "transient-shaper",
];
const OSC_SHAPES: OscShape[] = ["sine", "sawtooth", "square", "triangle", "noise", "wavetable"];
const FILTER_TYPES: FilterType[] = [
  "lowpass",
  "highpass",
  "bandpass",
  "notch",
  "allpass",
  "comb",
  "formant",
];
const LFO_WAVES: LFOWave[] = ["sine", "triangle", "saw", "square", "random", "s&h", "custom"];
const VIZ_MODES: VizMode[] = [
  "spectrum",
  "spectrogram",
  "oscilloscope",
  "vectorscope",
  "loudness",
  "sonogram",
  "phase",
  "waterfall",
  "radial",
  "3d-bars",
];
const SCALE_TYPES = Object.keys(SCALES);

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="text-cyan-400 font-mono">
          {value.toFixed(step < 1 ? 2 : 0)}
          {unit ?? ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-cyan-500"
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? "bg-cyan-500" : "bg-slate-600"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${checked ? "translate-x-5" : ""}`}
        />
      </button>
      {label}
    </label>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs text-slate-400">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:border-cyan-500 outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-200 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function MiniKeyboard({
  onNoteOn,
  onNoteOff,
}: {
  onNoteOn: (midi: number) => void;
  onNoteOff: (midi: number) => void;
}) {
  const [active, setActive] = useState<Set<number>>(new Set());
  const whiteKeys = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23];
  const blackKeys = [1, 3, 6, 8, 10, 13, 15, 18, 20, 22];

  const press = (midi: number) => {
    onNoteOn(midi + 48);
    setActive((s) => new Set(s).add(midi));
  };
  const release = (midi: number) => {
    onNoteOff(midi + 48);
    setActive((s) => {
      const n = new Set(s);
      n.delete(midi);
      return n;
    });
  };

  return (
    <div className="relative h-20 flex">
      {whiteKeys.map((k) => (
        <button
          key={k}
          onMouseDown={() => press(k)}
          onMouseUp={() => release(k)}
          onMouseLeave={() => active.has(k) && release(k)}
          className={`flex-1 border border-slate-600 rounded-b-md flex items-end justify-center pb-1 text-[10px] ${active.has(k) ? "bg-cyan-500 text-white" : "bg-slate-200 text-slate-700"}`}
        >
          {NOTE_NAMES[k % 12]}
        </button>
      ))}
      <div className="absolute top-0 left-0 right-0 h-12 flex pointer-events-none">
        {blackKeys.map((k) => {
          const pos = whiteKeys.indexOf(k - 1) + 1;
          return (
            <button
              key={k}
              onMouseDown={(e) => {
                e.stopPropagation();
                press(k);
              }}
              onMouseUp={(e) => {
                e.stopPropagation();
                release(k);
              }}
              onMouseLeave={() => active.has(k) && release(k)}
              style={{
                position: "absolute",
                left: `calc(${(pos / whiteKeys.length) * 100}% - 12px)`,
                width: "24px",
              }}
              className={`h-full rounded-b-md text-[8px] flex items-end justify-center pb-1 pointer-events-auto ${active.has(k) ? "bg-cyan-400 text-white" : "bg-slate-900 text-slate-400 border border-slate-700"}`}
            >
              {NOTE_NAMES[k % 12]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function VinnyPlugin({ engine }: { engine: AudioEngine }) {
  const [state, setState] = useState<VinnyState>(createDefaultVinnyState());
  const [activeSection, setActiveSection] = useState<string>("engine");
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [dna, setDna] = useState<ReturnType<typeof computeDNA> | null>(null);
  const controllerRef = useRef<VinnyController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  if (!controllerRef.current) {
    controllerRef.current = new VinnyController(engine, state);
  }

  const updateState = useCallback((partial: Partial<VinnyState>) => {
    setState((prev) => {
      const next = { ...prev, ...partial };
      controllerRef.current?.updateState(next);
      return next;
    });
  }, []);

  const updateSoundEngine = useCallback((partial: Partial<VinnyState["soundEngine"]>) => {
    setState((prev) => {
      const next = { ...prev, soundEngine: { ...prev.soundEngine, ...partial } };
      controllerRef.current?.updateState(next);
      return next;
    });
  }, []);

  const noteOn = useCallback(
    (midi: number) => {
      if (state.scaleGuardian.enabled && state.scaleGuardian.snapMode === "hard") {
        midi = snapToScale(midi, state.theory.key, state.theory.scaleType);
      }
      controllerRef.current?.noteOn(midi);
    },
    [state.scaleGuardian, state.theory],
  );

  const noteOff = useCallback((midi: number) => {
    controllerRef.current?.noteOff(midi);
  }, []);

  useEffect(() => {
    setSuggestions(generateSuggestions(state.theory, state.soundEngine));
    setDna(computeDNA(state.soundEngine, state.effects));
  }, [state.theory, state.soundEngine, state.effects]);

  useEffect(() => {
    if (activeSection !== "visualizer" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const analyser = engine.ctx.createAnalyser();
    analyser.fftSize = state.visualizer.fftSize;
    analyser.smoothingTimeConstant = state.visualizer.smoothing;
    engine.master.connect(analyser);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.width,
        h = canvas.height;
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, w, h);
      if (state.visualizer.mode === "spectrum" || state.visualizer.mode === "3d-bars") {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const bars = 64;
        const bw = w / bars;
        for (let i = 0; i < bars; i++) {
          const v = data[Math.floor((i / bars) * data.length)] / 255;
          const bh = v * h;
          const hue = (i / bars) * 240 + 180;
          ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
          ctx.fillRect(i * bw, h - bh, bw - 1, bh);
        }
      } else if (state.visualizer.mode === "oscilloscope") {
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        ctx.strokeStyle = "#06b4d4";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
          const x = (i / data.length) * w;
          const y = (data[i] * 0.5 + 0.5) * h;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < data.length; i++) {
          const v = data[i] / 255;
          ctx.fillStyle = `hsl(${v * 240 + 180}, 80%, ${v * 50}%)`;
          ctx.fillRect(i * (w / data.length), 0, w / data.length, h);
        }
      }
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      engine.master.disconnect(analyser);
    };
  }, [activeSection, engine, state.visualizer]);

  const renderEngine = () => (
    <div className="space-y-4">
      <SectionCard title="Oscillators">
        <div className="space-y-3">
          {state.soundEngine.oscillators.map((osc, i) => (
            <div key={osc.id} className="bg-slate-800/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">OSC {i + 1}</span>
                <Select<OscShape>
                  label=""
                  value={osc.shape}
                  options={OSC_SHAPES}
                  onChange={(v) =>
                    updateSoundEngine({
                      oscillators: state.soundEngine.oscillators.map((o, j) =>
                        j === i ? { ...o, shape: v } : o,
                      ),
                    })
                  }
                />
              </div>
              <Slider
                label="Detune"
                value={osc.detune}
                min={-50}
                max={50}
                step={1}
                unit="c"
                onChange={(v) =>
                  updateSoundEngine({
                    oscillators: state.soundEngine.oscillators.map((o, j) =>
                      j === i ? { ...o, detune: v } : o,
                    ),
                  })
                }
              />
              <Slider
                label="Volume"
                value={osc.volume}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) =>
                  updateSoundEngine({
                    oscillators: state.soundEngine.oscillators.map((o, j) =>
                      j === i ? { ...o, volume: v } : o,
                    ),
                  })
                }
              />
              <Slider
                label="Unison"
                value={osc.unison}
                min={1}
                max={7}
                step={1}
                onChange={(v) =>
                  updateSoundEngine({
                    oscillators: state.soundEngine.oscillators.map((o, j) =>
                      j === i ? { ...o, unison: v } : o,
                    ),
                  })
                }
              />
              <Slider
                label="Unison Spread"
                value={osc.unisonSpread}
                min={0}
                max={50}
                step={1}
                unit="c"
                onChange={(v) =>
                  updateSoundEngine({
                    oscillators: state.soundEngine.oscillators.map((o, j) =>
                      j === i ? { ...o, unisonSpread: v } : o,
                    ),
                  })
                }
              />
              <Slider
                label="Frequency Mult"
                value={osc.frequency}
                min={0.25}
                max={4}
                step={0.01}
                unit="x"
                onChange={(v) =>
                  updateSoundEngine({
                    oscillators: state.soundEngine.oscillators.map((o, j) =>
                      j === i ? { ...o, frequency: v } : o,
                    ),
                  })
                }
              />
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Filter">
        <div className="space-y-3">
          <Select<FilterType>
            label="Type"
            value={state.soundEngine.filter.type}
            options={FILTER_TYPES}
            onChange={(v) =>
              updateSoundEngine({ filter: { ...state.soundEngine.filter, type: v } })
            }
          />
          <Slider
            label="Cutoff"
            value={state.soundEngine.filter.cutoff}
            min={50}
            max={12000}
            step={10}
            unit="Hz"
            onChange={(v) =>
              updateSoundEngine({ filter: { ...state.soundEngine.filter, cutoff: v } })
            }
          />
          <Slider
            label="Resonance"
            value={state.soundEngine.filter.resonance}
            min={0.1}
            max={10}
            step={0.1}
            unit="Q"
            onChange={(v) =>
              updateSoundEngine({ filter: { ...state.soundEngine.filter, resonance: v } })
            }
          />
          <Slider
            label="Drive"
            value={state.soundEngine.filter.drive}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) =>
              updateSoundEngine({ filter: { ...state.soundEngine.filter, drive: v } })
            }
          />
          <Slider
            label="Key Tracking"
            value={state.soundEngine.filter.keyTracking}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) =>
              updateSoundEngine({ filter: { ...state.soundEngine.filter, keyTracking: v } })
            }
          />
          <Slider
            label="Env Amount"
            value={state.soundEngine.filter.envAmount}
            min={-1}
            max={1}
            step={0.01}
            onChange={(v) =>
              updateSoundEngine({ filter: { ...state.soundEngine.filter, envAmount: v } })
            }
          />
        </div>
      </SectionCard>
      <SectionCard title="Amp Envelope">
        <Slider
          label="Attack"
          value={state.soundEngine.ampEnv.attack}
          min={0.001}
          max={2}
          step={0.001}
          unit="s"
          onChange={(v) =>
            updateSoundEngine({ ampEnv: { ...state.soundEngine.ampEnv, attack: v } })
          }
        />
        <div className="h-2" />
        <Slider
          label="Decay"
          value={state.soundEngine.ampEnv.decay}
          min={0.001}
          max={2}
          step={0.001}
          unit="s"
          onChange={(v) => updateSoundEngine({ ampEnv: { ...state.soundEngine.ampEnv, decay: v } })}
        />
        <div className="h-2" />
        <Slider
          label="Sustain"
          value={state.soundEngine.ampEnv.sustain}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) =>
            updateSoundEngine({ ampEnv: { ...state.soundEngine.ampEnv, sustain: v } })
          }
        />
        <div className="h-2" />
        <Slider
          label="Release"
          value={state.soundEngine.ampEnv.release}
          min={0.001}
          max={3}
          step={0.001}
          unit="s"
          onChange={(v) =>
            updateSoundEngine({ ampEnv: { ...state.soundEngine.ampEnv, release: v } })
          }
        />
      </SectionCard>
      <SectionCard title="Global">
        <Slider
          label="Master Volume"
          value={state.soundEngine.masterVolume}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateSoundEngine({ masterVolume: v })}
        />
        <div className="h-2" />
        <Slider
          label="Glide"
          value={state.soundEngine.glide}
          min={0}
          max={1}
          step={0.01}
          unit="s"
          onChange={(v) => updateSoundEngine({ glide: v })}
        />
        <div className="h-2" />
        <Slider
          label="Bitcrush"
          value={state.soundEngine.bitcrush}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateSoundEngine({ bitcrush: v })}
        />
        <div className="h-2" />
        <Toggle
          label="Mono Mode"
          checked={state.soundEngine.monoMode}
          onChange={(v) => updateSoundEngine({ monoMode: v })}
        />
        <Toggle
          label="Legato"
          checked={state.soundEngine.legato}
          onChange={(v) => updateSoundEngine({ legato: v })}
        />
      </SectionCard>
      <MiniKeyboard onNoteOn={noteOn} onNoteOff={noteOff} />
    </div>
  );

  const renderText2Sound = () => (
    <div className="space-y-4">
      <SectionCard title="Text-to-Sound AI">
        <div className="space-y-3">
          <textarea
            value={state.textToSound.prompt}
            onChange={(e) =>
              updateState({ textToSound: { ...state.textToSound, prompt: e.target.value } })
            }
            placeholder="Describe a sound: 'warm dark cinematic pad with slow movement'"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:border-cyan-500 outline-none resize-none"
            rows={3}
          />
          <Select<typeof state.textToSound.style>
            label="Style"
            value={state.textToSound.style}
            options={
              [
                "pad",
                "pluck",
                "bass",
                "lead",
                "texture",
                "percussion",
                "vocal",
                "cinematic",
              ] as const
            }
            onChange={(v) => updateState({ textToSound: { ...state.textToSound, style: v } })}
          />
          <Slider
            label="Complexity"
            value={state.textToSound.complexity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => updateState({ textToSound: { ...state.textToSound, complexity: v } })}
          />
          <Slider
            label="Brightness"
            value={state.textToSound.brightness}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => updateState({ textToSound: { ...state.textToSound, brightness: v } })}
          />
          <Slider
            label="Warmth"
            value={state.textToSound.warmth}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => updateState({ textToSound: { ...state.textToSound, warmth: v } })}
          />
          <Slider
            label="Motion"
            value={state.textToSound.motion}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => updateState({ textToSound: { ...state.textToSound, motion: v } })}
          />
          <button
            onClick={() => {
              controllerRef.current?.generateFromText();
              updateState({
                soundEngine: controllerRef.current?.state.soundEngine ?? state.soundEngine,
              });
            }}
            className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-semibold text-white transition-colors"
          >
            Generate Sound
          </button>
        </div>
      </SectionCard>
      <SectionCard title="Keywords">
        <div className="flex flex-wrap gap-2">
          {[
            "warm",
            "bright",
            "dark",
            "aggressive",
            "soft",
            "metallic",
            "glassy",
            "gritty",
            "clean",
            "spacey",
          ].map((k) => (
            <button
              key={k}
              onClick={() =>
                updateState({
                  textToSound: { ...state.textToSound, prompt: state.textToSound.prompt + " " + k },
                })
              }
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300 border border-slate-700"
            >
              {k}
            </button>
          ))}
        </div>
      </SectionCard>
      <MiniKeyboard onNoteOn={noteOn} onNoteOff={noteOff} />
    </div>
  );

  const renderInstruments = () => (
    <div className="space-y-4">
      <SectionCard title="Ultra-Realistic Sound Design">
        <Select<InstrumentType>
          label="Instrument"
          value={state.instrument.type}
          options={INSTRUMENTS}
          onChange={(v) => updateState({ instrument: { ...state.instrument, type: v } })}
        />
        <div className="h-3" />
        <Slider
          label="Body Resonance"
          value={state.instrument.bodyResonance}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateState({ instrument: { ...state.instrument, bodyResonance: v } })}
        />
        <div className="h-2" />
        <Slider
          label="String Stiffness"
          value={state.instrument.stringStiffness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateState({ instrument: { ...state.instrument, stringStiffness: v } })}
        />
        <div className="h-2" />
        <Slider
          label="Attack Noise"
          value={state.instrument.attackNoise}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateState({ instrument: { ...state.instrument, attackNoise: v } })}
        />
        <div className="h-2" />
        <Slider
          label="Harmonic Content"
          value={state.instrument.harmonicContent}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateState({ instrument: { ...state.instrument, harmonicContent: v } })}
        />
        <div className="h-2" />
        <Slider
          label="Breath Noise"
          value={state.instrument.breathNoise}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateState({ instrument: { ...state.instrument, breathNoise: v } })}
        />
        <div className="h-2" />
        <Slider
          label="Sympathetic Resonance"
          value={state.instrument.sympatheticResonance}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) =>
            updateState({ instrument: { ...state.instrument, sympatheticResonance: v } })
          }
        />
        <div className="h-2" />
        <Slider
          label="Room Ambience"
          value={state.instrument.roomAmbience}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateState({ instrument: { ...state.instrument, roomAmbience: v } })}
        />
        <div className="h-3" />
        <button
          onClick={() => {
            controllerRef.current?.loadInstrument();
            updateState({
              soundEngine: controllerRef.current?.state.soundEngine ?? state.soundEngine,
            });
          }}
          className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-semibold text-white transition-colors"
        >
          Load Instrument
        </button>
      </SectionCard>
      <MiniKeyboard onNoteOn={noteOn} onNoteOff={noteOff} />
    </div>
  );

  const renderIdentifier = () => (
    <div className="space-y-4">
      <SectionCard title="Audio Identifier & Deconstructor">
        <p className="text-sm text-slate-400 mb-3">
          Upload an audio file to analyze its frequency content, harmonics, transients, and
          estimated instrument.
        </p>
        <input
          type="file"
          accept="audio/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const arrayBuf = await file.arrayBuffer();
            const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);
            const analysis = await analyzeAudio(engine, audioBuf);
            updateState({ sampler: { ...state.sampler, buffer: audioBuf } });
            (window as unknown as Record<string, unknown>).vinnyAnalysis = analysis;
          }}
          className="w-full text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-cyan-600 file:text-white"
        />
      </SectionCard>
    </div>
  );

  const renderSampler = () => (
    <div className="space-y-4">
      <SectionCard title="Sampler & Resampling">
        <input
          type="file"
          accept="audio/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const arrayBuf = await file.arrayBuffer();
            const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);
            const chops = autoChop(audioBuf, state.sampler.chopSize);
            updateState({ sampler: { ...state.sampler, buffer: audioBuf, chops } });
          }}
          className="w-full text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-cyan-600 file:text-white"
        />
        <div className="h-3" />
        <Slider
          label="Chop Size"
          value={state.sampler.chopSize}
          min={0.05}
          max={4}
          step={0.05}
          unit="s"
          onChange={(v) => updateState({ sampler: { ...state.sampler, chopSize: v } })}
        />
        <div className="h-2" />
        <Slider
          label="Resample Rate"
          value={state.sampler.resampleRate}
          min={0.25}
          max={4}
          step={0.01}
          unit="x"
          onChange={(v) => updateState({ sampler: { ...state.sampler, resampleRate: v } })}
        />
        <div className="h-2" />
        <Slider
          label="Bit Depth"
          value={state.sampler.bitDepth}
          min={4}
          max={32}
          step={1}
          unit="bit"
          onChange={(v) => updateState({ sampler: { ...state.sampler, bitDepth: v } })}
        />
        <div className="h-2" />
        <Slider
          label="Timestretch"
          value={state.sampler.timestretch}
          min={0.25}
          max={4}
          step={0.01}
          unit="x"
          onChange={(v) => updateState({ sampler: { ...state.sampler, timestretch: v } })}
        />
        <div className="h-2" />
        <Slider
          label="Pitch Shift"
          value={state.sampler.pitchShift}
          min={-12}
          max={12}
          step={1}
          unit=" st"
          onChange={(v) => updateState({ sampler: { ...state.sampler, pitchShift: v } })}
        />
        <div className="h-2" />
        <Slider
          label="Slice Sensitivity"
          value={state.sampler.sliceSensitivity}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateState({ sampler: { ...state.sampler, sliceSensitivity: v } })}
        />
        <div className="h-3" />
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (state.sampler.buffer)
                updateState({
                  sampler: {
                    ...state.sampler,
                    chops: autoChop(state.sampler.buffer, state.sampler.chopSize),
                  },
                });
            }}
            className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-semibold text-white"
          >
            Auto Chop
          </button>
          <button
            onClick={() => {
              if (state.sampler.buffer)
                updateState({
                  sampler: {
                    ...state.sampler,
                    chops: transientSlice(state.sampler.buffer, state.sampler.sliceSensitivity),
                  },
                });
            }}
            className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-semibold text-white"
          >
            Transient Slice
          </button>
        </div>
      </SectionCard>
      {state.sampler.chops.length > 0 && (
        <SectionCard title={`Chops (${state.sampler.chops.length})`}>
          <div className="grid grid-cols-4 gap-2">
            {state.sampler.chops.slice(0, 32).map((chop, i) => (
              <button
                key={chop.id}
                onClick={() => {
                  if (!state.sampler.buffer) return;
                  const src = engine.ctx.createBufferSource();
                  src.buffer = state.sampler.buffer;
                  src.playbackRate.value =
                    state.sampler.resampleRate * Math.pow(2, chop.pitch / 12);
                  const gain = engine.ctx.createGain();
                  gain.gain.value = chop.volume;
                  src.connect(gain);
                  gain.connect(engine.master);
                  src.start(0, chop.start, (chop.end - chop.start) / state.sampler.resampleRate);
                }}
                className="aspect-square bg-slate-800 hover:bg-cyan-700 border border-slate-700 rounded-lg flex items-center justify-center text-xs font-mono text-slate-300"
              >
                {i + 1}
              </button>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );

  const renderTheory = () => (
    <div className="space-y-4">
      <SectionCard title="Melody/Harmony/Theory Engine">
        <Select<string>
          label="Key"
          value={state.theory.key}
          options={NOTE_NAMES}
          onChange={(v) => updateState({ theory: { ...state.theory, key: v } })}
        />
        <div className="h-3" />
        <Select<string>
          label="Scale"
          value={state.theory.scaleType}
          options={SCALE_TYPES}
          onChange={(v) => updateState({ theory: { ...state.theory, scaleType: v } })}
        />
        <div className="h-3" />
        <div className="flex gap-2">
          {state.theory.chordProgression.map((chord, i) => (
            <div key={i} className="flex-1 bg-slate-800 rounded-lg p-2 text-center">
              <div className="text-xs text-slate-400">Chord {i + 1}</div>
              <div className="text-lg font-bold text-cyan-400">{chord}</div>
              <div className="text-[10px] text-slate-500">
                {chordToNotes(chord, state.theory.key, state.theory.scaleType)
                  .map((n) => NOTE_NAMES[n % 12])
                  .join(" ")}
              </div>
            </div>
          ))}
        </div>
        <div className="h-3" />
        <Slider
          label="Harmonic Rhythm"
          value={state.theory.harmonicRhythm}
          min={1}
          max={8}
          step={1}
          unit=" beats"
          onChange={(v) => updateState({ theory: { ...state.theory, harmonicRhythm: v } })}
        />
        <div className="h-2" />
        <Toggle
          label="Voice Leading"
          checked={state.theory.voiceLeading}
          onChange={(v) => updateState({ theory: { ...state.theory, voiceLeading: v } })}
        />
        <Toggle
          label="Counterpoint"
          checked={state.theory.counterpoint}
          onChange={(v) => updateState({ theory: { ...state.theory, counterpoint: v } })}
        />
        <div className="h-3" />
        <button
          onClick={() => {
            const melody = generateMelody(state.theory, 4, Date.now());
            melody.forEach((bar, bi) => {
              bar.forEach((midi, ni) => {
                if (midi < 0) return;
                setTimeout(() => noteOn(midi), (bi * 4 + ni) * 250);
                setTimeout(() => noteOff(midi), (bi * 4 + ni) * 250 + 200);
              });
            });
          }}
          className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-semibold text-white"
        >
          Generate & Play Melody
        </button>
      </SectionCard>
      <SectionCard title="Scale Guardian">
        <Toggle
          label="Enabled"
          checked={state.scaleGuardian.enabled}
          onChange={(v) => updateState({ scaleGuardian: { ...state.scaleGuardian, enabled: v } })}
        />
        <Toggle
          label="Auto-Correct"
          checked={state.scaleGuardian.autoCorrect}
          onChange={(v) =>
            updateState({ scaleGuardian: { ...state.scaleGuardian, autoCorrect: v } })
          }
        />
        <Toggle
          label="Highlight Out-of-Scale"
          checked={state.scaleGuardian.highlightOutOfScale}
          onChange={(v) =>
            updateState({ scaleGuardian: { ...state.scaleGuardian, highlightOutOfScale: v } })
          }
        />
        <Select<typeof state.scaleGuardian.snapMode>
          label="Snap Mode"
          value={state.scaleGuardian.snapMode}
          options={["off", "soft", "hard"] as const}
          onChange={(v) => updateState({ scaleGuardian: { ...state.scaleGuardian, snapMode: v } })}
        />
      </SectionCard>
    </div>
  );

  const renderMIDI = () => (
    <div className="space-y-4">
      <SectionCard title="MIDI & Performance">
        <Select<typeof state.midi.velocityCurve>
          label="Velocity Curve"
          value={state.midi.velocityCurve}
          options={["linear", "exponential", "logarithmic", "s-curve"] as const}
          onChange={(v) => updateState({ midi: { ...state.midi, velocityCurve: v } })}
        />
        <div className="h-2" />
        <Slider
          label="Velocity Min"
          value={state.midi.velocityMin}
          min={0}
          max={127}
          step={1}
          onChange={(v) => updateState({ midi: { ...state.midi, velocityMin: v } })}
        />
        <Slider
          label="Velocity Max"
          value={state.midi.velocityMax}
          min={0}
          max={127}
          step={1}
          onChange={(v) => updateState({ midi: { ...state.midi, velocityMax: v } })}
        />
        <Slider
          label="Aftertouch"
          value={state.midi.aftertouchSensitivity}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateState({ midi: { ...state.midi, aftertouchSensitivity: v } })}
        />
        <Slider
          label="Pitch Bend Range"
          value={state.midi.pitchBendSensitivity}
          min={1}
          max={12}
          step={1}
          unit=" st"
          onChange={(v) => updateState({ midi: { ...state.midi, pitchBendSensitivity: v } })}
        />
        <Toggle
          label="Sustain Pedal"
          checked={state.midi.sustainPedal}
          onChange={(v) => updateState({ midi: { ...state.midi, sustainPedal: v } })}
        />
        <Toggle
          label="Expression Pedal"
          checked={state.midi.expressionPedal}
          onChange={(v) => updateState({ midi: { ...state.midi, expressionPedal: v } })}
        />
        <Toggle
          label="MPE"
          checked={state.midi.mpe}
          onChange={(v) => updateState({ midi: { ...state.midi, mpe: v } })}
        />
      </SectionCard>
      <SectionCard title="Arpeggiator">
        <Toggle
          label="Enabled"
          checked={state.midi.arpeggiator}
          onChange={(v) => updateState({ midi: { ...state.midi, arpeggiator: v } })}
        />
        <Select<typeof state.midi.arpPattern>
          label="Pattern"
          value={state.midi.arpPattern}
          options={["up", "down", "updown", "random", "asplayed"] as const}
          onChange={(v) => updateState({ midi: { ...state.midi, arpPattern: v } })}
        />
        <Slider
          label="Rate"
          value={state.midi.arpRate}
          min={1}
          max={32}
          step={1}
          unit="Hz"
          onChange={(v) => updateState({ midi: { ...state.midi, arpRate: v } })}
        />
        <Slider
          label="Octaves"
          value={state.midi.arpOctaves}
          min={1}
          max={4}
          step={1}
          onChange={(v) => updateState({ midi: { ...state.midi, arpOctaves: v } })}
        />
      </SectionCard>
      <SectionCard title="Chord Mode">
        <Toggle
          label="Enabled"
          checked={state.midi.chordMode}
          onChange={(v) => updateState({ midi: { ...state.midi, chordMode: v } })}
        />
        <Select<typeof state.midi.chordShape>
          label="Shape"
          value={state.midi.chordShape}
          options={["triad", "seventh", "sus4", "add9", "power"] as const}
          onChange={(v) => updateState({ midi: { ...state.midi, chordShape: v } })}
        />
      </SectionCard>
    </div>
  );

  const renderLoops = () => (
    <div className="space-y-4">
      <SectionCard title="Loop Creation & Reshaping">
        <Slider
          label="Length"
          value={state.loop.length}
          min={1}
          max={16}
          step={1}
          unit=" beats"
          onChange={(v) => updateState({ loop: { ...state.loop, length: v } })}
        />
        <Slider
          label="Tempo"
          value={state.loop.tempo}
          min={60}
          max={200}
          step={1}
          unit=" BPM"
          onChange={(v) => updateState({ loop: { ...state.loop, tempo: v } })}
        />
        <Slider
          label="Swing"
          value={state.loop.swing}
          min={0}
          max={0.75}
          step={0.01}
          onChange={(v) => updateState({ loop: { ...state.loop, swing: v } })}
        />
        <Slider
          label="Humanize"
          value={state.loop.humanize}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateState({ loop: { ...state.loop, humanize: v } })}
        />
        <Slider
          label="Gate"
          value={state.loop.gate}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateState({ loop: { ...state.loop, gate: v } })}
        />
        <Slider
          label="Stutter"
          value={state.loop.stutter}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateState({ loop: { ...state.loop, stutter: v } })}
        />
        <Slider
          label="Pitch Variation"
          value={state.loop.pitchVariation}
          min={0}
          max={12}
          step={1}
          unit=" st"
          onChange={(v) => updateState({ loop: { ...state.loop, pitchVariation: v } })}
        />
        <Select<typeof state.loop.reverseMode>
          label="Reverse Mode"
          value={state.loop.reverseMode}
          options={["off", "full", "every-other", "random"] as const}
          onChange={(v) => updateState({ loop: { ...state.loop, reverseMode: v } })}
        />
        <Select<typeof state.loop.warpmode>
          label="Warp Mode"
          value={state.loop.warpmode}
          options={["beats", "time", "repitch", "texture"] as const}
          onChange={(v) => updateState({ loop: { ...state.loop, warpmode: v } })}
        />
      </SectionCard>
    </div>
  );

  const renderEffects = () => (
    <div className="space-y-4">
      <SectionCard title="Effects Rack (8 Slots)">
        <div className="space-y-2">
          {state.effects.slots.map((slot, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-6">{i + 1}</span>
              {slot ? (
                <>
                  <Select<FXType>
                    label=""
                    value={slot.type}
                    options={FX_TYPES}
                    onChange={(v) =>
                      updateState({
                        effects: {
                          ...state.effects,
                          slots: state.effects.slots.map((s, j) =>
                            j === i ? { ...s!, type: v, params: createDefaultFX(v).params } : s,
                          ),
                        },
                      })
                    }
                  />
                  <Toggle
                    label=""
                    checked={slot.enabled}
                    onChange={(val) =>
                      updateState({
                        effects: {
                          ...state.effects,
                          slots: state.effects.slots.map((s, j) =>
                            j === i ? { ...s!, enabled: val } : s,
                          ),
                        },
                      })
                    }
                  />
                  <Slider
                    label="Mix"
                    value={slot.mix}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(val) =>
                      updateState({
                        effects: {
                          ...state.effects,
                          slots: state.effects.slots.map((s, j) =>
                            j === i ? { ...s!, mix: val } : s,
                          ),
                        },
                      })
                    }
                  />
                  <button
                    onClick={() =>
                      updateState({
                        effects: {
                          ...state.effects,
                          slots: state.effects.slots.map((s, j) => (j === i ? null : s)),
                        },
                      })
                    }
                    className="px-2 py-1 bg-red-900 hover:bg-red-800 rounded text-xs text-red-300"
                  >
                    X
                  </button>
                </>
              ) : (
                <button
                  onClick={() =>
                    updateState({
                      effects: {
                        ...state.effects,
                        slots: state.effects.slots.map((s, j) =>
                          j === i ? createDefaultFX("reverb") : s,
                        ),
                      },
                    })
                  }
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-400 border border-dashed border-slate-600"
                >
                  + Add Effect
                </button>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
      {state.effects.slots.filter(Boolean).map(
        (slot) =>
          slot && (
            <SectionCard key={slot.id} title={`${slot.type} Parameters`}>
              <div className="space-y-2">
                {Object.entries(slot.params)
                  .slice(0, 6)
                  .map(([key, val]) => (
                    <Slider
                      key={key}
                      label={key}
                      value={val}
                      min={0}
                      max={val > 100 ? 200 : val > 10 ? 50 : 1}
                      step={val > 100 ? 1 : val > 10 ? 0.1 : 0.01}
                      onChange={(v) =>
                        updateState({
                          effects: {
                            ...state.effects,
                            slots: state.effects.slots.map((s) =>
                              s?.id === slot.id ? { ...s, params: { ...s.params, [key]: v } } : s,
                            ),
                          },
                        })
                      }
                    />
                  ))}
              </div>
            </SectionCard>
          ),
      )}
    </div>
  );

  const renderModulation = () => (
    <div className="space-y-4">
      <SectionCard title="LFOs">
        {state.modulation.lfos.map((lfo, i) => (
          <div key={lfo.id} className="bg-slate-800/50 rounded-lg p-3 space-y-2">
            <Select<LFOWave>
              label="Wave"
              value={lfo.shape}
              options={LFO_WAVES}
              onChange={(v) =>
                updateState({
                  modulation: {
                    ...state.modulation,
                    lfos: state.modulation.lfos.map((l, j) => (j === i ? { ...l, shape: v } : l)),
                  },
                })
              }
            />
            <Slider
              label="Rate"
              value={lfo.rate}
              min={0.1}
              max={20}
              step={0.1}
              unit="Hz"
              onChange={(v) =>
                updateState({
                  modulation: {
                    ...state.modulation,
                    lfos: state.modulation.lfos.map((l, j) => (j === i ? { ...l, rate: v } : l)),
                  },
                })
              }
            />
            <Slider
              label="Depth"
              value={lfo.depth}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) =>
                updateState({
                  modulation: {
                    ...state.modulation,
                    lfos: state.modulation.lfos.map((l, j) => (j === i ? { ...l, depth: v } : l)),
                  },
                })
              }
            />
            <Slider
              label="Phase"
              value={lfo.phase}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) =>
                updateState({
                  modulation: {
                    ...state.modulation,
                    lfos: state.modulation.lfos.map((l, j) => (j === i ? { ...l, phase: v } : l)),
                  },
                })
              }
            />
            <Toggle
              label="Tempo Sync"
              checked={lfo.sync}
              onChange={(v) =>
                updateState({
                  modulation: {
                    ...state.modulation,
                    lfos: state.modulation.lfos.map((l, j) => (j === i ? { ...l, sync: v } : l)),
                  },
                })
              }
            />
          </div>
        ))}
        <button
          onClick={() =>
            updateState({
              modulation: {
                ...state.modulation,
                lfos: [...state.modulation.lfos, createDefaultLFO()],
              },
            })
          }
          className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-400 border border-dashed border-slate-600"
        >
          + Add LFO
        </button>
      </SectionCard>
      <SectionCard title="Envelopes">
        {state.modulation.envelopes.map((env, i) => (
          <div key={env.id} className="bg-slate-800/50 rounded-lg p-3 space-y-2">
            <Slider
              label="Attack"
              value={env.attack}
              min={0.001}
              max={2}
              step={0.001}
              unit="s"
              onChange={(v) =>
                updateState({
                  modulation: {
                    ...state.modulation,
                    envelopes: state.modulation.envelopes.map((e, j) =>
                      j === i ? { ...e, attack: v } : e,
                    ),
                  },
                })
              }
            />
            <Slider
              label="Decay"
              value={env.decay}
              min={0.001}
              max={2}
              step={0.001}
              unit="s"
              onChange={(v) =>
                updateState({
                  modulation: {
                    ...state.modulation,
                    envelopes: state.modulation.envelopes.map((e, j) =>
                      j === i ? { ...e, decay: v } : e,
                    ),
                  },
                })
              }
            />
            <Slider
              label="Sustain"
              value={env.sustain}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) =>
                updateState({
                  modulation: {
                    ...state.modulation,
                    envelopes: state.modulation.envelopes.map((e, j) =>
                      j === i ? { ...e, sustain: v } : e,
                    ),
                  },
                })
              }
            />
            <Slider
              label="Release"
              value={env.release}
              min={0.001}
              max={3}
              step={0.001}
              unit="s"
              onChange={(v) =>
                updateState({
                  modulation: {
                    ...state.modulation,
                    envelopes: state.modulation.envelopes.map((e, j) =>
                      j === i ? { ...e, release: v } : e,
                    ),
                  },
                })
              }
            />
          </div>
        ))}
      </SectionCard>
      <SectionCard title="Modulation Matrix">
        {state.modulation.routings.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-sm text-slate-300">
            <span className="text-cyan-400">{r.source}</span>
            <span className="text-slate-500">→</span>
            <span className="text-cyan-400">{r.target}</span>
            <Slider
              label="Depth"
              value={r.depth}
              min={-1}
              max={1}
              step={0.01}
              onChange={(v) =>
                updateState({
                  modulation: {
                    ...state.modulation,
                    routings: state.modulation.routings.map((rr, j) =>
                      j === i ? { ...rr, depth: v } : rr,
                    ),
                  },
                })
              }
            />
          </div>
        ))}
      </SectionCard>
    </div>
  );

  const renderMixer = () => (
    <div className="space-y-4">
      <SectionCard title="Mixer & Routing">
        <div className="space-y-2">
          {state.mixer.channels.map((ch, i) => (
            <div key={ch.id} className="flex items-center gap-3 bg-slate-800/50 rounded-lg p-3">
              <div className="w-3 h-12 rounded-full" style={{ backgroundColor: ch.color }} />
              <div className="flex-1">
                <div className="text-sm text-slate-300">{ch.name}</div>
                <Slider
                  label="Vol"
                  value={ch.volume}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) =>
                    updateState({
                      mixer: {
                        ...state.mixer,
                        channels: state.mixer.channels.map((c, j) =>
                          j === i ? { ...c, volume: v } : c,
                        ),
                      },
                    })
                  }
                />
                <Slider
                  label="Pan"
                  value={ch.pan}
                  min={-1}
                  max={1}
                  step={0.01}
                  onChange={(v) =>
                    updateState({
                      mixer: {
                        ...state.mixer,
                        channels: state.mixer.channels.map((c, j) =>
                          j === i ? { ...c, pan: v } : c,
                        ),
                      },
                    })
                  }
                />
              </div>
              <button
                onClick={() =>
                  updateState({
                    mixer: {
                      ...state.mixer,
                      channels: state.mixer.channels.map((c, j) =>
                        j === i ? { ...c, mute: !c.mute } : c,
                      ),
                    },
                  })
                }
                className={`px-2 py-1 rounded text-xs ${ch.mute ? "bg-red-600 text-white" : "bg-slate-700 text-slate-300"}`}
              >
                M
              </button>
              <button
                onClick={() =>
                  updateState({
                    mixer: {
                      ...state.mixer,
                      channels: state.mixer.channels.map((c, j) =>
                        j === i ? { ...c, solo: !c.solo } : c,
                      ),
                    },
                  })
                }
                className={`px-2 py-1 rounded text-xs ${ch.solo ? "bg-yellow-500 text-black" : "bg-slate-700 text-slate-300"}`}
              >
                S
              </button>
            </div>
          ))}
        </div>
        <div className="h-3" />
        <Slider
          label="Master Volume"
          value={state.mixer.masterVolume}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateState({ mixer: { ...state.mixer, masterVolume: v } })}
        />
      </SectionCard>
    </div>
  );

  const renderExport = () => (
    <div className="space-y-4">
      <SectionCard title="Stems/Export & Mastering">
        <Select<typeof state.exportConfig.format>
          label="Format"
          value={state.exportConfig.format}
          options={["wav", "mp3", "flac", "ogg", "aiff"] as const}
          onChange={(v) => updateState({ exportConfig: { ...state.exportConfig, format: v } })}
        />
        <Slider
          label="Sample Rate"
          value={state.exportConfig.sampleRate}
          min={22050}
          max={96000}
          step={100}
          unit="Hz"
          onChange={(v) => updateState({ exportConfig: { ...state.exportConfig, sampleRate: v } })}
        />
        <Slider
          label="Bit Depth"
          value={state.exportConfig.bitDepth}
          min={8}
          max={32}
          step={8}
          unit="bit"
          onChange={(v) => updateState({ exportConfig: { ...state.exportConfig, bitDepth: v } })}
        />
        <Toggle
          label="Normalize"
          checked={state.exportConfig.normalize}
          onChange={(v) => updateState({ exportConfig: { ...state.exportConfig, normalize: v } })}
        />
        <Slider
          label="Normalize Target"
          value={state.exportConfig.normalizeTarget}
          min={-6}
          max={0}
          step={0.1}
          unit="dB"
          onChange={(v) =>
            updateState({ exportConfig: { ...state.exportConfig, normalizeTarget: v } })
          }
        />
        <Toggle
          label="Dither"
          checked={state.exportConfig.dither}
          onChange={(v) => updateState({ exportConfig: { ...state.exportConfig, dither: v } })}
        />
        <Toggle
          label="Export Stems"
          checked={state.exportConfig.stems}
          onChange={(v) => updateState({ exportConfig: { ...state.exportConfig, stems: v } })}
        />
        <Slider
          label="Loudness Target"
          value={state.exportConfig.loudnessTarget}
          min={-24}
          max={-6}
          step={1}
          unit=" LUFS"
          onChange={(v) =>
            updateState({ exportConfig: { ...state.exportConfig, loudnessTarget: v } })
          }
        />
        <Slider
          label="True Peak"
          value={state.exportConfig.truePeak}
          min={-3}
          max={0}
          step={0.1}
          unit="dBTP"
          onChange={(v) => updateState({ exportConfig: { ...state.exportConfig, truePeak: v } })}
        />
      </SectionCard>
    </div>
  );

  const renderVisualizer = () => (
    <div className="space-y-4">
      <SectionCard title="Visualizer & Analysis">
        <Select<VizMode>
          label="Mode"
          value={state.visualizer.mode}
          options={VIZ_MODES}
          onChange={(v) => updateState({ visualizer: { ...state.visualizer, mode: v } })}
        />
        <Slider
          label="FFT Size"
          value={state.visualizer.fftSize}
          min={256}
          max={8192}
          step={256}
          onChange={(v) => updateState({ visualizer: { ...state.visualizer, fftSize: v } })}
        />
        <Slider
          label="Smoothing"
          value={state.visualizer.smoothing}
          min={0}
          max={0.99}
          step={0.01}
          onChange={(v) => updateState({ visualizer: { ...state.visualizer, smoothing: v } })}
        />
        <Select<typeof state.visualizer.colorScheme>
          label="Color"
          value={state.visualizer.colorScheme}
          options={["classic", "fire", "ice", "neon", "mono", "rainbow", "viridis"] as const}
          onChange={(v) => updateState({ visualizer: { ...state.visualizer, colorScheme: v } })}
        />
        <Toggle
          label="Peak Hold"
          checked={state.visualizer.peakHold}
          onChange={(v) => updateState({ visualizer: { ...state.visualizer, peakHold: v } })}
        />
        <Toggle
          label="Freeze"
          checked={state.visualizer.freeze}
          onChange={(v) => updateState({ visualizer: { ...state.visualizer, freeze: v } })}
        />
      </SectionCard>
      <canvas
        ref={canvasRef}
        width={600}
        height={300}
        className="w-full bg-slate-900 rounded-xl border border-slate-800"
      />
    </div>
  );

  const renderWorkflow = () => (
    <div className="space-y-4">
      <SectionCard title="Workflow & Intelligence">
        <Toggle
          label="Smart Suggestions"
          checked={state.workflow.smartSuggestions}
          onChange={(v) => updateState({ workflow: { ...state.workflow, smartSuggestions: v } })}
        />
        <Toggle
          label="Chord Assist"
          checked={state.workflow.chordAssist}
          onChange={(v) => updateState({ workflow: { ...state.workflow, chordAssist: v } })}
        />
        <Toggle
          label="Melody Assist"
          checked={state.workflow.melodyAssist}
          onChange={(v) => updateState({ workflow: { ...state.workflow, melodyAssist: v } })}
        />
        <Toggle
          label="Mix Assist"
          checked={state.workflow.mixAssist}
          onChange={(v) => updateState({ workflow: { ...state.workflow, mixAssist: v } })}
        />
        <Toggle
          label="Preset Morph"
          checked={state.workflow.presetMorph}
          onChange={(v) => updateState({ workflow: { ...state.workflow, presetMorph: v } })}
        />
        <Toggle
          label="Auto-Arrange"
          checked={state.workflow.autoArrange}
          onChange={(v) => updateState({ workflow: { ...state.workflow, autoArrange: v } })}
        />
        <Toggle
          label="Version History"
          checked={state.workflow.versionHistory}
          onChange={(v) => updateState({ workflow: { ...state.workflow, versionHistory: v } })}
        />
      </SectionCard>
      <SectionCard title="Smart Suggestions">
        <div className="space-y-2">
          {suggestions.map((s, i) => (
            <div key={i} className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2 py-0.5 bg-cyan-900 text-cyan-300 rounded">
                  {s.type}
                </span>
                <span className="text-xs text-slate-500">
                  {(s.confidence * 100).toFixed(0)}% confidence
                </span>
              </div>
              <p className="text-sm text-slate-300">{s.description}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );

  const renderVinnyFeatures = () => (
    <div className="space-y-4">
      <SectionCard title="Sound Time Machine">
        <div className="flex gap-2 mb-3">
          <button
            onClick={() =>
              updateState({
                timeMachine: takeSnapshot(
                  state.timeMachine,
                  state.soundEngine,
                  `Snapshot ${state.timeMachine.snapshots.length + 1}`,
                ),
              })
            }
            className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-semibold text-white"
          >
            Take Snapshot
          </button>
          <button
            onClick={() =>
              updateState({ timeMachine: { ...state.timeMachine, snapshots: [], current: -1 } })
            }
            className="px-3 py-2 bg-red-900 hover:bg-red-800 rounded-lg text-sm text-red-300"
          >
            Clear
          </button>
        </div>
        <div className="space-y-1">
          {state.timeMachine.snapshots.map((snap, i) => (
            <button
              key={i}
              onClick={() => updateSoundEngine(snap.config)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm ${state.timeMachine.current === i ? "bg-cyan-700 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
            >
              {snap.label} — {new Date(snap.time).toLocaleTimeString()}
            </button>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Genre Migrator">
        <div className="grid grid-cols-3 gap-2">
          {GENRES.map((g) => (
            <button
              key={g}
              onClick={() => updateSoundEngine(migrateGenre(state.soundEngine, g))}
              className="px-2 py-2 bg-slate-800 hover:bg-cyan-700 rounded-lg text-xs text-slate-300 capitalize"
            >
              {g}
            </button>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Vibe Engine">
        <div className="grid grid-cols-3 gap-2">
          {VIBES.map((v) => (
            <button
              key={v}
              onClick={() => {
                const result = applyVibe(state.soundEngine, state.theory, v);
                updateState({ soundEngine: result.config, theory: result.theory });
              }}
              className="px-2 py-2 bg-slate-800 hover:bg-cyan-700 rounded-lg text-xs text-slate-300 capitalize"
            >
              {v}
            </button>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Sound DNA">
        {dna && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 font-mono">Hash: {dna.hash}</div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(dna.traits).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 capitalize w-20">{key}</span>
                  <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500" style={{ width: `${val * 100}%` }} />
                  </div>
                  <span className="text-xs text-cyan-400 font-mono w-8">
                    {(val * 100).toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>
      <SectionCard title="Live Perform Mode">
        <div className="space-y-2">
          <div className="text-sm text-slate-400">Scenes: {state.perform.sceneCount}</div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: state.perform.sceneCount }, (_, i) => (
              <button
                key={i}
                onClick={() => updateState({ perform: { ...state.perform, currentScene: i } })}
                className={`aspect-square rounded-lg text-sm font-bold ${state.perform.currentScene === i ? "bg-cyan-500 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="h-2" />
          <div className="text-sm text-slate-400">Macro Knobs</div>
          <div className="grid grid-cols-4 gap-2">
            {state.perform.macroKnobs.map((val, i) => (
              <Slider
                key={i}
                label={`M${i + 1}`}
                value={val}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) =>
                  updateState({
                    perform: {
                      ...state.perform,
                      macroKnobs: state.perform.macroKnobs.map((k, j) => (j === i ? v : k)),
                    },
                  })
                }
              />
            ))}
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Adaptive Mix">
        <Toggle
          label="Enabled"
          checked={state.adaptiveMix.enabled}
          onChange={(v) => updateState({ adaptiveMix: { ...state.adaptiveMix, enabled: v } })}
        />
        <Toggle
          label="Auto EQ"
          checked={state.adaptiveMix.autoEQ}
          onChange={(v) => updateState({ adaptiveMix: { ...state.adaptiveMix, autoEQ: v } })}
        />
        <Toggle
          label="Auto Balance"
          checked={state.adaptiveMix.autoBalance}
          onChange={(v) => updateState({ adaptiveMix: { ...state.adaptiveMix, autoBalance: v } })}
        />
        <Toggle
          label="Auto Duck"
          checked={state.adaptiveMix.autoDuck}
          onChange={(v) => updateState({ adaptiveMix: { ...state.adaptiveMix, autoDuck: v } })}
        />
        <Toggle
          label="Auto Master"
          checked={state.adaptiveMix.autoMaster}
          onChange={(v) => updateState({ adaptiveMix: { ...state.adaptiveMix, autoMaster: v } })}
        />
        <Slider
          label="Target Loudness"
          value={state.adaptiveMix.targetLoudness}
          min={-24}
          max={-6}
          step={1}
          unit=" LUFS"
          onChange={(v) =>
            updateState({ adaptiveMix: { ...state.adaptiveMix, targetLoudness: v } })
          }
        />
      </SectionCard>
      <SectionCard title="Infinite Variation Mode">
        <Toggle
          label="Enabled"
          checked={state.infiniteVariation.enabled}
          onChange={(v) =>
            updateState({ infiniteVariation: { ...state.infiniteVariation, enabled: v } })
          }
        />
        <Slider
          label="Param Range"
          value={state.infiniteVariation.paramRange}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) =>
            updateState({ infiniteVariation: { ...state.infiniteVariation, paramRange: v } })
          }
        />
        <Slider
          label="Mutation Rate"
          value={state.infiniteVariation.mutationRate}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) =>
            updateState({ infiniteVariation: { ...state.infiniteVariation, mutationRate: v } })
          }
        />
        <Slider
          label="Evolve Every"
          value={state.infiniteVariation.evolveEvery}
          min={1}
          max={16}
          step={1}
          unit=" bars"
          onChange={(v) =>
            updateState({ infiniteVariation: { ...state.infiniteVariation, evolveEvery: v } })
          }
        />
        <div className="text-xs text-slate-500">
          Current Variation: {state.infiniteVariation.currentVariation}
        </div>
        <button
          onClick={() => {
            updateSoundEngine(evolveConfig(state.soundEngine, state.infiniteVariation));
            updateState({
              infiniteVariation: {
                ...state.infiniteVariation,
                currentVariation: state.infiniteVariation.currentVariation + 1,
              },
            });
          }}
          className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-semibold text-white"
        >
          Evolve Now
        </button>
      </SectionCard>
      <SectionCard title="Reverse Producer">
        <Toggle
          label="Enabled"
          checked={state.reverseProducer.enabled}
          onChange={(v) =>
            updateState({ reverseProducer: { ...state.reverseProducer, enabled: v } })
          }
        />
        <Select<Genre>
          label="Target Genre"
          value={state.reverseProducer.targetGenre}
          options={GENRES}
          onChange={(v) =>
            updateState({ reverseProducer: { ...state.reverseProducer, targetGenre: v } })
          }
        />
        <Select<Vibe>
          label="Target Vibe"
          value={state.reverseProducer.targetVibe}
          options={VIBES}
          onChange={(v) =>
            updateState({ reverseProducer: { ...state.reverseProducer, targetVibe: v } })
          }
        />
      </SectionCard>
      <SectionCard title="Cross-Modal Learning">
        <Toggle
          label="Enabled"
          checked={state.crossModal.enabled}
          onChange={(v) => updateState({ crossModal: { ...state.crossModal, enabled: v } })}
        />
        <Toggle
          label="Audio → Visual"
          checked={state.crossModal.audioToVisual}
          onChange={(v) => updateState({ crossModal: { ...state.crossModal, audioToVisual: v } })}
        />
        <Toggle
          label="Visual → Audio"
          checked={state.crossModal.visualToAudio}
          onChange={(v) => updateState({ crossModal: { ...state.crossModal, visualToAudio: v } })}
        />
        <Toggle
          label="Text → Audio"
          checked={state.crossModal.textToAudio}
          onChange={(v) => updateState({ crossModal: { ...state.crossModal, textToAudio: v } })}
        />
        <Toggle
          label="Gesture → Audio"
          checked={state.crossModal.gestureToAudio}
          onChange={(v) => updateState({ crossModal: { ...state.crossModal, gestureToAudio: v } })}
        />
      </SectionCard>
      <SectionCard title="Universal Scale Guardian">
        <Toggle
          label="Enabled"
          checked={state.scaleGuardian.enabled}
          onChange={(v) => updateState({ scaleGuardian: { ...state.scaleGuardian, enabled: v } })}
        />
        <Toggle
          label="Auto-Correct"
          checked={state.scaleGuardian.autoCorrect}
          onChange={(v) =>
            updateState({ scaleGuardian: { ...state.scaleGuardian, autoCorrect: v } })
          }
        />
        <Toggle
          label="Highlight Out-of-Scale"
          checked={state.scaleGuardian.highlightOutOfScale}
          onChange={(v) =>
            updateState({ scaleGuardian: { ...state.scaleGuardian, highlightOutOfScale: v } })
          }
        />
        <Select<typeof state.scaleGuardian.snapMode>
          label="Snap Mode"
          value={state.scaleGuardian.snapMode}
          options={["off", "soft", "hard"] as const}
          onChange={(v) => updateState({ scaleGuardian: { ...state.scaleGuardian, snapMode: v } })}
        />
      </SectionCard>
    </div>
  );

  const renderers: Record<string, () => React.ReactNode> = {
    engine: renderEngine,
    text2sound: renderText2Sound,
    instruments: renderInstruments,
    identifier: renderIdentifier,
    sampler: renderSampler,
    theory: renderTheory,
    midi: renderMIDI,
    loops: renderLoops,
    effects: renderEffects,
    modulation: renderModulation,
    mixer: renderMixer,
    export: renderExport,
    visualizer: renderVisualizer,
    workflow: renderWorkflow,
    "vinny-features": renderVinnyFeatures,
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-cyan-900/40 to-slate-900 border border-cyan-800/50 rounded-xl p-4">
        <h2 className="text-xl font-bold text-cyan-400">VINNY — The All-in-One Sound Architect</h2>
        <p className="text-sm text-slate-400 mt-1">
          15-section sound design, synthesis, and AI-assisted music creation engine
        </p>
        {dna && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {Object.entries(dna.traits).map(([k, v]) => (
              <span key={k} className="px-2 py-0.5 bg-slate-800 rounded text-slate-400 capitalize">
                {k}: <span className="text-cyan-400">{(v * 100).toFixed(0)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1 bg-slate-900/60 border border-slate-800 rounded-xl p-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeSection === s.id ? "bg-cyan-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="max-h-[60vh] overflow-y-auto pr-1">
        {renderers[activeSection]?.() ?? null}
      </div>
    </div>
  );
}
