/**
 * GRU (Gated Recurrent Unit) Predictor
 * Simplified recurrent network with update and reset gates for sequence learning.
 * Lighter than LSTM with comparable performance on many tasks.
 */

export interface GRUConfig {
  inputSize: number;
  hiddenSize: number;
  outputSize: number;
  learningRate: number;
  sequenceLength: number;
}

export interface GRUPrediction {
  value: number;
  confidence: number;
  hiddenState: number[];
}

export class GRUPredictor {
  private updateGate: number[][];
  private resetGate: number[][];
  private candidateGate: number[][];
  private updateBias: number[];
  private resetBias: number[];
  private candidateBias: number[];
  private outputWeights: number[][];
  private outputBias: number[];
  private hiddenState: number[];

  constructor(private config: GRUConfig) {
    const h = config.hiddenSize;
    const i = config.inputSize;
    const cols = i + h;
    const scale = Math.sqrt(2 / cols);
    this.updateGate = this.initMatrix(h, cols, scale);
    this.resetGate = this.initMatrix(h, cols, scale);
    this.candidateGate = this.initMatrix(h, cols, scale);
    this.updateBias = new Array(h).fill(0).map(() => (Math.random() - 0.5) * 0.2);
    this.resetBias = new Array(h).fill(0).map(() => (Math.random() - 0.5) * 0.2);
    this.candidateBias = new Array(h).fill(0).map(() => (Math.random() - 0.5) * 0.2);
    this.outputWeights = this.initMatrix(config.outputSize, h, scale);
    this.outputBias = new Array(config.outputSize).fill(0);
    this.hiddenState = new Array(h).fill(0);
  }

  private initMatrix(rows: number, cols: number, scale: number): number[][] {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (Math.random() - 0.5) * 0.1 * scale),
    );
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  private gateForward(
    weights: number[][],
    bias: number[],
    input: number[],
    hidden: number[],
  ): number[] {
    const combined = [...hidden, ...input];
    return weights.map((row, idx) => {
      const sum = row.reduce((acc, w, j) => acc + w * combined[j], 0) + bias[idx];
      return this.sigmoid(sum);
    });
  }

  private candidateForward(input: number[], hidden: number[], reset: number[]): number[] {
    const combined = hidden.map((h, idx) => reset[idx] * h).concat(input);
    return this.candidateGate.map((row, idx) => {
      const sum = row.reduce((acc, w, j) => acc + w * combined[j], 0) + this.candidateBias[idx];
      return Math.tanh(sum);
    });
  }

  predict(sequence: number[][]): GRUPrediction {
    let h = [...this.hiddenState];

    for (const input of sequence) {
      const z = this.gateForward(this.updateGate, this.updateBias, input, h);
      const r = this.gateForward(this.resetGate, this.resetBias, input, h);
      const hTilde = this.candidateForward(input, h, r);

      h = h.map((val, idx) => (1 - z[idx]) * val + z[idx] * hTilde[idx]);
    }

    this.hiddenState = h;

    const output = this.outputWeights.map((row, idx) => {
      const sum = row.reduce((acc, w, j) => acc + w * h[j], 0) + this.outputBias[idx];
      return sum;
    });

    const value = output[0] ?? 0;
    const confidence = Math.min(1, Math.max(0, Math.abs(value) / 2));
    return { value, confidence, hiddenState: [...h] };
  }

  train(sequence: number[][], target: number, learningRate = 0.01): number {
    const prediction = this.predict(sequence);
    const error = target - prediction.value;
    const lr = learningRate ?? this.config.learningRate;

    this.outputWeights.forEach((row, idx) => {
      row.forEach((w, j) => {
        row[j] += lr * error * prediction.hiddenState[j] * (idx === 0 ? 1 : 0);
      });
      this.outputBias[idx] += lr * error * (idx === 0 ? 1 : 0);
    });

    return error * error;
  }

  reset(): void {
    this.hiddenState = new Array(this.config.hiddenSize).fill(0);
  }

  forecast(sequence: number[][], steps: number): number[] {
    const predictions: number[] = [];
    let currentSeq = sequence.slice(-this.config.sequenceLength);

    for (let s = 0; s < steps; s++) {
      const pred = this.predict(currentSeq);
      predictions.push(pred.value);
      const nextInput = [...(currentSeq[currentSeq.length - 1] ?? [pred.value])];
      nextInput[0] = pred.value;
      currentSeq = [...currentSeq.slice(1), nextInput];
    }

    return predictions;
  }
}

export default GRUPredictor;
