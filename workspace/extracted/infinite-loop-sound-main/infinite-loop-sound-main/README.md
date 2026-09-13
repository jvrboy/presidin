# Infinite Loop Sound — DivergenceIQ

Professional AI-powered forex divergence scanner, multi-agent trading platform, and audio production suite.

## Platform Independence

The app works across all platforms without hard Supabase dependency:

- **Web**: Full Supabase backend when configured, or IndexedDB local storage fallback
- **Desktop (.exe/.dmg/.AppImage)**: Electron with native file system access, network APIs, and app folder
- **Mobile (.ipa/.apk)**: Capacitor with Filesystem plugin for local file access
- **Offline**: All features work with local data store; syncs to Supabase when available

## AI Multi-Agent System (12 trained agents)

| Agent               | Role                                                    |
| ------------------- | ------------------------------------------------------- |
| Strategy Agent      | Strategy selection and signal generation                |
| Risk Manager        | Portfolio heat, drawdown, position sizing               |
| News Sentiment      | Market mood scoring from news events                    |
| Confluence Engine   | Multi-indicator confluence detection                    |
| Parameter Optimizer | Walk-forward optimization with anti-overfit             |
| Automation Hub      | Automated trade execution orchestration                 |
| Pattern Recognition | Chart pattern detection (harmonic, Elliott, Wyckoff)    |
| Self-Learning Core  | Adaptive weight learning from trade outcomes            |
| Liquidity Flow      | Liquidity zones, stop hunts, order flow imbalance       |
| Volatility Regime   | ATR/Bollinger regime classification and forecasting     |
| Correlation Matrix  | Cross-asset correlation monitoring for hedging          |
| Execution Flow      | Spread/slippage analysis and optimal execution strategy |

Train all agents from the `/ai-lab` route.

## Shader Gallery (11 backgrounds)

Liquid Blobs, Neural WebGPU, Plasma Fractal, Aurora Flow, Hex Matrix, Voronoi Cells, Starfield Warp, Fluid Dynamics, Tunnel Warp, Galaxy Spiral. Switch from `/theme` or `/shaders`.

## VINNY Audio Engine

### Pitch & Formant Tools (`/pitch-tools`)

- **Sound Pitcher**: Granular PSOLA pitch shifting with dual delay-line crossfading, detune, stereo width, feedback
- **Formant Shifter**: Filter-bank formant resynthesis with 3 formant bands, bandwidth control, resonance, preserve-original mode
- **Advanced Pitch Engine**: Combined pitch+formant+harmonization+pitch correction with key/scale snapping, glide, stereo spread
- **Pitch Detection**: Autocorrelation-based pitch tracking with note identification and cents offset

### Advanced Piano Roll (`/piano-roll`)

Ultra-advanced piano roll with per-note slide system:

- Per-note properties: pitch, length, velocity, pan, gain, micro-tuning, mute, solo, lock
- Per-note expression: vibrato (depth+rate), tremolo (depth+rate), expression, breath control
- **Ultra-Advanced Per-Note Slide System**: 8 curve types (linear, exponential, logarithmic, sine, scurve, bounce, elastic, step, custom)
- **Infinite Slide Mode**: Slides continue infinitely beyond note boundaries at configurable rate and direction
- Per-note volume/pan/filter automation with curve interpolation
- Note operations: add, remove, copy, paste, duplicate, move, resize, transpose, quantize, select all
- Scale-aware note coloring and guide display
- Canvas-based rendering with slide curve visualization
- Keyboard shortcuts (Delete, Ctrl+A/C/D/V, arrows, space)
- Playback with scheduled note triggering and playhead

### Playlist / Song Arrangement (`/playlist`)

DAW-style playlist for song arrangement:

- Multi-track layout (drum, instrument, audio, automation, bus, marker, tempo tracks)
- Clip types: pattern, audio, automation, marker, tempo
- Clip operations: drag to move, double-click to duplicate, delete, copy/paste
- Per-clip properties: name, start bar, length, volume, pan, fade in/out, time stretch, pitch shift
- Clip mute, loop, solo per track
- Track operations: add, remove, move up/down, mute, solo
- Zoom in/out, snap modes (bar to 1/16)
- Playhead with playback, loop mode
- Keyboard shortcuts (Delete, Ctrl+D, space)

### Advanced Mixing Console (`/mixing-tools`)

Professional mixing console:

- Channel strips with metering, pan, volume fader, mute/solo
- 4-band parametric EQ per channel (8 filter types: lowpass, highpass, bandpass, lowshelf, highshelf, peaking, notch, allpass)
- Compressor with sidechain support (threshold, ratio, attack, release, knee, makeup gain)
- Noise gate (threshold, attack, hold, release, range)
- Pre/post-fader sends to buses
- Bus routing with EQ and compression
- Master chain with EQ, compressor, limiter, stereo width
- Real-time metering (RMS, peak) with color-coded display
- Phase invert, dithering, automation-ready

### Audio Effects (20+ effects)

Original: Compressor, Limiter, Gate, Reverb, Delay, Chorus, Phaser, Flanger, Tremolo, Distortion, Fuzz, Overdrive, Bitcrush, Saturation, Amp, Cabinet, Halfspeed, Vibrato, Autopan, Portal, Shimmer, Freeze, Reverse, Granular FX, Vocoder, Pitch Shift, Harmonizer, Formant, Stereo Widener, Mid-Side, Transient Shaper

Pack 1: Convolution Reverb, Tape Echo, Granular Cloud, Spectral Freezer, Harmonic Enhancer, Transient Designer, Multiband Compressor, Stereo Imager, Vocoder FX, Lo-Fi Degrader

