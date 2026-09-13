// @ts-nocheck
// Advanced Visualizer — 5 new visualization modes for the Vinny audio engine.
// Canvas2D-based, no external dependencies.

import { AudioEngine } from "./engine";

export type AdvancedVizMode =
  | "radial-spectrum"
  | "3d-bars"
  | "waterfall"
  | "phase-scope"
  | "particle-flow";

export class AdvancedVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private analyser: AnalyserNode;
  private raf: number = 0;
  private mode: AdvancedVizMode;
  private particles: { x: number; y: number; vx: number; vy: number; life: number; hue: number }[] =
    [];
  private waterfallData: ImageData | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    engine: AudioEngine,
    mode: AdvancedVizMode = "radial-spectrum",
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.analyser = engine.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    this.mode = mode;
    engine.master.connect(this.analyser);
  }

  setMode(mode: AdvancedVizMode) {
    this.mode = mode;
    this.particles = [];
    this.waterfallData = null;
  }

  start() {
    const draw = () => {
      this.raf = requestAnimationFrame(draw);
      const w = this.canvas.width;
      const h = this.canvas.height;
      const freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(freqData);
      const timeData = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(timeData);

      switch (this.mode) {
        case "radial-spectrum":
          this.drawRadial(freqData, w, h);
          break;
        case "3d-bars":
          this.draw3DBars(freqData, w, h);
          break;
        case "waterfall":
          this.drawWaterfall(freqData, w, h);
          break;
        case "phase-scope":
          this.drawPhaseScope(timeData, w, h);
          break;
        case "particle-flow":
          this.drawParticles(freqData, w, h);
          break;
      }
    };
    draw();
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    try {
      this.analyser.disconnect();
    } catch {}
  }

  private drawRadial(freq: Uint8Array, w: number, h: number) {
    this.ctx.fillStyle = "rgba(10, 14, 26, 0.2)";
    this.ctx.fillRect(0, 0, w, h);
    const cx = w / 2,
      cy = h / 2;
    const bars = 128;
    const radius = Math.min(w, h) * 0.2;

    for (let i = 0; i < bars; i++) {
      const angle = (i / bars) * Math.PI * 2;
      const value = freq[Math.floor((i / bars) * freq.length)] / 255;
      const barLength = value * radius * 2;
      const x1 = cx + Math.cos(angle) * radius;
      const y1 = cy + Math.sin(angle) * radius;
      const x2 = cx + Math.cos(angle) * (radius + barLength);
      const y2 = cy + Math.sin(angle) * (radius + barLength);
      const hue = (i / bars) * 180 + 160;
      this.ctx.strokeStyle = `hsl(${hue}, 80%, ${30 + value * 50}%)`;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }
  }

  private draw3DBars(freq: Uint8Array, w: number, h: number) {
    this.ctx.fillStyle = "rgba(10, 14, 26, 0.3)";
    this.ctx.fillRect(0, 0, w, h);
    const bars = 64;
    const barWidth = w / bars;
    const maxDepth = 0.5;

    for (let i = 0; i < bars; i++) {
      const value = freq[Math.floor((i / bars) * freq.length)] / 255;
      const barHeight = value * h * 0.6;
      const depth = 1 - (i / bars) * maxDepth;
      const x = i * barWidth;
      const y = h - barHeight;

      // Front face
      const hue = 160 + (i / bars) * 60;
      this.ctx.fillStyle = `hsl(${hue}, 70%, ${20 + value * 40}%)`;
      this.ctx.fillRect(x, y, barWidth - 1, barHeight);

      // Top face (3D effect)
      this.ctx.fillStyle = `hsl(${hue}, 70%, ${30 + value * 50}%)`;
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x + barWidth - 1, y);
      this.ctx.lineTo(x + barWidth - 1 + depth * 10, y - depth * 10);
      this.ctx.lineTo(x + depth * 10, y - depth * 10);
      this.ctx.closePath();
      this.ctx.fill();
    }
  }

  private drawWaterfall(freq: Uint8Array, w: number, h: number) {
    if (!this.waterfallData) {
      this.waterfallData = this.ctx.createImageData(w, h);
    }

    // Shift down by 1 pixel
    const data = this.waterfallData.data;
    for (let y = h - 1; y > 0; y--) {
      for (let x = 0; x < w; x++) {
        const srcIdx = ((y - 1) * w + x) * 4;
        const dstIdx = (y * w + x) * 4;
        data[dstIdx] = data[srcIdx];
        data[dstIdx + 1] = data[srcIdx + 1];
        data[dstIdx + 2] = data[srcIdx + 2];
        data[dstIdx + 3] = 255;
      }
    }

    // Draw new line at top
    for (let x = 0; x < w; x++) {
      const freqIdx = Math.floor((x / w) * freq.length);
      const value = freq[freqIdx] / 255;
      const idx = (0 * w + x) * 4;
      data[idx] = Math.round(value * 0);
      data[idx + 1] = Math.round(value * 200);
      data[idx + 2] = Math.round(value * 180);
      data[idx + 3] = 255;
    }

    this.ctx.putImageData(this.waterfallData, 0, 0);
  }

  private drawPhaseScope(time: Float32Array, w: number, h: number) {
    this.ctx.fillStyle = "rgba(10, 14, 26, 0.1)";
    this.ctx.fillRect(0, 0, w, h);
    const cx = w / 2,
      cy = h / 2;
    const scale = Math.min(w, h) * 0.4;

    this.ctx.strokeStyle = "rgba(6, 180, 212, 0.6)";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    for (let i = 0; i < time.length - 1; i += 2) {
      const x = cx + time[i] * scale;
      const y = cy + time[i + 1] * scale;
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
  }

  private drawParticles(freq: Uint8Array, w: number, h: number) {
    this.ctx.fillStyle = "rgba(10, 14, 26, 0.15)";
    this.ctx.fillRect(0, 0, w, h);

    const avgFreq = freq.slice(0, 64).reduce((a, b) => a + b, 0) / 64 / 255;

    // Spawn new particles based on energy
    if (Math.random() < avgFreq * 0.5) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + avgFreq * 4;
      this.particles.push({
        x: w / 2,
        y: h / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        hue: 160 + Math.random() * 60,
      });
    }

    // Update and draw particles
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.01;
      this.ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${p.life})`;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.life * 3, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
}

export const ADVANCED_VIZ_MODES: AdvancedVizMode[] = [
  "radial-spectrum",
  "3d-bars",
  "waterfall",
  "phase-scope",
  "particle-flow",
];

export const ADVANCED_VIZ_LABELS: Record<AdvancedVizMode, string> = {
  "radial-spectrum": "Radial Spectrum",
  "3d-bars": "3D Bars",
  waterfall: "Waterfall",
  "phase-scope": "Phase Scope",
  "particle-flow": "Particle Flow",
};
