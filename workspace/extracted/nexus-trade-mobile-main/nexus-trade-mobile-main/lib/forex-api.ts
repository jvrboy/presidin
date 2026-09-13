import { invalidateCache, resilientFetch } from "@/lib/network-resilience";

export type BotState = "running" | "stopped" | "paused" | "error";

export type AccountSnapshot = {
  balance?: number;
  equity?: number;
  margin?: number;
  free_margin?: number;
  margin_level?: number;
  profit?: number;
  currency?: string;
  leverage?: number;
  connected?: boolean;
};

export type Position = {
  ticket: number;
  symbol: string;
  type: "buy" | "sell" | string;
  volume: number;
  open_price: number;
  current_price: number;
  sl?: number;
  tp?: number;
  profit: number;
  open_time?: string;
};

export type Signal = {
  id: string;
  symbol: string;
  asset_class: string;
  direction: "buy" | "sell" | "neutral" | string;
  strength: number;
  timeframe: string;
  entry: number;
  sl?: number;
  tp?: number;
  reason: string;
  timestamp?: string;
  status?: string;
};

export type BackendSettings = {
  allow_live_trading?: boolean;
  auto_trade?: boolean;
  enable_agentic_mode?: boolean;
  risk_mode?: string;
  max_risk_per_trade_pct?: number;
  max_daily_loss_pct?: number;
  max_open_trades?: number;
  default_lot_size?: number;
  primary_timeframe?: string;
  refresh_interval_sec?: number;
  enable_mt5_bridge?: boolean;
  mt5_host?: string;
  mt5_port?: number;
  // Master-agent vote weights
  agent_weight_trend?: number;
  agent_weight_momentum?: number;
  agent_weight_volatility?: number;
  agent_weight_structure?: number;
  agent_weight_regime?: number;
  agent_weight_smc?: number;
  agent_weight_mtf?: number;
  agent_weight_volume_flow?: number;
  agent_weight_session_liquidity?: number;
  agent_weight_fibonacci?: number;
  agent_weight_sentiment?: number;
  agent_weight_orderflow?: number;
  // Self-improving learning system toggles
  enable_deep_neural?: boolean;
  enable_drift_monitoring?: boolean;
  enable_anomaly_guard?: boolean;
  enable_shadow_deployment?: boolean;
  anomaly_pause_minutes?: number;
  drift_check_interval_min?: number;
  auto_retrain_on_drift?: boolean;
  sentiment_enabled?: boolean;
  [key: string]: unknown;
};

export type StatusSnapshot = {
  bot_state: BotState;
  mt5_connected: boolean;
  account: AccountSnapshot;
  positions: Position[];
  signals: Signal[];
  equity_history: Array<{ t?: string; equity?: number; balance?: number }>;
  logs: string[];
  last_update?: string | null;
  settings?: BackendSettings;
};

export type ProviderTestResult = {
  ok: boolean;
  provider_id: string;
  provider_label?: string;
  latency_ms?: number;
  status_code?: number;
  rate_limit?: { limit?: string; remaining?: string; reset?: string };
  message?: string;
  error?: string;
  key_used?: string;
  key_fallback_attempts?: number;
  provider_fallback_attempts?: number;
};

export type ProviderKeyHealth = {
  masked: string;
  status: "healthy" | "cooldown" | "parked";
  requests: number;
  failures: number;
  success_rate?: number | null;
  avg_latency_ms: number;
  cooldown_sec: number;
  last_error: string;
  requests_in_window?: number;
};

export type ProviderRateLimitStatus = { max_per_window: number; window_sec: number };

export type ProviderPoolStatus = {
  total_keys: number;
  healthy_keys: number;
  keys: ProviderKeyHealth[];
  rate_limit?: ProviderRateLimitStatus;
  proxy_count?: number;
};

export type ProviderKeysStatusSnapshot = {
  ai: Record<string, ProviderPoolStatus>;
  market: Record<string, ProviderPoolStatus>;
};

export type ProviderUsageStat = {
  provider_id: string;
  requests: number;
  successes: number;
  errors: number;
  health_checks: number;
  health_failures: number;
  last_latency_ms?: number | null;
  avg_latency_ms?: number | null;
  last_status_code?: number | null;
  last_checked_at?: string | null;
  last_error?: string | null;
  recent_errors: Array<{ at: string; message: string }>;
  rate_limit?: { limit?: string; remaining?: string; reset?: string };
  healthy?: boolean | null;
};

