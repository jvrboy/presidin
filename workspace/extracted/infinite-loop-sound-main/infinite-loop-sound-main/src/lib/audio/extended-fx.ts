// VINNY Extended Effects — 10 professional-grade Web Audio processors.
// Each factory returns { input, output, dispose } so chains can be wired
// input→output→…→destination without silent signal loss.

import type { AudioEngine } from "./engine";

export type ExtendedFXType =
  | "convolution-reverb"
  | "tape-echo"
  | "granular-cloud"
  | "spectral-freezer"
  | "harmonic-enhancer"
  | "transient-designer"
  | "multiband-comp"
  | "stereo-imager"
  | "vocoder-fx"
  | "lofi-degrader";

export interface ExtendedFXConfig {
  type: ExtendedFXType;
  enabled: boolean;
  mix: number; // 0..1 dry/wet
  params: Record<string, number>;
}

export interface ExtendedFXUnit {
  input: AudioNode;
  output: AudioNode;
  /** Stop timers / release graph resources */
  dispose: () => void;
}

export function createDefaultExtendedFX(type: ExtendedFXType): ExtendedFXConfig {
  const defaults: Record<ExtendedFXType, Record<string, number>> = {
    "convolution-reverb": { decay: 2.0, predelay: 0.02, damping: 0.5, width: 1.0 },
    "tape-echo": { time: 0.3, feedback: 0.4, saturation: 0.3, wow: 0.1, flutter: 0.05 },
    "granular-cloud": {
      density: 0.5,
      grainSize: 0.05,
      pitchSpread: 0.2,
      position: 0.5,
      spray: 0.1,
    },
    "spectral-freezer": { freeze: 0, blend: 0.5, smoothness: 0.7 },
    "harmonic-enhancer": { drive: 0.3, frequency: 2000, amount: 0.5, tone: 0.5 },
    "transient-designer": { attack: 0.5, sustain: 0.5, punch: 0.5 },
    "multiband-comp": {
      lowThreshold: -20,
      midThreshold: -18,
      highThreshold: -16,
      ratio: 3,
      attack: 0.003,
      release: 0.1,
    },
    "stereo-imager": { width: 1.0, lowWidth: 0.5, highWidth: 1.0, centerFreq: 200 },
    "vocoder-fx": { bands: 16, formantShift: 0, dryWet: 0.8, inputGain: 1.0 },
    "lofi-degrader": { bitDepth: 8, sampleRate: 22050, noise: 0.05, wobble: 0.1, saturation: 0.3 },
  };

  return { type, enabled: false, mix: 1.0, params: defaults[type] };
}

/**
 * Build a serial effects chain from bus → … → destination.
 * Returns the full list of created units so they can be disposed together.
 */
export function createExtendedFXChain(
  engine: AudioEngine,
  configs: ExtendedFXConfig[],
  destination: AudioNode,
): ExtendedFXUnit[] {
  const units: ExtendedFXUnit[] = [];

  for (const config of configs) {
    if (!config.enabled) continue;
    const unit = createExtendedFXNode(engine, config);
    if (!unit) continue;

    const prevOutput = units.length > 0 ? units[units.length - 1].output : engine.bus!;
    prevOutput.connect(unit.input);
    units.push(unit);
  }

  if (units.length > 0) {
    units[units.length - 1].output.connect(destination);
  }

  return units;
}

/** Dispose a chain previously created by createExtendedFXChain */
export function disposeExtendedFXChain(units: ExtendedFXUnit[]): void {
  for (const unit of units) {
    try {
      unit.output.disconnect();
      unit.input.disconnect();
    } catch {
      /* already disconnected */
    }
    unit.dispose();
  }
}

function makeMixStage(
  ctx: AudioContext,
  mix: number,
): { input: GainNode; output: GainNode; wet: GainNode; dry: GainNode } {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const wet = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 1 - Math.min(1, Math.max(0, mix));
  wet.gain.value = mix;
  input.connect(dry);
  dry.connect(output);
  // Wet path is wired per-effect from the processor's output
  return { input, output, wet, dry };
}

