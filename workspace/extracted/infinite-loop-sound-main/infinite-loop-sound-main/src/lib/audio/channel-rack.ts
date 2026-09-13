// Channel Rack — Step sequencer with per-channel samples, pitch, pan, gain, and effects.
// Integrates with the sample pack system and one-shot sampler.

import { AudioEngine } from "./engine";
import { playOneShot, type Sample } from "./sample-packs";

export interface ChannelRackStep {
  active: boolean;
  velocity: number;
  pitch: number;
  pan: number;
  gain: number;
  retrigger: number;
  reverse: boolean;
}

export interface ChannelRackChannel {
  id: string;
  name: string;
  color: string;
  sampleId: string | null;
  sample?: Sample;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  steps: ChannelRackStep[];
  reverb: number;
  delay: number;
  filter: number;
  filterFreq: number;
  distortion: number;
  swing: number;
  humanize: number;
  midiChannel: number;
  outputBus: string;
}

export interface ChannelRackState {
  id: string;
  name: string;
  bpm: number;
  steps: number;
  stepsPerBeat: number;
  channels: ChannelRackChannel[];
  playing: boolean;
  currentStep: number;
  swing: number;
  masterVolume: number;
  loopMode: boolean;
  loopStart: number;
  loopEnd: number;
}

export function createDefaultStep(): ChannelRackStep {
  return { active: false, velocity: 100, pitch: 0, pan: 0, gain: 1, retrigger: 1, reverse: false };
}

export function createDefaultChannel(name: string, steps: number): ChannelRackChannel {
  return {
    id: crypto.randomUUID(),
    name,
    color: "#3b82f6",
    sampleId: null,
    volume: 0.8,
    pan: 0,
    muted: false,
    solo: false,
    steps: Array.from({ length: steps }, createDefaultStep),
    reverb: 0,
    delay: 0,
    filter: 1,
    filterFreq: 20000,
    distortion: 0,
    swing: 0,
    humanize: 0,
    midiChannel: 0,
    outputBus: "master",
  };
}

export function createDefaultChannelRack(): ChannelRackState {
  const steps = 16;
  return {
    id: crypto.randomUUID(),
    name: "Pattern 1",
    bpm: 120,
    steps,
    stepsPerBeat: 4,
    channels: [
      createDefaultChannel("Kick", steps),
      createDefaultChannel("Snare", steps),
      createDefaultChannel("Hi-Hat", steps),
      createDefaultChannel("Clap", steps),
      createDefaultChannel("Perc", steps),
      createDefaultChannel("Bass", steps),
      createDefaultChannel("Synth", steps),
      createDefaultChannel("FX", steps),
    ],
    playing: false,
    currentStep: 0,
    swing: 0,
    masterVolume: 0.8,
    loopMode: true,
    loopStart: 0,
    loopEnd: steps - 1,
  };
}

export function toggleStep(channel: ChannelRackChannel, stepIndex: number): ChannelRackChannel {
  const steps = [...channel.steps];
  steps[stepIndex] = { ...steps[stepIndex], active: !steps[stepIndex].active };
  return { ...channel, steps };
}

export function updateStep(
  channel: ChannelRackChannel,
  stepIndex: number,
  patch: Partial<ChannelRackStep>,
): ChannelRackChannel {
  const steps = [...channel.steps];
  steps[stepIndex] = { ...steps[stepIndex], ...patch };
  return { ...channel, steps };
}

export function addChannel(rack: ChannelRackState, name: string): ChannelRackState {
  return { ...rack, channels: [...rack.channels, createDefaultChannel(name, rack.steps)] };
}

export function removeChannel(rack: ChannelRackState, channelId: string): ChannelRackState {
  return { ...rack, channels: rack.channels.filter((c) => c.id !== channelId) };
}

export function updateChannel(
  rack: ChannelRackState,
  channelId: string,
  patch: Partial<ChannelRackChannel>,
): ChannelRackState {
  return {
    ...rack,
    channels: rack.channels.map((c) => (c.id === channelId ? { ...c, ...patch } : c)),
  };
}

export function assignSample(
  rack: ChannelRackState,
  channelId: string,
  sample: Sample,
): ChannelRackState {
  return {
    ...rack,
    channels: rack.channels.map((c) =>
      c.id === channelId ? { ...c, sampleId: sample.id, sample, name: c.name || sample.name } : c,
    ),
  };
}

export function resizeSteps(rack: ChannelRackState, newSteps: number): ChannelRackState {
  return {
    ...rack,
    steps: newSteps,
    channels: rack.channels.map((c) => {
      const steps = [...c.steps];
      if (newSteps > steps.length) {
        while (steps.length < newSteps) steps.push(createDefaultStep());
      } else {
        steps.length = newSteps;
      }
      return { ...c, steps };
    }),
    loopEnd: Math.min(rack.loopEnd, newSteps - 1),
  };
}

export function stepDurationSec(rack: ChannelRackState): number {
  const beatDur = 60 / rack.bpm;
  return beatDur / rack.stepsPerBeat;
}

export function playStep(
  ctx: AudioContext,
  channel: ChannelRackChannel,
  step: ChannelRackStep,
  startTime: number,
): void {
  if (!step.active || channel.muted || !channel.sample?.buffer) return;
  const retriggers = step.retrigger || 1;
  const stepDur = 0.125;
  const retriggerGap = stepDur / retriggers;
  for (let r = 0; r < retriggers; r++) {
    const t = startTime + r * retriggerGap;
    const gain = (step.velocity / 127) * step.gain * channel.volume;
    playOneShot(ctx, channel.sample, {
      gain,
      pitch: step.pitch,
      pan: step.pan + channel.pan,
      startTime: t,
    });
  }
}

export class ChannelRackScheduler {
  private ctx: AudioContext;
  private rack: ChannelRackState;
  private nextStepTime = 0;
  private currentStep = 0;
  private timer: number | null = null;
  onStep?: (step: number) => void;

  constructor(ctx: AudioContext, rack: ChannelRackState) {
    this.ctx = ctx;
    this.rack = rack;
  }
  update(rack: ChannelRackState) {
    this.rack = rack;
  }
  start() {
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.nextStepTime = this.ctx.currentTime;
    this.currentStep = 0;
    this.schedule();
  }
  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
  private schedule = () => {
    const stepDur = stepDurationSec(this.rack);
    const anySolo = this.rack.channels.some((c) => c.solo);
    while (this.nextStepTime < this.ctx.currentTime + 0.1) {
      const step = this.currentStep;
      const swingOffset = step % 2 === 1 ? stepDur * this.rack.swing * 0.5 : 0;
      const startTime = this.nextStepTime + swingOffset;
      for (const channel of this.rack.channels) {
        if (channel.muted) continue;
        if (anySolo && !channel.solo) continue;
        const stepData = channel.steps[step];
        if (stepData?.active) playStep(this.ctx, channel, stepData, startTime);
      }
      this.onStep?.(step);
      this.nextStepTime += stepDur;
      this.currentStep = (this.currentStep + 1) % this.rack.steps;
      if (this.rack.loopMode && this.currentStep === this.rack.loopEnd + 1)
        this.currentStep = this.rack.loopStart;
    }
    this.timer = window.setTimeout(this.schedule, 25);
  };
}