export type ProviderUsageSnapshot = { providers: ProviderUsageStat[]; registered: number; interval_seconds: number };
export type ProviderTelemetrySample = { id: number; provider_id: string; operation: string; ok: number; latency_ms?: number | null; status_code?: number | null; error?: string | null; rate_limit_remaining?: string | null; ts: string };
export type ProviderNotificationEvent = { id: number; ts: string; level: string; category: string; message: string; data?: string | null };
export type CapabilityCatalog = { analysis_tools: Array<{ id: string; label: string; endpoint: string; status: string }>; strategy_agents: Array<{ id: string; label: string; module: string }>; count: number };
export type AnalysisRequest = { tool_id: string; symbol: string; timeframe: string; prompt?: string };
export type AnalysisResult = { ok: boolean; tool_id: string; symbol: string; summary?: string; signals?: Signal[]; confidence?: number; risks?: string[]; latency_ms?: number; error?: string };
export type StrategyPreview = { agent_id: string; symbol: string; timeframe: string; risk_mode?: string };
export type DiagnosticsSnapshot = { ok: boolean; checks: Array<{ name: string; status: "ok" | "warning" | "error"; detail: string }> };
export type RiskCheckRequest = { symbol: string; volume: number; stop_loss?: number; take_profit?: number };
export type RiskCheckResult = { ok: boolean; approved: boolean; risk_score: number; reasons: string[]; max_volume?: number };
export type StrategyPreviewResult = { ok: boolean; summary?: string; risk_score?: number; actions?: string[]; error?: string };

// --- Neural learning system -------------------------------------------------
export type NeuralStatus = {
  trained: boolean;
  samples: number;
  train_accuracy?: number | null;
  val_accuracy?: number | null;
  epochs_trained?: number;
  note?: string;
  architecture?: string;
};
export type NeuralTrainResult = {
  trained: boolean;
  samples: number;
  train_accuracy?: number | null;
  val_accuracy?: number | null;
  loss?: number | null;
  epochs_trained?: number;
};
export type LearningHistoryEntry = {
  id?: number;
  ts?: string;
  samples?: number;
  train_accuracy?: number | null;
  val_accuracy?: number | null;
  loss?: number | null;
  epochs_trained?: number;
  note?: string;
};
export type LearningHistoryResponse = {
  neural: LearningHistoryEntry[];
  rl_snapshot?: Record<string, unknown>;
  pending_experience?: number;
};

// --- Self-improving learning system -----------------------------------------
export type DeepNeuralStatus = {
  trained: boolean;
  samples: number;
  epochs_trained?: number;
  note?: string;
  architecture?: string;
};
export type DeepNeuralTrainResult = {
  trained: boolean;
  samples: number;
  train_accuracy?: number | null;
  val_accuracy?: number | null;
  loss?: number | null;
  epochs_trained?: number;
};

export type ModelVersionEntry = {
  version: number;
  model_name: string;
  samples: number;
  train_accuracy?: number | null;
  val_accuracy?: number | null;
  loss?: number | null;
  hyperparams?: Record<string, unknown>;
  notes?: string;
  is_champion?: boolean;
  created?: string;
};
export type ModelSummaryEntry = {
  model_name: string;
  latest_version: number;
  champion_version: number;
  total_versions: number;
  latest_val_accuracy?: number | null;
  champion_val_accuracy?: number | null;
  rollback_available: boolean;
};
export type ModelRegistrySummary = { models: ModelSummaryEntry[]; count: number };
export type ModelVersionHistory = { model_name: string; versions: ModelVersionEntry[] };

export type DriftFeatureReport = {
  feature: string;
  baseline_mean: number;
  baseline_std: number;
  recent_mean: number;
  recent_std: number;
  drift_score: number;
  severity: "low" | "moderate" | "high" | "critical" | string;
};
export type DriftCheckResult = {
  ok: boolean;
  message?: string;
  overall_severity?: "low" | "moderate" | "high" | "critical" | string;
  max_drift_score?: number;
  retrain_recommended?: boolean;
  features?: DriftFeatureReport[];
};
export type DriftHistoryResponse = { features: DriftFeatureReport[] };

export type AnomalyStatus = {
  global_paused: boolean;
  global_resume_in_sec: number;
  paused_symbols: Record<string, number>;
};
export type AnomalyEvent = {
  id?: number;
  symbol: string;
  kind: string;
  severity: "moderate" | "critical" | string;
  z_score: number;
  detail: string;
  action_taken: string;
  created?: string;
};
export type AnomalyListResponse = { status: AnomalyStatus; events: AnomalyEvent[] };

export type ShadowCandidate = {
  candidate_model: string;
  candidate_version?: number;
  n: number;
  candidate_win_rate: number;
  live_win_rate: number;
  avg_reward_atr: number;
  edge_vs_live: number;
  promotion_ready: boolean;
};
export type ShadowScoreboard = { candidates: ShadowCandidate[]; count: number };

export type FeatureImportance = { feature: string; importance: number; importance_pct: number };
export type ExplainModelResult = {
  ok: boolean;
  message?: string;
  model?: string;
  samples_used?: number;
  ranked_features?: FeatureImportance[];
  top_driver?: string | null;
};
export type DecisionContribution = { feature: string; value: number; z_vs_training_mean: number };
export type ExplainDecisionResult = {
  ok: boolean;
  message?: string;
  model?: string;
  win_probability?: number;
  most_unusual_features?: DecisionContribution[];
};

