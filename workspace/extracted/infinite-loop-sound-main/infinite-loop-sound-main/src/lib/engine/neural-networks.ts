/**
 * DivergenceIQ — Enhanced Neural Network Modules
 *
 * Provides advanced neural network capabilities for multi-asset prediction:
 *  - EnhancedLSTMNeuralNetwork: LSTM-style gated memory cells for time series
 *  - MultiAssetNeuralNetwork: Cross-asset correlation learner
 *  - NeuralEnsemble: Weighted voting across multiple models
 *
 * All weights use Xavier initialization. Backpropagation includes gradient
 * clipping at ±1.0 and an adaptive learning rate schedule.
 */

import type { Candle } from "./indicators";
import { rsi, ema, macd, atr, bbands, stoch } from "./indicators";

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

/** Single neural-network prediction result */
export interface NNPrediction {
  direction: "BUY" | "SELL" | "NEUTRAL";
  confidence: number;
  neuralScore: number;
  features: NNFeatureImportance[];
  modelVersion: string;
}

/** Per-feature contribution to a prediction */
export interface NNFeatureImportance {
  name: string;
  value: number;
  contribution: number; // positive = bullish, negative = bearish
}

/** Multi-asset prediction bundle */
export interface MultiAssetPrediction {
  pair: string;
  predictions: NNPrediction[];
  ensemble: NNPrediction;
  timestamp: number;
}

/** Runtime statistics for a neural model */
export interface NeuralNetStats {
  model: string;
  version: number;
  totalTraining: number;
  recentAccuracy: number;
  lastTrained: number;
  architecture: string;
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

/** Numerically stable sigmoid */
function sigmoid(x: number): number {
  const clamped = Math.max(-500, Math.min(500, x));
  return 1 / (1 + Math.exp(-clamped));
}

/** Sigmoid derivative given the *output* of sigmoid */
function sigmoidDeriv(s: number): number {
  return s * (1 - s);
}

/** Tanh */
function tanhFn(x: number): number {
  return Math.tanh(Math.max(-500, Math.min(500, x)));
}

/** Tanh derivative given the *output* of tanh */
function tanhDeriv(t: number): number {
  return 1 - t * t;
}

/** ReLU activation */
function relu(x: number): number {
  return Math.max(0, x);
}

/** ReLU derivative */
function reluDeriv(x: number): number {
  return x > 0 ? 1 : 0;
}

/** Xavier initialization scale for a given fan-in / fan-out */
function xavierScale(fanIn: number, fanOut: number): number {
  return Math.sqrt(2 / (fanIn + fanOut));
}

/** Clip a gradient value to [-1, 1] */
function clipGrad(g: number): number {
  return Math.max(-1, Math.min(1, g));
}

/** Create a 2-D matrix of zeros */
function zeros2D(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

/** Create a random 2-D matrix with Xavier init */
function xavierMatrix(rows: number, cols: number): number[][] {
  const scale = xavierScale(cols, rows);
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (Math.random() * 2 - 1) * scale),
  );
}

