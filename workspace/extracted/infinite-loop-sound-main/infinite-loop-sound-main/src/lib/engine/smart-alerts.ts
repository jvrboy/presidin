/**
 * Smart Alerts Engine — DivergenceIQ
 *
 * Configurable alert system that monitors market conditions and triggers
 * notifications when user-defined criteria are met.
 *
 * Alert types:
 *   - Price alerts (above/below threshold)
 *   - Volatility regime change alerts
 *   - Confluence score threshold alerts
 *   - Divergence detection alerts
 *   - Session open/close alerts
 *   - Drawdown limit alerts
 *   - Win/loss streak alerts
 *   - Multi-timeframe agreement alerts
 */

export type AlertType =
  | "price_above"
  | "price_below"
  | "volatility_regime_change"
  | "confluence_threshold"
  | "divergence_detected"
  | "session_open"
  | "session_close"
  | "drawdown_limit"
  | "streak_alert"
  | "mtf_agreement"
  | "correlation_change"
  | "custom";

export type AlertPriority = "low" | "medium" | "high" | "critical";

export interface AlertCondition {
  id: string;
  type: AlertType;
  name: string;
  description: string;
  enabled: boolean;
  pair?: string;
  timeframe?: string;
  params: Record<string, any>;
  priority: AlertPriority;
  cooldownMs: number; // minimum time between repeated triggers
  lastTriggered: number;
  triggerCount: number;
  createdAt: number;
  expiresAt?: number; // optional expiry
  sound?: boolean;
  vibrate?: boolean;
}

export interface AlertEvent {
  id: string;
  conditionId: string;
  type: AlertType;
  priority: AlertPriority;
  title: string;
  message: string;
  pair?: string;
  timeframe?: string;
  value?: number;
  triggeredAt: number;
  acknowledged: boolean;
}

const STORAGE_KEY = "diq.smart-alerts";
const EVENTS_KEY = "diq.alert-events";

/**
 * Load alert conditions from localStorage.
 */
export function loadAlertConditions(): AlertCondition[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

/**
 * Save alert conditions to localStorage.
 */
export function saveAlertConditions(conditions: AlertCondition[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conditions));
}

/**
 * Load alert events history.
 */
export function loadAlertEvents(): AlertEvent[] {
  try {
    return JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]");
  } catch {
    return [];
  }
}

/**
 * Save alert events.
 */
export function saveAlertEvents(events: AlertEvent[]): void {
  // Keep last 200 events
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(0, 200)));
}

/**
 * Create a new alert condition.
 */
export function createAlertCondition(
  type: AlertType,
  name: string,
  params: Record<string, any>,
  opts?: Partial<AlertCondition>,
): AlertCondition {
  return {
    id: crypto.randomUUID(),
    type,
    name,
    description: getDefaultDescription(type, params),
    enabled: true,
    params,
    priority: opts?.priority ?? "medium",
    cooldownMs: opts?.cooldownMs ?? 300_000, // 5 min default
    lastTriggered: 0,
    triggerCount: 0,
    createdAt: Date.now(),
    pair: opts?.pair,
    timeframe: opts?.timeframe,
    sound: opts?.sound ?? true,
    vibrate: opts?.vibrate ?? true,
    ...opts,
  };
}

function getDefaultDescription(type: AlertType, params: Record<string, any>): string {
  switch (type) {
    case "price_above":
      return `Price rises above ${params.threshold}`;
    case "price_below":
      return `Price falls below ${params.threshold}`;
    case "volatility_regime_change":
      return `Volatility regime changes to ${params.targetRegime || "any"}`;
    case "confluence_threshold":
      return `Confluence score exceeds ${params.minScore}%`;
    case "divergence_detected":
      return `New ${params.divType || "any"} divergence detected`;
    case "session_open":
      return `${params.session || "London"} session opens`;
    case "session_close":
      return `${params.session || "London"} session closes`;
    case "drawdown_limit":
      return `Drawdown exceeds ${params.maxDrawdownPct}%`;
    case "streak_alert":
      return `${params.streakType || "loss"} streak reaches ${params.count}`;
    case "mtf_agreement":
      return `${params.minAgreement || 3}+ timeframes agree on direction`;
    case "correlation_change":
      return `Correlation regime change detected`;
    case "custom":
      return params.description || "Custom alert condition";
  }
}