export type FeatureSnapshot = { id?: number; symbol: string; features: string; created?: string; [key: string]: unknown };

export type DecisionAuditRecord = {
  id?: number;
  signal_uid: string;
  symbol: string;
  final_signal: string;
  confidence: number;
  weighted_score: number;
  opinions_json: string;
  feature_vector: string;
  model_versions: string;
  created?: string;
};
export type DecisionAuditResponse = { records: DecisionAuditRecord[] };

export type TuningTrial = {
  id?: number;
  model_name: string;
  params: string;
  val_accuracy: number;
  val_loss: number;
  is_best?: number;
  created?: string;
};
export type TuningSearchResult = {
  ok: boolean;
  message?: string;
  model_name?: string;
  samples_used?: number;
  trials_run?: number;
  best_trial_id?: number | null;
  best_val_accuracy?: number;
  ranked_trials?: Array<{ id: number; params: Record<string, number>; val_accuracy: number; val_loss: number; train_accuracy: number }>;
};
export type TuningTrialsResponse = { trials: TuningTrial[] };

export type SentimentAverage = { avg_polarity: number; avg_magnitude: number; n: number };
export type SentimentSample = { id?: number; symbol: string; headline: string; source: string; polarity: number; magnitude: number; created?: string };
export type SentimentHeadlineResult = { ok?: boolean; symbol: string; polarity: number; magnitude: number; [key: string]: unknown };
export type SentimentHistoryResponse = { samples: SentimentSample[] };

// --- Candlestick chart -------------------------------------------------------
export type ChartCandle = { t: string; o: number; h: number; l: number; c: number; v: number };
export type ChartMarker = {
  kind: "signal" | "trade" | string;
  direction?: string;
  t?: string;
  entry?: number;
  exit?: number;
  sl?: number;
  tp?: number;
  strength?: number;
  status?: string;
  reason?: string;
  profit?: number;
};
export type ChartIndicators = {
  ema20?: number[];
  ema50?: number[];
  ema200?: number[];
  sma20?: number[];
  sma50?: number[];
  rsi14?: number[];
  macd?: number[];
  macd_signal?: number[];
  macd_histogram?: number[];
  bb_upper?: number[];
  bb_middle?: number[];
  bb_lower?: number[];
  atr14?: number[];
  volume?: number[];
  [key: string]: number[] | undefined;
};
export type SupplyDemandZone = { type: "supply" | "demand" | string; top: number; bottom: number; start_index?: number; end_index?: number };
export type TrendLine = { points: Array<{ t?: string; index?: number; price: number }>; direction?: string };
export type ChartPayload = {
  symbol: string;
  timeframe: string;
  source: string;
  candles: ChartCandle[];
  indicators: ChartIndicators;
  support_resistance: Array<{ price: number; type: string; strength?: number }>;
  supply_demand_zones: SupplyDemandZone[];
  trend_lines: TrendLine[];
  markers: ChartMarker[];
};
export type ChartTimeframe = "1m" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D";

// --- Dashboard metrics --------------------------------------------------------
export type DashboardMetrics = {
  pnl: { today: number; week: number; month: number; daily_pct: number };
  performance: {
    win_rate: number | null;
    profit_factor: number | null;
    gross_profit: number;
    gross_loss: number;
    total_trades: number;
    avg_profit: number | null;
    best_trade: number | null;
    worst_trade: number | null;
  };
  drawdown: { max_drawdown_pct: number; current_drawdown_pct: number };
  risk: {
    exposure_pct: number;
    margin_utilization_pct: number;
    margin_level_pct: number;
    open_positions: number;
    max_open_trades: number;
  };
  exposure_by_asset: Record<string, { volume: number; profit: number; positions: number }>;
  market_regime: { symbol?: string; regime: string; confidence: number; confirmed?: boolean };
  ai_confidence: number;
  backend_health: {
    status: string;
    uptime_sec: number;
    uptime_human: string;
    bot_state: string;
    cycles_completed: number;
    total_errors: number;
    total_warnings: number;
    errors_per_hour: number;
    last_error?: string | null;
  };
  mt5: { connected: boolean; latency_ms: number; last_update?: string | null };
  safety: { status: "safe" | "caution" | "blocked" | string; reasons: string[] };
};

// 10.0.2.2 only resolves on the Android EMULATOR (it's a special alias the
// emulator maps back to the host machine's 127.0.0.1). It is meaningless on
// a physical Android/iOS device, on the Windows/Electron desktop shell, and
// on plain web — those need the actual LAN IP (or localhost, if running on
// the same machine as the backend). We keep this as the emulator-friendly
// default (it's still the single most common first-run environment for this
// project) but the app surfaces very explicit setup guidance elsewhere
// (see Settings > Backend connection) so users on other platforms aren't
// left guessing why the emulator-only address doesn't work for them.
export const DEFAULT_API_BASE_URL = "http://10.0.2.2:8000";

