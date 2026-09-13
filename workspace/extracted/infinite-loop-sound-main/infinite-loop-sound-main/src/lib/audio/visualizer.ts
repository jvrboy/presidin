// Spectrogram & Analysis Visualizer — real-time FFT analysis and rendering.
// Provides spectrum, spectrogram, oscilloscope, vectorscope, and loudness meter.

import { AudioEngine } from "./engine";

export type VizType = "spectrum" | "spectrogram" | "oscilloscope" | "vectorscope" | "loudness";

export interface VizConfig {
  type: VizType;
  fftSize: number;
  smoothing: number;
  color: string;
  waterfall: boolean;
}

export const DEFAULT_VIZ: VizConfig = {
  type: "spectrum",
  fftSize: 2048,
  smoothing: 0.8,
  color: "#6366f1",
  waterfall: false,
};

export class Visualizer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: VizConfig;
  private raf = 0;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array = new Uint8Array(0);
  private timeData: Uint8Array = new Uint8Array(0);
  private spectrogramHistory: ImageData[] = [];
  private maxHistory = 200;
  private loudnessHistory: number[] = [];

  constructor(config: VizConfig = DEFAULT_VIZ) {
    this.config = config;
  }

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    AudioEngine.init();
    if (!AudioEngine.analyser) return;
    AudioEngine.analyser.fftSize = this.config.fftSize;
    AudioEngine.analyser.smoothingTimeConstant = this.config.smoothing;
    this.analyser = AudioEngine.analyser;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeData = new Uint8Array(this.analyser.fftSize);
    this.start();
  }

  setConfig(config: Partial<VizConfig>) {
    this.config = { ...this.config, ...config };
    if (this.analyser && config.fftSize) {
      this.analyser.fftSize = config.fftSize;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeData = new Uint8Array(this.analyser.fftSize);
    }
    if (this.analyser && config.smoothing !== undefined) {
      this.analyser.smoothingTimeConstant = config.smoothing;
    }
  }

  start() {
    const render = () => {
      this.render();
      this.raf = requestAnimationFrame(render);
    };
    render();
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  private render() {
    if (!this.canvas || !this.ctx || !this.analyser) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    switch (this.config.type) {
      case "spectrum":
        this.renderSpectrum(W, H);
        break;
      case "spectrogram":
        this.renderSpectrogram(W, H);
        break;
      case "oscilloscope":
        this.renderOscilloscope(W, H);
        break;
      case "vectorscope":
        this.renderVectorscope(W, H);
        break;
      case "loudness":
        this.renderLoudness(W, H);
        break;
    }
  }

  private renderSpectrum(W: number, H: number) {
    if (!this.ctx || !this.analyser) return;
    this.analyser.getByteFrequencyData(this.freqData as Uint8Array<ArrayBuffer>);
    this.ctx.fillStyle = "rgba(5,5,10,0.3)";
    this.ctx.fillRect(0, 0, W, H);
    const bars = Math.min(this.freqData.length, 128);
    const barW = W / bars;
    for (let i = 0; i < bars; i++) {
      const h = (this.freqData[i] / 255) * H;
      const hue = (i / bars) * 260;
      const grad = this.ctx.createLinearGradient(0, H, 0, H - h);
      grad.addColorStop(0, `hsl(${hue}, 80%, 40%)`);
      grad.addColorStop(1, `hsl(${hue}, 90%, 60%)`);
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(i * barW, H - h, barW - 1, h);
    }
  }

  private renderSpectrogram(W: number, H: number) {
    if (!this.ctx || !this.analyser) return;
    this.analyser.getByteFrequencyData(this.freqData as Uint8Array<ArrayBuffer>);
    // Scroll left and draw new column on right
    const colW = 2;
    const img = this.ctx.getImageData(colW, 0, W - colW, H);
    this.ctx.putImageData(img, 0, 0);
    this.ctx.fillStyle = "rgba(0,0,0,1)";
    this.ctx.fillRect(W - colW, 0, colW, H);
    const bins = Math.min(this.freqData.length, H);
    for (let y = 0; y < bins; y++) {
      const v = this.freqData[bins - y - 1];
      const hue = (1 - v / 255) * 260;
      this.ctx.fillStyle = `hsl(${hue}, 90%, ${20 + (v / 255) * 50}%)`;
      this.ctx.fillRect(W - colW, y, colW, 1);
    }
  }

  private renderOscilloscope(W: number, H: number) {
    if (!this.ctx || !this.analyser) return;
    this.analyser.getByteTimeDomainData(this.timeData as Uint8Array<ArrayBuffer>);
    this.ctx.fillStyle = "rgba(5,5,10,0.2)";
    this.ctx.fillRect(0, 0, W, H);
    this.ctx.strokeStyle = this.config.color;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    const slice = W / this.timeData.length;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = this.timeData[i] / 128;
      const y = (v * H) / 2;
      if (i === 0) this.ctx.moveTo(0, y);
      else this.ctx.lineTo(i * slice, y);
    }
    this.ctx.stroke();
  }

  private renderVectorscope(W: number, H: number) {
    if (!this.ctx || !this.analyser) return;
    this.analyser.getByteTimeDomainData(this.timeData as Uint8Array<ArrayBuffer>);
    this.ctx.fillStyle = "rgba(5,5,10,0.1)";
    this.ctx.fillRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H / 2;
    const scale = Math.min(W, H) / 4;
    // Lissajous: X = left, Y = right (approximated from mono)
    this.ctx.strokeStyle = this.config.color;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    for (let i = 0; i < this.timeData.length - 1; i += 2) {
      const x = (this.timeData[i] / 128 - 1) * scale + cx;
      const y = (this.timeData[i + 1] / 128 - 1) * scale + cy;
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
  }

  private renderLoudness(W: number, H: number) {
    if (!this.ctx || !this.analyser) return;
    this.analyser.getByteTimeDomainData(this.timeData as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = (this.timeData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.timeData.length);
    const db = 20 * Math.log10(Math.max(rms, 0.0001));
    this.loudnessHistory.push(db);
    if (this.loudnessHistory.length > W) this.loudnessHistory.shift();
    this.ctx.fillStyle = "rgba(5,5,10,0.3)";
    this.ctx.fillRect(0, 0, W, H);
    // Draw dB scale
    this.ctx.strokeStyle = "#444";
    this.ctx.lineWidth = 0.5;
    for (let db = -60; db <= 0; db += 10) {
      const y = H - ((db + 60) / 60) * H;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(W, y);
      this.ctx.stroke();
      this.ctx.fillStyle = "#666";
      this.ctx.font = "10px monospace";
      this.ctx.fillText(`${db}dB`, 4, y - 2);
    }
    // Draw history
    this.ctx.strokeStyle = this.config.color;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    for (let i = 0; i < this.loudnessHistory.length; i++) {
      const x = i;
      const y = H - ((this.loudnessHistory[i] + 60) / 60) * H;
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
  }
}
