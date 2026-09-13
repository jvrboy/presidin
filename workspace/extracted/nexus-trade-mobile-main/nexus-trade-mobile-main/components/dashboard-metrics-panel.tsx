import { StyleSheet, Text, View } from "react-native";

import { MetricCard, Panel, SectionHeader, StatusPill, formatMoney, formatNumber } from "@/components/trading-ui";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import type { DashboardMetrics } from "@/lib/forex-api";

function pct(value?: number | null, digits = 1) {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

function ratio(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  if (!Number.isFinite(value)) return "∞";
  return value.toFixed(2);
}

const SAFETY_TONE: Record<string, "success" | "warning" | "error"> = { safe: "success", caution: "warning", blocked: "error" };
const SAFETY_LABEL: Record<string, string> = { safe: "SAFE TO TRADE", caution: "CAUTION", blocked: "TRADING BLOCKED" };

/**
 * Full dashboard metrics grid: P&L (today/week/month), win rate,
 * profit factor, drawdown, risk exposure, margin utilization,
 * exposure by asset class, market regime, AI confidence, backend
 * health, MT5 latency, and a safe/caution/blocked safety indicator.
 */
export function DashboardMetricsPanel({ metrics, loading }: { metrics: DashboardMetrics | null; loading: boolean }) {
  const colors = useColors();

  if (!metrics) {
    return (
      <Panel>
        <Text style={[styles.placeholder, { color: colors.muted }]}>
          {loading ? "Loading dashboard metrics…" : "Dashboard metrics will appear once the backend connection is established."}
        </Text>
      </Panel>
    );
  }

  const safetyTone = SAFETY_TONE[metrics.safety.status] ?? "warning";
  const pnlToday = metrics.pnl.today;
  const pnlTone = pnlToday > 0 ? "success" : pnlToday < 0 ? "error" : "neutral";

  return (
    <View style={styles.wrap}>
      {/* Safety banner */}
      <Panel style={[styles.safetyPanel, { borderColor: `${colors[safetyTone]}55` }]}>
        <View style={styles.safetyTop}>
          <View style={styles.safetyTitleRow}>
            <IconSymbol name={safetyTone === "success" ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"} size={18} color={colors[safetyTone]} />
            <Text style={[styles.safetyTitle, { color: colors[safetyTone] }]}>{SAFETY_LABEL[metrics.safety.status] ?? metrics.safety.status.toUpperCase()}</Text>
          </View>
          <StatusPill label={metrics.backend_health.bot_state.toUpperCase()} tone={metrics.backend_health.status === "healthy" ? "success" : metrics.backend_health.status === "critical" ? "error" : "warning"} />
        </View>
        {metrics.safety.reasons.map((reason, index) => (
          <Text key={`${reason}-${index}`} style={[styles.safetyReason, { color: colors.muted }]}>• {reason}</Text>
        ))}
      </Panel>

      {/* P&L row */}
      <SectionHeader title="Profit & loss" subtitle={`Daily change ${metrics.pnl.daily_pct >= 0 ? "+" : ""}${metrics.pnl.daily_pct.toFixed(2)}%`} />
      <View style={styles.grid}>
        <MetricCard label="Today" value={formatMoney(metrics.pnl.today)} tone={pnlTone} icon={(pnlToday >= 0 ? "trending.up" : "trending.down") as never} />
        <MetricCard label="This week" value={formatMoney(metrics.pnl.week)} tone={metrics.pnl.week >= 0 ? "success" : "error"} icon={"timeline" as never} />
        <MetricCard label="This month" value={formatMoney(metrics.pnl.month)} tone={metrics.pnl.month >= 0 ? "success" : "error"} icon={"auto.graph" as never} />
        <MetricCard label="Win rate" value={metrics.performance.win_rate !== null && metrics.performance.win_rate !== undefined ? pct(metrics.performance.win_rate * 100) : "—"} caption={`${metrics.performance.total_trades} closed trades`} icon={"analytics" as never} />
      </View>

      {/* Performance row */}
      <SectionHeader title="Performance" subtitle="Profit factor, drawdown, and trade quality" />
      <View style={styles.grid}>
        <MetricCard label="Profit factor" value={ratio(metrics.performance.profit_factor)} caption={`Gross ${formatMoney(metrics.performance.gross_profit)} / -${formatMoney(metrics.performance.gross_loss)}`} icon={"insights" as never} />
        <MetricCard label="Max drawdown" value={pct(metrics.drawdown.max_drawdown_pct)} caption={`Current ${pct(metrics.drawdown.current_drawdown_pct)}`} tone={metrics.drawdown.current_drawdown_pct > 10 ? "warning" : "neutral"} icon={"trending.down" as never} />
        <MetricCard label="Best trade" value={formatMoney(metrics.performance.best_trade ?? undefined)} tone="success" icon="arrow.up.right" />
        <MetricCard label="Worst trade" value={formatMoney(metrics.performance.worst_trade ?? undefined)} tone="error" icon="arrow.down.right" />
      </View>

      {/* Risk row */}
      <SectionHeader title="Risk & exposure" subtitle={`${metrics.risk.open_positions}/${metrics.risk.max_open_trades} positions open`} />
      <View style={styles.grid}>
        <MetricCard label="Risk exposure" value={pct(metrics.risk.exposure_pct)} caption="Sum of open-position risk" tone={metrics.risk.exposure_pct > 6 ? "warning" : "neutral"} icon="speedometer" />
        <MetricCard label="Margin utilization" value={pct(metrics.risk.margin_utilization_pct)} caption={`Margin level ${formatNumber(metrics.risk.margin_level_pct, 0)}%`} tone={metrics.risk.margin_utilization_pct > 60 ? "warning" : "neutral"} icon="shield.fill" />
        <MetricCard label="Market regime" value={metrics.market_regime.regime.toUpperCase()} caption={metrics.market_regime.symbol ? `${metrics.market_regime.symbol} · confidence ${pct(metrics.market_regime.confidence * 100)}` : "Awaiting data"} icon={"hub" as never} />
        <MetricCard label="AI confidence" value={pct(metrics.ai_confidence * 100)} caption="Multi-agent consensus" icon={"psychology" as never} />
      </View>

      {/* Exposure by asset */}
      {Object.keys(metrics.exposure_by_asset).length > 0 ? (
        <View>
          <SectionHeader title="Exposure by asset class" />
          <Panel style={styles.exposurePanel}>
            {Object.entries(metrics.exposure_by_asset).map(([asset, bucket]) => (
              <View key={asset} style={styles.exposureRow}>
                <Text style={[styles.exposureAsset, { color: colors.foreground }]}>{asset}</Text>
                <Text style={[styles.exposureMeta, { color: colors.muted }]}>{bucket.positions} pos · {formatNumber(bucket.volume, 2)} lots</Text>
                <Text style={[styles.exposureProfit, { color: bucket.profit >= 0 ? colors.success : colors.error }]}>{formatMoney(bucket.profit)}</Text>
              </View>
            ))}
          </Panel>
        </View>
      ) : null}

      {/* System health row */}
      <SectionHeader title="System health" subtitle={metrics.backend_health.uptime_human ? `Uptime ${metrics.backend_health.uptime_human}` : undefined} />
      <View style={styles.grid}>
        <MetricCard
          label="Backend health"
          value={metrics.backend_health.status.toUpperCase()}
          caption={`${metrics.backend_health.cycles_completed} cycles · ${metrics.backend_health.total_errors} errors`}
          tone={metrics.backend_health.status === "healthy" ? "success" : metrics.backend_health.status === "critical" ? "error" : "warning"}
          icon={"model.training" as never}
        />
        <MetricCard
          label="MT5 connection"
          value={metrics.mt5.connected ? "CONNECTED" : "OFFLINE"}
          caption={metrics.mt5.latency_ms ? `Latency ${formatNumber(metrics.mt5.latency_ms, 0)}ms` : "No live link"}
          tone={metrics.mt5.connected ? "success" : "warning"}
          icon="link"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  placeholder: { fontSize: 12, textAlign: "center", paddingVertical: 8 },
  safetyPanel: { gap: 8 },
  safetyTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  safetyTitleRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  safetyTitle: { fontSize: 13, fontWeight: "900", letterSpacing: 0.4 },
  safetyReason: { fontSize: 11, lineHeight: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  exposurePanel: { gap: 10 },
  exposureRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  exposureAsset: { flex: 1, fontSize: 13, fontWeight: "800", textTransform: "capitalize" },
  exposureMeta: { flex: 1, fontSize: 11, textAlign: "center" },
  exposureProfit: { fontFamily: "monospace", fontSize: 12, fontWeight: "800", textAlign: "right" },
});
