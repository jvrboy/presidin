/**
 * Hopfield Network - Associative memory / content-addressable memory
 * Stores patterns and retrieves them from noisy/partial cues via energy minimization.
 */

export interface HopfieldConfig {
  neuronCount: number;
  threshold: number;
  async: boolean;
  maxIterations: number;
}

export interface HopfieldResult {
  pattern: number[];
  iterations: number;
  energy: number;
  converged: boolean;
}

export class HopfieldNetwork {
  private weights: number[][];
  private patterns: number[][] = [];

  constructor(private config: HopfieldConfig) {
    this.weights = Array.from({ length: config.neuronCount }, () =>
      new Array(config.neuronCount).fill(0),
    );
  }

  train(patterns: number[][]): void {
    this.patterns = patterns;
    const n = this.config.neuronCount;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          this.weights[i][j] = 0;
          continue;
        }
        let sum = 0;
        for (const pattern of patterns) {
          sum += pattern[i] * pattern[j];
        }
        this.weights[i][j] = sum / n;
      }
    }
  }

  recall(input: number[], maxIterations?: number): HopfieldResult {
    const n = this.config.neuronCount;
    const state = [...input];
    const maxIters = maxIterations ?? this.config.maxIterations;
    let iterations = 0;
    let converged = false;

    while (iterations < maxIters) {
      const prevState = [...state];

      if (this.config.async) {
        for (let i = 0; i < n; i++) {
          const idx = Math.floor(Math.random() * n);
          state[idx] = this.updateNeuron(state, idx);
        }
      } else {
        for (let i = 0; i < n; i++) {
          state[i] = this.updateNeuron(state, i);
        }
      }

      iterations++;
      if (state.every((v, i) => v === prevState[i])) {
        converged = true;
        break;
      }
    }

    return {
      pattern: state,
      iterations,
      energy: this.energy(state),
      converged,
    };
  }

  private updateNeuron(state: number[], i: number): number {
    let sum = 0;
    for (let j = 0; j < this.config.neuronCount; j++) {
      sum += this.weights[i][j] * state[j];
    }
    return sum >= this.config.threshold ? 1 : -1;
  }

  energy(state: number[]): number {
    let e = 0;
    const n = this.config.neuronCount;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        e += this.weights[i][j] * state[i] * state[j];
      }
    }
    return -0.5 * e;
  }

  capacity(): number {
    return Math.floor(0.138 * this.config.neuronCount);
  }

  getStoredPatterns(): number[][] {
    return this.patterns;
  }

  addNoise(pattern: number[], noiseLevel: number): number[] {
    return pattern.map((v) => (Math.random() < noiseLevel ? -v : v));
  }
}

export default HopfieldNetwork;