export function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

/** In web DEV only (when the page is served by Metro on a localhost port),
 *  every fetch to a different-origin backend gets blocked by the browser's
 *  same-origin policy unless the backend sends permissive CORS headers —
 *  and even when it does, a single misconfigured OPTIONS preflight returns
 *  a generic "Network request failed" with no actionable detail.
 *
 *  Metro (see metro.config.js) registers a tiny /__proxy reverse-proxy
 *  that strips CORS entirely by being same-origin from the browser's
 *  perspective. We transparently rewrite the backend URL through that
 *  prefix only when:
 *    - Platform.OS === "web"
 *    - document.location points at a localhost / 127.0.0.1 origin (i.e.
 *      we're being served by Metro dev, NOT a production CDN)
 *
 *  In every other case (native, web production), the URL passes through
 *  untouched. This means the SAME code path works everywhere: dev web
 *  uses the proxy, native hits the backend directly, prod web is expected
 *  to be served from the same origin or behind a CORS-friendly reverse
 *  proxy.
 *
 *  The proxy URL has the format: /__proxy/<host>/<port>/<path>
 *  e.g. http://192.168.1.20:8000/api/status → /__proxy/192.168.1.20/8000/api/status
 */
function rewriteForDevProxy(baseUrl: string, path: string): { url: string; bypassCache: boolean } {
  // Native: never proxy (no same-origin restriction, no CORS). We detect
  // "native" by the absence of `window` — React Native does not expose
  // a global window object (only web does). This avoids importing
  // react-native's Platform (which pulls in Flow source that Vite's
  // ESM parser can't always handle in test environments).
  if (typeof window === "undefined") {
    return { url: `${normalizeBaseUrl(baseUrl)}${path}`, bypassCache: false };
  }
  // Web: check if we're being served from Metro dev (localhost / 127.0.0.1).
  let isDevServer = false;
  try {
    if (window.location) {
      const host = window.location.hostname;
      isDevServer = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
    }
  } catch {
    // window.location not accessible — assume prod (no proxy).
  }
  if (!isDevServer) {
    return { url: `${normalizeBaseUrl(baseUrl)}${path}`, bypassCache: false };
  }
  // Dev web: rewrite through the Metro proxy. Parse the target URL.
  try {
    const target = new URL(normalizeBaseUrl(baseUrl));
    const host = target.hostname;
    const port = target.port || (target.protocol === "https:" ? "443" : "80");
    const proxyPath = `${target.pathname === "/" ? "" : target.pathname}${path}`;
    return {
      url: `/__proxy/${host}/${port}${proxyPath}`,
      bypassCache: false,
    };
  } catch {
    // URL parse failed — fall back to direct fetch.
    return { url: `${normalizeBaseUrl(baseUrl)}${path}`, bypassCache: false };
  }
}

/** Classify a raw fetch failure into a specific, user-actionable reason.
 * React Native / browser fetch collapses DNS failures, connection-refused,
 * TLS errors and CORS blocks into the exact same generic `TypeError:
 * Network request failed` (or `Failed to fetch` on web) with no further
 * detail — so we can't distinguish the underlying cause from the error
 * object alone. Instead we inspect the target URL and give the most likely,
 * actionable explanation plus a concrete fix, rather than repeating the
 * meaningless native message back to the user. */
