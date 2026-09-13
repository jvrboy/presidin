/**
 * LSTM (Long Short-Term Memory) Predictor
 * Recurrent neural network for time-series forecasting with gated memory cells.
 * Forward + backward pass, online training via truncated BPTT.
 */

export interface LSTMConfig {
  inputSize: number;
  hiddenSize: number;
  outputSize: number;
  learningRate: number;
  sequenceLength: number;
}

export interface LSTMPrediction {
  value: number;
  confidence: number;
  hiddenState: number[];
  cellState: number[];
}

interface LSTMGate {
  weights: number[][];
  bias: number[];
}

export class LSTMPredictor {
  private forgetGate: LSTMGate;
  private inputGate: LSTMGate;
  private candidateGate: LSTMGate;
  private outputGate: LSTMGate;
  private outputWeights: number[][];
  private outputBias: number[];
  private cellState: number[];
  private hiddenState: number[];

  constructor(private config: LSTMConfig) {
    const h = config.hiddenSize;
    const i = config.inputSize;
    this.forgetGate = this.initGate(h, i);
    this.inputGate = this.initGate(h, i);
    this.candidateGate = this.initGate(h, i);
    this.outputGate = this.initGate(h, i);
    this.outputWeights = this.initMatrix(config.outputSize, h);
    this.outputBias = new Array(config.outputSize).fill(0);
    this.cellState = new Array(h).fill(0);
    this.hiddenState = new Array(h).fill(0);
  }

  private initGate(rows: number, cols: number): LSTMGate {
    return {
      weights: this.initMatrix(rows, cols + rows),
      bias: new Array(rows).fill(0).map(() => (Math.random() - 0.5) * 0.2),
    };
  }

