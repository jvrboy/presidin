import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { GlassPanel } from "@/components/glass-ui";
import { useColors } from "@/hooks/use-colors";
import { useThemeContext } from "@/lib/theme-provider";
import { forexApi, normalizeBaseUrl } from "@/lib/forex-api";
import { useNetworkHealth, formatLatency, formatSuccessRate, classifyHealth } from "@/hooks/use-network-health";

/**
 * In-app network diagnostics panel.
 *
 * Surfaces EVERY layer of the network stack so a user reporting "the app
 * has no network access" can see exactly which layer is broken without
 * needing to attach a debugger:
 *
 *   1. Device platform (Android / iOS / web) + OS version
 *   2. Window origin (web only — to confirm the dev-server vs prod)
 *   3. Resilience-layer rolling health (avg / p95 latency, success rate,
 *      last error category)
 *   4. Live ping to the configured backend URL (separate from the
 *      status poll — sends a one-off /api/status GET and reports the
 *      raw outcome, including the rewritten-through-proxy URL when
 *      running on web dev)
 *   5. Backend URL classification (emulator alias / localhost / LAN IP
 *      / public host / HTTPS-no-cert)
 *   6. Platform-specific permission hints (iOS local-network permission,
 *      Android INTERNET permission, etc.)
 *
 * Designed to be dropped into the Settings tab (rendered inside an
 * existing Panel) or rendered standalone on a debug route. Renders as a
 * vertical list of diagnostic rows; no external dependencies beyond the
 * existing forex-api + use-network-health hook.
 */

export type DiagRow = {
  label: string;
  value: string;
  tone: "good" | "warning" | "error" | "neutral";
  hint?: string;
};

export type DiagSection = {
  title: string;
  rows: DiagRow[];
};

/** Run a single one-off ping against the backend URL. Bypasses the
 *  resilience layer's cache so the result always reflects the live
 *  state of the network. */
async function pingBackend(baseUrl: string): Promise<{ ok: boolean; status?: number; latencyMs: number; error?: string; finalUrl?: string }> {
  const startedAt = Date.now();
  // Determine the final URL the resilience layer would actually hit
  // (so we can display it to the user — particularly important on web
  // dev where the URL is rewritten through the /__proxy prefix).
  const isWeb = typeof window !== "undefined";
  const onDevServer =
    isWeb &&
    typeof window.location !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "0.0.0.0");
  let finalUrl = `${normalizeBaseUrl(baseUrl)}/api/status`;
  if (isWeb && onDevServer) {
    try {
      const u = new URL(normalizeBaseUrl(baseUrl));
      const port = u.port || (u.protocol === "https:" ? "443" : "80");
      finalUrl = `/__proxy/${u.hostname}/${port}${u.pathname === "/" ? "" : u.pathname}/api/status`;
    } catch {
      /* fall back to direct URL */
    }
  }
  try {
    await forexApi.getStatus(baseUrl);
    return { ok: true, status: 200, latencyMs: Date.now() - startedAt, finalUrl };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: e instanceof Error ? e.message : String(e),
      finalUrl,
    };
  }
}

