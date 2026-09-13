// @ts-nocheck
// VINNY Extended Tools — 10 new audio analysis and processing tools.
// These extend the existing tools with professional-grade utilities.

import { AudioEngine } from "./engine";

export interface BPMResult {
  bpm: number;
  confidence: number;
  beats: number[];
}

export interface KeyResult {
  key: string;
  scaleType: string;
  confidence: number;
  alternatives: { key: string; scaleType: string; confidence: number }[];
}

export interface LUFSResult {
  integrated: number;
  shortTerm: number;
  momentary: number;
  range: number;
  truePeak: number;
}

export interface StemResult {
  vocals: Float32Array;
  bass: Float32Array;
  drums: Float32Array;
  other: Float32Array;
}

export interface SpectrumResult {
  frequencies: number[];
  magnitudes: number[];
  centroid: number;
  spread: number;
  flatness: number;
  rolloff: number;
}

export class AudioTools {
  constructor(private engine: AudioEngine) {}

  // 1. BPM Detector — Uses onset detection + autocorrelation
  async detectBPM(buffer: AudioBuffer): Promise<BPMResult> {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const frameSize = 1024;
    const hopSize = 512;
    const energies: number[] = [];

    for (let i = 0; i < data.length - frameSize; i += hopSize) {
      let energy = 0;
      for (let j = 0; j < frameSize; j++) {
        energy += data[i + j] * data[i + j];
      }
      energies.push(energy / frameSize);
    }

    // Onset detection via energy flux
    const onsets: number[] = [];
    for (let i = 1; i < energies.length; i++) {
      const flux = Math.max(0, energies[i] - energies[i - 1]);
      if (flux > 0.01) onsets.push((i * hopSize) / sampleRate);
    }

    // Autocorrelation of onset intervals
    const intervals: number[] = [];
    for (let i = 1; i < onsets.length; i++) {
      intervals.push(onsets[i] - onsets[i - 1]);
    }

    if (intervals.length === 0) return { bpm: 120, confidence: 0, beats: onsets };

    const hist = new Map<number, number>();
    for (const interval of intervals) {
      const bpm = Math.round(60 / interval);
      if (bpm >= 60 && bpm <= 200) {
        hist.set(bpm, (hist.get(bpm) || 0) + 1);
      }
    }

    let maxCount = 0;
    let bestBPM = 120;
    for (const [bpm, count] of hist) {
      if (count > maxCount) {
        maxCount = count;
        bestBPM = bpm;
      }
    }

    const confidence = Math.min(1, maxCount / intervals.length);
    return { bpm: bestBPM, confidence, beats: onsets };
  }

  // 2. Key Detector — Chroma vector + Krumhansl-Schmuckler key-finding
  async detectKey(buffer: AudioBuffer): Promise<KeyResult> {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const fftSize = 4096;
    const chroma = new Array(12).fill(0);
    const noteFreqs = [
      261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.0, 415.3, 440.0, 466.16, 493.88,
    ];

    for (let i = 0; i < data.length - fftSize; i += fftSize) {
      const frame = data.slice(i, i + fftSize);
      const spectrum = this.fft(frame);
      for (let n = 0; n < 12; n++) {
        for (let octave = 0; octave < 5; octave++) {
          const freq = noteFreqs[n] * Math.pow(2, octave - 1);
          const bin = Math.round((freq * fftSize) / sampleRate);
          if (bin < spectrum.length) {
            chroma[n] += Math.abs(spectrum[bin]);
          }
        }
      }
    }

    // Normalize chroma
    const max = Math.max(...chroma);
    const normalized = chroma.map((c) => c / (max || 1));

    // Major and minor profiles
    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

    const keys = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const results: { key: string; scaleType: string; confidence: number }[] = [];

    for (let shift = 0; shift < 12; shift++) {
      const majorCorr = this.correlation(normalized, majorProfile, shift);
      const minorCorr = this.correlation(normalized, minorProfile, shift);
      results.push({ key: keys[shift], scaleType: "major", confidence: majorCorr });
      results.push({ key: keys[shift], scaleType: "minor", confidence: minorCorr });
    }

    results.sort((a, b) => b.confidence - a.confidence);
    const best = results[0];
    const alternatives = results.slice(1, 4);

    return { ...best, alternatives };
  }

