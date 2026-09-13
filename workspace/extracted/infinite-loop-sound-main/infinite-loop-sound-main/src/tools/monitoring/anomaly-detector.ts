/**
 * Anomaly Detector - Statistical anomaly detection for market data streams
 * Extends monitoring with Z-score, IQR, isolation forest, and seasonal decomposition
 */

export interface AnomalyConfig {
  method: "zscore" | "iqr" | "isolation_forest" | "seasonal";
  threshold: number;
  windowSize: number;
  seasonalityPeriod: number;
}

export interface Anomaly {
  timestamp: number;
  value: number;
  score: number;
  method: string;
  severity: "low" | "medium" | "high";
  description: string;
}

export interface AnomalyReport {
  totalAnomalies: number;
  highSeverity: number;
  mediumSeverity: number;
  lowSeverity: number;
  anomalies: Anomaly[];
  baseline: { mean: number; stdDev: number; median: number; iqr: number };
}

export class AnomalyDetector {
  constructor(private config: AnomalyConfig) {}

  detect(data: { timestamp: number; value: number }[]): AnomalyReport {
    const values = data.map((d) => d.value);
    const baseline = this.calculateBaseline(values);
    const anomalies: Anomaly[] = [];

    switch (this.config.method) {
      case "zscore":
        for (const point of data) {
          const score =
            baseline.stdDev > 0 ? Math.abs((point.value - baseline.mean) / baseline.stdDev) : 0;
          if (score > this.config.threshold) {
            anomalies.push(this.createAnomaly(point, score, "zscore", baseline));
          }
        }
        break;
      case "iqr": {
        const lowerFence = baseline.median - this.config.threshold * baseline.iqr;
        const upperFence = baseline.median + this.config.threshold * baseline.iqr;
        for (const point of data) {
          if (point.value < lowerFence || point.value > upperFence) {
            const score =
              Math.max(Math.abs(point.value - upperFence), Math.abs(point.value - lowerFence)) /
              (baseline.iqr || 1);
            anomalies.push(this.createAnomaly(point, score, "iqr", baseline));
          }
        }
        break;
      }
      case "isolation_forest": {
        const forest = this.buildIsolationForest(values, 100, 256);
        const c_n = this.expectedPathLength(Math.max(2, Math.min(256, values.length)));
        for (const point of data) {
          const pathLength = this.averagePathLength(point.value, forest);
          const score = Math.pow(2, -pathLength / (c_n || 1));
          if (score > 0.6) {
            anomalies.push(this.createAnomaly(point, score, "isolation_forest", baseline));
          }
        }
        break;
      }
      case "seasonal": {
        const period = Math.max(1, Math.floor(this.config.seasonalityPeriod || 1));
        const seasonal = this.seasonalDecompose(values, period);
        for (let i = 0; i < data.length; i++) {
          const residual =
            data[i].value - seasonal.trend[i] - seasonal.seasonal[i % seasonal.seasonal.length];
          const score = baseline.stdDev > 0 ? Math.abs(residual) / baseline.stdDev : 0;
          if (score > this.config.threshold) {
            anomalies.push(this.createAnomaly(data[i], score, "seasonal", baseline));
          }
        }
        break;
      }
    }

    return {
      totalAnomalies: anomalies.length,
      highSeverity: anomalies.filter((a) => a.severity === "high").length,
      mediumSeverity: anomalies.filter((a) => a.severity === "medium").length,
      lowSeverity: anomalies.filter((a) => a.severity === "low").length,
      anomalies,
      baseline,
    };
  }

  private calculateBaseline(values: number[]): AnomalyReport["baseline"] {
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (values.length || 1);
    const stdDev = Math.sqrt(variance);
    const median = sorted[Math.floor(sorted.length / 2)] || 0;
    const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
    const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
    const iqr = q3 - q1;
    return { mean, stdDev, median, iqr };
  }

  private createAnomaly(
    point: { timestamp: number; value: number },
    score: number,
    method: string,
    baseline: AnomalyReport["baseline"],
  ): Anomaly {
    const severity = score > 3 ? "high" : score > 2 ? "medium" : "low";
    return {
      timestamp: point.timestamp,
      value: point.value,
      score,
      method,
      severity,
      description: `Value ${point.value.toFixed(4)} deviates ${score.toFixed(2)}x from baseline (mean=${baseline.mean.toFixed(4)}, std=${baseline.stdDev.toFixed(4)})`,
    };
  }

  /**
   * Proper isolation forest: each tree is built on a random subsample with random
   * split thresholds; anomalies (extreme values) isolate quickly → short paths →
   * high scores via 2^(-E[h]/c(n)).
   */
  private buildIsolationForest(
    values: number[],
    numTrees: number,
    sampleSize: number,
  ): ITreeNode[] {
    const forest: ITreeNode[] = [];
    if (values.length === 0) return forest;
    const size = Math.max(2, Math.min(sampleSize, values.length));
    const maxHeight = Math.ceil(Math.log2(Math.max(2, size)));
    for (let t = 0; t < numTrees; t++) {
      const sample: number[] = [];
      for (let i = 0; i < size; i++) {
        sample.push(values[Math.floor(Math.random() * values.length)]);
      }
      forest.push(this.buildITree(sample, 0, maxHeight));
    }
    return forest;
  }

  private buildITree(data: number[], depth: number, maxHeight: number): ITreeNode {
    const node: ITreeNode = { size: data.length };
    if (depth >= maxHeight || data.length <= 1) return node;
    let min = Infinity;
    let max = -Infinity;
    for (const v of data) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === max) return node;
    node.splitValue = min + Math.random() * (max - min);
    const left: number[] = [];
    const right: number[] = [];
    for (const v of data) {
      if (v < node.splitValue) left.push(v);
      else right.push(v);
    }
    node.left = this.buildITree(left, depth + 1, maxHeight);
    node.right = this.buildITree(right, depth + 1, maxHeight);
    return node;
  }

  private itreePathLength(value: number, tree: ITreeNode, depth: number): number {
    if (tree.splitValue === undefined || !tree.left || !tree.right) {
      return depth + this.expectedPathLength(tree.size);
    }
    return value < tree.splitValue
      ? this.itreePathLength(value, tree.left, depth + 1)
      : this.itreePathLength(value, tree.right, depth + 1);
  }

  private averagePathLength(value: number, forest: ITreeNode[]): number {
    if (forest.length === 0) return 1;
    let total = 0;
    for (const tree of forest) total += this.itreePathLength(value, tree, 0);
    return total / forest.length;
  }

  private expectedPathLength(n: number): number {
    if (n <= 1) return 1;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
  }

  private seasonalDecompose(
    values: number[],
    period: number,
  ): { trend: number[]; seasonal: number[] } {
    const trend: number[] = [];
    const halfWindow = Math.floor(period / 2);
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(values.length, i + halfWindow + 1);
      const window = values.slice(start, end);
      trend.push(window.reduce((a, b) => a + b, 0) / window.length);
    }
    const seasonal: number[] = new Array(period).fill(0);
    const counts: number[] = new Array(period).fill(0);
    for (let i = 0; i < values.length; i++) {
      seasonal[i % period] += values[i] - trend[i];
      counts[i % period]++;
    }
    for (let i = 0; i < period; i++) {
      seasonal[i] = counts[i] > 0 ? seasonal[i] / counts[i] : 0;
    }
    return { trend, seasonal };
  }
}

export default AnomalyDetector;

interface ITreeNode {
  size: number;
  splitValue?: number;
  left?: ITreeNode;
  right?: ITreeNode;
}