/** Safe JSON localStorage getter */
function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Safe JSON localStorage setter */
function saveJSON(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Storage may be full or unavailable — silently ignore
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FEATURE NAME CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

/** 24 feature names for the LSTM network input */
const LSTM_FEATURE_NAMES: string[] = [
  "return_1", // 0
  "return_3", // 1
  "return_5", // 2
  "return_10", // 3
  "return_20", // 4
  "rsi_14", // 5
  "momentum", // 6
  "volatility", // 7
  "atr_ratio", // 8
  "bb_position", // 9
  "ema8_slope", // 10
  "ema21_slope", // 11
  "ema50_slope", // 12
  "macd_signal", // 13
  "stoch_k", // 14
  "stoch_d", // 15
  "session", // 16
  "day_of_week", // 17
  "hour_of_day", // 18
  "trend_consist", // 19
  "mean_revert", // 20
  "skewness", // 21
  "kurtosis", // 22
  "noise", // 23
  "awesome_osc", // 24
  "cci_20", // 25
  "williams_r", // 26
  "mfi_14", // 27
  "vortex_plus", // 28
  "vortex_minus", // 29
  "ultimate_osc", // 30
  "fisher_transform", // 31
  "tsi", // 32
  "mass_index", // 33
];

/** 12 feature names for the multi-asset per-asset vector */
const MULTI_ASSET_FEATURE_NAMES: string[] = [
  "return_1",
  "return_5",
  "return_20",
  "rsi",
  "momentum",
  "volatility",
  "trend",
  "volume_ratio",
  "bb_position",
  "atr_ratio",
  "stoch_k",
  "noise",
];

// ═══════════════════════════════════════════════════════════════════════
// 1. ENHANCED LSTM NEURAL NETWORK
// ═══════════════════════════════════════════════════════════════════════

/**
 * LSTM-style neural network with gated memory cells.
 *
 * Architecture
 * ────────────
 * Input          : 24 features
 * LSTM Cell      : 32 hidden units (input / forget / output / cell gates)
 * Dense Output   : 3 outputs (direction probability, confidence, trend strength)
 *
 * Training uses Backpropagation Through Time (BPTT) over 10 timesteps,
 * gradient clipping at ±1.0, and an adaptive learning rate.
 */
export class EnhancedLSTMNeuralNetwork {
  // ── Dimensions ──
  private readonly INPUT_SIZE = 34;
  private readonly HIDDEN_SIZE = 48;
  private readonly OUTPUT_SIZE = 3;
  private readonly BPTT_STEPS = 10;

  // ── LSTM gate weight matrices: W (input→gate), U (hidden→gate) ──
  // Input gate
  private Wi: number[][]; // [hiddenSize x inputSize]
  private Ui: number[][]; // [hiddenSize x hiddenSize]
  private bi: number[];
  // Forget gate
  private Wf: number[][];
  private Uf: number[][];
  private bf: number[];
  // Output gate
  private Wo: number[][];
  private Uo: number[][];
  private bo: number[];
  // Cell candidate
  private Wc: number[][];
  private Uc: number[][];
  private bc: number[];

  // ── Dense output layer ──
  private Wout: number[][]; // [outputSize x hiddenSize]
  private bout: number[];

  // ── LSTM state (persistent across sequential predictions) ──
  private cellState: number[] = [];
  private hiddenState: number[] = [];

  // ── BPTT history ring buffer ──
  private bpttBuffer: Array<{
    features: number[];
    cellState: number[];
    hiddenState: number[];
    gates: {
      i: number[];
      f: number[];
      o: number[];
      cCandidate: number[];
      cNew: number[];
    };
    output: number[];
    label?: number[];
  }> = [];

  // ── Training bookkeeping ──
  private totalTraining = 0;
  private trainingHistory: Array<{ predicted: number; actual: number }> = [];
  private version = 0;
  private learningRate = 0.003;
  private lastTrained = 0;
  private adaptiveDecay = 0.999;
  private adaptiveFloor = 0.0002;
  private adaptiveCeiling = 0.015;

  constructor() {
    const sInput = xavierScale(this.INPUT_SIZE, this.HIDDEN_SIZE);
    const sHidden = xavierScale(this.HIDDEN_SIZE, this.HIDDEN_SIZE);
    const sOutput = xavierScale(this.HIDDEN_SIZE, this.OUTPUT_SIZE);

    // Initialise all gate weights with Xavier
    this.Wi = xavierMatrix(this.HIDDEN_SIZE, this.INPUT_SIZE);
    this.Ui = Array.from({ length: this.HIDDEN_SIZE }, () =>
      Array.from({ length: this.HIDDEN_SIZE }, () => (Math.random() * 2 - 1) * sHidden),
    );
    this.bi = new Array(this.HIDDEN_SIZE).fill(0);

    this.Wf = xavierMatrix(this.HIDDEN_SIZE, this.INPUT_SIZE);
    this.Uf = Array.from({ length: this.HIDDEN_SIZE }, () =>
      Array.from({ length: this.HIDDEN_SIZE }, () => (Math.random() * 2 - 1) * sHidden),
    );
    this.bf = new Array(this.HIDDEN_SIZE).fill(0);

    this.Wo = xavierMatrix(this.HIDDEN_SIZE, this.INPUT_SIZE);
    this.Uo = Array.from({ length: this.HIDDEN_SIZE }, () =>
      Array.from({ length: this.HIDDEN_SIZE }, () => (Math.random() * 2 - 1) * sHidden),
    );
    this.bo = new Array(this.HIDDEN_SIZE).fill(0);

    this.Wc = xavierMatrix(this.HIDDEN_SIZE, this.INPUT_SIZE);
    this.Uc = Array.from({ length: this.HIDDEN_SIZE }, () =>
      Array.from({ length: this.HIDDEN_SIZE }, () => (Math.random() * 2 - 1) * sHidden),
    );
    this.bc = new Array(this.HIDDEN_SIZE).fill(0);

    // Dense output layer
    this.Wout = Array.from({ length: this.OUTPUT_SIZE }, () =>
      Array.from({ length: this.HIDDEN_SIZE }, () => (Math.random() * 2 - 1) * sOutput),
    );
    this.bout = new Array(this.OUTPUT_SIZE).fill(0);

    // Initialise LSTM state to zero
    this.cellState = new Array(this.HIDDEN_SIZE).fill(0);
    this.hiddenState = new Array(this.HIDDEN_SIZE).fill(0);

    // Attempt to restore saved weights
    this.load();
  }

  // ── Core LSTM forward step ──────────────────────────────────────────

  /**
   * Run one LSTM cell step.
   * Returns the gate activations and new states for BPTT bookkeeping.
   */
  private lstmStep(features: number[]): {
    inputGate: number[];
    forgetGate: number[];
    outputGate: number[];
    cellCandidate: number[];
    cellNew: number[];
    hiddenNew: number[];
  } {
    const x = features;
    const hPrev = this.hiddenState;
    const cPrev = this.cellState;
    const H = this.HIDDEN_SIZE;

    // Compute gate pre-activations
    const inputGate = new Array(H);
    const forgetGate = new Array(H);
    const outputGate = new Array(H);
    const cellCandidate = new Array(H);
    const cellNew = new Array(H);
    const hiddenNew = new Array(H);

    for (let j = 0; j < H; j++) {
      // Input gate: i = sigmoid(Wi*x + Ui*h_prev + bi)
      let sumI = this.bi[j];
      for (let k = 0; k < this.INPUT_SIZE; k++) sumI += this.Wi[j][k] * (x[k] ?? 0);
      for (let k = 0; k < H; k++) sumI += this.Ui[j][k] * hPrev[k];
      inputGate[j] = sigmoid(sumI);

      // Forget gate: f = sigmoid(Wf*x + Uf*h_prev + bf)
      let sumF = this.bf[j];
      for (let k = 0; k < this.INPUT_SIZE; k++) sumF += this.Wf[j][k] * (x[k] ?? 0);
      for (let k = 0; k < H; k++) sumF += this.Uf[j][k] * hPrev[k];
      forgetGate[j] = sigmoid(sumF);

      // Cell candidate: c_tilde = tanh(Wc*x + Uc*h_prev + bc)
      let sumC = this.bc[j];
      for (let k = 0; k < this.INPUT_SIZE; k++) sumC += this.Wc[j][k] * (x[k] ?? 0);
      for (let k = 0; k < H; k++) sumC += this.Uc[j][k] * hPrev[k];
      cellCandidate[j] = tanhFn(sumC);

      // New cell state: c = f * c_prev + i * c_tilde
      cellNew[j] = forgetGate[j] * cPrev[j] + inputGate[j] * cellCandidate[j];

      // Output gate: o = sigmoid(Wo*x + Uo*h_prev + bo)
      let sumO = this.bo[j];
      for (let k = 0; k < this.INPUT_SIZE; k++) sumO += this.Wo[j][k] * (x[k] ?? 0);
      for (let k = 0; k < H; k++) sumO += this.Uo[j][k] * hPrev[k];
      outputGate[j] = sigmoid(sumO);

      // New hidden state: h = o * tanh(c)
      hiddenNew[j] = outputGate[j] * tanhFn(cellNew[j]);
    }

    // Update persistent state
    this.cellState = cellNew;
    this.hiddenState = hiddenNew;

    return {
      inputGate,
      forgetGate,
      outputGate,
      cellCandidate,
      cellNew,
      hiddenNew,
    };
  }

  // ── Dense output projection ─────────────────────────────────────────

  /**
   * Project hidden state → 3 outputs through sigmoid.
   * Returns raw output array.
   */
  private denseOutput(h: number[]): number[] {
    const out = new Array(this.OUTPUT_SIZE);
    for (let i = 0; i < this.OUTPUT_SIZE; i++) {
      let sum = this.bout[i];
      for (let j = 0; j < this.HIDDEN_SIZE; j++) sum += this.Wout[i][j] * h[j];
      out[i] = sigmoid(sum);
    }
    return out;
  }

  // ── Public predict ──────────────────────────────────────────────────

  /**
   * Feed a 24-feature vector through the LSTM cell and dense layer.
   *
   * Returns:
   *   direction  — 0..1 (>0.5 bullish, <0.5 bearish)
   *   confidence — 0..1
   *   trend      — 0..1 (trend strength)
   *   cellState  — current cell state snapshot
   *   hiddenState— current hidden state snapshot
   */
  predict(features: number[]): {
    direction: number;
    confidence: number;
    trend: number;
    cellState: number[];
    hiddenState: number[];
  } {
    const lstmOut = this.lstmStep(features);
    const output = this.denseOutput(lstmOut.hiddenNew);

    // Store in BPTT buffer for potential training later
    this.bpttBuffer.push({
      features: [...features],
      cellState: [...lstmOut.cellNew],
      hiddenState: [...lstmOut.hiddenNew],
      gates: {
        i: [...lstmOut.inputGate],
        f: [...lstmOut.forgetGate],
        o: [...lstmOut.outputGate],
        cCandidate: [...lstmOut.cellCandidate],
        cNew: [...lstmOut.cellNew],
      },
      output: [...output],
    });
    // Keep buffer bounded
    if (this.bpttBuffer.length > this.BPTT_STEPS + 5) {
      this.bpttBuffer.shift();
    }

    return {
      direction: output[0],
      confidence: output[1],
      trend: output[2],
      cellState: [...this.cellState],
      hiddenState: [...this.hiddenState],
    };
  }

  // ── BPTT training ───────────────────────────────────────────────────

  /**
   * Train on a single (features, label) pair using BPTT over up to
   * BPTT_STEPS timesteps from the ring buffer.
   *
   * @param features — 24-element input vector
   * @param labels   — 3-element target vector (direction, confidence, trend)
   * @param lr       — optional override for learning rate
   * @returns { loss: number } — MSE loss for this sample
   */
  train(features: number[], labels: number[], lr?: number): { loss: number } {
    const effectiveLR = lr ?? this.learningRate;

    // Attach label to most recent buffer entry
    if (this.bpttBuffer.length > 0) {
      this.bpttBuffer[this.bpttBuffer.length - 1].label = [...labels];
    }

    // Determine how many timesteps to backprop through
    const T = Math.min(this.bpttBuffer.length, this.BPTT_STEPS);
    if (T === 0) return { loss: 0 };

    const H = this.HIDDEN_SIZE;
    const I = this.INPUT_SIZE;
    const O = this.OUTPUT_SIZE;

    // Accumulated weight gradients (zeroed)
    // Gate weight grads
    const dWi = zeros2D(H, I),
      dUi = zeros2D(H, H),
      dbi = new Array(H).fill(0);
    const dWf = zeros2D(H, I),
      dUf = zeros2D(H, H),
      dbf = new Array(H).fill(0);
    const dWo = zeros2D(H, I),
      dUo = zeros2D(H, H),
      dbo = new Array(H).fill(0);
    const dWc = zeros2D(H, I),
      dUc = zeros2D(H, H),
      dbc = new Array(H).fill(0);
    // Output layer grads
    const dWout = zeros2D(O, H),
      dbout = new Array(O).fill(0);

    // Running loss
    let totalLoss = 0;

    // BPTT: walk backwards through time
    // dh_next and dc_next are the gradients flowing from future timestep
    const dhNext = new Array(H).fill(0);
    const dcNext = new Array(H).fill(0);

    for (let t = T - 1; t >= 0; t--) {
      const step = this.bpttBuffer[t];
      const x = step.features;
      const label = step.label ?? labels; // fallback to provided label
      const cPrev = t > 0 ? this.bpttBuffer[t - 1].gates.cNew : new Array(H).fill(0);
      const hPrev = t > 0 ? this.bpttBuffer[t - 1].hiddenState : new Array(H).fill(0);
      const { i: ig, f: fg, o: og, cCandidate: cg, cNew } = step.gates;
      const output = step.output;

      // ── Output layer loss & gradients ──
      const dOut = new Array(O);
      for (let k = 0; k < O; k++) {
        const target = label[k] ?? 0.5;
        const error = target - output[k];
        dOut[k] = clipGrad(error * sigmoidDeriv(output[k]));
        totalLoss += error * error;
      }

      // dWout, dbout
      for (let k = 0; k < O; k++) {
        for (let j = 0; j < H; j++) {
          dWout[k][j] += dOut[k] * step.hiddenState[j];
        }
        dbout[k] += dOut[k];
      }

      // dh from output layer
      const dhOut = new Array(H).fill(0);
      for (let j = 0; j < H; j++) {
        for (let k = 0; k < O; k++) {
          dhOut[j] += dOut[k] * this.Wout[k][j];
        }
      }

      // Combine with dh flowing from future
      const dhTotal = new Array(H);
      for (let j = 0; j < H; j++) {
        dhTotal[j] = clipGrad(dhOut[j] + dhNext[j]);
      }

      // ── LSTM cell gradients ──
      const tanhC = new Array(H);
      for (let j = 0; j < H; j++) tanhC[j] = tanhFn(cNew[j]);

      // dc = dh * o * tanh'(c) + dc_next
      const dc = new Array(H);
      for (let j = 0; j < H; j++) {
        dc[j] = clipGrad(dhTotal[j] * og[j] * tanhDeriv(tanhC[j]) + dcNext[j]);
      }

      for (let j = 0; j < H; j++) {
        // Forget gate gradient
        const df = clipGrad(dc[j] * cPrev[j] * sigmoidDeriv(fg[j]));
        // Input gate gradient
        const di = clipGrad(dc[j] * cg[j] * sigmoidDeriv(ig[j]));
        // Cell candidate gradient
        const dcTilde = clipGrad(dc[j] * ig[j] * tanhDeriv(cg[j]));
        // Output gate gradient
        const dO = clipGrad(dhTotal[j] * tanhC[j] * sigmoidDeriv(og[j]));

        // Weight updates for forget gate
        for (let k = 0; k < I; k++) dWf[j][k] += df * (x[k] ?? 0);
        for (let k = 0; k < H; k++) dUf[j][k] += df * hPrev[k];
        dbf[j] += df;

        // Weight updates for input gate
        for (let k = 0; k < I; k++) dWi[j][k] += di * (x[k] ?? 0);
        for (let k = 0; k < H; k++) dUi[j][k] += di * hPrev[k];
        dbi[j] += di;

        // Weight updates for cell candidate
        for (let k = 0; k < I; k++) dWc[j][k] += dcTilde * (x[k] ?? 0);
        for (let k = 0; k < H; k++) dUc[j][k] += dcTilde * hPrev[k];
        dbc[j] += dcTilde;

        // Weight updates for output gate
        for (let k = 0; k < I; k++) dWo[j][k] += dO * (x[k] ?? 0);
        for (let k = 0; k < H; k++) dUo[j][k] += dO * hPrev[k];
        dbo[j] += dO;

        // Gradients flowing to previous timestep
        dhNext[j] = 0;
        for (let k = 0; k < H; k++) {
          dhNext[j] +=
            this.Wf[j][k] * df + this.Wi[j][k] * di + this.Wc[j][k] * dcTilde + this.Wo[j][k] * dO;
        }
        dhNext[j] = clipGrad(dhNext[j]);

        dcNext[j] = clipGrad(dc[j] * fg[j]);
      }
    }

    // ── Apply accumulated gradients (SGD) ──
    // Gate weights
    const applyGateGrad = (
      W: number[][],
      dW: number[][],
      U: number[][],
      dU: number[][],
      b: number[],
      db: number[],
    ) => {
      for (let j = 0; j < H; j++) {
        for (let k = 0; k < I; k++) W[j][k] += effectiveLR * clipGrad(dW[j][k] / T);
        for (let k = 0; k < H; k++) U[j][k] += effectiveLR * clipGrad(dU[j][k] / T);
        b[j] += effectiveLR * clipGrad(db[j] / T);
      }
    };

    applyGateGrad(this.Wi, dWi, this.Ui, dUi, this.bi, dbi);
    applyGateGrad(this.Wf, dWf, this.Uf, dUf, this.bf, dbf);
    applyGateGrad(this.Wo, dWo, this.Uo, dUo, this.bo, dbo);
    applyGateGrad(this.Wc, dWc, this.Uc, dUc, this.bc, dbc);

    // Output layer weights
    for (let k = 0; k < O; k++) {
      for (let j = 0; j < H; j++) {
        this.Wout[k][j] += effectiveLR * clipGrad(dWout[k][j] / T);
      }
      this.bout[k] += effectiveLR * clipGrad(dbout[k] / T);
    }

    // ── Bookkeeping ──
    this.totalTraining++;
    this.lastTrained = Date.now();
    this.version++;

    // Track accuracy
    const predDir = this.bpttBuffer[T - 1]?.output[0] ?? 0.5;
    const actualDir = labels[0] ?? 0.5;
    this.trainingHistory.push({
      predicted: predDir,
      actual: actualDir,
    });
    if (this.trainingHistory.length > 500) this.trainingHistory.shift();

    // Adaptive learning rate
    this.adaptLearningRate();

    // Auto-persist every 20 iterations
    if (this.version % 20 === 0) this.save();

    // Trim BPTT buffer to keep only recent context
    if (this.bpttBuffer.length > this.BPTT_STEPS) {
      this.bpttBuffer = this.bpttBuffer.slice(-this.BPTT_STEPS);
    }

    return { loss: totalLoss / (T * O) };
  }

  // ── Adaptive learning rate ──────────────────────────────────────────

  private adaptLearningRate(): void {
    const accuracy = this.recentAccuracy();
    // Increase LR if accuracy is low (explore), decrease if high (exploit)
    if (accuracy > 0.7) {
      this.learningRate = Math.max(this.adaptiveFloor, this.learningRate * this.adaptiveDecay);
    } else if (accuracy < 0.45) {
      this.learningRate = Math.min(this.adaptiveCeiling, this.learningRate * 1.05);
    }
  }

  /** Compute recent accuracy from training history */
  private recentAccuracy(): number {
    if (this.trainingHistory.length === 0) return 0.5;
    const n = Math.min(50, this.trainingHistory.length);
    const recent = this.trainingHistory.slice(-n);
    let correct = 0;
    for (const t of recent) {
      // Both on same side of 0.5 = correct
      if ((t.predicted > 0.5 && t.actual > 0.5) || (t.predicted < 0.5 && t.actual < 0.5)) {
        correct++;
      }
    }
    return correct / n;
  }

  // ── Reset LSTM memory ───────────────────────────────────────────────

  resetState(): void {
    this.cellState = new Array(this.HIDDEN_SIZE).fill(0);
    this.hiddenState = new Array(this.HIDDEN_SIZE).fill(0);
    this.bpttBuffer = [];
  }

  // ── Stats ───────────────────────────────────────────────────────────

  getStats(): NeuralNetStats {
    return {
      model: "EnhancedLSTM",
      version: this.version,
      totalTraining: this.totalTraining,
      recentAccuracy: this.recentAccuracy(),
      lastTrained: this.lastTrained,
      architecture: `24→LSTM(32)→3  BPTT=${this.BPTT_STEPS}`,
    };
  }

  // ── Persistence ─────────────────────────────────────────────────────

  save(): void {
    saveJSON("diq_lstm_nn", {
      Wi: this.Wi,
      Ui: this.Ui,
      bi: this.bi,
      Wf: this.Wf,
      Uf: this.Uf,
      bf: this.bf,
      Wo: this.Wo,
      Uo: this.Uo,
      bo: this.bo,
      Wc: this.Wc,
      Uc: this.Uc,
      bc: this.bc,
      Wout: this.Wout,
      bout: this.bout,
      version: this.version,
      totalTraining: this.totalTraining,
      learningRate: this.learningRate,
      lastTrained: this.lastTrained,
      trainingHistory: this.trainingHistory.slice(-100), // keep last 100
    });
  }

  load(): void {
    const data = loadJSON<Record<string, unknown> | null>("diq_lstm_nn", null);
    if (!data) return;
    try {
      // Validate dimensions before loading
      const Wi = data.Wi as number[][];
      if (Wi?.length !== this.HIDDEN_SIZE || Wi[0]?.length !== this.INPUT_SIZE) return;

      this.Wi = Wi;
      this.Ui = data.Ui as number[][];
      this.bi = data.bi as number[];
      this.Wf = data.Wf as number[][];
      this.Uf = data.Uf as number[][];
      this.bf = data.bf as number[];
      this.Wo = data.Wo as number[][];
      this.Uo = data.Uo as number[][];
      this.bo = data.bo as number[];
      this.Wc = data.Wc as number[][];
      this.Uc = data.Uc as number[][];
      this.bc = data.bc as number[];
      this.Wout = data.Wout as number[][];
      this.bout = data.bout as number[];
      this.version = (data.version as number) ?? 0;
      this.totalTraining = (data.totalTraining as number) ?? 0;
      this.learningRate = (data.learningRate as number) ?? 0.003;
      this.lastTrained = (data.lastTrained as number) ?? 0;
      this.trainingHistory =
        (data.trainingHistory as Array<{ predicted: number; actual: number }>) ?? [];
    } catch {
      // Corrupt data — keep defaults
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 2. MULTI-ASSET NEURAL NETWORK
// ═══════════════════════════════════════════════════════════════════════

/**
 * A feed-forward network that learns cross-asset correlations.
 * When trained on EURUSD, it also ingests GBPUSD and USDJPY behaviour
 * so that correlated momentum increases prediction confidence.
 *
 * Architecture
 * ────────────
 * Per-asset features : 12 features × 3 assets = 36 inputs
 * Hidden 1           : 48 units (ReLU)
 * Hidden 2           : 24 units (ReLU)
 * Output             : 3 units (sigmoid) — direction, confidence, trend
 *
 * A learned correlation matrix is maintained to expose inter-pair relationships.
 */
export class MultiAssetNeuralNetwork {
  private readonly FEATURES_PER_ASSET = 12;
  private readonly NUM_ASSETS = 3;
  private readonly INPUT_SIZE = 36; // 12 × 3
  private readonly HIDDEN1 = 48;
  private readonly HIDDEN2 = 24;
  private readonly OUTPUT_SIZE = 3;

  // ── Weight matrices ──
  private W1: number[][]; // [HIDDEN1 x INPUT_SIZE]
  private b1: number[];
  private W2: number[][]; // [HIDDEN2 x HIDDEN1]
  private b2: number[];
  private W3: number[][]; // [OUTPUT_SIZE x HIDDEN2]
  private b3: number[];

  // ── Correlation tracking ──
  private correlationAccum: Record<
    string,
    Record<string, { xy: number; xx: number; yy: number; count: number }>
  > = {};

  // ── Training bookkeeping ──
  private totalTraining = 0;
  private trainingHistory: Array<{ predicted: number; actual: number }> = [];
  private version = 0;
  private learningRate = 0.004;
  private lastTrained = 0;
  private adaptiveDecay = 0.9995;
  private adaptiveFloor = 0.0003;
  private adaptiveCeiling = 0.012;

  /** Known asset pairs for correlation tracking */
  private static readonly KNOWN_PAIRS = ["EURUSD", "GBPUSD", "USDJPY"];

  constructor() {
    const s1 = xavierScale(this.INPUT_SIZE, this.HIDDEN1);
    const s2 = xavierScale(this.HIDDEN1, this.HIDDEN2);
    const s3 = xavierScale(this.HIDDEN2, this.OUTPUT_SIZE);

    this.W1 = Array.from({ length: this.HIDDEN1 }, () =>
      Array.from({ length: this.INPUT_SIZE }, () => (Math.random() * 2 - 1) * s1),
    );
    this.b1 = new Array(this.HIDDEN1).fill(0);
    this.W2 = Array.from({ length: this.HIDDEN2 }, () =>
      Array.from({ length: this.HIDDEN1 }, () => (Math.random() * 2 - 1) * s2),
    );
    this.b2 = new Array(this.HIDDEN2).fill(0);
    this.W3 = Array.from({ length: this.OUTPUT_SIZE }, () =>
      Array.from({ length: this.HIDDEN2 }, () => (Math.random() * 2 - 1) * s3),
    );
    this.b3 = new Array(this.OUTPUT_SIZE).fill(0);

    // Initialise correlation accumulators
    for (const a of MultiAssetNeuralNetwork.KNOWN_PAIRS) {
      this.correlationAccum[a] = {};
      for (const b of MultiAssetNeuralNetwork.KNOWN_PAIRS) {
        this.correlationAccum[a][b] = { xy: 0, xx: 0, yy: 0, count: 0 };
      }
    }

    this.load();
  }

  // ── Forward pass ────────────────────────────────────────────────────

  /**
   * Run a forward pass through the 3-hidden-layer network.
   * @param input — 36-element flat vector (12 per asset × 3 assets)
   */
  private forward(input: number[]): { output: number[]; h1: number[]; h2: number[] } {
    // Hidden layer 1 — ReLU
    const h1 = new Array(this.HIDDEN1);
    for (let i = 0; i < this.HIDDEN1; i++) {
      let sum = this.b1[i];
      for (let j = 0; j < this.INPUT_SIZE; j++) sum += this.W1[i][j] * (input[j] ?? 0);
      h1[i] = relu(sum);
    }

    // Hidden layer 2 — ReLU
    const h2 = new Array(this.HIDDEN2);
    for (let i = 0; i < this.HIDDEN2; i++) {
      let sum = this.b2[i];
      for (let j = 0; j < this.HIDDEN1; j++) sum += this.W2[i][j] * h1[j];
      h2[i] = relu(sum);
    }

    // Output — sigmoid
    const output = new Array(this.OUTPUT_SIZE);
    for (let i = 0; i < this.OUTPUT_SIZE; i++) {
      let sum = this.b3[i];
      for (let j = 0; j < this.HIDDEN2; j++) sum += this.W3[i][j] * h2[j];
      output[i] = sigmoid(sum);
    }

    return { output, h1, h2 };
  }

  // ── Build flat input from multi-asset features ──────────────────────

  /**
   * Flatten per-asset feature vectors into a single 36-element input.
   * Order: [primary features (12), correlated1 features (12), correlated2 features (12)]
   */
  private buildInput(assetFeatures: Map<string, number[]>, primaryPair: string): number[] {
    const input = new Array(this.INPUT_SIZE).fill(0);

    // Place primary pair first
    const primary = assetFeatures.get(primaryPair) ?? new Array(this.FEATURES_PER_ASSET).fill(0.5);
    for (let i = 0; i < this.FEATURES_PER_ASSET; i++) {
      input[i] = primary[i] ?? 0.5;
    }

    // Fill remaining slots with other assets
    let offset = this.FEATURES_PER_ASSET;
    for (const pair of assetFeatures.keys()) {
      if (pair === primaryPair || offset >= this.INPUT_SIZE) continue;
      const feats = assetFeatures.get(pair) ?? new Array(this.FEATURES_PER_ASSET).fill(0.5);
      for (let i = 0; i < this.FEATURES_PER_ASSET && offset + i < this.INPUT_SIZE; i++) {
        input[offset + i] = feats[i] ?? 0.5;
      }
      offset += this.FEATURES_PER_ASSET;
    }

    return input;
  }

  // ── Public predict ──────────────────────────────────────────────────

  /**
   * Predict direction for the primary pair using multi-asset context.
   *
   * @param assetFeatures — Map of pair → 12-feature vector
   * @param primaryPair   — The pair to predict for
   * @returns NNPrediction with direction, confidence, and feature importance
   */
  predict(assetFeatures: Map<string, number[]>, primaryPair: string): NNPrediction {
    const input = this.buildInput(assetFeatures, primaryPair);
    const { output, h1 } = this.forward(input);

    // Derive feature importance from input→hidden1 weights and hidden activations
    const features: NNFeatureImportance[] = [];
    const allPairs = [
      primaryPair,
      ...Array.from(assetFeatures.keys()).filter((p) => p !== primaryPair),
    ];

    for (let a = 0; a < Math.min(allPairs.length, this.NUM_ASSETS); a++) {
      const pair = allPairs[a] ?? `asset_${a}`;
      const baseOffset = a * this.FEATURES_PER_ASSET;
      for (let f = 0; f < this.FEATURES_PER_ASSET; f++) {
        const idx = baseOffset + f;
        const featName = `${pair}:${MULTI_ASSET_FEATURE_NAMES[f] ?? `f${f}`}`;
        // Feature importance = weighted sum of hidden1 activations
        let importance = 0;
        for (let h = 0; h < this.HIDDEN1; h++) {
          importance += Math.abs(this.W1[h][idx] * h1[h]);
        }
        features.push({
          name: featName,
          value: input[idx] ?? 0,
          contribution: Math.tanh(importance * (output[0] - 0.5) * 10),
        });
      }
    }

    // Sort by absolute contribution for readability
    features.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    const direction: "BUY" | "SELL" | "NEUTRAL" =
      output[0] > 0.6 ? "BUY" : output[0] < 0.4 ? "SELL" : "NEUTRAL";

    return {
      direction,
      confidence: output[1],
      neuralScore: output[0] * 100,
      features,
      modelVersion: `multi-asset-v${this.version}`,
    };
  }

  // ── Update correlation accumulators ─────────────────────────────────

  private updateCorrelations(assetFeatures: Map<string, number[]>, outcome: number): void {
    const allPairs = Array.from(assetFeatures.keys());
    // Use the first feature (return_1) as the proxy for direction
    for (let i = 0; i < allPairs.length; i++) {
      for (let j = i; j < allPairs.length; j++) {
        const pairA = allPairs[i];
        const pairB = allPairs[j];
        const valA = (assetFeatures.get(pairA)?.[0] ?? 0) * (outcome > 0.5 ? 1 : -1);
        const valB = (assetFeatures.get(pairB)?.[0] ?? 0) * (outcome > 0.5 ? 1 : -1);

        if (!this.correlationAccum[pairA]) this.correlationAccum[pairA] = {};
        if (!this.correlationAccum[pairA][pairB])
          this.correlationAccum[pairA][pairB] = { xy: 0, xx: 0, yy: 0, count: 0 };

        const acc = this.correlationAccum[pairA][pairB];
        acc.xy += valA * valB;
        acc.xx += valA * valA;
        acc.yy += valB * valB;
        acc.count++;
      }
    }
  }

  // ── Public train ────────────────────────────────────────────────────

  /**
   * Train the multi-asset network on a single sample.
   *
   * @param assetFeatures — Map of pair → 12-feature vector
   * @param primaryPair   — The pair being predicted
   * @param outcome       — 0 (bearish) or 1 (bullish)
   */
  train(
    assetFeatures: Map<string, number[]>,
    primaryPair: string,
    outcome: number,
  ): { loss: number } {
    const input = this.buildInput(assetFeatures, primaryPair);
    const { output, h1, h2 } = this.forward(input);

    // Target: [outcome, confidence ~ 0.8 if confident, trend ~ |outcome - 0.5| * 2]
    const targets = [outcome, 0.8, Math.abs(outcome - 0.5) * 2];

    // ── Output layer gradients (MSE with sigmoid derivative) ──
    const d3 = new Array(this.OUTPUT_SIZE);
    let loss = 0;
    for (let i = 0; i < this.OUTPUT_SIZE; i++) {
      const error = targets[i] - output[i];
      loss += error * error;
      d3[i] = clipGrad(2 * error * sigmoidDeriv(output[i]));
    }
    loss /= this.OUTPUT_SIZE;

    // ── Hidden 2 gradients ──
    const d2 = new Array(this.HIDDEN2);
    for (let j = 0; j < this.HIDDEN2; j++) {
      let sum = 0;
      for (let i = 0; i < this.OUTPUT_SIZE; i++) sum += d3[i] * this.W3[i][j];
      d2[j] = clipGrad(sum * reluDeriv(h2[j]));
    }

    // ── Hidden 1 gradients ──
    const d1 = new Array(this.HIDDEN1);
    for (let j = 0; j < this.HIDDEN1; j++) {
      let sum = 0;
      for (let i = 0; i < this.HIDDEN2; i++) sum += d2[i] * this.W2[i][j];
      d1[j] = clipGrad(sum * reluDeriv(h1[j]));
    }

    // ── Update W3, b3 ──
    for (let i = 0; i < this.OUTPUT_SIZE; i++) {
      for (let j = 0; j < this.HIDDEN2; j++) {
        this.W3[i][j] += this.learningRate * clipGrad(d3[i] * h2[j]);
      }
      this.b3[i] += this.learningRate * clipGrad(d3[i]);
    }

    // ── Update W2, b2 ──
    for (let i = 0; i < this.HIDDEN2; i++) {
      for (let j = 0; j < this.HIDDEN1; j++) {
        this.W2[i][j] += this.learningRate * clipGrad(d2[i] * h1[j]);
      }
      this.b2[i] += this.learningRate * clipGrad(d2[i]);
    }

    // ── Update W1, b1 ──
    for (let i = 0; i < this.HIDDEN1; i++) {
      for (let j = 0; j < this.INPUT_SIZE; j++) {
        this.W1[i][j] += this.learningRate * clipGrad(d1[i] * (input[j] ?? 0));
      }
      this.b1[i] += this.learningRate * clipGrad(d1[i]);
    }

    // ── Bookkeeping ──
    this.totalTraining++;
    this.lastTrained = Date.now();
    this.version++;

    this.trainingHistory.push({ predicted: output[0], actual: outcome });
    if (this.trainingHistory.length > 500) this.trainingHistory.shift();

    // Update correlation accumulators
    this.updateCorrelations(assetFeatures, outcome);

    // Adaptive learning rate
    this.adaptLearningRate();

    // Persist periodically
    if (this.version % 20 === 0) this.save();

    return { loss };
  }

  // ── Adaptive learning rate ──────────────────────────────────────────

  private adaptLearningRate(): void {
    const accuracy = this.recentAccuracy();
    if (accuracy > 0.7) {
      this.learningRate = Math.max(this.adaptiveFloor, this.learningRate * this.adaptiveDecay);
    } else if (accuracy < 0.45) {
      this.learningRate = Math.min(this.adaptiveCeiling, this.learningRate * 1.05);
    }
  }

  private recentAccuracy(): number {
    if (this.trainingHistory.length === 0) return 0.5;
    const n = Math.min(50, this.trainingHistory.length);
    const recent = this.trainingHistory.slice(-n);
    let correct = 0;
    for (const t of recent) {
      if ((t.predicted > 0.5 && t.actual > 0.5) || (t.predicted < 0.5 && t.actual < 0.5)) correct++;
    }
    return correct / n;
  }

  // ── Get learned correlation map ─────────────────────────────────────

  /**
   * Returns a matrix of Pearson correlations between all tracked pairs.
   * Values range from -1 (perfect inverse) to +1 (perfect positive).
   */
  getCorrelationMap(): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};
    for (const a of Object.keys(this.correlationAccum)) {
      result[a] = {};
      for (const b of Object.keys(this.correlationAccum[a])) {
        const acc = this.correlationAccum[a][b];
        if (acc.count < 5 || acc.xx === 0 || acc.yy === 0) {
          result[a][b] = 0;
          continue;
        }
        const denom = Math.sqrt(acc.xx * acc.yy);
        result[a][b] = Math.max(-1, Math.min(1, acc.xy / denom));
      }
    }
    return result;
  }

  // ── Stats ───────────────────────────────────────────────────────────

  getStats(): NeuralNetStats {
    return {
      model: "MultiAsset",
      version: this.version,
      totalTraining: this.totalTraining,
      recentAccuracy: this.recentAccuracy(),
      lastTrained: this.lastTrained,
      architecture: `36→48(ReLU)→24(ReLU)→3`,
    };
  }

  // ── Persistence ─────────────────────────────────────────────────────

  save(): void {
    saveJSON("diq_multiasset_nn", {
      W1: this.W1,
      b1: this.b1,
      W2: this.W2,
      b2: this.b2,
      W3: this.W3,
      b3: this.b3,
      version: this.version,
      totalTraining: this.totalTraining,
      learningRate: this.learningRate,
      lastTrained: this.lastTrained,
      trainingHistory: this.trainingHistory.slice(-100),
      correlationAccum: this.correlationAccum,
    });
  }

  load(): void {
    const data = loadJSON<Record<string, unknown> | null>("diq_multiasset_nn", null);
    if (!data) return;
    try {
      const W1 = data.W1 as number[][];
      if (W1?.length !== this.HIDDEN1 || W1[0]?.length !== this.INPUT_SIZE) return;

      this.W1 = W1;
      this.b1 = data.b1 as number[];
      this.W2 = data.W2 as number[][];
      this.b2 = data.b2 as number[];
      this.W3 = data.W3 as number[][];
      this.b3 = data.b3 as number[];
      this.version = (data.version as number) ?? 0;
      this.totalTraining = (data.totalTraining as number) ?? 0;
      this.learningRate = (data.learningRate as number) ?? 0.004;
      this.lastTrained = (data.lastTrained as number) ?? 0;
      this.trainingHistory =
        (data.trainingHistory as Array<{ predicted: number; actual: number }>) ?? [];
      this.correlationAccum =
        (data.correlationAccum as Record<
          string,
          Record<string, { xy: number; xx: number; yy: number; count: number }>
        >) ?? this.correlationAccum;
    } catch {
      // Corrupt data — keep defaults
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 3. NEURAL ENSEMBLE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Combines predictions from multiple NN models using weighted voting.
 * Weights are recalculated dynamically based on each model's recent accuracy.
 */
export class NeuralEnsemble {
  private models: Map<string, EnhancedLSTMNeuralNetwork | MultiAssetNeuralNetwork>;
  private weights: Record<string, number>;
  private predictionHistory: Array<{ model: string; correct: boolean }>;
  private defaultWeight = 0.5;

  constructor() {
    this.models = new Map();
    this.weights = {};
    this.predictionHistory = [];

    // Register built-in models
    this.registerModel("lstm", new EnhancedLSTMNeuralNetwork());
    this.registerModel("multi-asset", new MultiAssetNeuralNetwork());
  }

  /**
   * Register a new model with the ensemble.
   */
  registerModel(name: string, model: EnhancedLSTMNeuralNetwork | MultiAssetNeuralNetwork): void {
    this.models.set(name, model);
    this.weights[name] = this.defaultWeight;
  }

  /**
   * Run all registered models and combine their predictions via weighted voting.
   *
   * @param inputs — Map of model name → its required input data
   *   - "lstm":        { features: number[] }        (24 features)
   *   - "multi-asset": { assetFeatures: Map, pair }  (multi-asset context)
   */
  predict(inputs: Map<string, unknown>): NNPrediction {
    this.updateWeights();

    const predictions: Array<{ name: string; pred: NNPrediction; weight: number }> = [];
    let totalWeight = 0;

    for (const [name, model] of this.models) {
      const input = inputs.get(name);
      if (!input) continue;

      let pred: NNPrediction;

      if (model instanceof EnhancedLSTMNeuralNetwork) {
        const data = input as { features: number[] };
        const result = model.predict(data.features ?? new Array(24).fill(0.5));
        const direction: "BUY" | "SELL" | "NEUTRAL" =
          result.direction > 0.6 ? "BUY" : result.direction < 0.4 ? "SELL" : "NEUTRAL";
        pred = {
          direction,
          confidence: result.confidence,
          neuralScore: result.direction * 100,
          features: LSTM_FEATURE_NAMES.map((n, i) => ({
            name: n,
            value: data.features?.[i] ?? 0,
            contribution: Math.tanh((data.features?.[i] ?? 0) * (result.direction - 0.5) * 5),
          })),
          modelVersion: `lstm-v${model.getStats().version}`,
        };
      } else {
        const data = input as { assetFeatures: Map<string, number[]>; pair: string };
        pred = model.predict(data.assetFeatures ?? new Map(), data.pair ?? "");
      }

      const weight = this.weights[name] ?? this.defaultWeight;
      predictions.push({ name, pred, weight });
      totalWeight += weight;
    }

    if (predictions.length === 0) {
      return {
        direction: "NEUTRAL",
        confidence: 0,
        neuralScore: 50,
        features: [],
        modelVersion: "ensemble-empty",
      };
    }

    // ── Weighted aggregation ──
    // Direction score: BUY=1, SELL=0, NEUTRAL=0.5
    let weightedDirScore = 0;
    let weightedConfidence = 0;
    const allFeatures: NNFeatureImportance[] = [];

    for (const { pred, weight } of predictions) {
      const dirValue = pred.direction === "BUY" ? 1 : pred.direction === "SELL" ? 0 : 0.5;
      const normalisedWeight = weight / (totalWeight || 1);
      weightedDirScore += dirValue * normalisedWeight;
      weightedConfidence += pred.confidence * normalisedWeight;

      // Merge top features from each model
      const topFeatures = pred.features.slice(0, 5);
      for (const f of topFeatures) {
        allFeatures.push({
          ...f,
          contribution: f.contribution * normalisedWeight,
        });
      }
    }

    // Sort merged features by absolute contribution
    allFeatures.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    const finalDirection: "BUY" | "SELL" | "NEUTRAL" =
      weightedDirScore > 0.6 ? "BUY" : weightedDirScore < 0.4 ? "SELL" : "NEUTRAL";

    return {
      direction: finalDirection,
      confidence: Math.min(1, Math.max(0, weightedConfidence)),
      neuralScore: weightedDirScore * 100,
      features: allFeatures.slice(0, 12),
      modelVersion: `ensemble-v${predictions.length}`,
    };
  }

  /**
   * Recalculate model weights based on recent prediction accuracy.
   * Models with higher accuracy get higher weight.
   */
  updateWeights(): void {
    const modelAccuracies: Record<string, { correct: number; total: number }> = {};

    // Tally recent predictions per model
    const recent = this.predictionHistory.slice(-200);
    for (const entry of recent) {
      if (!modelAccuracies[entry.model]) modelAccuracies[entry.model] = { correct: 0, total: 0 };
      modelAccuracies[entry.model].total++;
      if (entry.correct) modelAccuracies[entry.model].correct++;
    }

    // Convert to weights (softmax-style normalisation)
    const rawWeights: Record<string, number> = {};
    let sumRaw = 0;

    for (const name of this.models.keys()) {
      const acc = modelAccuracies[name];
      // If no history, keep default weight
      if (!acc || acc.total === 0) {
        rawWeights[name] = this.defaultWeight;
      } else {
        const accuracy = acc.correct / acc.total;
        // Exponential weighting: higher accuracy → much higher weight
        rawWeights[name] = Math.exp(accuracy * 5);
      }
      sumRaw += rawWeights[name];
    }

    // Normalise
    for (const name of this.models.keys()) {
      this.weights[name] = (rawWeights[name] ?? this.defaultWeight) / (sumRaw || 1);
    }
  }

  /**
   * Train all registered models on the same sample.
   *
   * @param inputs  — Map of model name → training input data
   * @param outcome — 0 (bearish) or 1 (bullish)
   */
  trainAll(inputs: Map<string, unknown>, outcome: number): void {
    const labels = [outcome, 0.8, Math.abs(outcome - 0.5) * 2];

    for (const [name, model] of this.models) {
      const input = inputs.get(name);
      if (!input) continue;

      if (model instanceof EnhancedLSTMNeuralNetwork) {
        const data = input as { features: number[] };
        model.train(data.features ?? new Array(24).fill(0.5), labels);
      } else {
        const data = input as { assetFeatures: Map<string, number[]>; pair: string };
        model.train(data.assetFeatures ?? new Map(), data.pair ?? "", outcome);
      }
    }
  }

  /**
   * Record whether a past ensemble prediction was correct, so weights
   * can be recalculated.
   */
  recordOutcome(modelName: string, correct: boolean): void {
    this.predictionHistory.push({ model: modelName, correct });
    if (this.predictionHistory.length > 1000) this.predictionHistory.shift();
  }

  /**
   * Get stats for all registered models.
   */
  getStats(): NeuralNetStats[] {
    return Array.from(this.models.entries()).map(([name, model]) => model.getStats());
  }

  /**
   * Reset all model states (e.g. between trading sessions).
   */
  resetAll(): void {
    for (const model of this.models.values()) {
      if (model instanceof EnhancedLSTMNeuralNetwork) {
        model.resetState();
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 4. FEATURE EXTRACTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Extract 24 market features from candle data for the LSTM network.
 *
 * Features (indices 0-23):
 *  0-4  : Returns at 1, 3, 5, 10, 20 bars
 *  5    : RSI(14) normalised to 0-1
 *  6    : Momentum (10-bar price change ratio)
 *  7    : Volatility (rolling std of 10-bar returns, normalised)
 *  8    : ATR ratio (current ATR / 20-period average ATR)
 *  9    : Bollinger Band position (0 = lower, 1 = upper)
 *  10-12: EMA slopes (8, 21, 50 period)
 *  13   : MACD histogram signal
 *  14   : Stochastic %K
 *  15   : Stochastic %D
 *  16   : Session binary (1 = day, 0 = night)
 *  17   : Day of week (0-6 normalised to 0-1)
 *  18   : Hour of day (0-23 normalised to 0-1)
 *  19   : Trend consistency (fraction of up-bars in last 20)
 *  20   : Mean reversion signal (deviation from 20-SMA)
 *  21   : Return skewness
 *  22   : Excess kurtosis of returns
 *  23   : Small noise for regularisation
 */
export function extractMarketFeatures(candles: Candle[]): number[] {
  // Default fallback if not enough data
  if (candles.length < 5) return new Array(24).fill(0.5);

  const close = candles.map((c) => c.close);
  const n = close.length;
  const last = n - 1;

  // ── Returns (indices 0-4) ──
  const safeReturn = (lookback: number): number => {
    if (last < lookback) return 0;
    return (close[last] - close[last - lookback]) / (close[last - lookback] || 1);
  };
  const return1 = Math.tanh(safeReturn(1) * 50); // amplified & bounded
  const return3 = Math.tanh(safeReturn(3) * 25);
  const return5 = Math.tanh(safeReturn(5) * 15);
  const return10 = Math.tanh(safeReturn(10) * 8);
  const return20 = Math.tanh(safeReturn(20) * 5);

  // ── RSI (index 5) ──
  const rsiValues = rsi(close, 14);
  const rsiVal = (rsiValues[last] ?? 50) / 100; // normalise to 0-1

  // ── Momentum (index 6) ──
  const momentum =
    last >= 10 ? Math.tanh(((close[last] - close[last - 10]) / (close[last - 10] || 1)) * 20) : 0;

  // ── Volatility (index 7) ──
  const returns: number[] = [];
  for (let i = 1; i < n; i++) {
    returns.push((close[i] - close[i - 1]) / (close[i - 1] || 1));
  }
  const volLookback = Math.min(10, returns.length);
  const recentReturns = returns.slice(-volLookback);
  const meanReturn = recentReturns.reduce((a, b) => a + b, 0) / volLookback;
  const returnStd = Math.sqrt(
    recentReturns.reduce((a, r) => a + (r - meanReturn) ** 2, 0) / volLookback,
  );
  const volatility = Math.min(1, returnStd * 100); // normalise

  // ── ATR ratio (index 8) ──
  const atrValues = atr(candles, 14);
  const currentATR = atrValues[last] ?? 0;
  // Compute 20-period average ATR
  let atrSum = 0;
  let atrCount = 0;
  const atrLookback = Math.min(20, last + 1);
  for (let i = n - atrLookback; i < n; i++) {
    const a = atrValues[i];
    if (a != null && a > 0) {
      atrSum += a;
      atrCount++;
    }
  }
  const avgATR = atrCount > 0 ? atrSum / atrCount : 1;
  const atrRatio = avgATR > 0 ? Math.min(2, currentATR / avgATR) / 2 : 0.5;

  // ── Bollinger Band position (index 9) ──
  const bb = bbands(close, 20, 2);
  const bbUpper = bb.upper[last] ?? close[last] * 1.01;
  const bbLower = bb.lower[last] ?? close[last] * 0.99;
  const bbRange = bbUpper - bbLower;
  const bbPosition =
    bbRange > 0 ? Math.max(0, Math.min(1, (close[last] - bbLower) / bbRange)) : 0.5;

  // ── EMA slopes (indices 10-12) ──
  const computeEMASlope = (period: number): number => {
    const emaVals = ema(close, period);
    const eNow = emaVals[last];
    const ePrev = emaVals[last - 3]; // 3-bar slope
    if (eNow == null || ePrev == null || ePrev === 0) return 0;
    return Math.tanh(((eNow - ePrev) / ePrev) * 100);
  };
  const ema8Slope = computeEMASlope(8);
  const ema21Slope = computeEMASlope(21);
  const ema50Slope = computeEMASlope(50);

  // ── MACD signal (index 13) ──
  const macdVals = macd(close, 12, 26, 9);
  const macdHist = macdVals.hist[last] ?? 0;
  const macdSignal = Math.tanh(macdHist * 200); // normalise

  // ── Stochastic %K and %D (indices 14-15) ──
  const stochVals = stoch(candles, 14, 3, 3);
  const stochK = (stochVals.k[last] ?? 50) / 100; // 0-1
  const stochD = (stochVals.d[last] ?? 50) / 100; // 0-1

  // ── Session binary (index 16) ──
  const lastEpoch = candles[last].epoch;
  const hourUTC = new Date(lastEpoch * 1000).getUTCHours();
  const session = hourUTC >= 6 && hourUTC < 20 ? 1 : 0;

  // ── Day of week (index 17) ──
  const dayOfWeek = new Date(lastEpoch * 1000).getUTCDay() / 6; // 0-1

  // ── Hour of day (index 18) ──
  const hourOfDay = hourUTC / 23; // 0-1

  // ── Trend consistency (index 19) ──
  const trendLookback = Math.min(20, n);
  let upBars = 0;
  for (let i = n - trendLookback; i < n; i++) {
    if (close[i] > close[i - 1]) upBars++;
  }
  const trendConsistency = upBars / trendLookback;

  // ── Mean reversion (index 20) ──
  const sma20 = close.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, n);
  const deviation = sma20 > 0 ? (close[last] - sma20) / sma20 : 0;
  const meanRevert = Math.tanh(deviation * 20);

  // ── Skewness (index 21) ──
  const skewLookback = Math.min(30, returns.length);
  const skewReturns = returns.slice(-skewLookback);
  const skewMean = skewReturns.reduce((a, b) => a + b, 0) / skewLookback;
  const skewStd =
    Math.sqrt(skewReturns.reduce((a, r) => a + (r - skewMean) ** 2, 0) / skewLookback) || 0.001;
  const skewness = Math.tanh(
    skewReturns.reduce((a, r) => a + ((r - skewMean) / skewStd) ** 3, 0) / skewLookback / 3,
  );

  // ── Kurtosis (index 22) ──
  const kurtosis = Math.tanh(
    (skewReturns.reduce((a, r) => a + ((r - skewMean) / skewStd) ** 4, 0) / skewLookback - 3) / 10,
  );

  // ── Noise (index 23) ──
  const noise = (Math.random() - 0.5) * 0.1; // small regularisation noise

  return [
    return1,
    return3,
    return5,
    return10,
    return20, // 0-4
    rsiVal, // 5
    momentum, // 6
    volatility, // 7
    atrRatio, // 8
    bbPosition, // 9
    ema8Slope,
    ema21Slope,
    ema50Slope, // 10-12
    macdSignal, // 13
    stochK,
    stochD, // 14-15
    session, // 16
    dayOfWeek, // 17
    hourOfDay, // 18
    trendConsistency, // 19
    meanRevert, // 20
    skewness, // 21
    kurtosis, // 22
    noise, // 23
  ];
}

/**
 * Extract 12 features per asset for the multi-asset network.
 *
 * Features:
 *  0-2 : Returns at 1, 5, 20 bars
 *  3   : RSI (normalised)
 *  4   : Momentum
 *  5   : Volatility
 *  6   : Trend direction (SMA5 vs SMA20)
 *  7   : Volume ratio (if available)
 *  8   : Bollinger Band position
 *  9   : ATR ratio
 *  10  : Stochastic %K
 *  11  : Small noise for regularisation
 */
export function extractMultiAssetFeatures(candles: Candle[]): number[] {
  if (candles.length < 5) return new Array(12).fill(0.5);

  const close = candles.map((c) => c.close);
  const n = close.length;
  const last = n - 1;

  // ── Returns (0-2) ──
  const safeReturn = (lookback: number): number => {
    if (last < lookback) return 0;
    return (close[last] - close[last - lookback]) / (close[last - lookback] || 1);
  };
  const return1 = Math.tanh(safeReturn(1) * 50);
  const return5 = Math.tanh(safeReturn(5) * 15);
  const return20 = Math.tanh(safeReturn(20) * 5);

  // ── RSI (3) ──
  const rsiValues = rsi(close, 14);
  const rsiVal = (rsiValues[last] ?? 50) / 100;

  // ── Momentum (4) ──
  const momentum =
    last >= 10 ? Math.tanh(((close[last] - close[last - 10]) / (close[last - 10] || 1)) * 20) : 0;

  // ── Volatility (5) ──
  const returns: number[] = [];
  for (let i = Math.max(1, n - 20); i < n; i++) {
    returns.push((close[i] - close[i - 1]) / (close[i - 1] || 1));
  }
  const meanR = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const stdR = Math.sqrt(returns.reduce((a, r) => a + (r - meanR) ** 2, 0) / (returns.length || 1));
  const volatility = Math.min(1, stdR * 100);

  // ── Trend (6) — SMA5 vs SMA20 direction ──
  const sma5 = close.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, n);
  const sma20 = close.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, n);
  const trend = sma20 > 0 ? Math.tanh(((sma5 - sma20) / sma20) * 50) : 0;

  // ── Volume ratio (7) ──
  let volumeRatio = 0.5;
  if (candles[0]?.volume != null) {
    const recentVol = candles.slice(-5).reduce((s, c) => s + (c.volume ?? 0), 0) / 5;
    const avgVol = candles.reduce((s, c) => s + (c.volume ?? 0), 0) / n;
    volumeRatio = avgVol > 0 ? Math.min(1, Math.max(0, recentVol / avgVol / 2)) : 0.5;
  }

  // ── BB position (8) ──
  const bb = bbands(close, 20, 2);
  const bbUpper = bb.upper[last] ?? close[last] * 1.01;
  const bbLower = bb.lower[last] ?? close[last] * 0.99;
  const bbRange = bbUpper - bbLower;
  const bbPosition =
    bbRange > 0 ? Math.max(0, Math.min(1, (close[last] - bbLower) / bbRange)) : 0.5;

  // ── ATR ratio (9) ──
  const atrValues = atr(candles, 14);
  const currentATR = atrValues[last] ?? 0;
  let atrSum = 0,
    atrCount = 0;
  const atrLookback = Math.min(20, last + 1);
  for (let i = n - atrLookback; i < n; i++) {
    const a = atrValues[i];
    if (a != null && a > 0) {
      atrSum += a;
      atrCount++;
    }
  }
  const avgATR = atrCount > 0 ? atrSum / atrCount : 1;
  const atrRatio = avgATR > 0 ? Math.min(1, currentATR / avgATR / 2) : 0.5;

  // ── Stochastic %K (10) ──
  const stochVals = stoch(candles, 14, 3, 3);
  const stochK = (stochVals.k[last] ?? 50) / 100;

  // ── Noise (11) ──
  const noise = (Math.random() - 0.5) * 0.1;

  return [
    return1,
    return5,
    return20, // 0-2
    rsiVal, // 3
    momentum, // 4
    volatility, // 5
    trend, // 6
    volumeRatio, // 7
    bbPosition, // 8
    atrRatio, // 9
    stochK, // 10
    noise, // 11
  ];
}

// ═══════════════════════════════════════════════════════════════════════
// 5. SIGNAL INTEGRATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Enhance an existing trading signal with neural network predictions.
 *
 * Pipeline:
 *  1. Extract 24 features from candles
 *  2. Run LSTM prediction
 *  3. If correlated candles are available, also run multi-asset prediction
 *  4. Return adjusted direction and boosted score
 *
 * @param baseSignal        — Original signal with direction and score
 * @param candles           — Primary pair candle history
 * @param correlatedCandles — Optional Map of pair → candle data for cross-asset analysis
 */
export function neuralEnhanceSignal(
  baseSignal: { direction: "BUY" | "SELL"; scorePct: number; pair: string; timeframe: string },
  candles: Candle[],
  correlatedCandles?: Map<string, Candle[]>,
): {
  direction: "BUY" | "SELL";
  scorePct: number;
  neuralBoost: number;
  neuralConfidence: number;
} {
  // ── Step 1: Extract features ──
  const features = extractMarketFeatures(candles);

  // ── Step 2: Run LSTM prediction ──
  const lstmResult = lstmNetwork.predict(features);
  const lstmDirection = lstmResult.direction; // 0-1, >0.5 bullish
  const lstmConfidence = lstmResult.confidence;

  // ── Step 3: Multi-asset prediction (if correlated data available) ──
  let multiAssetDir = 0.5;
  let multiAssetConfidence = 0.5;
  let hasMultiAsset = false;

  if (correlatedCandles && correlatedCandles.size >= 2) {
    hasMultiAsset = true;
    const assetFeatures = new Map<string, number[]>();
    // Primary pair features
    assetFeatures.set(baseSignal.pair, extractMultiAssetFeatures(candles));
    // Correlated pairs
    for (const [pair, corrCandles] of correlatedCandles) {
      if (pair !== baseSignal.pair) {
        assetFeatures.set(pair, extractMultiAssetFeatures(corrCandles));
      }
    }
    const maResult = multiAssetNN.predict(assetFeatures, baseSignal.pair);
    multiAssetDir = maResult.direction === "BUY" ? 1 : maResult.direction === "SELL" ? 0 : 0.5;
    multiAssetConfidence = maResult.confidence;
  }

  // ── Step 4: Combine and adjust ──
  // Weighted combination of LSTM and multi-asset signals
  const lstmWeight = hasMultiAsset ? 0.6 : 1.0;
  const maWeight = hasMultiAsset ? 0.4 : 0.0;
  const combinedDir = lstmDirection * lstmWeight + multiAssetDir * maWeight;
  const combinedConfidence = lstmConfidence * lstmWeight + multiAssetConfidence * maWeight;

  // Base direction as numeric: BUY = 1, SELL = 0
  const baseDir = baseSignal.direction === "BUY" ? 1 : 0;

  // Neural boost: how much the NN agrees with the base signal
  // If NN strongly agrees → boost the score. If NN disagrees → reduce.
  const agreement = 1 - Math.abs(combinedDir - baseDir); // 1 = perfect agreement, 0 = opposite
  const confidenceFactor = combinedConfidence; // higher NN confidence → more boost/reduction

  // Compute boost: +20% max if NN agrees strongly, -30% max if NN disagrees
  const neuralBoost = (agreement - 0.5) * confidenceFactor * 40; // range roughly -20 to +20

  // If NN strongly disagrees (combined dir on opposite side and confident), flip direction
  let finalDirection = baseSignal.direction;
  const nnDisagrees =
    (baseDir === 1 && combinedDir < 0.35) || (baseDir === 0 && combinedDir > 0.65);
  const nnVeryConfident = combinedConfidence > 0.7;

  if (nnDisagrees && nnVeryConfident) {
    // Strong disagreement with high confidence → flip the signal
    finalDirection = baseSignal.direction === "BUY" ? "SELL" : "BUY";
  }

  // Adjust score
  const boostedScore = Math.max(0, Math.min(100, baseSignal.scorePct + neuralBoost));

  return {
    direction: finalDirection,
    scorePct: Math.round(boostedScore * 10) / 10,
    neuralBoost: Math.round(neuralBoost * 10) / 10,
    neuralConfidence: Math.round(combinedConfidence * 100) / 100,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORT SINGLETONS
// ═══════════════════════════════════════════════════════════════════════

/** Singleton ensemble that combines LSTM + multi-asset models */
export const neuralEnsemble = new NeuralEnsemble();

/** Singleton LSTM network for direct use */
export const lstmNetwork = new EnhancedLSTMNeuralNetwork();

/** Singleton multi-asset network for direct use */
export const multiAssetNN = new MultiAssetNeuralNetwork();
