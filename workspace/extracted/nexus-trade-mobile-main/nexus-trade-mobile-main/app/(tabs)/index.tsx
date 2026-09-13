import { useCallback } from "react";
import { Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";

import { ActionButton, EmptyState, MetricCard, Panel, SectionHeader, StatusPill, formatMoney, formatNumber } from "@/components/trading-ui";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useTrading } from "@/lib/trading-context";
import { GlassPanel, LiquidGlassOrb } from "@/components/glass-ui";
import { AuroraVeil } from "@/components/liquid-glass-advanced";
import { useThemeContext } from "@/lib/theme-provider";
import { EquityChart } from "@/components/equity-chart";
import { DashboardMetricsPanel } from "@/components/dashboard-metrics-panel";
import { useDashboardMetrics } from "@/hooks/use-dashboard-metrics";
import { useNetworkHealth, formatLatency, formatSuccessRate, classifyHealth } from "@/hooks/use-network-health";
import { useSignalAlerts } from "@/lib/multi-timeframe-scanner";

function backendRiskLabel(value?: number) {
  return value === undefined ? "Backend governed" : `${formatNumber(value, 2)}% per trade`;
}

export default function DashboardScreen() {
  const colors = useColors();
  const { advanced } = useThemeContext();
  const { status, loading, connected, error, lastSyncedAt, refresh, controlBot, killSwitch, signals, online, pendingWrites } = useTrading();
  const { metrics, loading: metricsLoading } = useDashboardMetrics();
  const networkHealth = useNetworkHealth();
  const account = status?.account;
  const botState = status?.bot_state ?? "stopped";
  const botTone = botState === "running" ? "success" : botState === "paused" ? "warning" : botState === "error" ? "error" : "neutral";

  // Wire up signal alerts (no-op when mode === "off" or on web).
  useSignalAlerts(signals, advanced.signalAlertMode, advanced.signalAlertThreshold, connected);

  const networkTone = classifyHealth(networkHealth);
  const networkColor = networkTone === "good" ? colors.success : networkTone === "degraded" ? colors.warning : networkTone === "bad" ? colors.error : colors.muted;

  const runControl = useCallback(async (action: "start" | "stop" | "pause" | "resume") => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await controlBot(action);
  }, [controlBot]);

  const confirmKillSwitch = useCallback(() => {
    Alert.alert("Trigger kill switch?", "This asks the backend to flatten positions and halt emergency trading protections. Continue only if this is intentional.", [
      { text: "Cancel", style: "cancel" },
      { text: "Trigger", style: "destructive", onPress: () => void killSwitch() },
    ]);
  }, [killSwitch]);

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* AuroraVeil: slow drifting aurora gradient behind the whole
            dashboard. Rendered as the first absolutely-positioned child
            of the ScrollView's content container — sits behind every
            panel without affecting layout. */}
        <AuroraVeil intensity={advanced.highContrastSurfaces ? 38 : advanced.glassIntensity} />

        <View style={styles.header}>
          <View>
            <View style={styles.brandRow}>
              <View style={[styles.brandMark, { backgroundColor: advanced.customAccent ?? colors.primary }]}><Text style={styles.brandMarkText}>NT</Text></View>
              <Text style={[styles.eyebrow, { color: advanced.customAccent ?? colors.primary }]}>NEXUS TRADE</Text>
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>Command center</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>Keep risk visible. Trade deliberately.</Text>
          </View>
          <View style={styles.headerRight}>
            <StatusPill label={connected ? "BACKEND ONLINE" : "DISCONNECTED"} tone={connected ? "success" : "warning"} icon={connected ? "wifi" : "wifi.slash"} />
            {advanced.showNetworkLatency && connected ? (
              <View style={[styles.networkPill, { borderColor: `${networkColor}55`, backgroundColor: `${networkColor}14` }]}>
                <View style={[styles.networkDot, { backgroundColor: networkColor }]} />
                <Text style={[styles.networkText, { color: networkColor }]}>{formatLatency(networkHealth.avgLatencyMs)} · {formatSuccessRate(networkHealth.successRate)}</Text>
              </View>
            ) : null}
            <Pressable
              onPress={() => router.push("/settings")}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              style={({ pressed }) => [styles.settingsButton, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <IconSymbol name="gearshape.fill" size={18} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        {error ? (
          <Pressable onPress={() => router.push("/settings")} style={[styles.errorBanner, { backgroundColor: `${colors.warning}12`, borderColor: `${colors.warning}45` }]}>
            <IconSymbol name="exclamationmark.triangle.fill" size={17} color={colors.warning} />
            <View style={styles.errorCopy}>
              <Text style={[styles.errorTitle, { color: colors.warning }]}>Backend connection needed</Text>
              <Text style={[styles.errorText, { color: colors.muted }]} numberOfLines={2}>{error}</Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color={colors.warning} />
          </Pressable>
        ) : null}

        {/* Offline banner — surfaces when the app is showing cached
            data because the live backend poll is failing. Includes a
            count of queued writes when applicable. */}
        {!online && status ? (
          <View style={[styles.offlineBanner, { backgroundColor: `${colors.warning}12`, borderColor: `${colors.warning}45` }]}>
            <IconSymbol name="wifi.slash" size={15} color={colors.warning} />
            <View style={styles.offlineCopy}>
              <Text style={[styles.offlineTitle, { color: colors.warning }]}>Offline — showing cached data</Text>
              <Text style={[styles.offlineText, { color: colors.muted }]}>
                {pendingWrites.length > 0
                  ? `${pendingWrites.length} pending write${pendingWrites.length === 1 ? "" : "s"} queued for retry. Will auto-flush when connection returns.`
                  : "Last successful sync is being shown. New data will load when the backend is reachable."}
              </Text>
            </View>
          </View>
        ) : null}

        {advanced.showAccountValues ? <View style={styles.metricsGrid}>
          <MetricCard label="Balance" value={formatMoney(account?.balance, account?.currency)} caption={account?.currency ?? "Waiting for account"} icon="chart.bar.fill" />
          <MetricCard label="Equity" value={formatMoney(account?.equity, account?.currency)} caption={account?.margin_level ? `Margin ${formatNumber(account.margin_level, 0)}%` : "Awaiting MT5"} icon="chart.bar.fill" />
          <MetricCard label="Floating P&L" value={formatMoney(account?.profit, account?.currency)} caption={account?.profit !== undefined ? "Live account value" : "No live data"} tone={account?.profit !== undefined && account.profit < 0 ? "error" : account?.profit !== undefined ? "success" : "neutral"} icon={account?.profit !== undefined && account.profit < 0 ? "arrow.down.right" : "arrow.up.right"} />
          <MetricCard label="Free margin" value={formatMoney(account?.free_margin, account?.currency)} caption={account?.leverage ? `Leverage 1:${account.leverage}` : "Awaiting MT5"} icon="shield.fill" />
        </View> : <Panel><Text style={[styles.safetyNote, { color: colors.muted }]}>Account values are hidden by your advanced privacy control.</Text></Panel>}

        <GlassPanel intensity={advanced.glassIntensity} style={[styles.overviewPanel, { backgroundColor: `${colors.surface}E8`, borderColor: `${advanced.customAccent ?? colors.primary}55` }]}>
          <LiquidGlassOrb size={150} color={advanced.customAccent ?? colors.primary} />
          <View style={styles.overviewHeader}><View><Text style={[styles.overviewEyebrow, { color: advanced.customAccent ?? colors.primary }]}>LIVE INTELLIGENCE</Text><Text style={[styles.overviewTitle, { color: colors.foreground }]}>Risk-aware command layer</Text></View><StatusPill label={status?.mt5_connected ? "MARKET LINKED" : "WAITING"} tone={status?.mt5_connected ? "success" : "warning"} /></View>
          <View style={styles.overviewGrid}>
            {advanced.dashboardModules.market ? <View><Text style={[styles.overviewLabel, { color: colors.muted }]}>MARKET REGIME</Text><Text style={[styles.overviewValue, { color: colors.foreground }]}>{status?.signals?.length ? "Signal flow active" : "Building context"}</Text></View> : null}
            {advanced.dashboardModules.strategies ? <View><Text style={[styles.overviewLabel, { color: colors.muted }]}>STRATEGY READINESS</Text><Text style={[styles.overviewValue, { color: colors.success }]}>{connected ? "Backend tools ready" : "Connect backend"}</Text></View> : null}
            {advanced.dashboardModules.providers ? <View><Text style={[styles.overviewLabel, { color: colors.muted }]}>RISK BUDGET</Text><Text style={[styles.overviewValue, { color: colors.foreground }]}>{backendRiskLabel(status?.settings?.max_risk_per_trade_pct)}</Text></View> : null}
          </View>
        </GlassPanel>

        <View>
          <SectionHeader title="Portfolio equity" subtitle={lastSyncedAt ? `Synced ${lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "No sync yet"} />
          <Panel>
            <EquityChart history={status?.equity_history ?? []} />
          </Panel>
        </View>

        <View>
          <SectionHeader title="Dashboard metrics" subtitle="P&L, risk, regime, AI confidence and system health" />
          <DashboardMetricsPanel metrics={metrics} loading={metricsLoading} />
        </View>

        <Panel style={styles.controlPanel}>
          <SectionHeader title="Bot control" subtitle={lastSyncedAt ? `Synced ${lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "No sync yet"} action={<StatusPill label={botState.toUpperCase()} tone={botTone} />} />
          <View style={styles.controlGrid}>
            <ActionButton label="Start" icon="play.fill" variant="primary" disabled={!connected || loading || botState === "running"} onPress={() => void runControl("start")} />
            <ActionButton label="Pause" icon="pause.fill" variant="secondary" disabled={!connected || loading || botState !== "running"} onPress={() => void runControl("pause")} />
            <ActionButton label="Stop" icon="stop.fill" variant="secondary" disabled={!connected || loading || botState === "stopped"} onPress={() => void runControl("stop")} />
          </View>
          <Pressable onPress={confirmKillSwitch} disabled={!connected || loading} style={({ pressed }) => [styles.killButton, { borderColor: `${colors.error}55`, backgroundColor: `${colors.error}10`, opacity: !connected || loading ? 0.45 : pressed ? 0.7 : 1 }]}>
            <IconSymbol name="bolt.fill" size={15} color={colors.error} />
            <Text style={[styles.killText, { color: colors.error }]}>Emergency kill switch</Text>
          </Pressable>
          <Text style={[styles.safetyNote, { color: colors.muted }]}>Live order execution remains governed by the backend safety settings. This mobile client does not store broker credentials.</Text>
        </Panel>

        <View>
          <SectionHeader title="Open positions" subtitle={`${status?.positions?.length ?? 0} active`} />
          {status?.positions?.length ? status.positions.map((position) => (
            <Panel key={String(position.ticket)} style={styles.positionCard}>
              <View style={styles.positionTopRow}>
                <View>
                  <Text style={[styles.positionSymbol, { color: colors.foreground }]}>{position.symbol}</Text>
                  <Text style={[styles.positionMeta, { color: colors.muted }]}>{position.type.toUpperCase()} · {formatNumber(position.volume, 2)} lots</Text>
                </View>
                <Text style={[styles.positionProfit, { color: position.profit >= 0 ? colors.success : colors.error }]}>{formatMoney(position.profit, account?.currency)}</Text>
              </View>
              <View style={styles.positionLevels}>
                <Text style={[styles.positionLevel, { color: colors.muted }]}>Open <Text style={{ color: colors.foreground }}>{formatNumber(position.open_price, 5)}</Text></Text>
                <Text style={[styles.positionLevel, { color: colors.muted }]}>Now <Text style={{ color: colors.foreground }}>{formatNumber(position.current_price, 5)}</Text></Text>
                <Text style={[styles.positionLevel, { color: colors.muted }]}>SL <Text style={{ color: colors.foreground }}>{formatNumber(position.sl, 5)}</Text></Text>
                <Text style={[styles.positionLevel, { color: colors.muted }]}>TP <Text style={{ color: colors.foreground }}>{formatNumber(position.tp, 5)}</Text></Text>
              </View>
            </Panel>
          )) : <EmptyState title={connected ? "No open positions" : "Connect to see positions"} body={connected ? "The backend has not reported an active MT5 position." : "Set the FastAPI URL in Settings to load live account data."} icon={connected ? "chart.bar.fill" : "wifi.slash"} />}
        </View>

        <View>
          <SectionHeader title="Activity log" subtitle={`${status?.logs?.length ?? 0} recent events`} />
          <Panel style={styles.logPanel}>
            {status?.logs?.length ? status.logs.slice(-6).reverse().map((log, index) => (
              <View key={`${log}-${index}`} style={styles.logRow}>
                <View style={[styles.logDot, { backgroundColor: index === 0 ? colors.primary : colors.border }]} />
                <Text style={[styles.logText, { color: colors.muted }]} numberOfLines={2}>{log}</Text>
              </View>
            )) : <Text style={[styles.logEmpty, { color: colors.muted }]}>No backend activity has been received yet.</Text>}
          </Panel>
        </View>

        <Text style={[styles.disclaimer, { color: colors.muted }]}>Educational software. Forex and leveraged trading involve substantial risk of loss.</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: "center", gap: 22, maxWidth: 1120, padding: 18, paddingBottom: 38, width: "100%" },
  header: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  brandRow: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 10 },
  brandMark: { alignItems: "center", borderRadius: 9, height: 28, justifyContent: "center", width: 28 },
  brandMarkText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  eyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { fontSize: 29, fontWeight: "900", letterSpacing: -1 },
  subtitle: { fontSize: 13, marginTop: 5 },
  headerRight: { alignItems: "flex-end", gap: 10 },
  networkPill: { alignItems: "center", borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: 6, paddingHorizontal: 9, paddingVertical: 5 },
  networkDot: { borderRadius: 99, height: 6, width: 6 },
  networkText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  settingsButton: { alignItems: "center", borderRadius: 12, borderWidth: 1, height: 38, justifyContent: "center", width: 38 },
  errorBanner: { alignItems: "center", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 10, padding: 13 },
  errorCopy: { flex: 1, gap: 3 },
  errorTitle: { fontSize: 12, fontWeight: "900" },
  errorText: { fontSize: 11, lineHeight: 16 },
  offlineBanner: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, padding: 12 },
  offlineCopy: { flex: 1, gap: 3 },
  offlineTitle: { fontSize: 11, fontWeight: "900" },
  offlineText: { fontSize: 10, lineHeight: 14 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  overviewPanel: { gap: 16, minHeight: 150, overflow: "hidden", position: "relative" },
  overviewHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", zIndex: 1 },
  overviewEyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  overviewTitle: { fontSize: 18, fontWeight: "900", marginTop: 5 },
  overviewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 20, zIndex: 1 },
  overviewLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 0.7 },
  overviewValue: { fontSize: 12, fontWeight: "800", marginTop: 5 },
  controlPanel: { gap: 14 },
  controlGrid: { flexDirection: "row", gap: 8 },
  killButton: { alignItems: "center", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 40 },
  killText: { fontSize: 12, fontWeight: "900" },
  safetyNote: { fontSize: 11, lineHeight: 16 },
  positionCard: { gap: 14, marginBottom: 10 },
  positionTopRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  positionSymbol: { fontSize: 16, fontWeight: "900" },
  positionMeta: { fontSize: 11, marginTop: 4 },
  positionProfit: { fontFamily: "monospace", fontSize: 14, fontWeight: "900" },
  positionLevels: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  positionLevel: { fontFamily: "monospace", fontSize: 11 },
  logPanel: { gap: 12 },
  logRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  logDot: { borderRadius: 99, height: 6, width: 6 },
  logText: { flex: 1, fontFamily: "monospace", fontSize: 10, lineHeight: 16 },
  logEmpty: { fontSize: 12 },
  disclaimer: { fontSize: 10, lineHeight: 15, textAlign: "center" },
});
