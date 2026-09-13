/**
 * Transformer Attention Network
 * Multi-head self-attention with positional encoding for sequence modeling.
 * Lightweight feed-forward implementation (no external deps).
 */

export interface TransformerConfig {
  modelDim: number;
  numHeads: number;
  ffDim: number;
  numLayers: number;
  maxSeqLen: number;
  learningRate: number;
}

export interface AttentionOutput {
  output: number[][];
  attentionWeights: number[][][];
}

interface TransformerLayer {
  wQ: number[][];
  wK: number[][];
  wV: number[][];
  wO: number[][];
  ff1: number[][];
  ff2: number[][];
  normGamma: number[];
  normBeta: number[];
}

export class TransformerAttention {
  private layers: TransformerLayer[] = [];
  private positionalEncoding: number[][] = [];

  constructor(private config: TransformerConfig) {
    const d = config.modelDim;
    for (let l = 0; l < config.numLayers; l++) {
      this.layers.push({
        wQ: this.initMatrix(d, d),
        wK: this.initMatrix(d, d),
        wV: this.initMatrix(d, d),
        wO: this.initMatrix(d, d),
        ff1: this.initMatrix(config.ffDim, d),
        ff2: this.initMatrix(d, config.ffDim),
        normGamma: new Array(d).fill(1),
        normBeta: new Array(d).fill(0),
      });
    }
    this.initPositionalEncoding();
  }

  private initMatrix(rows: number, cols: number): number[][] {
    const scale = Math.sqrt(2 / cols);
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (Math.random() - 0.5) * 0.1 * scale),
    );
  }

  private initPositionalEncoding(): void {
    const d = this.config.modelDim;
    this.positionalEncoding = Array.from({ length: this.config.maxSeqLen }, (_, pos) =>
      Array.from({ length: d }, (__, i) => {
        if (i % 2 === 0) return Math.sin(pos / Math.pow(10000, i / d));
        return Math.cos(pos / Math.pow(10000, (i - 1) / d));
      }),
    );
  }

  private softmax(arr: number[]): number[] {
    const max = Math.max(...arr);
    const exps = arr.map((x) => Math.exp(x - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((x) => x / sum);
  }

  private matMul(a: number[][], b: number[][]): number[][] {
    const rows = a.length;
    const cols = b[0].length;
    const inner = b.length;
    return Array.from({ length: rows }, (_, i) =>
      Array.from({ length: cols }, (_, j) => {
        let sum = 0;
        for (let k = 0; k < inner; k++) sum += a[i][k] * b[k][j];
        return sum;
      }),
    );
  }

  private matVecMul(matrix: number[][], vec: number[]): number[] {
    return matrix.map((row) => row.reduce((acc, w, j) => acc + w * vec[j], 0));
  }

  private layernorm(x: number[], gamma: number[], beta: number[]): number[] {
    const mean = x.reduce((a, b) => a + b, 0) / x.length;
    const variance = x.reduce((a, b) => a + (b - mean) ** 2, 0) / x.length;
    const std = Math.sqrt(variance + 1e-6);
    return x.map((val, i) => gamma[i] * ((val - mean) / std) + beta[i]);
  }

  private multiHeadAttention(
    x: number[][],
    layer: TransformerLayer,
  ): { output: number[][]; weights: number[][][] } {
    const headDim = Math.floor(this.config.modelDim / this.config.numHeads);
    if (headDim < 1) throw new Error("numHeads cannot exceed modelDim");
    const allWeights: number[][][] = [];
    const headOutputs: number[][][] = [];

    for (let h = 0; h < this.config.numHeads; h++) {
      const start = h * headDim;
      const end = start + headDim;

      const Q = x.map((row) => this.matVecMul(layer.wQ, row).slice(start, end));
      const K = x.map((row) => this.matVecMul(layer.wK, row).slice(start, end));
      const V = x.map((row) => this.matVecMul(layer.wV, row).slice(start, end));

      const headWeights: number[][] = [];
      const headOut: number[][] = [];

      for (let i = 0; i < x.length; i++) {
        const scores = K.map((kRow) => {
          let dot = 0;
          for (let d = 0; d < headDim; d++) dot += Q[i][d] * kRow[d];
          return dot / Math.sqrt(headDim);
        });
        const attn = this.softmax(scores);
        headWeights.push(attn);

        const out = new Array(headDim).fill(0);
        for (let j = 0; j < x.length; j++) {
          for (let d = 0; d < headDim; d++) {
            out[d] += attn[j] * V[j][d];
          }
        }
        headOut.push(out);
      }

      allWeights.push(headWeights);
      headOutputs.push(headOut);
    }

    const concatOutput = headOutputs[0].map((_, i) => {
      const combined: number[] = [];
      for (let h = 0; h < this.config.numHeads; h++) {
        combined.push(...headOutputs[h][i]);
      }
      return combined;
    });

    const output = concatOutput.map((row) => this.matVecMul(layer.wO, row));

    return { output, weights: allWeights };
  }

  private feedForward(x: number[], layer: TransformerLayer): number[] {
    const hidden = this.matVecMul(layer.ff1, x).map((v) => Math.max(0, v));
    return this.matVecMul(layer.ff2, hidden);
  }

  forward(input: number[][]): AttentionOutput {
    const seqLen = input.length;
    const x = input.map((row, i) =>
      row.map((val, j) => val + (this.positionalEncoding[i]?.[j] ?? 0)),
    );

    let allWeights: number[][][] = [];
    let current = x;

    for (const layer of this.layers) {
      const attn = this.multiHeadAttention(current, layer);
      allWeights = attn.weights;

      const residual = current.map((row, i) => row.map((val, j) => val + attn.output[i][j]));
      const normed = residual.map((row) => this.layernorm(row, layer.normGamma, layer.normBeta));

      const ffOut = normed.map((row) => {
        const ff = this.feedForward(row, layer);
        const residual = row.map((val, j) => val + ff[j]);
        return this.layernorm(residual, layer.normGamma, layer.normBeta);
      });

      current = ffOut;
    }

    return { output: current, attentionWeights: allWeights };
  }

  predict(sequence: number[][]): { value: number; confidence: number } {
    const { output } = this.forward(sequence);
    const last = output[output.length - 1];
    const value = last[0];
    const confidence = Math.min(1, Math.max(0, Math.abs(value)));
    return { value, confidence };
  }

  train(sequence: number[][], target: number, learningRate = 0.001): number {
    const { output } = this.forward(sequence);
    const last = output[output.length - 1];
    const error = target - last[0];
    const loss = error * error;

    for (const layer of this.layers) {
      const grad = error * learningRate;
      layer.wO.forEach((row) => {
        row.forEach((_, j) => {
          row[j] += grad * last[j] * 0.01;
        });
      });
    }

    return loss;
  }
}

export default TransformerAttention;