Pack 2: Ring Modulator, Frequency Shifter, Resonator, Chorus Ensemble, Multi-Stage Phaser

### Audio Analysis Tools (`/audio-tools`)

BPM Detector, Key Detector, LUFS Meter, Spectrum Analyzer, Stem Splitter, Noise Gate, Phase Correlation Meter, Dynamic Range Meter, Pitch Tracker, Audio Fingerprinter

### Vinny Extended Features

AI Melody Generator, Chord Progression Generator, Pattern Sequencer, Arpeggiator Engine, Bass Line Generator, Scale Finder, Harmonizer, Rhythm Generator (Euclidean), Voice Leading Optimizer, Song Structure Generator

### MIDI Tools

MIDI file parser, MIDI file exporter, MIDI transformer (transpose, quantize, time-stretch, velocity scale), MIDI to note name, MIDI generator

### Advanced Visualizer (5 modes)

Radial Spectrum, 3D Bars, Waterfall, Phase Scope, Particle Flow

## Trading Tools (12 extended calculators)

Pivot Points (5 methods), Position Size, Kelly Criterion, Risk of Ruin (Monte Carlo), Session Heatmap, Currency Strength, Fibonacci Retracement, Pip Value, Drawdown, Z-Score, Sharpe Ratio, Profit Factor. Access via `/extended-tools`.

## Quant Lab (`/quant-lab`)

Research-grade strategy validation statistics:

- **Deflated Sharpe Ratio** — Bailey/López de Prado multiple-testing correction: probabilistic Sharpe ratio with skew/kurtosis adjustments, expected maximum SR across trials
- **Probability of Backtest Overfitting (PBO)** — combinatorially-symmetric cross-validation over parameter sweeps
- **Drawdown Recovery Planner** — required-gain mathematics, Kelly-calibrated recovery sizing, gambler's-ruin probability estimates
- **Market Regime Detector** — 3-state (bull/range/bear) classifier with t-statistic drift significance, volatility-relative scaling, and online transition-matrix learning

## Volatility Lab (`/volatility-lab`)

Institutional volatility estimation and forecasting:

- **Estimators**: Close-to-close, Parkinson, Garman-Klass, Rogers-Satchell, Yang-Zhang (overnight-gap aware)
- **Forecasts**: RiskMetrics EWMA recursion and GARCH(1,1) fitted by quasi-maximum-likelihood with multi-step convergence paths

## HRP Allocator (`/portfolio-hrp`)

Hierarchical Risk Parity portfolio construction across live Deriv instruments: correlation-distance tree clustering, quasi-diagonalization, recursive inverse-variance bisection.

## Microstructure Toolkit (`src/tools/analytics/microstructure.ts`)

Roll's effective spread, Amihud illiquidity, Kyle's lambda price impact, VPIN with bulk volume classification, and a composite liquidity score.

## CPCV (`src/tools/backtesting/cpcv.ts`)

Combinatorial Purged Cross-Validation with embargo — every C(n,p) train/test block split produces OOS paths for probabilistic strategy decisions instead of a single backtest number.

## Key Routes

| Route             | Description                                                            |
| ----------------- | ---------------------------------------------------------------------- |
| `/`               | Dashboard with live ticks, signals, KPI ticker                         |
| `/theme`          | Theme picker + shader selector                                         |
| `/ai-lab`         | Agent training dashboard (12 agents)                                   |
| `/local-ai`       | Platform-aware GGUF model loader                                       |
| `/shaders`        | Shader gallery                                                         |
| `/native-tools`   | Device file browser, network status, storage info                      |
| `/audio-tools`    | Audio analysis suite (BPM, key, LUFS, spectrum)                        |
| `/extended-tools` | 12 professional trading calculators                                    |
| `/pitch-tools`    | Sound Pitcher, Formant Shifter, Advanced Pitch Engine                  |
| `/piano-roll`     | Advanced piano roll with ultra-advanced per-note infinite slide system |
| `/playlist`       | Song arrangement playlist with multi-track clips                       |
| `/mixing-tools`   | Professional mixing console with EQ, dynamics, sends                   |
| `/tools`          | Core forex tools (sessions, pivots, volatility)                        |
| `/ai-agents`      | Agent orchestration                                                    |
| `/portfolio-pro`  | Portfolio manager with P&L                                             |
| `/risk-manager`   | Risk configuration                                                     |
| `/strategy-lab`   | Strategy builder and backtesting                                       |

## Architecture

- **Frontend**: TanStack Start + React 19 + Vite 7 + Tailwind CSS 4
- **Backend**: Supabase (optional, degrades gracefully to IndexedDB)
- **Desktop**: Electron with electron-builder (dmg, nsis, AppImage)
- **Mobile**: Capacitor (iOS, Android)
- **AI**: wllama (WASM) for browser, native bindings for desktop
- **Audio**: Web Audio API with comprehensive Vinny engine
- **Native Bridge**: Unified file system, network, and storage API across platforms

## Production Ready

- No mockups — all data flows use real APIs or local persistence
- Graceful degradation when Supabase is not configured
- Platform-aware model loading for GGUF files
- 12 trained AI agents with accuracy tracking
- 11 WebGL/WebGPU shader backgrounds
- 20+ audio effects, 10 audio analysis tools, 10 Vinny extended features
- Advanced piano roll with ultra-advanced infinite per-note slide system
- Playlist/song arrangement with multi-track clips
- Professional mixing console with full channel strip processing
- Sound Pitcher, Formant Shifter, Advanced Pitch Engine
- MIDI file parsing, export, and transformation
- 5 advanced visualizer modes
- 12 professional trading calculators
- Native device file system, network, and storage access
- Professional UI components throughout
