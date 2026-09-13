/**
 * Boom & Crash Neural Network Predictor
 * Self-improving: learns from signal outcomes to increase accuracy
 * Generates frequent signals with confidence scoring
 */

// ── Types ──
export interface BoomCrashSignal {
  id: string;
  index: string; // e.g. "Boom 1000", "Crash 500"
  direction: "SPIKE_UP" | "SPIKE_DOWN";
  confidence: number; // 0-100
  predictedTick: number;
  currentTick: number;
  timestamp: string;
  factors: BoomCrashFactor[];
  neuralScore: number;
  outcome?: "HIT" | "MISS" | null;
  outcomeTimestamp?: string;
}

export interface BoomCrashFactor {
  name: string;
  value: number; // 0-1
  weight: number;
  signal: "bullish" | "bearish" | "neutral";
}

// ── Neural Network ──
export class BoomCrashNeuralNetwork {
  private inputSize = 18;
  private hiddenSize = 24;
  private outputSize = 3; // [spike_prob, direction_bias, confidence]

  private weightsIH: number[][];
  private weightsHO: number[][];
  private biasH: number[];
  private biasO: number[];
  private learningRate = 0.005;
  private trainingHistory: Array<{ input: number[]; actual: number; predicted: number }> = [];
  private version = 0;

  constructor() {
    // Initialize with Xavier initialization
    const scaleIH = Math.sqrt(2 / (this.inputSize + this.hiddenSize));
    const scaleHO = Math.sqrt(2 / (this.hiddenSize + this.outputSize));

    this.weightsIH = Array.from({ length: this.hiddenSize }, () =>
      Array.from({ length: this.inputSize }, () => (Math.random() * 2 - 1) * scaleIH),
    );
    this.weightsHO = Array.from({ length: this.outputSize }, () =>
      Array.from({ length: this.hiddenSize }, () => (Math.random() * 2 - 1) * scaleHO),
    );
    this.biasH = new Array(this.hiddenSize).fill(0);
    this.biasO = new Array(this.outputSize).fill(0);

    // Load saved weights if available
    this.loadWeights();
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
  }

  private relu(x: number): number {
    return Math.max(0, x);
  }

  private leakyRelu(x: number): number {
    return x > 0 ? x : 0.01 * x;
  }

  // Forward pass
  predict(features: number[]): {
    spikeProbability: number;
    directionBias: number;
    confidence: number;
    hiddenActivations: number[];
  } {
    // Hidden layer with LeakyReLU
    const hidden = this.weightsIH.map((w, i) => {
      const sum = w.reduce((acc, wt, j) => acc + wt * (features[j] || 0), 0) + this.biasH[i];
      return this.leakyRelu(sum);
    });

    // Output layer
    const output = this.weightsHO.map((w, i) => {
      const sum = w.reduce((acc, wt, j) => acc + wt * hidden[j], 0) + this.biasO[i];
      return this.sigmoid(sum);
    });

    return {
      spikeProbability: output[0],
      directionBias: output[1], // >0.5 = UP, <0.5 = DOWN
      confidence: output[2],
      hiddenActivations: hidden,
    };
  }

  // Backpropagation training
  train(features: number[], actualOutcome: number): { loss: number; improvement: number } {
    const prediction = this.predict(features);
    const predicted = prediction.spikeProbability;
    const error = actualOutcome - predicted;
    const loss = error * error;

    // Store for tracking
    this.trainingHistory.push({ input: features, actual: actualOutcome, predicted });
    if (this.trainingHistory.length > 1000) this.trainingHistory.shift();

    // Output layer gradients
    const outputGradients = this.weightsHO.map((w, i) => {
      const o = this.sigmoid(
        w.reduce((acc, wt, j) => acc + wt * prediction.hiddenActivations[j], 0) + this.biasO[i],
      );
      const target =
        i === 0
          ? actualOutcome
          : i === 1
            ? actualOutcome > 0.5
              ? 0.8
              : 0.2
            : Math.abs(error) < 0.2
              ? 0.9
              : 0.3;
      return (target - o) * o * (1 - o);
    });

    // Hidden layer gradients
    const hiddenGradients = prediction.hiddenActivations.map((h, j) => {
      const downstream = outputGradients.reduce((acc, og, i) => acc + og * this.weightsHO[i][j], 0);
      return downstream * (h > 0 ? 1 : 0.01); // LeakyReLU derivative
    });

    // Update output weights
    for (let i = 0; i < this.outputSize; i++) {
      for (let j = 0; j < this.hiddenSize; j++) {
        this.weightsHO[i][j] +=
          this.learningRate * outputGradients[i] * prediction.hiddenActivations[j];
      }
      this.biasO[i] += this.learningRate * outputGradients[i];
    }

    // Update hidden weights
    for (let i = 0; i < this.hiddenSize; i++) {
      for (let j = 0; j < this.inputSize; j++) {
        this.weightsIH[i][j] += this.learningRate * hiddenGradients[i] * (features[j] || 0);
      }
      this.biasH[i] += this.learningRate * hiddenGradients[i];
    }

    this.version++;

    // Auto-save every 10 training iterations
    if (this.version % 10 === 0) this.saveWeights();

    // Calculate improvement
    const recentN = Math.min(50, this.trainingHistory.length);
    const recent = this.trainingHistory.slice(-recentN);
    const recentAccuracy =
      recent.filter((t) => Math.abs(t.actual - Math.round(t.predicted)) < 0.5).length / recentN;

    return { loss, improvement: recentAccuracy };
  }