function describeNetworkFailure(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  let host = "";
  let isHttps = false;
  try {
    const u = new URL(normalized);
    host = u.hostname;
    isHttps = u.protocol === "https:";
  } catch {
    return `Network request failed — "${baseUrl}" is not a valid URL. Enter your backend address like http://192.168.1.20:8000.`;
  }

  if (host === "10.0.2.2") {
    return "Network request failed — 10.0.2.2 only works from inside the Android emulator. On a real phone, Windows desktop, or web browser, use your computer's LAN IP instead (e.g. http://192.168.1.20:8000) or 127.0.0.1 if the backend runs on this same device. Check Settings > Backend connection.";
  }
  if (host === "localhost" || host === "127.0.0.1") {
    return "Network request failed — localhost/127.0.0.1 means \"this device itself\". If the backend runs on a different computer or you're on a physical phone, use that computer's LAN IP instead (e.g. http://192.168.1.20:8000). Check Settings > Backend connection.";
  }
  if (isHttps) {
    return `Network request failed — could not reach ${host} over HTTPS. Self-hosted backends usually don't have a valid TLS certificate; try http:// instead of https://, and confirm the backend is running and reachable on your network.`;
  }
  return `Network request failed — could not reach ${host}. Confirm the Nexus Trade backend is running, your device is on the same Wi-Fi/LAN as it, and the address/port in Settings > Backend connection is correct.`;
}

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  // Resilient fetch wrapper — adds retry-with-backoff, in-flight
  // deduplication for GETs, short-lived GET cache, and a network-
  // health ring buffer. See lib/network-resilience.ts for the full
  // design and the test suite for the guarantees it provides.
  //
  // On web + dev server, rewrite the URL through Metro's /__proxy
  // reverse proxy to bypass browser same-origin / CORS restrictions
  // (see metro.config.js + rewriteForDevProxy above).
  const rewritten = rewriteForDevProxy(baseUrl, path);
  let response: Response;
  try {
    // When rewritten.url is a fully-formed URL (native / prod web),
    // pass an empty baseUrl and the full URL as path so resilientFetch
    // builds the same final URL.
    response = await resilientFetch(rewritten.url, "", { ...init, bypassCache: rewritten.bypassCache });
  } catch (fetchError) {
    if (fetchError instanceof Error && fetchError.name === "AbortError") {
      throw new Error(`Backend request timed out after 15 seconds — is ${normalizeBaseUrl(baseUrl)} reachable?`);
    }
    // This is the exact spot React Native's native "Network request
    // failed" TypeError (or the web "Failed to fetch") is thrown — give
    // a specific, actionable message instead of forwarding it verbatim.
    // (resilientFetch already retried transient failures, so if we end
    // up here, the network is genuinely down or the URL is wrong.)
    throw new Error(describeNetworkFailure(baseUrl));
  }

  try {
    const raw = await response.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = raw;
    }

    if (!response.ok) {
      const message =
        typeof payload === "object" && payload && "detail" in payload
          ? String((payload as { detail: unknown }).detail)
          : `Backend request failed (${response.status})`;
      throw new Error(message);
    }

    return payload as T;
  } catch (parseError) {
    // If parsing failed but the response was OK, surface a clearer
    // message than a bare SyntaxError. The original request did reach
    // the backend — this is a malformed-body class of bug, not a
    // network bug, and is worth distinguishing for the user.
    if (parseError instanceof Error && parseError.name === "SyntaxError") {
      throw new Error(`Backend at ${normalizeBaseUrl(baseUrl)} returned a non-JSON response — it may be a different service or a reverse proxy returning an HTML error page.`);
    }
    throw parseError;
  }
}