function classifyBackendUrl(baseUrl: string): { kind: string; tone: DiagRow["tone"]; hint?: string } {
  let host = "";
  let protocol = "http:";
  try {
    const u = new URL(normalizeBaseUrl(baseUrl));
    host = u.hostname;
    protocol = u.protocol;
  } catch {
    return { kind: "Invalid URL", tone: "error", hint: "The URL you entered could not be parsed." };
  }
  if (host === "10.0.2.2") return { kind: "Android emulator alias", tone: "warning", hint: "Only works inside the Android emulator. Use your LAN IP on real devices." };
  if (host === "localhost" || host === "127.0.0.1") return { kind: "Loopback", tone: "warning", hint: "Only works if the backend runs on this same device. Use your LAN IP for cross-device access." };
  if (protocol === "https:") return { kind: "HTTPS", tone: "warning", hint: "Self-hosted backends usually lack a valid TLS cert — try http:// instead." };
  if (/^192\.168\./.test(host) || /^10\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return { kind: "LAN IP", tone: "good" };
  return { kind: "Public host", tone: "good" };
}

export function NetworkDiagnosticsPanel({ baseUrl, connected }: { baseUrl: string; connected: boolean }) {
  const colors = useColors();
  const { advanced } = useThemeContext();
  const networkHealth = useNetworkHealth(1500);
  const [ping, setPing] = useState<{ ok: boolean; status?: number; latencyMs: number; error?: string; finalUrl?: string } | null>(null);
  const [pinging, setPinging] = useState(false);

  const runPing = useCallback(async () => {
    setPinging(true);
    const result = await pingBackend(baseUrl);
    setPing(result);
    setPinging(false);
  }, [baseUrl]);

  // Auto-run the ping once on mount + whenever the backend URL changes.
  useEffect(() => {
    void runPing();
  }, [runPing]);

  const netTone = classifyHealth(networkHealth);
  const urlClassification = classifyBackendUrl(baseUrl);

  const platformRow: DiagRow = {
    label: "Platform",
    value: Platform.OS === "web" ? `Web (${typeof window !== "undefined" ? window.location.origin : "unknown"})` : Platform.OS === "android" ? `Android (API ${Platform.Version})` : `iOS ${Platform.Version}`,
    tone: "neutral",
  };

  const originRow: DiagRow | null =
    Platform.OS === "web" && typeof window !== "undefined"
      ? {
          label: "Page origin",
          value: window.location.origin,
          tone: window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? "warning" : "good",
          hint: window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? "Metro dev server — backend calls are rewritten through /__proxy to bypass CORS." : "Production deployment — backend calls go directly to the configured URL.",
        }
      : null;

  const urlRow: DiagRow = {
    label: "Backend URL",
    value: baseUrl,
    tone: urlClassification.tone,
    hint: urlClassification.hint,
  };

  const urlKindRow: DiagRow = {
    label: "URL classification",
    value: urlClassification.kind,
    tone: urlClassification.tone,
  };

  const healthRow: DiagRow = {
    label: "Resilience layer health",
    value: networkHealth.samples.length === 0 ? "No samples yet" : `${formatLatency(networkHealth.avgLatencyMs)} avg · ${formatLatency(networkHealth.p95LatencyMs)} p95 · ${formatSuccessRate(networkHealth.successRate)} success`,
    tone: netTone === "good" ? "good" : netTone === "degraded" ? "warning" : netTone === "bad" ? "error" : "neutral",
    hint: networkHealth.lastErrorKind ? `Last error: ${networkHealth.lastErrorKind}` : undefined,
  };

  const pingRow: DiagRow = ping
    ? {
        label: "Live backend ping",
        value: ping.ok ? `OK · ${ping.latencyMs}ms` : `FAILED · ${ping.latencyMs}ms`,
        tone: ping.ok ? "good" : "error",
        hint: ping.ok ? (ping.finalUrl && ping.finalUrl !== `${normalizeBaseUrl(baseUrl)}/api/status` ? `Rewritten through: ${ping.finalUrl}` : undefined) : ping.error,
      }
    : { label: "Live backend ping", value: pinging ? "Pinging…" : "Not run yet", tone: "neutral" };

  const permissionRows: DiagRow[] = [];
  if (Platform.OS === "android") {
    permissionRows.push(
      { label: "Android INTERNET permission", value: "Declared in app.config.ts", tone: "good" },
      { label: "Android cleartext HTTP", value: "Allowed (usesCleartextTraffic: true)", tone: "good", hint: "Required for plain-HTTP backends on the LAN — Android 9+ blocks it by default." },
    );
  } else if (Platform.OS === "ios") {
    permissionRows.push(
      { label: "iOS App Transport Security", value: "Arbitrary loads allowed", tone: "good", hint: "Required for plain-HTTP backends on the LAN." },
      { label: "iOS local-network usage description", value: "Declared", tone: "good", hint: "iOS 14+ requires this string before allowing LAN IP connections." },
      { label: "iOS Bonjour services", value: "_http._tcp declared", tone: "good" },
    );
  } else {
    permissionRows.push({
      label: "Web CORS",
      value: typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "Dev proxy active" : "Direct (production)",
      tone: "neutral",
      hint: typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "Metro dev server rewrites backend URLs through /__proxy/* to bypass browser CORS." : "Production web expects same-origin or CORS-friendly backend.",
    });
  }

  const sections: DiagSection[] = [
    { title: "Device & origin", rows: [platformRow, ...(originRow ? [originRow] : [])] },
    { title: "Backend URL", rows: [urlRow, urlKindRow] },
    { title: "Live connectivity", rows: [healthRow, pingRow] },
    { title: "Platform permissions", rows: permissionRows },
  ];

  return (
    <GlassPanel intensity={advanced.glassIntensity} style={[styles.panel, { backgroundColor: `${colors.surface}E8`, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.foreground }]}>Network diagnostics</Text>
        <Pressable onPress={() => void runPing()} disabled={pinging} style={({ pressed }) => [styles.refreshButton, { borderColor: colors.border, backgroundColor: colors.background, opacity: pinging ? 0.5 : pressed ? 0.7 : 1 }]}>
          <Text style={[styles.refreshText, { color: colors.primary }]}>{pinging ? "Pinging…" : "Re-ping"}</Text>
        </Pressable>
      </View>
      <Text style={[styles.subtitle, { color: colors.muted }]}>Live readout of every layer of the network stack. If the app can&apos;t reach the backend, this panel shows you exactly which layer is broken.</Text>

      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>{section.title.toUpperCase()}</Text>
          {section.rows.map((row) => (
            <DiagRowView key={row.label} row={row} />
          ))}
        </View>
      ))}

      {ping && !ping.ok && ping.error ? (
        <View style={[styles.errorBox, { backgroundColor: `${colors.error}14`, borderColor: `${colors.error}44` }]}>
          <Text style={[styles.errorLabel, { color: colors.error }]}>Last ping error</Text>
          <Text style={[styles.errorText, { color: colors.foreground }]}>{ping.error}</Text>
        </View>
      ) : null}

      <View style={[styles.helpBox, { backgroundColor: `${colors.primary}0D`, borderColor: `${colors.primary}38` }]}>
        <Text style={[styles.helpTitle, { color: colors.foreground }]}>Common fixes</Text>
        <Text style={[styles.helpBody, { color: colors.muted }]}>• Backend URL wrong? In Settings, confirm the FastAPI URL matches your computer&apos;s LAN IP.{"\n"}• On a real phone? Use your computer&apos;s LAN IP (e.g. http://192.168.1.20:8000), not localhost or 10.0.2.2.{"\n"}• On iOS 14+? Approve the local-network permission prompt the first time the app tries to connect.{"\n"}• HTTPS URL? Self-hosted backends usually don&apos;t have a valid TLS cert — use http:// instead.{"\n"}• Web dev? Metro auto-proxies through /__proxy to bypass CORS — no action needed.</Text>
      </View>
    </GlassPanel>
  );
}