  // Persistence
  saveWeights() {
    try {
      localStorage.setItem(
        "diq_bcnn_weights",
        JSON.stringify({
          weightsIH: this.weightsIH,
          weightsHO: this.weightsHO,
          biasH: this.biasH,
          biasO: this.biasO,
          version: this.version,
          learningRate: this.learningRate,
        }),
      );
    } catch {}
  }

  loadWeights() {
    try {
      const saved = localStorage.getItem("diq_bcnn_weights");
      if (!saved) return;
      const data = JSON.parse(saved);
      if (data.weightsIH?.length === this.hiddenSize) {
        this.weightsIH = data.weightsIH;
        this.weightsHO = data.weightsHO;
        this.biasH = data.biasH;
        this.biasO = data.biasO;
        this.version = data.version || 0;
        this.learningRate = data.learningRate || 0.005;
      }
    } catch {}
  }

  getStats() {
    const recentN = Math.min(100, this.trainingHistory.length);
    const recent = this.trainingHistory.slice(-recentN);
    const accuracy =
      recent.length > 0
        ? recent.filter((t) => Math.abs(t.actual - Math.round(t.predicted)) < 0.5).length / recentN
        : 0;
    return {
      version: this.version,
      trainingSize: this.trainingHistory.length,
      accuracy: Math.round(accuracy * 100),
      learningRate: this.learningRate,
    };
  }

  // Adaptive learning rate
  adaptLearningRate() {
    const stats = this.getStats();
    if (stats.accuracy > 80) {
      this.learningRate = Math.max(0.0005, this.learningRate * 0.95); // Fine-tune
    } else if (stats.accuracy < 50) {
      this.learningRate = Math.min(0.02, this.learningRate * 1.1); // Explore more
    }
  }
}

// ── Feature Extraction ──
export function extractBoomCrashFeatures(ticks: number[], index: string): number[] {
  if (ticks.length < 20) return new Array(18).fill(0.5);

  const recent = ticks.slice(-100);
  const n = recent.length;
  const isBoom = index.toLowerCase().includes("boom");

  // Price statistics
  const mean = recent.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const normStd = Math.min(1, (std / mean) * 10);

  // Returns
  const returns = recent.slice(1).map((v, i) => (v - recent[i]) / recent[i]);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const returnStd = Math.sqrt(
    returns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / returns.length,
  );

  // Spike detection
  const spikeThreshold = std * 2.5;
  const recentSpikes = recent
    .slice(-20)
    .filter((v, i) => i > 0 && Math.abs(v - recent[n - 20 + i - 1]) > spikeThreshold).length;

  // Momentum
  const sma5 = recent.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const sma20 = recent.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const momentum = (sma5 - sma20) / sma20;

  // RSI approximation
  const gains = returns.filter((r) => r > 0);
  const losses = returns.filter((r) => r < 0).map((r) => -r);
  const avgGain = gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0.001;
  const rsi = 1 - 1 / (1 + avgGain / avgLoss);

  // Tick interval pattern (time between spikes)
  const ticksSinceLastSpike = (() => {
    for (let i = recent.length - 2; i >= 0; i--) {
      if (Math.abs(recent[i + 1] - recent[i]) > spikeThreshold) return recent.length - 1 - i;
    }
    return recent.length;
  })();
  const normalizedTickGap = Math.min(1, ticksSinceLastSpike / 50);

  // Volatility regime
  const vol10 = Math.sqrt(returns.slice(-10).reduce((a, b) => a + b ** 2, 0) / 10);
  const vol50 = Math.sqrt(
    returns.slice(-50).reduce((a, b) => a + b ** 2, 0) / Math.min(50, returns.length),
  );
  const volRatio = vol50 > 0 ? Math.min(2, vol10 / vol50) / 2 : 0.5;

  // Trend consistency
  const upTicks = returns.slice(-20).filter((r) => r > 0).length / 20;

  // Boom/Crash specific
  const boomBias = isBoom ? 1 : 0;
  const crashBias = isBoom ? 0 : 1;

  // Pattern: compression before spike
  const recentVol = returns.slice(-5).map(Math.abs);
  const compression = recentVol.every((v) => v < returnStd * 0.5) ? 1 : 0;

  // Skewness
  const skew =
    returns.reduce((a, r) => a + ((r - avgReturn) / (returnStd || 0.001)) ** 3, 0) / returns.length;
  const normSkew = Math.min(1, Math.max(0, (skew + 3) / 6));

  // Kurtosis (heavy tails = more spikes)
  const kurt =
    returns.reduce((a, r) => a + ((r - avgReturn) / (returnStd || 0.001)) ** 4, 0) /
      returns.length -
    3;
  const normKurt = Math.min(1, Math.max(0, kurt / 10));

  // Mean reversion signal
  const deviation = (recent[n - 1] - mean) / (std || 1);
  const meanReversion = Math.min(1, Math.max(0, Math.abs(deviation) / 3));

  return [
    normStd, // 0: Volatility
    Math.min(1, recentSpikes / 5), // 1: Spike frequency
    Math.min(1, Math.max(0, momentum * 10 + 0.5)), // 2: Momentum
    rsi, // 3: RSI
    normalizedTickGap, // 4: Ticks since last spike
    volRatio, // 5: Volatility regime
    upTicks, // 6: Trend consistency
    boomBias, // 7: Is boom index
    crashBias, // 8: Is crash index
    compression, // 9: Compression pattern
    normSkew, // 10: Skewness
    normKurt, // 11: Kurtosis
    meanReversion, // 12: Mean reversion
    Math.min(1, returnStd * 100), // 13: Return volatility
    Math.min(1, Math.max(0, avgReturn * 1000 + 0.5)), // 14: Avg return
    Math.min(1, recent[n - 1] / (mean * 2 || 1)), // 15: Price / 2*mean
    Math.min(1, Math.abs(recent[n - 1] - recent[n - 2]) / (std || 1) / 3), // 16: Last tick magnitude
    Math.random() * 0.1, // 17: Noise (regularization)
  ];
}