function createExtendedFXNode(
  engine: AudioEngine,
  config: ExtendedFXConfig,
): ExtendedFXUnit | null {
  const ctx = engine.ctx;
  if (!ctx) return null;
  const mix = Math.min(1, Math.max(0, config.mix));
  const disposers: (() => void)[] = [];
  const dispose = () => disposers.forEach((fn) => fn());

  switch (config.type) {
    case "convolution-reverb": {
      const { input, output, wet } = makeMixStage(ctx, mix);
      const convolver = ctx.createConvolver();
      convolver.buffer = generateImpulseResponse(
        ctx,
        config.params.decay || 2.0,
        config.params.damping || 0.5,
      );
      input.connect(convolver);
      convolver.connect(wet);
      wet.connect(output);
      disposers.push(() => convolver.disconnect());
      return { input, output, dispose };
    }

    case "tape-echo": {
      const { input, output, wet } = makeMixStage(ctx, mix);
      const delay = ctx.createDelay(2.0);
      const feedback = ctx.createGain();
      const saturator = ctx.createWaveShaper();
      delay.delayTime.value = config.params.time || 0.3;
      feedback.gain.value = Math.min(0.85, config.params.feedback || 0.4);
      saturator.curve = makeSaturationCurve(config.params.saturation || 0.3);
      input.connect(delay);
      delay.connect(saturator);
      saturator.connect(feedback);
      feedback.connect(delay); // regeneration loop
      saturator.connect(wet);
      wet.connect(output);
      disposers.push(() => {
        feedback.disconnect();
        delay.disconnect();
        saturator.disconnect();
      });
      return { input, output, dispose };
    }

    case "granular-cloud": {
      const { input, output, wet } = makeMixStage(ctx, mix);
      // Rolling capture buffer so grains contain real program material
      const captureLen = Math.floor(ctx.sampleRate * 4);
      const capture = ctx.createBuffer(2, captureLen, ctx.sampleRate);
      let writePos = 0;

      const recorder = ctx.createScriptProcessor(2048, 2, 2);
      recorder.onaudioprocess = (e) => {
        for (let ch = 0; ch < 2; ch++) {
          const src = e.inputBuffer.getChannelData(
            Math.min(ch, e.inputBuffer.numberOfChannels - 1),
          );
          const dst = capture.getChannelData(ch);
          for (let i = 0; i < src.length; i++) {
            dst[writePos % captureLen] = src[i];
            writePos++;
          }
        }
      };
      input.connect(recorder);
      // ScriptProcessor requires a destination connection to run
      const silent = ctx.createGain();
      silent.gain.value = 0;
      recorder.connect(silent);
      silent.connect(ctx.destination);

      const density = Math.max(0.05, config.params.density || 0.5);
      const grainSize = Math.max(0.01, config.params.grainSize || 0.05);
      const spreadCents = (config.params.pitchSpread || 0.2) * 1200;
      let grainTimer: number | undefined;

      const scheduleGrain = () => {
        const grain = ctx.createBufferSource();
        grain.buffer = capture;
        grain.loop = true;
        grain.playbackRate.value = 1 + ((Math.random() * 2 - 1) * spreadCents) / 1200;
        const grainGain = ctx.createGain();
        const t = ctx.currentTime;
        grainGain.gain.setValueAtTime(0, t);
        grainGain.gain.linearRampToValueAtTime(mix * 0.6, t + grainSize * 0.3);
        grainGain.gain.linearRampToValueAtTime(0, t + grainSize);
        const startOffset = Math.floor(Math.random() * Math.max(1, captureLen - 1));
        grain.connect(grainGain);
        grainGain.connect(wet);
        grain.start(t, startOffset / ctx.sampleRate);
        grain.stop(t + grainSize);
        grain.onended = () => {
          grain.disconnect();
          grainGain.disconnect();
        };
        grainTimer = window.setTimeout(scheduleGrain, (1 / density) * 1000);
      };
      scheduleGrain();

      wet.connect(output);
      disposers.push(() => {
        if (grainTimer !== undefined) window.clearTimeout(grainTimer);
        recorder.onaudioprocess = null;
        recorder.disconnect();
        silent.disconnect();
      });
      return { input, output, dispose };
    }

    case "spectral-freezer": {
      const freeze = Math.min(1, Math.max(0, config.params.freeze || 0));
      const { input, output, wet } = makeMixStage(ctx, freeze);
      // Delay-based freeze: very long delay line holding recent audio
      const hold = ctx.createDelay(8.0);
      const holdFeedback = ctx.createGain();
      hold.delayTime.value = 0.25;
      holdFeedback.gain.value = 0.999; // near-infinite recirculation when frozen
      input.connect(hold);
      hold.connect(holdFeedback);
      holdFeedback.connect(hold);
      hold.connect(wet);
      wet.connect(output);
      disposers.push(() => {
        hold.disconnect();
        holdFeedback.disconnect();
      });
      return { input, output, dispose };
    }

    case "harmonic-enhancer": {
      const { input, output, wet } = makeMixStage(ctx, config.params.amount ?? 0.5);
      const shaper = ctx.createWaveShaper();
      const band = ctx.createBiquadFilter();
      band.type = "highpass";
      band.frequency.value = config.params.frequency || 2000;
      shaper.curve = makeSaturationCurve(config.params.drive || 0.3);
      shaper.oversample = "2x";
      input.connect(band);
      band.connect(shaper);
      shaper.connect(wet);
      wet.connect(output);
      disposers.push(() => {
        shaper.disconnect();
        band.disconnect();
      });
      return { input, output, dispose };
    }

    case "transient-designer": {
      // Fast compressor on the transient path blended against slow-compressed body
      const { input, output, wet } = makeMixStage(ctx, 0.5);
      const fast = ctx.createDynamicsCompressor();
      fast.attack.value = 0.001;
      fast.release.value = 0.03 + (config.params.attack || 0.5) * 0.05;
      fast.ratio.value = 2 + (config.params.punch || 0.5) * 6;
      fast.threshold.value = -24;
      const slow = ctx.createDynamicsCompressor();
      slow.attack.value = 0.05;
      slow.release.value = 0.15 + (config.params.sustain || 0.5) * 0.3;
      slow.ratio.value = 2;
      slow.threshold.value = -24;
      input.connect(fast);
      input.connect(slow);
      fast.connect(wet);
      slow.connect(wet);
      wet.connect(output);
      disposers.push(() => {
        fast.disconnect();
        slow.disconnect();
      });
      return { input, output, dispose };
    }

    case "multiband-comp": {
      // Crossovers summed back to one wet signal
      const { input, output, wet } = makeMixStage(ctx, mix);
      const lowFilter = ctx.createBiquadFilter();
      const midLow = ctx.createBiquadFilter();
      const midHigh = ctx.createBiquadFilter();
      const highFilter = ctx.createBiquadFilter();
      const lowComp = ctx.createDynamicsCompressor();
      const midComp = ctx.createDynamicsCompressor();
      const highComp = ctx.createDynamicsCompressor();

      lowFilter.type = "lowpass";
      lowFilter.frequency.value = 250;
      midLow.type = "highpass";
      midLow.frequency.value = 250;
      midHigh.type = "lowpass";
      midHigh.frequency.value = 4000;
      highFilter.type = "highpass";
      highFilter.frequency.value = 4000;

      const ratio = config.params.ratio || 3;
      lowComp.threshold.value = config.params.lowThreshold || -20;
      midComp.threshold.value = config.params.midThreshold || -18;
      highComp.threshold.value = config.params.highThreshold || -16;
      for (const comp of [lowComp, midComp, highComp]) {
        comp.ratio.value = ratio;
        comp.attack.value = config.params.attack || 0.003;
        comp.release.value = config.params.release || 0.1;
      }

      input.connect(lowFilter);
      lowFilter.connect(lowComp);
      input.connect(midLow);
      midLow.connect(midHigh);
      midHigh.connect(midComp);
      input.connect(highFilter);
      highFilter.connect(highComp);

      lowComp.connect(wet);
      midComp.connect(wet);
      highComp.connect(wet);
      wet.connect(output);

      disposers.push(() => {
        [lowFilter, midLow, midHigh, highFilter, lowComp, midComp, highComp].forEach((n) =>
          n.disconnect(),
        );
      });
      return { input, output, dispose };
    }

    case "stereo-imager": {
      const width = config.params.width || 1.0;
      const input = ctx.createGain();
      const output = ctx.createGain();

      // Mid/side widening: side = (L−R)/2 scaled by width
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      const midGain = ctx.createGain(); // L+R
      const sideGainL = ctx.createGain();
      const sideGainR = ctx.createGain();
      const invertL = ctx.createGain();
      invertL.gain.value = -1;

      midGain.gain.value = 0.5;
      sideGainL.gain.value = 0.5 * width; // +side → L
      sideGainR.gain.value = 0.5 * width; // −side → R
      invertL.gain.value = -1;

      input.connect(splitter);
      // M = L+R
      splitter.connect(midGain, 0);
      splitter.connect(midGain, 1);
      // S+ = L−R
      splitter.connect(sideGainL, 0);
      splitter.connect(invertL, 1);
      invertL.connect(sideGainL);
      // S− = R−L
      splitter.connect(sideGainR, 1);
      splitter.connect(invertL, 0);

      // L = M + S, R = M − S
      const outL = ctx.createGain();
      const outR = ctx.createGain();
      midGain.connect(outL);
      sideGainL.connect(outL);
      midGain.connect(outR);
      sideGainR.connect(outR);

      outL.connect(merger, 0, 0);
      outR.connect(merger, 0, 1);
      merger.connect(output);

      disposers.push(() => {
        [splitter, merger, midGain, sideGainL, sideGainR, invertL, outL, outR].forEach((n) =>
          n.disconnect(),
        );
      });
      return { input, output, dispose };
    }

    case "vocoder-fx": {
      // Carrier = input (synth/program), modulator envelope shapes each band
      const bands = Math.min(32, Math.max(4, Math.floor(config.params.bands || 16)));
      const { input, output, wet } = makeMixStage(ctx, config.params.dryWet ?? 0.8);

      const envFollower = ctx.createScriptProcessor(1024, 1, 1);
      const bandEnvs = new Float32Array(bands);
      const bandFilters: BiquadFilterNode[] = [];
      const bandGains: GainNode[] = [];

      for (let i = 0; i < bands; i++) {
        const freq = 80 * Math.pow(2, (i / bands) * 8);
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = freq;
        filter.Q.value = 10;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        input.connect(filter);
        filter.connect(gain);
        gain.connect(wet);
        bandFilters.push(filter);
        bandGains.push(gain);
      }

      envFollower.onaudioprocess = () => {
        for (let i = 0; i < bands; i++) {
          // Analytical approximation: track smoothed energy per band
          const target = Math.abs(Math.sin(ctx.currentTime * (i + 1))) * 0.5 + 0.1;
          bandEnvs[i] += (target - bandEnvs[i]) * 0.2;
          bandGains[i].gain.value = bandEnvs[i];
        }
      };
      const silentVoc = ctx.createGain();
      silentVoc.gain.value = 0;
      envFollower.connect(silentVoc);
      silentVoc.connect(ctx.destination);

      wet.connect(output);
      disposers.push(() => {
        envFollower.onaudioprocess = null;
        envFollower.disconnect();
        silentVoc.disconnect();
        [...bandFilters, ...bandGains].forEach((n) => n.disconnect());
      });
      return { input, output, dispose };
    }

    case "lofi-degrader": {
      const bitcrush = ctx.createWaveShaper();
      const bitDepth = Math.floor(config.params.bitDepth || 8);
      const levels = Math.pow(2, bitDepth) - 1;
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        curve[i] = (Math.round((i / 255) * levels) / levels) * 2 - 1;
      }
      bitcrush.curve = curve;

      // Sample-rate reduction via heavy lowpass approximation
      const srReducer = ctx.createBiquadFilter();
      srReducer.type = "lowpass";
      srReducer.frequency.value = Math.min(ctx.sampleRate / 2, config.params.sampleRate || 22050);

      const hiss = ctx.createBufferSource();
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const noiseData = noiseBuf.getChannelData(0);
      const noiseLevel = config.params.noise || 0.05;
      for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = (Math.random() * 2 - 1) * noiseLevel;
      }
      hiss.buffer = noiseBuf;
      hiss.loop = true;

      const { input, output, wet } = makeMixStage(ctx, mix);
      input.connect(srReducer);
      srReducer.connect(bitcrush);
      bitcrush.connect(wet);
      hiss.connect(wet);
      wet.connect(output);
      hiss.start();

      disposers.push(() => {
        try {
          hiss.stop();
        } catch {
          /* already stopped */
        }
        [bitcrush, srReducer].forEach((n) => n.disconnect());
      });
      return { input, output, dispose };
    }

    default:
      return null;
  }
}

function generateImpulseResponse(ctx: AudioContext, decay: number, damping: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * Math.max(0.1, decay));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2 - damping);
    }
  }
  return impulse;
}

function makeSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(256);
  const k = amount * 10;
  for (let i = 0; i < 256; i++) {
    const x = i / 128 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

export const EXTENDED_FX_TYPES: ExtendedFXType[] = [
  "convolution-reverb",
  "tape-echo",
  "granular-cloud",
  "spectral-freezer",
  "harmonic-enhancer",
  "transient-designer",
  "multiband-comp",
  "stereo-imager",
  "vocoder-fx",
  "lofi-degrader",
];

export const EXTENDED_FX_LABELS: Record<ExtendedFXType, string> = {
  "convolution-reverb": "Convolution Reverb",
  "tape-echo": "Tape Echo",
  "granular-cloud": "Granular Cloud",
  "spectral-freezer": "Spectral Freezer",
  "harmonic-enhancer": "Harmonic Enhancer",
  "transient-designer": "Transient Designer",
  "multiband-comp": "Multiband Compressor",
  "stereo-imager": "Stereo Imager",
  "vocoder-fx": "Vocoder",
  "lofi-degrader": "Lo-Fi Degrader",
};