/**
 * Check if an alert condition should trigger given current market state.
 */
export function evaluateCondition(
  condition: AlertCondition,
  context: {
    price?: number;
    regime?: string;
    confluenceScore?: number;
    divergences?: string[];
    currentSession?: string;
    drawdownPct?: number;
    streak?: number;
    mtfAgreement?: number;
    correlationChanged?: boolean;
  },
): AlertEvent | null {
  if (!condition.enabled) return null;

  // Check cooldown
  const now = Date.now();
  if (now - condition.lastTriggered < condition.cooldownMs) return null;

  // Check expiry
  if (condition.expiresAt && now > condition.expiresAt) return null;

  let triggered = false;
  let title = "";
  let message = "";
  let value: number | undefined;

  switch (condition.type) {
    case "price_above":
      if (context.price && context.price > condition.params.threshold) {
        triggered = true;
        title = `🔺 Price Above ${condition.params.threshold}`;
        message = `${condition.pair || "Asset"} price reached ${context.price.toFixed(5)}`;
        value = context.price;
      }
      break;

    case "price_below":
      if (context.price && context.price < condition.params.threshold) {
        triggered = true;
        title = `🔻 Price Below ${condition.params.threshold}`;
        message = `${condition.pair || "Asset"} price dropped to ${context.price.toFixed(5)}`;
        value = context.price;
      }
      break;

    case "volatility_regime_change":
      if (context.regime && context.regime !== condition.params.lastRegime) {
        if (!condition.params.targetRegime || context.regime === condition.params.targetRegime) {
          triggered = true;
          title = `⚡ Volatility Regime: ${context.regime}`;
          message = `Market shifted from ${condition.params.lastRegime || "unknown"} to ${context.regime}`;
        }
      }
      break;

    case "confluence_threshold":
      if (context.confluenceScore && context.confluenceScore >= condition.params.minScore) {
        triggered = true;
        title = `🎯 High Confluence: ${context.confluenceScore}%`;
        message = `${condition.pair || "Pair"} reached ${context.confluenceScore}% confluence score`;
        value = context.confluenceScore;
      }
      break;

    case "divergence_detected":
      if (context.divergences && context.divergences.length > 0) {
        const matching = condition.params.divType
          ? context.divergences.filter((d) => d.includes(condition.params.divType))
          : context.divergences;
        if (matching.length > 0) {
          triggered = true;
          title = `📊 Divergence Detected`;
          message = `${matching.join(", ")} on ${condition.pair || "pair"}`;
        }
      }
      break;

    case "drawdown_limit":
      if (context.drawdownPct && context.drawdownPct >= condition.params.maxDrawdownPct) {
        triggered = true;
        title = `🚨 Drawdown Alert: ${context.drawdownPct.toFixed(1)}%`;
        message = `Account drawdown exceeded ${condition.params.maxDrawdownPct}% limit. Consider stopping.`;
        value = context.drawdownPct;
      }
      break;

    case "streak_alert":
      if (context.streak !== undefined) {
        const isLoss =
          condition.params.streakType === "loss" && context.streak <= -condition.params.count;
        const isWin =
          condition.params.streakType === "win" && context.streak >= condition.params.count;
        if (isLoss || isWin) {
          triggered = true;
          title = isLoss
            ? `❌ Loss Streak: ${Math.abs(context.streak)}`
            : `✅ Win Streak: ${context.streak}`;
          message = isLoss
            ? `You've lost ${Math.abs(context.streak)} trades in a row. Consider taking a break.`
            : `${context.streak} wins in a row! Stay disciplined — don't get overconfident.`;
          value = context.streak;
        }
      }
      break;

    case "mtf_agreement":
      if (context.mtfAgreement && context.mtfAgreement >= condition.params.minAgreement) {
        triggered = true;
        title = `🔗 MTF Agreement: ${context.mtfAgreement} timeframes`;
        message = `${context.mtfAgreement} timeframes agree on direction for ${condition.pair || "pair"}`;
        value = context.mtfAgreement;
      }
      break;

    case "correlation_change":
      if (context.correlationChanged) {
        triggered = true;
        title = `🔄 Correlation Regime Change`;
        message = `Significant correlation shift detected. Review pair exposure.`;
      }
      break;

    case "session_open": {
      // Fires when the current session matches the configured one and
      // hasn't fired for this session yet
      const target = condition.params.session || "London";
      if (context.currentSession?.toLowerCase() === target.toLowerCase()) {
        if (condition.params.lastSessionState !== "open") {
          triggered = true;
          condition.params.lastSessionState = "open";
          title = `🌅 ${target} Session Open`;
          message = `${target} session has opened — watch for range breaks on ${condition.pair || "majors"}.`;
        }
      } else {
        condition.params.lastSessionState = undefined;
      }
      break;
    }

    case "session_close": {
      const targetClose = condition.params.session || "London";
      if (
        context.currentSession &&
        context.currentSession.toLowerCase() !== targetClose.toLowerCase()
      ) {
        if (condition.params.lastSessionState !== "closed") {
          triggered = true;
          condition.params.lastSessionState = "closed";
          title = `🌇 ${targetClose} Session Close`;
          message = `${targetClose} session has closed — review open positions before liquidity thins.`;
        }
      }
      break;
    }

    case "custom": {
      // Custom conditions trigger when their description keyword appears
      // in any divergence label, or unconditionally once per cooldown window
      if (condition.params.triggerOnDivergence && context.divergences?.length) {
        triggered = true;
        title = `⚙️ Custom Alert`;
        message = `${condition.params.description || "Custom condition"} — divergences: ${context.divergences.join(", ")}`;
      }
      break;
    }
  }

  if (!triggered) return null;

  return {
    id: crypto.randomUUID(),
    conditionId: condition.id,
    type: condition.type,
    priority: condition.priority,
    title,
    message,
    pair: condition.pair,
    timeframe: condition.timeframe,
    value,
    triggeredAt: now,
    acknowledged: false,
  };
}

