/**
 * Autoencoder - Unsupervised neural network for dimensionality reduction and anomaly detection
 * Compresses input through a bottleneck then reconstructs it, learning latent representations.
 */

export interface AutoencoderConfig {
  inputSize: number;
  hiddenLayers: number[];
  latentSize: number;
  learningRate: number;
  sparsity: number;
}

export interface AutoencoderResult {
  reconstruction: number[];
  latent: number[];
  reconstructionError: number;
}

export class Autoencoder {
  private encoderWeights: number[][][] = [];
  private encoderBias: number[][] = [];
  private decoderWeights: number[][][] = [];
  private decoderBias: number[][] = [];

  constructor(private config: AutoencoderConfig) {
    const encoderDims = [config.inputSize, ...config.hiddenLayers, config.latentSize];
    const decoderDims = [
      config.latentSize,
      ...[...config.hiddenLayers].reverse(),
      config.inputSize,
    ];

    for (let l = 0; l < encoderDims.length - 1; l++) {
      this.encoderWeights.push(this.initMatrix(encoderDims[l + 1], encoderDims[l]));
      this.encoderBias.push(
        new Array(encoderDims[l + 1]).fill(0).map(() => (Math.random() - 0.5) * 0.1),
      );
    }
    for (let l = 0; l < decoderDims.length - 1; l++) {
      this.decoderWeights.push(this.initMatrix(decoderDims[l + 1], decoderDims[l]));
      this.decoderBias.push(
        new Array(decoderDims[l + 1]).fill(0).map(() => (Math.random() - 0.5) * 0.1),
      );
    }
  }

  private initMatrix(rows: number, cols: number): number[][] {
    const scale = Math.sqrt(2 / cols);
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (Math.random() - 0.5) * 0.1 * scale),
    );
  }

  private relu(x: number): number {
    return Math.max(0, x);
  }

  private matVec(matrix: number[][], vec: number[], bias: number[]): number[] {
    return matrix.map((row, i) => row.reduce((acc, w, j) => acc + w * vec[j], 0) + bias[i]);
  }

  encode(input: number[]): number[] {
    let current = input;
    for (let l = 0; l < this.encoderWeights.length; l++) {
      const z = this.matVec(this.encoderWeights[l], current, this.encoderBias[l]);
      current = l === this.encoderWeights.length - 1 ? z.map((v) => v) : z.map((v) => this.relu(v));
    }
    return current;
  }

  decode(latent: number[]): number[] {
    let current = latent;
    for (let l = 0; l < this.decoderWeights.length; l++) {
      const z = this.matVec(this.decoderWeights[l], current, this.decoderBias[l]);
      current = l === this.decoderWeights.length - 1 ? z : z.map((v) => this.relu(v));
    }
    return current;
  }

  reconstruct(input: number[]): AutoencoderResult {
    const latent = this.encode(input);
    const reconstruction = this.decode(latent);
    const reconstructionError =
      input.reduce((sum, v, i) => sum + (v - reconstruction[i]) ** 2, 0) / input.length;
    return { reconstruction, latent, reconstructionError };
  }

  train(input: number[], learningRate = 0.01): number {
    const lr = learningRate ?? this.config.learningRate;

    // Forward pass, storing pre-activations for derivative computation
    const encoderActivations: number[][] = [input];
    const encoderPre: number[][] = [];
    let current = input;
    for (let l = 0; l < this.encoderWeights.length; l++) {
      const z = this.matVec(this.encoderWeights[l], current, this.encoderBias[l]);
      encoderPre.push(z);
      current = l === this.encoderWeights.length - 1 ? z : z.map((v) => this.relu(v));
      encoderActivations.push(current);
    }

    const decoderActivations: number[][] = [current];
    const decoderPre: number[][] = [];
    for (let l = 0; l < this.decoderWeights.length; l++) {
      const z = this.matVec(this.decoderWeights[l], current, this.decoderBias[l]);
      decoderPre.push(z);
      current = l === this.decoderWeights.length - 1 ? z : z.map((v) => this.relu(v));
      decoderActivations.push(current);
    }
    const reconstruction = current;

    const error = input.map((v, i) => v - reconstruction[i]);
    const loss = error.reduce((s, e) => s + e * e, 0) / input.length;

    // Backprop through decoder (gradient of loss wrt weights; ascent direction on error)
    let grad: number[] = error;
    for (let l = this.decoderWeights.length - 1; l >= 0; l--) {
      const W = this.decoderWeights[l];
      const prevAct = decoderActivations[l];
      const nextGrad = new Array(W[0].length).fill(0);
      for (let i = 0; i < W.length; i++) {
        const gi = grad[i];
        if (gi === 0) continue;
        for (let j = 0; j < W[i].length; j++) nextGrad[j] += W[i][j] * gi;
      }
      if (l > 0) {
        const zPrev = decoderPre[l - 1];
        for (let j = 0; j < nextGrad.length; j++) if (zPrev[j] <= 0) nextGrad[j] = 0;
      }
      for (let i = 0; i < W.length; i++) {
        const delta = lr * grad[i];
        if (delta === 0) continue;
        for (let j = 0; j < W[i].length; j++) W[i][j] += delta * prevAct[j];
        this.decoderBias[l][i] += delta;
      }
      grad = nextGrad;
    }

    // Backprop through encoder
    for (let l = this.encoderWeights.length - 1; l >= 0; l--) {
      const W = this.encoderWeights[l];
      const prevAct = encoderActivations[l];
      const nextGrad = l > 0 ? new Array(W[0].length).fill(0) : [];
      if (l > 0) {
        for (let i = 0; i < W.length; i++) {
          const gi = grad[i];
          if (gi === 0) continue;
          for (let j = 0; j < W[i].length; j++) nextGrad[j] += W[i][j] * gi;
        }
        const zPrev = encoderPre[l - 1];
        for (let j = 0; j < nextGrad.length; j++) if (zPrev[j] <= 0) nextGrad[j] = 0;
      }
      for (let i = 0; i < W.length; i++) {
        const delta = lr * grad[i];
        if (delta === 0) continue;
        for (let j = 0; j < W[i].length; j++) W[i][j] += delta * prevAct[j];
        this.encoderBias[l][i] += delta;
      }
      if (l > 0) grad = nextGrad;
    }

    return loss;
  }

  isAnomaly(input: number[], threshold: number): boolean {
    return this.reconstruct(input).reconstructionError > threshold;
  }
}

export default Autoencoder;
