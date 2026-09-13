// Circuit Breaker — Automated trading halt system with configurable triggers.
// Monitors drawdown, loss streaks, volatility spikes, and outlier events to protect capital.

export type CircuitBreakerTrigger =
  | "daily_loss"
  | "drawdown"
  | "consecutive_losses"
  | "volatility_spike"
  | "position_limit"
  | "news_event"
  | "manual";

export type CircuitBreakerState = "armed" | "tripped" | "halted" | "resetting" | "recovered";

export interface CircuitBreakerConfig {
  maxDailyLoss: number; // absolute currency loss
  maxDailyLossPercent: number; // percentage of account
  maxDrawdownPercent: number; // max drawdown before halt
  maxConsecutiveLosses: number;
  volatilityThreshold: number; // multiple of ATR for volatility spike
  maxOpenPositions: number;
  cooldownPeriodMs: number; // time before auto-reset after halt
  autoReset: boolean;
  notifyOnTrip: boolean;
}

export interface CircuitBreakerEvent {
  trigger: CircuitBreakerTrigger;
  value: number;
  threshold: number;
  timestamp: number;
  message: string;
  severity: "info" | "warning" | "critical";
}

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  events: CircuitBreakerEvent[];
  haltedAt: number | null;
  cooldownEndsAt: number | null;
  dailyPnL: number;
  peakEquity: number;
  currentEquity: number;
  consecutiveLosses: number;
  openPositions: number;
  lastResetAt: number | null;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  maxDailyLoss: 1000,
  maxDailyLossPercent: 5,
  maxDrawdownPercent: 15,
  maxConsecutiveLosses: 5,
  volatilityThreshold: 3,
  maxOpenPositions: 10,
  cooldownPeriodMs: 30 * 60 * 1000, // 30 minutes
  autoReset: true,
  notifyOnTrip: true,
};

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitBreakerState = "armed";
  private events: CircuitBreakerEvent[] = [];
  private dailyPnL = 0;
  private peakEquity = 10000;
  private currentEquity = 10000;
  private dayStartEquity = 10000;
  private consecutiveLosses = 0;
  private openPositions = 0;
  private haltedAt: number | null = null;
  private cooldownEndsAt: number | null = null;
  private lastResetAt: number | null = null;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  updateConfig(updates: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      events: this.events.slice(-50),
      haltedAt: this.haltedAt,
      cooldownEndsAt: this.cooldownEndsAt,
      dailyPnL: this.dailyPnL,
      peakEquity: this.peakEquity,
      currentEquity: this.currentEquity,
      consecutiveLosses: this.consecutiveLosses,
      openPositions: this.openPositions,
      lastResetAt: this.lastResetAt,
    };
  }

  canTrade(): boolean {
    if (this.state === "halted" || this.state === "tripped") {
      if (this.config.autoReset && this.cooldownEndsAt && Date.now() > this.cooldownEndsAt) {
        this.reset();
        return true;
      }
      return false;
    }
    return true;
  }

  updatePnL(pnl: number): void {
    this.dailyPnL += pnl;
    this.currentEquity += pnl;
    if (this.currentEquity > this.peakEquity) {
      this.peakEquity = this.currentEquity;
    }
  }

  recordTradeResult(win: boolean): CircuitBreakerEvent | null {
    if (win) {
      this.consecutiveLosses = 0;
    } else {
      this.consecutiveLosses++;
    }
    return this.checkTriggers();
  }

  setOpenPositions(count: number): void {
    this.openPositions = count;
  }

  recordVolatilitySpike(atrMultiple: number): CircuitBreakerEvent | null {
    if (atrMultiple >= this.config.volatilityThreshold) {
      return this.trip(
        "volatility_spike",
        atrMultiple,
        this.config.volatilityThreshold,
        `Volatility spike: ${atrMultiple.toFixed(1)}x ATR`,
      );
    }
    return null;
  }

  manualHalt(reason: string): CircuitBreakerEvent {
    return this.trip("manual", 0, 0, `Manual halt: ${reason}`);
  }

  manualReset(): void {
    this.reset();
  }

  resetDailyPnL(): void {
    this.dailyPnL = 0;
    this.dayStartEquity = this.currentEquity;
  }

  private checkTriggers(): CircuitBreakerEvent | null {
    // Daily loss check
    if (this.dailyPnL <= -this.config.maxDailyLoss) {
      return this.trip(
        "daily_loss",
        this.dailyPnL,
        this.config.maxDailyLoss,
        `Daily loss limit: ${this.dailyPnL.toFixed(2)} (max: ${this.config.maxDailyLoss})`,
      );
    }

    if (this.dayStartEquity > 0) {
      // Denominator is day-start equity so the percentage doesn't shrink as equity falls
      const dailyLossPercent = (this.dailyPnL / this.dayStartEquity) * 100;
      if (dailyLossPercent <= -this.config.maxDailyLossPercent) {
        return this.trip(
          "daily_loss",
          dailyLossPercent,
          this.config.maxDailyLossPercent,
          `Daily loss ${dailyLossPercent.toFixed(1)}% exceeds ${this.config.maxDailyLossPercent}% limit`,
        );
      }
    }

    // Drawdown check
    const drawdown =
      this.peakEquity > 0 ? ((this.peakEquity - this.currentEquity) / this.peakEquity) * 100 : 0;
    if (drawdown >= this.config.maxDrawdownPercent) {
      return this.trip(
        "drawdown",
        drawdown,
        this.config.maxDrawdownPercent,
        `Drawdown: ${drawdown.toFixed(1)}% (max: ${this.config.maxDrawdownPercent}%)`,
      );
    }

    // Consecutive losses check
    if (this.consecutiveLosses >= this.config.maxConsecutiveLosses) {
      return this.trip(
        "consecutive_losses",
        this.consecutiveLosses,
        this.config.maxConsecutiveLosses,
        `${this.consecutiveLosses} consecutive losses (limit: ${this.config.maxConsecutiveLosses})`,
      );
    }

    // Position limit check
    if (this.openPositions >= this.config.maxOpenPositions) {
      return this.trip(
        "position_limit",
        this.openPositions,
        this.config.maxOpenPositions,
        `${this.openPositions} open positions (limit: ${this.config.maxOpenPositions})`,
      );
    }

    return null;
  }

  private trip(
    trigger: CircuitBreakerTrigger,
    value: number,
    threshold: number,
    message: string,
  ): CircuitBreakerEvent {
    const severity = this.state === "halted" || this.state === "tripped" ? "critical" : "warning";
    const event: CircuitBreakerEvent = {
      trigger,
      value,
      threshold,
      timestamp: Date.now(),
      message,
      severity,
    };

    this.events.push(event);
    this.state = "tripped";
    this.haltedAt = Date.now();
    this.cooldownEndsAt = Date.now() + this.config.cooldownPeriodMs;

    return event;
  }

  private reset(): void {
    this.state = "recovered";
    this.lastResetAt = Date.now();
    this.haltedAt = null;
    this.cooldownEndsAt = null;
    this.consecutiveLosses = 0;

    // Transition back to armed after a brief recovery period
    setTimeout(() => {
      if (this.state === "recovered") {
        this.state = "armed";
      }
    }, 5000);
  }
}

export function createCircuitBreaker(config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  return new CircuitBreaker(config);
}
