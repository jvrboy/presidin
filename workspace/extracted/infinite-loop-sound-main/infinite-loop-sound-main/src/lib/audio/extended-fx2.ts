// @ts-nocheck
// VINNY Extended Effects Pack 2 — 5 more professional audio effects.

import { AudioEngine } from "./engine";

export type ExtendedFX2Type =
  | "ring-modulator"
  | "frequency-shifter"
  | "resonator"
  | "chorus-ensemble"
  | "phaser-stages";

export interface ExtendedFX2Config {
  type: ExtendedFX2Type;
  enabled: boolean;
  mix: number;
  params: Record<string, number>;
}

export function createDefaultExtendedFX2(type: ExtendedFX2Type): ExtendedFX2Config {
  const defaults: Record<ExtendedFX2Type, Record<string, number>> = {
    "ring-modulator": { frequency: 100, depth: 1.0, mix: 0.5 },
    "frequency-shifter": { shift: 200, feedback: 0.3, mix: 0.5 },
    resonator: { frequency: 440, resonance: 10, decay: 0.5, mix: 0.5 },
    "chorus-ensemble": { rate: 0.5, depth: 0.3, voices: 3, width: 0.8, mix: 0.5 },
    "phaser-stages": { rate: 0.3, depth: 0.7, stages: 6, feedback: 0.3, mix: 0.5 },
  };
  return { type, enabled: false, mix: 1.0, params: defaults[type] };
}

export function createExtendedFX2Node(
  engine: AudioEngine,
  config: ExtendedFX2Config,
): AudioNode | null {
  const ctx = engine.ctx;

  switch (config.type) {
    case "ring-modulator": {
      const input = ctx.createGain();
      const modOsc = ctx.createOscillator();
      const modGain = ctx.createGain();
      const ringMod = ctx.createGain();
      modOsc.frequency.value = config.params.frequency || 100;
      modGain.gain.value = config.params.depth || 1.0;
      modOsc.connect(modGain);
      modGain.connect(ringMod.gain);
      input.connect(ringMod);
      modOsc.start();
      return input;
    }

    case "frequency-shifter": {
      const input = ctx.createGain();
      const delay = ctx.createDelay(0.1);
      const feedback = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      delay.delayTime.value = 1 / (config.params.shift || 200);
      feedback.gain.value = config.params.feedback || 0.3;
      input.connect(delay);
      delay.connect(shaper);
      shaper.connect(feedback);
      feedback.connect(delay);
      return input;
    }

    case "resonator": {
      const input = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = config.params.frequency || 440;
      filter.Q.value = config.params.resonance || 10;
      input.connect(filter);
      return input;
    }

    case "chorus-ensemble": {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const voices = Math.floor(config.params.voices || 3);
      for (let i = 0; i < voices; i++) {
        const delay = ctx.createDelay(0.05);
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = (config.params.rate || 0.5) * (1 + i * 0.1);
        lfoGain.gain.value = (config.params.depth || 0.3) * 0.05;
        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);
        delay.delayTime.value = 0.02 + i * 0.005;
        input.connect(delay);
        delay.connect(output);
        lfo.start();
      }
      input.connect(output);
      return input;
    }

    case "phaser-stages": {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const stages = Math.floor(config.params.stages || 6);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = config.params.rate || 0.3;
      lfoGain.gain.value = config.params.depth || 0.7;
      lfo.connect(lfoGain);
      let prev: AudioNode = input;
      for (let i = 0; i < stages; i++) {
        const filter = ctx.createBiquadFilter();
        filter.type = "allpass";
        filter.frequency.value = 500 + i * 200;
        lfoGain.connect(filter.frequency);
        prev.connect(filter);
        prev = filter;
      }
      prev.connect(output);
      input.connect(output);
      lfo.start();
      return input;
    }

    default:
      return null;
  }
}

export const EXTENDED_FX2_TYPES: ExtendedFX2Type[] = [
  "ring-modulator",
  "frequency-shifter",
  "resonator",
  "chorus-ensemble",
  "phaser-stages",
];

export const EXTENDED_FX2_LABELS: Record<ExtendedFX2Type, string> = {
  "ring-modulator": "Ring Modulator",
  "frequency-shifter": "Frequency Shifter",
  resonator: "Resonator",
  "chorus-ensemble": "Chorus Ensemble",
  "phaser-stages": "Multi-Stage Phaser",
};