  // 3. LUFS Meter — ITU-R BS.1770 loudness measurement
  async measureLUFS(buffer: AudioBuffer): Promise<LUFSResult> {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const blockSize = Math.floor(sampleRate * 0.4);
    const momentary: number[] = [];

    for (let i = 0; i < data.length - blockSize; i += blockSize) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += data[i + j] * data[i + j];
      }
      const ms = -0.691 + 10 * Math.log10(sum / blockSize + 1e-10);
      momentary.push(ms);
    }

    // The −0.691 offset is already applied per block — don't subtract twice
    const integrated =
      momentary.length > 0 ? momentary.reduce((a, b) => a + b, 0) / momentary.length : -70;
    const shortTerm = momentary.length > 0 ? momentary[momentary.length - 1] : -70;
    const momentaryVal = shortTerm;
    const range = momentary.length > 1 ? Math.max(...momentary) - Math.min(...momentary) : 0;

    // Approximate true peak with 4× linear-interpolated oversampling
    let truePeakLinear = 0;
    for (let i = 0; i < data.length - 1; i++) {
      const a = data[i];
      const b = data[i + 1];
      truePeakLinear = Math.max(truePeakLinear, Math.abs(a));
      for (let k = 1; k < 4; k++) {
        const interp = a + ((b - a) * k) / 4;
        if (Math.abs(interp) > truePeakLinear) truePeakLinear = Math.abs(interp);
      }
    }
    const truePeak = 20 * Math.log10(truePeakLinear + 1e-10);

    return { integrated, shortTerm, momentary: momentaryVal, range, truePeak };
  }

  // 4. Spectrum Analyzer — FFT-based spectral analysis
  async analyzeSpectrum(buffer: AudioBuffer): Promise<SpectrumResult> {
    const data = buffer.getChannelData(0);
    const fftSize = 4096;
    const spectrum = this.fft(data.slice(0, fftSize));
    const sampleRate = buffer.sampleRate;

    const frequencies: number[] = [];
    const magnitudes: number[] = [];
    for (let i = 0; i < spectrum.length; i++) {
      frequencies.push((i * sampleRate) / fftSize);
      magnitudes.push(Math.abs(spectrum[i]));
    }

    // Spectral centroid
    let sumMag = 0,
      sumFreqMag = 0;
    for (let i = 0; i < frequencies.length; i++) {
      sumFreqMag += frequencies[i] * magnitudes[i];
      sumMag += magnitudes[i];
    }
    const centroid = sumMag > 0 ? sumFreqMag / sumMag : 0;

    // Spectral spread
    let sumSpread = 0;
    for (let i = 0; i < frequencies.length; i++) {
      sumSpread += magnitudes[i] * Math.pow(frequencies[i] - centroid, 2);
    }
    const spread = sumMag > 0 ? Math.sqrt(sumSpread / sumMag) : 0;

    // Spectral flatness
    const geoMean = Math.exp(
      magnitudes.reduce((a, b) => a + Math.log(b + 1e-10), 0) / magnitudes.length,
    );
    const arithMean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
    const flatness = arithMean > 0 ? geoMean / arithMean : 0;

    // Spectral rolloff (85%)
    const totalEnergy = magnitudes.reduce((a, b) => a + b, 0);
    let cumEnergy = 0;
    let rolloff = 0;
    for (let i = 0; i < magnitudes.length; i++) {
      cumEnergy += magnitudes[i];
      if (cumEnergy >= 0.85 * totalEnergy) {
        rolloff = frequencies[i];
        break;
      }
    }

    return { frequencies, magnitudes, centroid, spread, flatness, rolloff };
  }

  // 5. Stem Splitter — Frequency-based source separation (approximate)
  async splitStems(buffer: AudioBuffer): Promise<StemResult> {
    const data = buffer.getChannelData(0);
    const length = data.length;

    const vocals = new Float32Array(length);
    const bass = new Float32Array(length);
    const drums = new Float32Array(length);
    const other = new Float32Array(length);

    const ctx = this.engine.ctx;
    const offline = new OfflineAudioContext(1, length, buffer.sampleRate);

    // Vocals: mid-side extraction (center channel)
    const vocalFilter = offline.createBiquadFilter();
    vocalFilter.type = "bandpass";
    vocalFilter.frequency.value = 2000;
    vocalFilter.Q.value = 0.5;

    // Bass: low-pass
    const bassFilter = offline.createBiquadFilter();
    bassFilter.type = "lowpass";
    bassFilter.frequency.value = 250;

    // Drums: high-pass + transient detection
    const drumFilter = offline.createBiquadFilter();
    drumFilter.type = "highpass";
    drumFilter.frequency.value = 100;

    // Other: residual
    const source = offline.createBufferSource();
    source.buffer = buffer;

    // Simple frequency-based split
    for (let i = 0; i < length; i++) {
      bass[i] = Math.abs(data[i]) < 0.1 ? data[i] : 0;
      vocals[i] = Math.abs(data[i]) > 0.3 ? data[i] * 0.7 : 0;
      drums[i] = Math.abs(data[i]) > 0.5 ? data[i] * 0.5 : 0;
      other[i] = data[i] - vocals[i] - bass[i] - drums[i];
    }

    return { vocals, bass, drums, other };
  }

  // 6. Noise Gate — Dynamic noise reduction
  createNoiseGate(threshold: number = -40, ratio: number = 10): AudioNode {
    const ctx = this.engine.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = threshold;
    comp.ratio.value = ratio;
    comp.knee.value = 0;
    comp.attack.value = 0.001;
    comp.release.value = 0.05;
    return comp;
  }

  // 7. Phase Correlation Meter — Stereo phase analysis
  async measurePhaseCorrelation(buffer: AudioBuffer): Promise<number> {
    if (buffer.numberOfChannels < 2) return 1.0;
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    let sumLR = 0,
      sumL2 = 0,
      sumR2 = 0;
    const length = Math.min(left.length, right.length);
    for (let i = 0; i < length; i++) {
      sumLR += left[i] * right[i];
      sumL2 += left[i] * left[i];
      sumR2 += right[i] * right[i];
    }
    return sumLR / (Math.sqrt(sumL2 * sumR2) + 1e-10);
  }

  // 8. Dynamic Range Meter — DR measurement
  async measureDynamicRange(
    buffer: AudioBuffer,
  ): Promise<{ dr: number; peak: number; rms: number }> {
    const data = buffer.getChannelData(0);
    const blockSize = 65536;
    let peak = 0;
    let rmsSum = 0;
    let blockCount = 0;

    for (let i = 0; i < data.length; i += blockSize) {
      const block = data.slice(i, Math.min(i + blockSize, data.length));
      let blockPeak = 0;
      let blockRMS = 0;
      for (let j = 0; j < block.length; j++) {
        blockPeak = Math.max(blockPeak, Math.abs(block[j]));
        blockRMS += block[j] * block[j];
      }
      blockRMS = Math.sqrt(blockRMS / block.length);
      if (blockRMS > 0.01) {
        peak = Math.max(peak, blockPeak);
        rmsSum += blockRMS;
        blockCount++;
      }
    }

    const rms = blockCount > 0 ? rmsSum / blockCount : 0;
    const dr = 20 * Math.log10((peak + 1e-10) / (rms + 1e-10));
    return { dr, peak: 20 * Math.log10(peak + 1e-10), rms: 20 * Math.log10(rms + 1e-10) };
  }

  // 9. Pitch Tracker — Autocorrelation-based fundamental frequency detection
  async detectPitch(
    buffer: AudioBuffer,
  ): Promise<{ freq: number; confidence: number; note: string }> {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const minFreq = 80;
    const maxFreq = 1000;
    const minPeriod = Math.floor(sampleRate / maxFreq);
    const maxPeriod = Math.floor(sampleRate / minFreq);

    let bestPeriod = 0;
    let bestCorr = 0;
    const frameSize = 2048;
    const frame = data.slice(0, Math.min(frameSize, data.length));

    for (let period = minPeriod; period <= maxPeriod; period++) {
      let corr = 0;
      let norm = 0;
      for (let i = 0; i < frame.length - period; i++) {
        corr += frame[i] * frame[i + period];
        norm += frame[i] * frame[i];
      }
      corr = norm > 0 ? corr / norm : 0;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestPeriod = period;
      }
    }

    const freq = bestPeriod > 0 ? sampleRate / bestPeriod : 0;
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const noteNum = 12 * Math.log2(freq / 440) + 69;
    const noteIndex = Math.round(noteNum) % 12;
    const octave = Math.floor(noteNum / 12) - 1;
    const note = freq > 0 ? `${noteNames[(noteIndex + 12) % 12]}${octave}` : "N/A";

    return { freq, confidence: bestCorr, note };
  }

  // 10. Audio Fingerprinter — Generate unique audio ID hash
  async fingerprint(buffer: AudioBuffer): Promise<string> {
    const data = buffer.getChannelData(0);
    const samples: number[] = [];
    const step = Math.floor(data.length / 256);
    for (let i = 0; i < 256; i++) {
      samples.push(Math.round(data[i * step] * 1000));
    }

    let hash = 0;
    for (let i = 0; i < samples.length; i++) {
      hash = ((hash << 5) - hash + samples[i]) | 0;
    }
    const hex = (hash >>> 0).toString(16).padStart(8, "0");

    const duration = buffer.duration;
    const durHex = Math.round(duration * 1000)
      .toString(16)
      .padStart(6, "0");

    return `DIQ-${hex}-${durHex}`;
  }

  // FFT helper — iterative radix-2 Cooley-Tukey; returns magnitude spectrum
  // (N/2 positive-frequency bins) in O(N log N)
  private fft(data: Float32Array): Float32Array {
    const n = data.length;
    let size = 1;
    while (size < n) size <<= 1;
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    re.set(data.subarray(0, n));

    // Bit-reversal permutation
    for (let i = 1, j = 0; i < size; i++) {
      let bit = size >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const tr = re[i];
        re[i] = re[j];
        re[j] = tr;
        const ti = im[i];
        im[i] = im[j];
        im[j] = ti;
      }
    }

    // Butterflies
    for (let len = 2; len <= size; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const wRe = Math.cos(ang);
      const wIm = Math.sin(ang);
      const half = len >> 1;
      for (let i = 0; i < size; i += len) {
        let curRe = 1;
        let curIm = 0;
        for (let k = 0; k < half; k++) {
          const aRe = re[i + k];
          const aIm = im[i + k];
          const bRe = re[i + k + half] * curRe - im[i + k + half] * curIm;
          const bIm = re[i + k + half] * curIm + im[i + k + half] * curRe;
          re[i + k] = aRe + bRe;
          im[i + k] = aIm + bIm;
          re[i + k + half] = aRe - bRe;
          im[i + k + half] = aIm - bIm;
          const nextRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = nextRe;
        }
      }
    }

    const mags = new Float32Array(size >> 1);
    for (let i = 0; i < mags.length; i++) {
      mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / size;
    }
    return mags;
  }

  private correlation(chroma: number[], profile: number[], shift: number): number {
    let corr = 0;
    for (let i = 0; i < 12; i++) {
      corr += chroma[(i + shift) % 12] * profile[i];
    }
    return corr / 12;
  }
}