  private initMatrix(rows: number, cols: number): number[][] {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (Math.random() - 0.5) * 0.1),
    );
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  private tanh(x: number): number {
    return Math.tanh(x);
  }

  private concat(a: number[], b: number[]): number[] {
    return [...a, ...b];
  }

  private gateForward(gate: LSTMGate, input: number[], hidden: number[]): number[] {
    const combined = this.concat(hidden, input);
    return gate.weights.map((row, idx) => {
      const sum = row.reduce((acc, w, j) => acc + w * combined[j], 0) + gate.bias[idx];
      return this.sigmoid(sum);
    });
  }

  private gatePreActivations(gate: LSTMGate, combined: number[]): number[] {
    return gate.weights.map((row, idx) => {
      const sum = row.reduce((acc, w, j) => acc + w * combined[j], 0) + gate.bias[idx];
      return sum;
    });
  }

  private candidateForward(gate: LSTMGate, input: number[], hidden: number[]): number[] {
    const combined = this.concat(hidden, input);
    return gate.weights.map((row, idx) => {
      const sum = row.reduce((acc, w, j) => acc + w * combined[j], 0) + gate.bias[idx];
      return this.tanh(sum);
    });
  }

  predict(sequence: number[][]): LSTMPrediction {
    let h = [...this.hiddenState];
    let c = [...this.cellState];

    for (const input of sequence) {
      const f = this.gateForward(this.forgetGate, input, h);
      const i = this.gateForward(this.inputGate, input, h);
      const cTilde = this.candidateForward(this.candidateGate, input, h);
      const o = this.gateForward(this.outputGate, input, h);

      c = c.map((val, idx) => f[idx] * val + i[idx] * cTilde[idx]);
      h = c.map((val, idx) => o[idx] * this.tanh(val));
    }

    this.cellState = c;
    this.hiddenState = h;

    const output = this.outputWeights.map((row, idx) => {
      const sum = row.reduce((acc, w, j) => acc + w * h[j], 0) + this.outputBias[idx];
      return sum;
    });

    const value = output[0] ?? 0;
    const confidence = Math.min(1, Math.max(0, Math.abs(value) / 2));

    return { value, confidence, hiddenState: [...h], cellState: [...c] };
  }

  train(sequence: number[][], target: number, learningRate = 0.01): number {
    const lr = learningRate ?? this.config.learningRate;
    const hSize = this.config.hiddenSize;

    // Forward pass storing all intermediate states for BPTT
    interface StepState {
      combined: number[];
      f: number[];
      ig: number[];
      cTilde: number[];
      o: number[];
      zF: number[];
      zI: number[];
      zG: number[];
      zO: number[];
      cBefore: number[];
      tanhCBefore: number[];
      c: number[];
      h: number[];
      tanhC: number[];
    }
    const steps: StepState[] = [];
    let h = [...this.hiddenState];
    let c = [...this.cellState];

    for (const input of sequence) {
      const step: Partial<StepState> = {};
      const combined = this.concat(h, input);
      step.combined = combined;
      step.zF = this.gatePreActivations(this.forgetGate, combined);
      step.f = step.zF.map((z) => this.sigmoid(z));
      step.zI = this.gatePreActivations(this.inputGate, combined);
      step.ig = step.zI.map((z) => this.sigmoid(z));
      step.zG = this.gatePreActivations(this.candidateGate, combined);
      step.cTilde = step.zG.map((z) => this.tanh(z));
      step.zO = this.gatePreActivations(this.outputGate, combined);
      step.o = step.zO.map((z) => this.sigmoid(z));
      step.cBefore = [...c];
      step.tanhCBefore = c.map((v) => this.tanh(v));
      c = step.cBefore.map((val, idx) => step.f![idx] * val + step.ig![idx] * step.cTilde![idx]);
      const tanhC: number[] = c.map((v) => this.tanh(v));
      step.tanhC = tanhC;
      step.c = [...c];
      h = step.c.map((val, idx) => step.o![idx] * tanhC[idx]);
      step.h = [...h];
      steps.push(step as StepState);
    }

    this.cellState = [...c];
    this.hiddenState = [...h];

    const outputValue =
      this.outputWeights[0].reduce((acc, w, j) => acc + w * h[j], 0) + this.outputBias[0];
    const error = target - outputValue;
    const loss = error * error;

    // Backward pass (gradients flow with positive sign; updates use += lr * grad * input)
    let dh = new Array(hSize).fill(0);
    let dc = new Array(hSize).fill(0);
    if (this.outputWeights.length > 0) {
      for (let j = 0; j < hSize; j++) {
        const w = this.outputWeights[0][j];
        dh[j] += error * w;
        this.outputWeights[0][j] += lr * error * h[j];
      }
      this.outputBias[0] += lr * error;
    }

    for (let t = steps.length - 1; t >= 0; t--) {
      const s = steps[t];
      // dh from the future plus dh at this step's output
      const dhStep = s.h.map((_, idx) => dh[idx]);
      dc = s.tanhC.map((tc, idx) => dc[idx] * s.f[idx] + dhStep[idx] * s.o[idx] * (1 - tc * tc));

      const dO = dhStep.map((g, idx) => g * s.tanhC[idx]);
      const dzO = dO.map((g, idx) => g * s.o[idx] * (1 - s.o[idx]));
      const dF = dc.map((g, idx) => g * s.tanhCBefore[idx]);
      const dzF = dF.map((g, idx) => g * s.f[idx] * (1 - s.f[idx]));
      const dI = dc.map((g, idx) => g * s.cTilde[idx]);
      const dzI = dI.map((g, idx) => g * s.ig[idx] * (1 - s.ig[idx]));
      const dG = dc.map((g, idx) => g * s.ig[idx]);
      const dzG = dG.map((g, idx) => g * (1 - s.cTilde[idx] * s.cTilde[idx]));

      // Gradient wrt previous hidden state (captured from pre-update weights)
      const gradWrtCombined = (gate: LSTMGate, dz: number[]): number[] => {
        const gc = new Array(gate.weights[0].length).fill(0);
        for (let idx = 0; idx < gate.weights.length; idx++) {
          const g = dz[idx];
          if (g === 0) continue;
          for (let j = 0; j < gate.weights[idx].length; j++) gc[j] += gate.weights[idx][j] * g;
        }
        return gc;
      };
      const applyUpdate = (gate: LSTMGate, dz: number[]) => {
        for (let idx = 0; idx < gate.weights.length; idx++) {
          const g = lr * dz[idx];
          for (let j = 0; j < gate.weights[idx].length; j++)
            gate.weights[idx][j] += g * s.combined[j];
          gate.bias[idx] += lr * dz[idx];
        }
      };

      const dhPrev = new Array(hSize).fill(0);
      for (const [gate, dz] of [
        [this.forgetGate, dzF],
        [this.inputGate, dzI],
        [this.candidateGate, dzG],
        [this.outputGate, dzO],
      ] as [LSTMGate, number[]][]) {
        const gc = gradWrtCombined(gate, dz);
        applyUpdate(gate, dz);
        for (let j = 0; j < hSize; j++) dhPrev[j] += gc[j];
      }

      dh = dhPrev;
    }

    return loss;
  }

  reset(): void {
    this.cellState = new Array(this.config.hiddenSize).fill(0);
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

export default LSTMPredictor;
