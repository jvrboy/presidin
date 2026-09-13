import { useMemo, useState } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";

import { ActionButton, EmptyState, SectionHeader, SignalRow, StatusPill, formatNumber } from "@/components/trading-ui";
import { ScreenContainer } from "@/components/screen-container";
import { GlassPanel } from "@/components/glass-ui";
import { useColors } from "@/hooks/use-colors";
import { useTrading } from "@/lib/trading-context";
import { useMultiTimeframeScanner, type MultiTimeframeScan } from "@/lib/multi-timeframe-scanner";

const FILTERS = ["all", "forex", "crypto", "metals", "indices", "stocks"];

export default function SignalsScreen() {
  const colors = useColors();
  const { apiBaseUrl, signals, status, connected, loading, rescan, refresh } = useTrading();
  const [filter, setFilter] = useState("all");
  const [scanSymbol, setScanSymbol] = useState("EURUSD");
  const filteredSignals = useMemo(() => filter === "all" ? signals : signals.filter((signal) => signal.asset_class?.toLowerCase() === filter), [filter, signals]);

  const { scanning, result, error: scanError, scan } = useMultiTimeframeScanner(apiBaseUrl, scanSymbol.trim().toUpperCase() || null);

  const handleRescan = async () => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await rescan();
  };

  const handleScan = async () => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await scan();
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.primary} />} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>MARKET INTELLIGENCE</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Signals</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>Multi-asset analysis from the Nexus engine.</Text>
          </View>
          <StatusPill label={`${filteredSignals.length} LIVE`} tone={connected ? "success" : "neutral"} />
        </View>

        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {FILTERS.map((item) => {
              const active = filter === item;
              return <Text key={item} onPress={() => setFilter(item)} style={[styles.filterChip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border, color: active ? "#FFFFFF" : colors.muted }]}>{item.toUpperCase()}</Text>;
            })}
          </ScrollView>
          <ActionButton label="Rescan" icon="arrow.clockwise" variant="secondary" disabled={!connected || loading} onPress={() => void handleRescan()} />
        </View>

        <SectionHeader title="Active signals" subtitle={status?.last_update ? `Updated ${new Date(status.last_update).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for backend scan"} />
        {filteredSignals.length ? filteredSignals.map((signal) => <SignalRow key={signal.id} signal={signal} />) : <EmptyState title={connected ? "No signals in this view" : "Connect to load signals"} body={connected ? "Start the bot or run a rescan to populate the signal feed." : "Set the FastAPI URL in Settings. The app never invents market data when offline."} icon={connected ? "chart.bar.fill" : "wifi.slash"} />}

        <SectionHeader title="Multi-timeframe scanner" subtitle="Cross-timeframe confluence check — confirms or contradicts the headline signal." />
        <GlassPanel intensity={18} style={[styles.scanPanel, { backgroundColor: `${colors.surface}E8`, borderColor: colors.border }]}>
          <View style={styles.scanRow}>
            <TextInput autoCapitalize="characters" autoCorrect={false} value={scanSymbol} onChangeText={setScanSymbol} placeholder="EURUSD" placeholderTextColor={colors.muted} style={[styles.scanInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
            <ActionButton label={scanning ? "Scanning…" : "Scan"} icon="arrow.clockwise" variant="primary" disabled={!connected || scanning || !scanSymbol.trim()} onPress={() => void handleScan()} />
          </View>
          {scanError ? <Text style={[styles.scanError, { color: colors.error }]}>{scanError}</Text> : null}
          {result ? <MultiTimeframeResultView result={result} /> : <Text style={[styles.scanHint, { color: colors.muted }]}>Runs the same backend chart endpoint across 5M / 15M / 1H / 4H / 1D in parallel and reports confluence.</Text>}
        </GlassPanel>

        <View style={[styles.infoCard, { backgroundColor: `${colors.primary}0D`, borderColor: `${colors.primary}38` }]}>
          <Text style={[styles.infoTitle, { color: colors.foreground }]}>Analysis only by default</Text>
          <Text style={[styles.infoBody, { color: colors.muted }]}>Signals are informational until the backend&apos;s own live-trading safety gates allow execution. Review strength, timeframe, stop, and target before acting.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

/** Compact visual summary of a multi-timeframe scan — a row of
 *  per-timeframe direction chips plus the overall confluence score. */
function MultiTimeframeResultView({ result }: { result: MultiTimeframeScan }) {
  const colors = useColors();
  const dominantColor = result.dominantDirection === "buy" ? colors.success : result.dominantDirection === "sell" ? colors.error : colors.warning;
  return (
    <View style={styles.scanResult}>
      <View style={styles.scanSummary}>
        <View>
          <Text style={[styles.scanLabel, { color: colors.muted }]}>DOMINANT</Text>
          <Text style={[styles.scanValue, { color: dominantColor }]}>{result.dominantDirection.toUpperCase()}</Text>
        </View>
        <View>
          <Text style={[styles.scanLabel, { color: colors.muted }]}>BUY / SELL / NEUTRAL</Text>
          <Text style={[styles.scanValue, { color: colors.foreground }]}>{result.buyCount} / {result.sellCount} / {result.neutralCount}</Text>
        </View>
        <View>
          <Text style={[styles.scanLabel, { color: colors.muted }]}>CONFLUENCE</Text>
          <Text style={[styles.scanValue, { color: dominantColor }]}>{result.confluenceScore}%</Text>
        </View>
        <View>
          <Text style={[styles.scanLabel, { color: colors.muted }]}>AVG STRENGTH</Text>
          <Text style={[styles.scanValue, { color: colors.foreground }]}>{formatNumber(result.averageStrength, 1)}%</Text>
        </View>
      </View>
      <View style={styles.voteRow}>
        {result.votes.map((vote) => {
          const tone = vote.direction === "buy" ? colors.success : vote.direction === "sell" ? colors.error : colors.warning;
          return (
            <View key={vote.timeframe} style={[styles.voteChip, { backgroundColor: vote.ok ? `${tone}18` : colors.background, borderColor: vote.ok ? tone : colors.border }]}>
              <Text style={[styles.voteTF, { color: colors.muted }]}>{vote.timeframe}</Text>
              <Text style={[styles.voteDir, { color: vote.ok ? tone : colors.muted }]}>{vote.ok ? vote.direction.toUpperCase() : "N/A"}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: "center", gap: 20, maxWidth: 1120, padding: 18, paddingBottom: 38, width: "100%" },
  header: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between" },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginBottom: 9 },
  title: { fontSize: 30, fontWeight: "900", letterSpacing: -1 },
  subtitle: { fontSize: 13, marginTop: 5 },
  filterRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  filterScroll: { flexGrow: 1, gap: 7 },
  filterChip: { borderRadius: 10, borderWidth: 1, fontSize: 10, fontWeight: "900", overflow: "hidden", paddingHorizontal: 10, paddingVertical: 9 },
  infoCard: { borderRadius: 16, borderWidth: 1, gap: 5, padding: 14 },
  infoTitle: { fontSize: 13, fontWeight: "900" },
  infoBody: { fontSize: 11, lineHeight: 17 },
  scanPanel: { gap: 12, padding: 16 },
  scanRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  scanInput: { borderRadius: 10, borderWidth: 1, flex: 1, fontSize: 13, fontWeight: "800", paddingHorizontal: 12, paddingVertical: 10, textTransform: "uppercase" },
  scanError: { fontSize: 11, fontWeight: "700" },
  scanHint: { fontSize: 11, lineHeight: 16 },
  scanResult: { gap: 12 },
  scanSummary: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  scanLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 0.7 },
  scanValue: { fontSize: 14, fontWeight: "900", marginTop: 3 },
  voteRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  voteChip: { alignItems: "center", borderRadius: 10, borderWidth: 1, gap: 2, paddingHorizontal: 8, paddingVertical: 6 },
  voteTF: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  voteDir: { fontSize: 10, fontWeight: "900" },
});
