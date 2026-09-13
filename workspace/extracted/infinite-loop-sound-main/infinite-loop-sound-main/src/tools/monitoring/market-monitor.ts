/**
 * Market Monitor - Real-time market monitoring and alerting
 */

export interface MarketAlert {
  id: string;
  type: "price" | "volume" | "volatility" | "trend" | "correlation" | "anomaly";
  symbol: string;
  severity: "info" | "warning" | "critical";
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
}

export interface MarketSnapshot {
  timestamp: number;
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  volume24h: number;
  change24h: number;
  volatility: number;
  rsi: number;
  macd: number;
}

export interface VolatilityAlert {
  symbol: string;
  currentVol: number;
  averageVol: number;
  percentChange: number;
  status: "normal" | "elevated" | "extreme";
}

export interface AnomalyDetection {
  symbol: string;
  type: string;
  score: number;
  description: string;
  timestamp: number;
}

export interface CorrelationWatch {
  symbols: string[];
  correlation: number;
  change: number;
  status: "normal" | "diverging" | "converging";
}

export class MarketMonitor {
  private alerts: Map<string, MarketAlert[]> = new Map();
  private snapshots: Map<string, MarketSnapshot[]> = new Map();
  private watchers: Map<string, { alertFn: (alert: MarketAlert) => void }> = new Map();
  private volatilityBaseline: Map<string, number> = new Map();

  /**
   * Record market snapshot
   */
  recordSnapshot(snapshot: MarketSnapshot): void {
    if (!this.snapshots.has(snapshot.symbol)) {
      this.snapshots.set(snapshot.symbol, []);
    }

    this.snapshots.get(snapshot.symbol)!.push(snapshot);

    // Keep only last 1000 snapshots per symbol
    const snapshots = this.snapshots.get(snapshot.symbol)!;
    if (snapshots.length > 1000) {
      snapshots.shift();
    }
  }

  /**
   * Check price alerts
   */
  checkPriceAlert(
    symbol: string,
    price: number,
    thresholds: { high?: number; low?: number },
  ): MarketAlert[] {
    const alerts: MarketAlert[] = [];
    const timestamp = Date.now();

    if (thresholds.high && price > thresholds.high) {
      const alert: MarketAlert = {
        id: `ALERT-${timestamp}`,
        type: "price",
        symbol,
        severity: "warning",
        message: `Price ${price} exceeded high threshold ${thresholds.high}`,
        value: price,
        threshold: thresholds.high,
        timestamp,
      };

      alerts.push(alert);
      this.recordAlert(alert);
      this.notifyWatchers(alert);
    }

    if (thresholds.low && price < thresholds.low) {
      const alert: MarketAlert = {
        id: `ALERT-${timestamp}`,
        type: "price",
        symbol,
        severity: "warning",
        message: `Price ${price} fell below low threshold ${thresholds.low}`,
        value: price,
        threshold: thresholds.low,
        timestamp,
      };

      alerts.push(alert);
      this.recordAlert(alert);
      this.notifyWatchers(alert);
    }

    return alerts;
  }

  /**
   * Check volume alerts
   */
  checkVolumeAlert(
    symbol: string,
    volume: number,
    avgVolume: number,
    threshold: number = 1.5,
  ): MarketAlert | null {
    const volumeRatio = volume / avgVolume;

    if (volumeRatio > threshold) {
      const alert: MarketAlert = {
        id: `ALERT-${Date.now()}`,
        type: "volume",
        symbol,
        severity: "warning",
        message: `Volume spike detected: ${(volumeRatio * 100).toFixed(0)}% above average`,
        value: volume,
        threshold: avgVolume * threshold,
        timestamp: Date.now(),
      };

      this.recordAlert(alert);
      this.notifyWatchers(alert);

      return alert;
    }

    return null;
  }

  /**
   * Monitor volatility changes
   */
  checkVolatilityAlert(symbol: string, currentVol: number): VolatilityAlert {
    const baseline = this.volatilityBaseline.get(symbol) ?? currentVol;

    if (this.volatilityBaseline.get(symbol) === undefined) {
      this.volatilityBaseline.set(symbol, currentVol);
    }

    const percentChange = ((currentVol - baseline) / baseline) * 100;
    let status: "normal" | "elevated" | "extreme" = "normal";
    let severity: "info" | "warning" | "critical" = "info";

    if (percentChange > 50) {
      status = "extreme";
      severity = "critical";
    } else if (percentChange > 25) {
      status = "elevated";
      severity = "warning";
    }

    if (severity !== "info") {
      const alert: MarketAlert = {
        id: `ALERT-${Date.now()}`,
        type: "volatility",
        symbol,
        severity,
        message: `Volatility ${status}: ${percentChange.toFixed(1)}% change detected`,
        value: currentVol,
        threshold: baseline,
        timestamp: Date.now(),
      };

      this.recordAlert(alert);
      this.notifyWatchers(alert);
    }

    return {
      symbol,
      currentVol,
      averageVol: baseline,
      percentChange,
      status,
    };
  }