// ── Signal Generator ──
const nn = new BoomCrashNeuralNetwork();

export function generateBoomCrashSignal(ticks: number[], index: string): BoomCrashSignal | null {
  const features = extractBoomCrashFeatures(ticks, index);
  const prediction = nn.predict(features);

  // Only generate signal if probability > threshold
  if (prediction.spikeProbability < 0.55) return null;

  const isBoom = index.toLowerCase().includes("boom");
  const direction: "SPIKE_UP" | "SPIKE_DOWN" =
    prediction.directionBias > 0.5 ? "SPIKE_UP" : "SPIKE_DOWN";

  // For boom indices, spikes go up; for crash, spikes go down
  const expectedDirection = isBoom ? "SPIKE_UP" : "SPIKE_DOWN";
  const confidence = Math.round(prediction.confidence * 100);
  const currentTick = ticks[ticks.length - 1];

  const factors: BoomCrashFactor[] = [
    {
      name: "Spike Probability",
      value: prediction.spikeProbability,
      weight: 0.3,
      signal: prediction.spikeProbability > 0.65 ? "bullish" : "neutral",
    },
    {
      name: "Volatility Regime",
      value: features[5],
      weight: 0.15,
      signal: features[5] > 0.6 ? "bullish" : features[5] < 0.3 ? "bearish" : "neutral",
    },
    {
      name: "Compression",
      value: features[9],
      weight: 0.2,
      signal: features[9] > 0.5 ? "bullish" : "neutral",
    },
    {
      name: "RSI",
      value: features[3],
      weight: 0.1,
      signal: features[3] > 0.7 ? "bearish" : features[3] < 0.3 ? "bullish" : "neutral",
    },
    {
      name: "Momentum",
      value: features[2],
      weight: 0.1,
      signal: features[2] > 0.6 ? "bullish" : features[2] < 0.4 ? "bearish" : "neutral",
    },
    {
      name: "Tick Gap",
      value: features[4],
      weight: 0.15,
      signal: features[4] > 0.7 ? "bullish" : "neutral",
    },
  ];

  return {
    id: crypto.randomUUID(),
    index,
    direction: expectedDirection,
    confidence,
    predictedTick: Math.round(
      currentTick * (1 + (isBoom ? 0.005 : -0.005) * prediction.spikeProbability),
    ),
    currentTick,
    timestamp: new Date().toISOString(),
    factors,
    neuralScore: Math.round(prediction.spikeProbability * 100),
    outcome: null,
  };
}

export function trainOnOutcome(signal: BoomCrashSignal, ticks: number[], hit: boolean) {
  const features = extractBoomCrashFeatures(ticks, signal.index);
  const result = nn.train(features, hit ? 1 : 0);
  nn.adaptLearningRate();
  nn.saveWeights();
  return result;
}

export function getNNStats() {
  return nn.getStats();
}

export const BOOM_CRASH_INDICES = [
  { symbol: "Boom 300 Index", short: "Boom 300", type: "boom" },
  { symbol: "Boom 500 Index", short: "Boom 500", type: "boom" },
  { symbol: "Boom 1000 Index", short: "Boom 1000", type: "boom" },
  { symbol: "Crash 300 Index", short: "Crash 300", type: "crash" },
  { symbol: "Crash 500 Index", short: "Crash 500", type: "crash" },
  { symbol: "Crash 1000 Index", short: "Crash 1000", type: "crash" },
] as const;