/**
 * Default alert presets for quick setup.
 */
export const ALERT_PRESETS: Omit<
  AlertCondition,
  "id" | "lastTriggered" | "triggerCount" | "createdAt"
>[] = [
  {
    type: "drawdown_limit",
    name: "Daily Drawdown Limit",
    description: "Alert when daily drawdown exceeds 3%",
    enabled: true,
    params: { maxDrawdownPct: 3 },
    priority: "critical",
    cooldownMs: 600_000,
    sound: true,
    vibrate: true,
  },
  {
    type: "streak_alert",
    name: "Loss Streak Warning",
    description: "Alert after 3 consecutive losses",
    enabled: true,
    params: { streakType: "loss", count: 3 },
    priority: "high",
    cooldownMs: 1_800_000,
    sound: true,
    vibrate: true,
  },
  {
    type: "confluence_threshold",
    name: "High Confluence Signal",
    description: "Alert when confluence score exceeds 75%",
    enabled: true,
    params: { minScore: 75 },
    priority: "medium",
    cooldownMs: 300_000,
    sound: true,
    vibrate: false,
  },
  {
    type: "mtf_agreement",
    name: "Multi-TF Agreement",
    description: "Alert when 4+ timeframes agree",
    enabled: true,
    params: { minAgreement: 4 },
    priority: "high",
    cooldownMs: 600_000,
    sound: true,
    vibrate: true,
  },
  {
    type: "volatility_regime_change",
    name: "Volatility Spike",
    description: "Alert on extreme volatility",
    enabled: true,
    params: { targetRegime: "EXTREME", lastRegime: null },
    priority: "critical",
    cooldownMs: 1_800_000,
    sound: true,
    vibrate: true,
  },
];