function DiagRowView({ row }: { row: DiagRow }) {
  const colors = useColors();
  const toneColor = row.tone === "good" ? colors.success : row.tone === "warning" ? colors.warning : row.tone === "error" ? colors.error : colors.muted;
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={[styles.rowDot, { backgroundColor: toneColor }]} />
        <View style={styles.rowCopy}>
          <Text style={[styles.rowLabel, { color: colors.muted }]}>{row.label}</Text>
          <Text style={[styles.rowValue, { color: colors.foreground }]}>{row.value}</Text>
          {row.hint ? <Text style={[styles.rowHint, { color: colors.muted }]}>{row.hint}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12, padding: 16 },
  headerRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  title: { fontSize: 16, fontWeight: "900" },
  subtitle: { fontSize: 11, lineHeight: 16 },
  refreshButton: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  refreshText: { fontSize: 11, fontWeight: "800" },
  section: { gap: 8, marginTop: 4 },
  sectionTitle: { fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  row: { flexDirection: "row", gap: 10, paddingHorizontal: 2, paddingVertical: 4 },
  rowLeft: { alignItems: "flex-start", flexDirection: "row", flex: 1, gap: 8 },
  rowDot: { borderRadius: 99, height: 8, marginTop: 6, width: 8 },
  rowCopy: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  rowValue: { fontSize: 12, fontWeight: "700" },
  rowHint: { fontSize: 10, lineHeight: 14 },
  errorBox: { borderRadius: 10, borderWidth: 1, gap: 4, padding: 10 },
  errorLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  errorText: { fontSize: 11, lineHeight: 16 },
  helpBox: { borderRadius: 10, borderWidth: 1, gap: 5, padding: 12 },
  helpTitle: { fontSize: 12, fontWeight: "900" },
  helpBody: { fontSize: 11, lineHeight: 17 },
});
