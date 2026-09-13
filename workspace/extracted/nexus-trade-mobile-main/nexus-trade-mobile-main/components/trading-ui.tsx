import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View, type PressableProps } from "react-native";

import { IconSymbol, type IconSymbolName } from "@/components/ui/icon-symbol";
import { GlassPanel, LiquidGlassOrb } from "@/components/glass-ui";
import { useColors } from "@/hooks/use-colors";
import type { Signal } from "@/lib/forex-api";

/**
 * Font-scaling defaults.
 *
 * Allow the OS-level Dynamic Type / font scale to scale our text up
 * for accessibility — but cap it at 1.4× so a 200% system font
 * scale doesn't blow out the tightly-laid-out metric cards and signal
 * rows. Users who need a higher cap can override per-Text via props.
 */
const TEXT_PROPS = {
  allowFontScaling: true,
  maxFontSizeMultiplier: 1.4,
} as const;

export function formatMoney(value?: number, currency = "USD") {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return `${value < 0 ? "−" : ""}${currency} ${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value?: number, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function StatusPill({ label, tone = "neutral", icon }: { label: string; tone?: "success" | "warning" | "error" | "neutral"; icon?: "wifi" | "wifi.slash" | "checkmark.circle.fill" | "exclamationmark.triangle.fill" }) {
  const colors = useColors();
  const palette = {
    success: { bg: `${colors.success}20`, text: colors.success },
    warning: { bg: `${colors.warning}20`, text: colors.warning },
    error: { bg: `${colors.error}20`, text: colors.error },
    neutral: { bg: `${colors.muted}18`, text: colors.muted },
  }[tone];

  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}> 
      {icon ? <IconSymbol name={icon} size={13} color={palette.text} /> : <View style={[styles.dot, { backgroundColor: palette.text }]} />}
      <Text {...TEXT_PROPS} style={[styles.pillText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        <Text {...TEXT_PROPS} style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? <Text {...TEXT_PROPS} style={[styles.sectionSubtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Panel({ children, style }: { children: React.ReactNode; style?: object }) {
  const colors = useColors();
  return <GlassPanel style={[styles.panel, { backgroundColor: `${colors.surface}E8`, borderColor: colors.border }, style]}><LiquidGlassOrb size={92} color={colors.primary} /><View style={styles.panelContent}>{children}</View></GlassPanel>;
}

export function MetricCard({ label, value, caption, tone = "neutral", icon }: { label: string; value: string; caption?: string; tone?: "success" | "warning" | "error" | "neutral"; icon?: IconSymbolName }) {
  const colors = useColors();
  const valueColor = tone === "success" ? colors.success : tone === "error" ? colors.error : colors.foreground;
  return (
    <Panel style={styles.metricCard}>
      <View style={styles.metricTopRow}>
        <Text {...TEXT_PROPS} style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>
        {icon ? <IconSymbol name={icon} size={16} color={colors.muted} /> : null}
      </View>
      <Text {...TEXT_PROPS} style={[styles.metricValue, { color: valueColor }]}>{value}</Text>
      {caption ? <Text {...TEXT_PROPS} style={[styles.metricCaption, { color: colors.muted }]}>{caption}</Text> : null}
    </Panel>
  );
}

export function ActionButton({ label, icon, variant = "secondary", disabled, ...props }: PressableProps & { label: string; icon?: "play.fill" | "pause.fill" | "stop.fill" | "bolt.fill" | "arrow.clockwise" | "link" | "shield.fill"; variant?: "primary" | "secondary" | "danger" }) {
  const colors = useColors();
  const stylesForVariant = {
    primary: { backgroundColor: colors.primary, borderColor: colors.primary, textColor: "#FFFFFF" },
    secondary: { backgroundColor: colors.background, borderColor: colors.border, textColor: colors.foreground },
    danger: { backgroundColor: `${colors.error}16`, borderColor: `${colors.error}65`, textColor: colors.error },
  }[variant];
  return (
    <Pressable
      {...props}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.actionButton, { backgroundColor: stylesForVariant.backgroundColor, borderColor: stylesForVariant.borderColor, opacity: disabled ? 0.45 : pressed ? 0.74 : 1 }]}
    >
      {icon ? <IconSymbol name={icon} size={15} color={stylesForVariant.textColor} /> : null}
      <Text style={[styles.actionLabel, { color: stylesForVariant.textColor }]}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ title, body, icon = "server.rack" }: { title: string; body: string; icon?: "server.rack" | "chart.bar.fill" | "wifi.slash" }) {
  const colors = useColors();
  return (
    <View style={[styles.emptyState, { borderColor: colors.border }]}> 
      <IconSymbol name={icon} size={22} color={colors.muted} />
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.muted }]}>{body}</Text>
    </View>
  );
}

export function SignalRow({ signal }: { signal: Signal }) {
  const colors = useColors();
  const directionColor = signal.direction === "buy" ? colors.success : signal.direction === "sell" ? colors.error : colors.warning;
  const strength = Math.max(0, Math.min(100, Number(signal.strength) || 0));
  const strengthLabel = useMemo(() => `${Math.round(strength)}%`, [strength]);
  return (
    <Panel style={styles.signalCard}>
      <View style={styles.signalHeader}>
        <View style={styles.signalSymbolRow}>
          <View style={[styles.symbolBadge, { backgroundColor: `${directionColor}18` }]}>
            <Text style={[styles.symbolBadgeText, { color: directionColor }]}>{signal.symbol.slice(0, 2)}</Text>
          </View>
          <View>
            <Text style={[styles.signalSymbol, { color: colors.foreground }]}>{signal.symbol}</Text>
            <Text style={[styles.signalMeta, { color: colors.muted }]}>{signal.asset_class} · {signal.timeframe}</Text>
          </View>
        </View>
        <View style={[styles.directionBadge, { backgroundColor: `${directionColor}18` }]}>
          <IconSymbol name={signal.direction === "sell" ? "arrow.down.right" : "arrow.up.right"} size={13} color={directionColor} />
          <Text style={[styles.directionText, { color: directionColor }]}>{signal.direction.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.strengthRow}>
        <Text style={[styles.strengthLabel, { color: colors.muted }]}>Signal strength</Text>
        <Text style={[styles.strengthValue, { color: directionColor }]}>{strengthLabel}</Text>
      </View>
      <View style={[styles.strengthTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.strengthFill, { width: `${strength}%`, backgroundColor: directionColor }]} />
      </View>
      <View style={styles.levelGrid}>
        <Level label="ENTRY" value={formatNumber(signal.entry, 5)} />
        <Level label="STOP" value={formatNumber(signal.sl, 5)} />
        <Level label="TARGET" value={formatNumber(signal.tp, 5)} />
      </View>
      <Text style={[styles.signalReason, { color: colors.muted }]} numberOfLines={3}>{signal.reason || "No rationale supplied by backend."}</Text>
    </Panel>
  );
}

function Level({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.levelItem}>
      <Text style={[styles.levelLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.levelValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: 18, borderWidth: 1, padding: 16 },
  panelContent: { zIndex: 1 },
  pill: { alignItems: "center", borderRadius: 999, flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  dot: { borderRadius: 99, height: 7, width: 7 },
  pillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  sectionHeader: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginBottom: 11 },
  sectionCopy: { flex: 1, gap: 3 },
  sectionTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  sectionSubtitle: { fontSize: 12 },
  metricCard: { flex: 1, minWidth: "45%", padding: 14 },
  metricTopRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  metricLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  metricValue: { fontSize: 18, fontWeight: "800", marginTop: 10 },
  metricCaption: { fontSize: 11, marginTop: 4 },
  actionButton: { alignItems: "center", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 42, paddingHorizontal: 14 },
  actionLabel: { fontSize: 12, fontWeight: "800" },
  emptyState: { alignItems: "center", borderRadius: 18, borderStyle: "dashed", borderWidth: 1, gap: 8, paddingHorizontal: 22, paddingVertical: 28 },
  emptyTitle: { fontSize: 15, fontWeight: "800" },
  emptyBody: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  signalCard: { gap: 12, marginBottom: 12 },
  signalHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  signalSymbolRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  symbolBadge: { alignItems: "center", borderRadius: 12, height: 38, justifyContent: "center", width: 38 },
  symbolBadgeText: { fontSize: 13, fontWeight: "900" },
  signalSymbol: { fontSize: 16, fontWeight: "900" },
  signalMeta: { fontSize: 11, marginTop: 3, textTransform: "capitalize" },
  directionBadge: { alignItems: "center", borderRadius: 999, flexDirection: "row", gap: 5, paddingHorizontal: 9, paddingVertical: 6 },
  directionText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  strengthRow: { flexDirection: "row", justifyContent: "space-between" },
  strengthLabel: { fontSize: 11, fontWeight: "700" },
  strengthValue: { fontSize: 11, fontWeight: "900" },
  strengthTrack: { borderRadius: 99, height: 6, overflow: "hidden" },
  strengthFill: { borderRadius: 99, height: "100%" },
  levelGrid: { flexDirection: "row", justifyContent: "space-between" },
  levelItem: { gap: 4 },
  levelLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  levelValue: { fontFamily: "monospace", fontSize: 12, fontWeight: "700" },
  signalReason: { fontSize: 12, lineHeight: 18 },
});