export const forexApi = {
  getStatus: (baseUrl: string) => request<StatusSnapshot>(baseUrl, "/api/status"),
  getSignals: (baseUrl: string) => request<Signal[]>(baseUrl, "/api/signals"),
  controlBot: (baseUrl: string, action: "start" | "stop" | "pause" | "resume") =>
    request<{ ok: boolean; state: BotState }>(baseUrl, "/api/bot", {
      method: "POST",
      body: JSON.stringify({ action }),
    }).then((result) => { invalidateCache(baseUrl, "/api/"); return result; }),
  rescan: (baseUrl: string) =>
    request<{ count: number }>(baseUrl, "/api/signals/rescan", { method: "POST" })
      .then((result) => { invalidateCache(baseUrl, "/api/"); return result; }),
  kill: (baseUrl: string) =>
    request<{ ok: boolean }>(baseUrl, "/api/kill", { method: "POST" })
      .then((result) => { invalidateCache(baseUrl, "/api/"); return result; }),
  getSettings: (baseUrl: string) => request<BackendSettings>(baseUrl, "/api/settings"),
  // POST expects the FULL settings object (backend SystemSettings model),
  // not a partial patch — always spread the latest getSettings() result
  // and override only the fields being changed. Masked key fields
  // ("••••••••xxxx") are safely round-tripped: the backend detects the
  // mask prefix and keeps the real stored value instead of overwriting it.
  updateSettings: (baseUrl: string, settings: BackendSettings) =>
    request<{ ok: boolean }>(baseUrl, "/api/settings", { method: "POST", body: JSON.stringify(settings) })
      .then((result) => { invalidateCache(baseUrl, "/api/"); return result; }),
  testProvider: (baseUrl: string, payload: { provider_id: string; kind: "ai" | "market"; api_key: string; base_url?: string; model?: string }) =>
    request<ProviderTestResult>(baseUrl, "/api/providers/test", { method: "POST", body: JSON.stringify(payload) }),
  routeAi: (baseUrl: string, payload: { provider_id: string; api_key: string; base_url?: string; model?: string; prompt: string }) =>
    request<{ ok: boolean; text?: string; latency_ms?: number; error?: string }>(baseUrl, "/api/providers/chat", { method: "POST", body: JSON.stringify({ ...payload, kind: "ai" }) }),
  getProviderQuote: (baseUrl: string, payload: { provider_id: string; api_key: string; base_url?: string; symbol: string }) =>
    request<{ ok: boolean; provider_id: string; symbol?: string; price?: number | string; latency_ms?: number; error?: string }>(baseUrl, "/api/providers/quote", { method: "POST", body: JSON.stringify({ ...payload, kind: "market" }) }),
  routeAiWithFallback: (baseUrl: string, providers: Array<{ provider_id: string; api_key: string; base_url?: string; model?: string; enabled: boolean; priority: number }>, prompt: string) =>
    request<{ ok: boolean; text?: string; provider_id?: string; fallback_attempts?: number; failures?: Array<{ provider_id: string; message: string }>; message?: string }>(baseUrl, "/api/providers/chat/fallback", { method: "POST", body: JSON.stringify({ providers: providers.map((provider) => ({ ...provider, kind: "ai" })), prompt }) }),
  registerProviderHealth: (baseUrl: string, providers: Array<{ provider_id: string; kind: "ai" | "market"; api_key: string; base_url?: string; model?: string; enabled: boolean; priority: number }>, interval_seconds = 300, thresholds?: { latency_threshold_ms: number; error_rate_threshold_pct: number }) =>
    request<{ registered: number; interval_seconds: number; latency_threshold_ms: number; error_rate_threshold_pct: number }>(baseUrl, "/api/providers/health/register", { method: "POST", body: JSON.stringify({ providers, interval_seconds, ...(thresholds ?? {}) }) }),
  getProviderUsage: (baseUrl: string) => request<ProviderUsageSnapshot>(baseUrl, "/api/providers/health"),
  checkProvidersNow: (baseUrl: string) => request<{ results: ProviderTestResult[] }>(baseUrl, "/api/providers/health/check", { method: "POST" }),
  routeQuoteWithFallback: (baseUrl: string, providers: Array<{ provider_id: string; api_key: string; base_url?: string; enabled: boolean; priority: number }>, symbol: string) =>
    request<{ ok: boolean; provider_id?: string; price?: number | string; latency_ms?: number; fallback_attempts?: number; failures?: Array<{ provider_id: string; message: string }>; message?: string }>(baseUrl, "/api/providers/quote/fallback", { method: "POST", body: JSON.stringify({ providers: providers.map((provider) => ({ ...provider, kind: "market" })), prompt: symbol }) }),
  getProviderHistory: (baseUrl: string, providerId?: string, since?: string) => request<{ samples: ProviderTelemetrySample[] }>(baseUrl, `/api/providers/history?${providerId ? `provider_id=${encodeURIComponent(providerId)}&` : ""}${since ? `since=${encodeURIComponent(since)}` : ""}`),
  getProviderNotifications: (baseUrl: string) => request<{ events: ProviderNotificationEvent[] }>(baseUrl, "/api/providers/notifications"),

  // ------------------------------------------------------------------
  // Unlimited API keys with automatic failover — PER PROVIDER. These
  // pooled methods store keys server-side (never round-tripped back to
  // the client except masked) and let the backend rotate across every
  // key configured for a provider, skipping ones that are rate-limited,
  // quota-exhausted, or invalid, before the request is ever reported as
  // failed. Combine with routeAiWithFallback/routeQuoteWithFallback-style
  // cross-provider ordering for two independent layers of resilience.
  // ------------------------------------------------------------------
  getProviderKeysStatus: (baseUrl: string) => request<ProviderKeysStatusSnapshot>(baseUrl, "/api/providers/keys/status"),
  addProviderKey: (baseUrl: string, payload: { provider_id: string; kind: "ai" | "market"; key: string }) =>
    request<{ ok: boolean; provider_id: string; total_keys: number }>(baseUrl, "/api/providers/keys/add", { method: "POST", body: JSON.stringify(payload) })
      .then((result) => { invalidateCache(baseUrl, "/api/providers/"); return result; }),
  removeProviderKey: (baseUrl: string, payload: { provider_id: string; kind: "ai" | "market"; index: number }) =>
    request<{ ok: boolean; provider_id: string; total_keys: number }>(baseUrl, "/api/providers/keys/remove", { method: "POST", body: JSON.stringify(payload) })
      .then((result) => { invalidateCache(baseUrl, "/api/providers/"); return result; }),
  setProviderKeys: (baseUrl: string, payload: { provider_id: string; kind: "ai" | "market"; keys: string[] }) =>
    request<{ ok: boolean; provider_id: string; total_keys: number }>(baseUrl, "/api/providers/keys/set", { method: "POST", body: JSON.stringify(payload) })
      .then((result) => { invalidateCache(baseUrl, "/api/providers/"); return result; }),
  routeAiPooled: (baseUrl: string, payload: { provider_id: string; prompt: string; base_url?: string; model?: string }) =>
    request<{ ok: boolean; text?: string; latency_ms?: number; error?: string; key_used?: string; message?: string }>(baseUrl, "/api/providers/chat/pooled", { method: "POST", body: JSON.stringify(payload) }),
  getProviderQuotePooled: (baseUrl: string, payload: { provider_id: string; symbol: string; base_url?: string }) =>
    request<{ ok: boolean; provider_id: string; symbol?: string; price?: number | string; latency_ms?: number; error?: string; key_used?: string; message?: string }>(baseUrl, "/api/providers/quote/pooled", { method: "POST", body: JSON.stringify(payload) }),
  testProviderPooled: (baseUrl: string, payload: { provider_id: string; kind: "ai" | "market"; base_url?: string; model?: string }) =>
    request<ProviderTestResult>(baseUrl, "/api/providers/test/pooled", { method: "POST", body: JSON.stringify(payload) }),
  routeAiWithFallbackPooled: (baseUrl: string, providers: Array<{ provider_id: string; kind?: "ai"; enabled: boolean; priority: number; base_url?: string; model?: string }>, prompt: string) =>
    request<{ ok: boolean; text?: string; provider_id?: string; provider_fallback_attempts?: number; key_fallback_attempts?: number; failures?: Array<{ provider_id: string; message: string }>; message?: string }>(baseUrl, "/api/providers/chat/fallback/pooled", { method: "POST", body: JSON.stringify({ providers, prompt }) }),
  routeQuoteWithFallbackPooled: (baseUrl: string, providers: Array<{ provider_id: string; kind?: "market"; enabled: boolean; priority: number; base_url?: string }>, symbol: string) =>
    request<{ ok: boolean; provider_id?: string; price?: number | string; latency_ms?: number; provider_fallback_attempts?: number; key_fallback_attempts?: number; failures?: Array<{ provider_id: string; message: string }>; message?: string }>(baseUrl, "/api/providers/quote/fallback/pooled", { method: "POST", body: JSON.stringify({ providers, symbol }) }),
  getProviderAlertSettings: (baseUrl: string) => request<{ latency_threshold_ms: number; error_rate_threshold_pct: number }>(baseUrl, "/api/providers/alert-settings"),
  registerPushToken: (baseUrl: string, token: string, platform: string) => request<{ ok: boolean }>(baseUrl, "/api/providers/push-token", { method: "POST", body: JSON.stringify({ token, platform }) }),
  getCapabilities: (baseUrl: string) => request<CapabilityCatalog>(baseUrl, "/api/capabilities"),
  runAnalysis: (baseUrl: string, payload: AnalysisRequest) => request<AnalysisResult>(baseUrl, "/api/analysis/run", { method: "POST", body: JSON.stringify(payload) }),
  previewStrategy: (baseUrl: string, payload: StrategyPreview) => request<{ ok: boolean; summary?: string; risk_score?: number; actions?: string[]; error?: string }>(baseUrl, "/api/strategies/preview", { method: "POST", body: JSON.stringify(payload) }),
  runDiagnostics: (baseUrl: string) => request<DiagnosticsSnapshot>(baseUrl, "/api/diagnostics"),
  runRiskCheck: (baseUrl: string, payload: RiskCheckRequest) => request<RiskCheckResult>(baseUrl, "/api/risk/check", { method: "POST", body: JSON.stringify(payload) }),

  // Neural learning system — grows as the bot accumulates real trade outcomes
  getNeuralStatus: (baseUrl: string) => request<NeuralStatus>(baseUrl, "/api/neural/status"),
  trainNeural: (baseUrl: string) =>
    request<NeuralTrainResult>(baseUrl, "/api/neural/train", { method: "POST" })
      .then((result) => { invalidateCache(baseUrl, "/api/"); return result; }),
  getNeuralLearningHistory: (baseUrl: string) => request<LearningHistoryResponse>(baseUrl, "/api/neural/learning-history"),

  // Self-improving learning system — deep neural net, model registry,
  // drift monitor, anomaly guard, shadow deployment, explainability,
  // sentiment (see backend/app.py "Self-improving learning system" block)
  getDeepNeuralStatus: (baseUrl: string) => request<DeepNeuralStatus>(baseUrl, "/api/deep-neural/status"),
  trainDeepNeural: (baseUrl: string) =>
    request<DeepNeuralTrainResult>(baseUrl, "/api/deep-neural/train", { method: "POST" })
      .then((result) => { invalidateCache(baseUrl, "/api/"); return result; }),

  getModelRegistry: (baseUrl: string) => request<ModelRegistrySummary>(baseUrl, "/api/learning/models"),
  getModelHistory: (baseUrl: string, modelName: string, limit = 50) =>
    request<ModelVersionHistory>(baseUrl, `/api/learning/models/${encodeURIComponent(modelName)}/history?limit=${limit}`),
  promoteModelVersion: (baseUrl: string, payload: { model_name: string; version: number }) =>
    request<{ ok: boolean; model_name: string; champion_version: number }>(baseUrl, "/api/learning/models/promote", { method: "POST", body: JSON.stringify(payload) })
      .then((result) => { invalidateCache(baseUrl, "/api/learning/"); return result; }),

  getDrift: (baseUrl: string) => request<DriftCheckResult>(baseUrl, "/api/learning/drift"),
  getDriftHistory: (baseUrl: string, limit = 20) => request<DriftHistoryResponse>(baseUrl, `/api/learning/drift/history?limit=${limit}`),

  getAnomalies: (baseUrl: string, limit = 50, symbol?: string) =>
    request<AnomalyListResponse>(baseUrl, `/api/learning/anomalies?limit=${limit}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ""}`),
  pauseAnomalyGuard: (baseUrl: string, payload: { minutes?: number; symbol?: string }) =>
    request<AnomalyStatus>(baseUrl, "/api/learning/anomalies/pause", { method: "POST", body: JSON.stringify(payload) })
      .then((result) => { invalidateCache(baseUrl, "/api/learning/"); return result; }),
  resumeAnomalyGuard: (baseUrl: string) =>
    request<AnomalyStatus>(baseUrl, "/api/learning/anomalies/resume", { method: "POST" })
      .then((result) => { invalidateCache(baseUrl, "/api/learning/"); return result; }),

  getShadowScoreboard: (baseUrl: string, limit = 200) => request<ShadowScoreboard>(baseUrl, `/api/learning/shadow?limit=${limit}`),

  getModelExplanation: (baseUrl: string, model: "rl" | "neural" | "deep" = "rl", samples = 200) =>
    request<ExplainModelResult>(baseUrl, `/api/learning/explain?model=${model}&samples=${samples}`),
  explainDecision: (baseUrl: string, payload: { features: Record<string, number>; model_name?: "rl" | "neural" | "deep" }) =>
    request<ExplainDecisionResult>(baseUrl, "/api/learning/explain/decision", { method: "POST", body: JSON.stringify(payload) }),

  getDecisionAudit: (baseUrl: string, symbol?: string, limit = 100) =>
    request<DecisionAuditResponse>(baseUrl, `/api/learning/audit?limit=${limit}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ""}`),

  runTuningSearch: (baseUrl: string, payload: { model_name?: string; n_trials?: number }) =>
    request<TuningSearchResult>(baseUrl, "/api/learning/tuning/search", { method: "POST", body: JSON.stringify(payload) })
      .then((result) => { invalidateCache(baseUrl, "/api/learning/"); return result; }),
  getTuningTrials: (baseUrl: string, modelName?: string, limit = 50) =>
    request<TuningTrialsResponse>(baseUrl, `/api/learning/tuning/trials?limit=${limit}${modelName ? `&model_name=${encodeURIComponent(modelName)}` : ""}`),

  setProviderRateLimit: (baseUrl: string, payload: { provider_id: string; max_per_window: number; window_sec?: number }) =>
    request<{ ok: boolean; provider_id: string; rate_limit: ProviderRateLimitStatus }>(baseUrl, "/api/providers/rate-limit", { method: "POST", body: JSON.stringify(payload) }),
  setProviderProxies: (baseUrl: string, payload: { provider_id: string; proxies: string[] }) =>
    request<{ ok: boolean; provider_id: string; proxy_count: number }>(baseUrl, "/api/providers/proxies", { method: "POST", body: JSON.stringify(payload) }),

  getSentiment: (baseUrl: string, symbol: string) => request<SentimentAverage>(baseUrl, `/api/sentiment/${encodeURIComponent(symbol)}`),
  submitSentimentHeadline: (baseUrl: string, payload: { symbol: string; headline: string; source?: string }) =>
    request<SentimentHeadlineResult>(baseUrl, "/api/sentiment/headline", { method: "POST", body: JSON.stringify(payload) })
      .then((result) => { invalidateCache(baseUrl, "/api/sentiment/"); return result; }),
  getSentimentHistory: (baseUrl: string, symbol: string, limit = 50) =>
    request<SentimentHistoryResponse>(baseUrl, `/api/sentiment/${encodeURIComponent(symbol)}/history?limit=${limit}`),

  // Candlestick chart data (OHLCV + indicator overlays + markers)
  getChartData: (
    baseUrl: string,
    symbol: string,
    options?: { timeframe?: ChartTimeframe | string; bars?: number; indicators?: string[] }
  ) => {
    const params = new URLSearchParams();
    params.set("timeframe", options?.timeframe ?? "1H");
    params.set("bars", String(options?.bars ?? 300));
    if (options?.indicators?.length) params.set("indicators", options.indicators.join(","));
    return request<ChartPayload>(baseUrl, `/api/chart/${encodeURIComponent(symbol)}?${params.toString()}`);
  },

  // Aggregated dashboard metrics (P&L, win rate, drawdown, risk, regime, health, MT5, safety)
  getDashboardMetrics: (baseUrl: string) => request<DashboardMetrics>(baseUrl, "/api/dashboard/metrics"),
};