  /**
   * Detect anomalies in market data
   */
  detectAnomalies(symbol: string): AnomalyDetection[] {
    const snapshots = this.snapshots.get(symbol);
    if (!snapshots || snapshots.length < 10) {
      return [];
    }

    const anomalies: AnomalyDetection[] = [];
    const lastSnapshot = snapshots[snapshots.length - 1];

    // Price jump anomaly
    if (snapshots.length >= 2) {
      const prevPrice = snapshots[snapshots.length - 2].price;
      const priceChange = Math.abs((lastSnapshot.price - prevPrice) / prevPrice);

      if (priceChange > 0.05) {
        // 5% jump
        anomalies.push({
          symbol,
          type: "price_jump",
          score: Math.min(1, priceChange),
          description: `Significant price jump of ${(priceChange * 100).toFixed(2)}%`,
          timestamp: Date.now(),
        });
      }
    }

    // Spread anomaly
    const spread = (lastSnapshot.ask - lastSnapshot.bid) / lastSnapshot.bid;
    if (spread > 0.01) {
      // Spread > 1%
      anomalies.push({
        symbol,
        type: "spread_widening",
        score: Math.min(1, spread),
        description: `Wide bid-ask spread: ${(spread * 100).toFixed(3)}%`,
        timestamp: Date.now(),
      });
    }

    return anomalies;
  }

  /**
   * Check correlation between symbols
   */
  checkCorrelation(symbol1: string, symbol2: string): CorrelationWatch {
    const snapshots1 = this.snapshots.get(symbol1) ?? [];
    const snapshots2 = this.snapshots.get(symbol2) ?? [];

    if (snapshots1.length < 10 || snapshots2.length < 10) {
      return {
        symbols: [symbol1, symbol2],
        correlation: 0,
        change: 0,
        status: "normal",
      };
    }

    // Calculate price changes
    const changes1 = this.calculateChanges(snapshots1);
    const changes2 = this.calculateChanges(snapshots2);

    // Calculate correlation
    const correlation = this.calculatePearsonCorrelation(changes1, changes2);

    // Determine status
    let status: "normal" | "diverging" | "converging" = "normal";

    if (correlation < -0.3) {
      status = "diverging";
    } else if (correlation > 0.7) {
      status = "converging";
    }

    return {
      symbols: [symbol1, symbol2],
      correlation,
      change: 0, // Would calculate change from previous correlation
      status,
    };
  }

  /**
   * Calculate price changes
   */
  private calculateChanges(snapshots: MarketSnapshot[]): number[] {
    const changes: number[] = [];

    for (let i = 1; i < snapshots.length; i++) {
      const change = (snapshots[i].price - snapshots[i - 1].price) / snapshots[i - 1].price;
      changes.push(change);
    }

    return changes;
  }

  /**
   * Calculate Pearson correlation
   */
  private calculatePearsonCorrelation(series1: number[], series2: number[]): number {
    if (series1.length === 0 || series2.length === 0) return 0;

    const n = Math.min(series1.length, series2.length);
    const s1 = series1.slice(0, n);
    const s2 = series2.slice(0, n);

    const mean1 = s1.reduce((a, b) => a + b, 0) / n;
    const mean2 = s2.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator1 = 0;
    let denominator2 = 0;

    for (let i = 0; i < n; i++) {
      const dev1 = s1[i] - mean1;
      const dev2 = s2[i] - mean2;

      numerator += dev1 * dev2;
      denominator1 += dev1 * dev1;
      denominator2 += dev2 * dev2;
    }

    const denominator = Math.sqrt(denominator1 * denominator2);

    if (denominator === 0) return 0;

    return numerator / denominator;
  }

  /**
   * Record alert
   */
  private recordAlert(alert: MarketAlert): void {
    if (!this.alerts.has(alert.symbol)) {
      this.alerts.set(alert.symbol, []);
    }

    this.alerts.get(alert.symbol)!.push(alert);

    // Keep only last 1000 alerts per symbol
    const alerts = this.alerts.get(alert.symbol)!;
    if (alerts.length > 1000) {
      alerts.shift();
    }
  }

  /**
   * Subscribe to alerts
   */
  watchAlerts(symbol: string, callback: (alert: MarketAlert) => void): void {
    this.watchers.set(`${symbol}-watcher`, {
      alertFn: callback,
    });
  }

  /**
   * Notify watchers
   */
  private notifyWatchers(alert: MarketAlert): void {
    for (const watcher of this.watchers.values()) {
      watcher.alertFn(alert);
    }
  }

  /**
   * Get alerts for symbol
   */
  getAlerts(symbol: string, limit: number = 100): MarketAlert[] {
    const alerts = this.alerts.get(symbol) ?? [];
    return alerts.slice(-limit);
  }

  /**
   * Get snapshots for symbol
   */
  getSnapshots(symbol: string, limit: number = 100): MarketSnapshot[] {
    const snapshots = this.snapshots.get(symbol) ?? [];
    return snapshots.slice(-limit);
  }

  /**
   * Clear old data
   */
  cleanup(maxAge: number = 86400000): void {
    const now = Date.now();

    // Clean snapshots
    for (const [symbol, snapshots] of this.snapshots.entries()) {
      this.snapshots.set(
        symbol,
        snapshots.filter((s) => now - s.timestamp < maxAge),
      );
    }

    // Clean alerts
    for (const [symbol, alerts] of this.alerts.entries()) {
      this.alerts.set(
        symbol,
        alerts.filter((a) => now - a.timestamp < maxAge),
      );
    }
  }
}

export default MarketMonitor;
