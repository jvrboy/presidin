import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";

import { ActionButton, EmptyState, SectionHeader, StatusPill, formatNumber } from "@/components/trading-ui";
import { GlassPanel, LiquidGlassOrb, PulseDot } from "@/components/glass-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTrading } from "@/lib/trading-context";
import {
  forexApi,
  type AnomalyEvent,
  type AnomalyStatus,
  type DecisionAuditRecord,
  type DeepNeuralStatus,
  type TuningTrial,
  type DriftCheckResult,
  type ExplainModelResult,
  type ModelSummaryEntry,
  type SentimentAverage,
  type ShadowCandidate,
} from "@/lib/forex-api";

type ExplainModel = "rl" | "neural" | "deep";
const EXPLAIN_MODELS: ExplainModel[] = ["rl", "neural", "deep"];
const SEVERITY_TONE: Record<string, "success" | "warning" | "error" | "neutral"> = {
  low: "success",
  normal: "success",
  moderate: "warning",
  high: "error",
  critical: "error",
};

/** Small reusable card wrapper matching the existing Panel visual language,
 * but with its own header row (title + trailing status/action) since this
 * screen packs many distinct sub-systems that each need their own label. */
function LearningCard({ title, icon, trailing, children }: { title: string; icon?: string; trailing?: React.ReactNode; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <GlassPanel style={[styles.card, { backgroundColor: `${colors.surface}E8`, borderColor: colors.border }]}>
      <LiquidGlassOrb size={80} color={colors.primary} />
      <View style={styles.cardInner}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{title}</Text>
          {trailing}
        </View>
        {children}
      </View>
    </GlassPanel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function Bar({ label, pct, tone }: { label: string; pct: number; tone: string }) {
  const colors = useColors();
  return (
    <View style={styles.barRow}>
      <Text style={[styles.barLabel, { color: colors.muted }]} numberOfLines={1}>{label}</Text>
      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.barFill, { width: `${Math.min(100, Math.max(2, pct))}%`, backgroundColor: tone }]} />
      </View>
      <Text style={[styles.barPct, { color: colors.muted }]}>{formatNumber(pct, 1)}%</Text>
    </View>
  );
}

export default function LearningScreen() {
  const colors = useColors();
  const { apiBaseUrl, connected } = useTrading();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deepNeural, setDeepNeural] = useState<DeepNeuralStatus | null>(null);
  const [models, setModels] = useState<ModelSummaryEntry[]>([]);
  const [drift, setDrift] = useState<DriftCheckResult | null>(null);
  const [anomalyStatus, setAnomalyStatus] = useState<AnomalyStatus | null>(null);
  const [anomalyEvents, setAnomalyEvents] = useState<AnomalyEvent[]>([]);
  const [shadow, setShadow] = useState<ShadowCandidate[]>([]);
  const [audit, setAudit] = useState<DecisionAuditRecord[]>([]);
  const [tuningTrials, setTuningTrials] = useState<TuningTrial[]>([]);
  const [tuningRunning, setTuningRunning] = useState(false);
  const [explainModel, setExplainModel] = useState<ExplainModel>("rl");
  const [explain, setExplain] = useState<ExplainModelResult | null>(null);
  const [sentimentSymbol, setSentimentSymbol] = useState("EURUSD");
  const [sentiment, setSentiment] = useState<SentimentAverage | null>(null);
  const [headlineDraft, setHeadlineDraft] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!connected) return;
    if (!silent) setLoading(true);
    try {
      const [dn, reg, driftRes, anomalies, sb, auditRes, tuningRes] = await Promise.all([
        forexApi.getDeepNeuralStatus(apiBaseUrl).catch(() => null),
        forexApi.getModelRegistry(apiBaseUrl).catch(() => null),
        forexApi.getDrift(apiBaseUrl).catch(() => null),
        forexApi.getAnomalies(apiBaseUrl, 20).catch(() => null),
        forexApi.getShadowScoreboard(apiBaseUrl, 100).catch(() => null),
        forexApi.getDecisionAudit(apiBaseUrl, undefined, 20).catch(() => null),
        forexApi.getTuningTrials(apiBaseUrl, undefined, 10).catch(() => null),
      ]);
      if (dn) setDeepNeural(dn);
      if (reg) setModels(reg.models);
      if (driftRes) setDrift(driftRes);
      if (anomalies) {
        setAnomalyStatus(anomalies.status);
        setAnomalyEvents(anomalies.events ?? []);
      }
      if (sb) setShadow(sb.candidates ?? []);
      if (auditRes) setAudit(auditRes.records ?? []);
      if (tuningRes) setTuningTrials(tuningRes.trials ?? []);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load learning-system status");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [apiBaseUrl, connected]);

  const loadExplain = useCallback(async (model: ExplainModel) => {
    if (!connected) return;
    try {
      const result = await forexApi.getModelExplanation(apiBaseUrl, model, 200);
      setExplain(result);
    } catch {
      setExplain({ ok: false, message: "Unable to load explainability data" });
    }
  }, [apiBaseUrl, connected]);

  const loadSentiment = useCallback(async (symbol: string) => {
    if (!connected || !symbol.trim()) return;
    try {
      const result = await forexApi.getSentiment(apiBaseUrl, symbol.trim().toUpperCase());
      setSentiment(result);
    } catch {
      setSentiment(null);
    }
  }, [apiBaseUrl, connected]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadExplain(explainModel); }, [explainModel, loadExplain]);
  useEffect(() => { void loadSentiment(sentimentSymbol); }, [sentimentSymbol, loadSentiment]);

  const haptic = async () => { if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

  const runAction = async (key: string, fn: () => Promise<unknown>) => {
    setBusyAction(key);
    await haptic();
    try {
      await fn();
      await load(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Action failed");
    } finally {
      setBusyAction(null);
    }
  };

  const runTuningSearch = async () => {
    setTuningRunning(true);
    await haptic();
    try {
      const result = await forexApi.runTuningSearch(apiBaseUrl, { model_name: "neural", n_trials: 10 });
      if (result.ok) {
        const trials = await forexApi.getTuningTrials(apiBaseUrl, undefined, 10).catch(() => null);
        if (trials) setTuningTrials(trials.trials ?? []);
      } else if (result.message) {
        setError(result.message);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Tuning search failed");
    } finally {
      setTuningRunning(false);
    }
  };

  const submitHeadline = async () => {
    if (!headlineDraft.trim()) return;
    await runAction("headline", async () => {
      await forexApi.submitSentimentHeadline(apiBaseUrl, { symbol: sentimentSymbol.trim().toUpperCase(), headline: headlineDraft.trim(), source: "manual" });
      setHeadlineDraft("");
      await loadSentiment(sentimentSymbol);
    });
  };

  const pausedSymbolEntries = useMemo(() => Object.entries(anomalyStatus?.paused_symbols ?? {}), [anomalyStatus]);
  const anyPaused = Boolean(anomalyStatus?.global_paused || pausedSymbolEntries.length);

  if (!connected) {
    return (
      <ScreenContainer edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <SectionHeader title="Learning System" subtitle="Model registry, drift, anomalies, shadow deployment" />
          <EmptyState title="Connect to load the learning system" body="Set the FastAPI URL in Settings to see model versions, drift, anomaly guard, shadow deployment, explainability and sentiment." icon="wifi.slash" />
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>SELF-IMPROVING SYSTEM</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Learning</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>How the bot&apos;s models are trained, checked, and kept honest.</Text>
          </View>
          <View style={styles.headerStatus}>
            <PulseDot size={10} color={anyPaused ? colors.error : colors.success} active />
            <StatusPill label={anyPaused ? "GUARD ACTIVE" : "NOMINAL"} tone={anyPaused ? "error" : "success"} />
          </View>
        </View>

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: `${colors.error}14`, borderColor: `${colors.error}44` }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        ) : null}

        {/* Deep neural network */}
        <LearningCard
          title="Deep Neural Net"
          trailing={<StatusPill label={deepNeural?.trained ? "TRAINED" : "WARMING UP"} tone={deepNeural?.trained ? "success" : "neutral"} />}
        >
          <Text style={[styles.cardCaption, { color: colors.muted }]}>{deepNeural?.architecture ?? "16 → 32 → 24 → 16 → 1, dropout 15%"}</Text>
          <View style={styles.statRow}>
            <Stat label="Samples" value={String(deepNeural?.samples ?? 0)} />
            <Stat label="Epochs" value={String(deepNeural?.epochs_trained ?? 0)} />
          </View>
          <ActionButton label="Retrain now" icon={"model.training" as never} variant="secondary" disabled={busyAction === "deep-train"} onPress={() => void runAction("deep-train", () => forexApi.trainDeepNeural(apiBaseUrl))} />
        </LearningCard>

        {/* Model registry */}
        <LearningCard title="Model Registry" trailing={<StatusPill label={`${models.length} MODELS`} tone="neutral" />}>
          {models.length ? (
            models.map((m) => (
              <View key={m.model_name} style={styles.registryRow}>
                <View style={styles.registryNameCol}>
                  <Text style={[styles.registryName, { color: colors.foreground }]}>{m.model_name}</Text>
                  <Text style={[styles.registryMeta, { color: colors.muted }]}>v{m.latest_version} latest · champion v{m.champion_version}</Text>
                </View>
                <Text style={[styles.registryAcc, { color: colors.primary }]}>{m.champion_val_accuracy != null ? `${formatNumber(m.champion_val_accuracy * 100, 1)}%` : "—"}</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.cardCaption, { color: colors.muted }]}>No versions recorded yet — models register a version each time they retrain.</Text>
          )}
        </LearningCard>

        {/* Drift monitor */}
        <LearningCard
          title="Drift Monitor"
          trailing={drift?.overall_severity ? <StatusPill label={drift.overall_severity.toUpperCase()} tone={SEVERITY_TONE[drift.overall_severity] ?? "neutral"} /> : undefined}
        >
          {drift?.ok ? (
            <>
              <View style={styles.statRow}>
                <Stat label="Max drift score" value={formatNumber(drift.max_drift_score ?? 0, 2)} />
                <Stat label="Retrain?" value={drift.retrain_recommended ? "Recommended" : "Not needed"} />
              </View>
              {(drift.features ?? []).slice(0, 5).map((f) => (
                <Bar key={f.feature} label={f.feature} pct={Math.min(100, f.drift_score * 25)} tone={f.severity === "critical" || f.severity === "high" ? colors.error : colors.primary} />
              ))}
            </>
          ) : (
            <Text style={[styles.cardCaption, { color: colors.muted }]}>{drift?.message ?? "Not enough live data yet to compare against the training baseline."}</Text>
          )}
          <ActionButton label="Run drift check" icon={"auto.graph" as never} variant="secondary" disabled={busyAction === "drift"} onPress={() => void runAction("drift", () => forexApi.getDrift(apiBaseUrl).then(setDrift))} />
        </LearningCard>

        {/* Anomaly guard */}
        <LearningCard
          title="Anomaly Guard"
          trailing={<StatusPill label={anyPaused ? "PAUSED" : "MONITORING"} tone={anyPaused ? "error" : "success"} />}
        >
          {anomalyStatus?.global_paused ? (
            <Text style={[styles.cardCaption, { color: colors.error }]}>Global pause active — resumes in {formatNumber(anomalyStatus.global_resume_in_sec, 0)}s.</Text>
          ) : null}
          {pausedSymbolEntries.length ? (
            pausedSymbolEntries.map(([sym, secs]) => (
              <Text key={sym} style={[styles.cardCaption, { color: colors.warning }]}>{sym} paused — {formatNumber(secs, 0)}s remaining</Text>
            ))
          ) : null}
          {!anyPaused ? <Text style={[styles.cardCaption, { color: colors.muted }]}>No active pauses. Rolling z-score scan runs every 2 minutes on all active symbols.</Text> : null}
          {anomalyEvents.length ? (
            <View style={styles.eventList}>
              {anomalyEvents.slice(0, 5).map((ev, i) => (
                <View key={ev.id ?? i} style={styles.eventRow}>
                  <View style={[styles.eventDot, { backgroundColor: ev.severity === "critical" ? colors.error : colors.warning }]} />
                  <Text style={[styles.eventText, { color: colors.muted }]} numberOfLines={1}>{ev.symbol} · {ev.kind} (z={formatNumber(ev.z_score, 1)})</Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.actionRow}>
            <ActionButton label="Pause 15m" icon="shield.fill" variant="danger" disabled={busyAction === "pause"} onPress={() => void runAction("pause", () => forexApi.pauseAnomalyGuard(apiBaseUrl, { minutes: 15 }))} />
            <ActionButton label="Resume all" icon="play.fill" variant="secondary" disabled={busyAction === "resume" || !anyPaused} onPress={() => void runAction("resume", () => forexApi.resumeAnomalyGuard(apiBaseUrl))} />
          </View>
        </LearningCard>

        {/* Shadow deployment */}
        <LearningCard title="Shadow Deployment" trailing={<StatusPill label={`${shadow.length} CANDIDATES`} tone="neutral" />}>
          {shadow.length ? (
            shadow.map((c) => (
              <View key={c.candidate_model} style={styles.registryRow}>
                <View style={styles.registryNameCol}>
                  <Text style={[styles.registryName, { color: colors.foreground }]}>{c.candidate_model}</Text>
                  <Text style={[styles.registryMeta, { color: colors.muted }]}>{c.n} resolved outcomes</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.registryAcc, { color: c.edge_vs_live > 0 ? colors.success : colors.error }]}>{c.edge_vs_live > 0 ? "+" : ""}{formatNumber(c.edge_vs_live * 100, 1)}%</Text>
                  {c.promotion_ready ? <Text style={{ color: colors.success, fontSize: 10, fontWeight: "800" }}>READY</Text> : null}
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.cardCaption, { color: colors.muted }]}>Candidates predict alongside the live model without affecting real trades. Results appear once outcomes resolve.</Text>
          )}
        </LearningCard>

        {/* Explainability */}
        <LearningCard title="Explainability">
          <View style={styles.filterScroll}>
            {EXPLAIN_MODELS.map((m) => {
              const active = explainModel === m;
              return (
                <Text
                  key={m}
                  onPress={() => setExplainModel(m)}
                  style={[styles.filterChip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border, color: active ? "#FFFFFF" : colors.muted }]}
                >
                  {m.toUpperCase()}
                </Text>
              );
            })}
          </View>
          {explain?.ok ? (
            <>
              <Text style={[styles.cardCaption, { color: colors.muted }]}>Top driver: {explain.top_driver ?? "—"} · {explain.samples_used} samples</Text>
              {(explain.ranked_features ?? []).slice(0, 6).map((f) => (
                <Bar key={f.feature} label={f.feature} pct={f.importance_pct} tone={colors.primary} />
              ))}
            </>
          ) : (
            <Text style={[styles.cardCaption, { color: colors.muted }]}>{explain?.message ?? "Not enough labelled outcomes yet."}</Text>
          )}
        </LearningCard>

        {/* Automated hyperparameter tuning — random search over real replay data */}
        <LearningCard title="Hyperparameter Tuning" trailing={<StatusPill label={tuningTrials.length ? `${tuningTrials.length} TRIALS` : "NO TRIALS"} tone="neutral" />}>
          {tuningTrials.length ? (
            tuningTrials.slice(0, 5).map((trial, i) => (
              <View key={trial.id ?? i} style={styles.registryRow}>
                <View style={styles.registryNameCol}>
                  <Text style={[styles.registryName, { color: colors.foreground }]}>
                    {trial.model_name} {trial.is_best ? "· BEST" : ""}
                  </Text>
                  <Text style={[styles.registryMeta, { color: colors.muted }]} numberOfLines={1}>
                    val_loss {formatNumber(trial.val_loss, 3)}
                  </Text>
                </View>
                <Text style={[styles.registryAcc, { color: colors.foreground }]}>{formatNumber((trial.val_accuracy ?? 0) * 100, 0)}%</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.cardCaption, { color: colors.muted }]}>No search run yet — random search trains throwaway MLPs on the real replay buffer; the best config is recorded, never auto-applied.</Text>
          )}
          <ActionButton label={tuningRunning ? "Searching…" : "Run search (10 trials)"} icon={"auto.graph" as never} variant="secondary" disabled={tuningRunning} onPress={() => void runTuningSearch()} />
        </LearningCard>

        {/* Sentiment */}
        {/* Immutable decision audit trail */}
        <LearningCard title="Decision Audit" trailing={<StatusPill label={`${audit.length} RECENT`} tone="neutral" />}>
          {audit.length ? (
            audit.slice(0, 6).map((record, i) => {
              const dirColor = record.final_signal?.toLowerCase().includes("buy") ? colors.success : record.final_signal?.toLowerCase().includes("sell") ? colors.error : colors.muted;
              return (
                <View key={record.id ?? record.signal_uid ?? i} style={styles.registryRow}>
                  <View style={styles.registryNameCol}>
                    <Text style={[styles.registryName, { color: colors.foreground }]}>{record.symbol} · {record.final_signal}</Text>
                    <Text style={[styles.registryMeta, { color: colors.muted }]} numberOfLines={1}>{record.created ?? "—"} · score {formatNumber(record.weighted_score, 2)}</Text>
                  </View>
                  <Text style={[styles.registryAcc, { color: dirColor }]}>{formatNumber((record.confidence ?? 0) * 100, 0)}%</Text>
                </View>
              );
            })
          ) : (
            <Text style={[styles.cardCaption, { color: colors.muted }]}>No decisions recorded yet — every signal decision (full opinion set, feature vector, model versions) is written here immutably as the bot runs.</Text>
          )}
        </LearningCard>

        <LearningCard title="Sentiment (NLP)">
          <TextInput
            value={sentimentSymbol}
            onChangeText={setSentimentSymbol}
            placeholder="Symbol e.g. EURUSD"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          {sentiment ? (
            <View style={styles.statRow}>
              <Stat label="Avg polarity" value={formatNumber(sentiment.avg_polarity, 2)} />
              <Stat label="Avg magnitude" value={formatNumber(sentiment.avg_magnitude, 2)} />
              <Stat label="Samples" value={String(sentiment.n)} />
            </View>
          ) : null}
          <TextInput
            value={headlineDraft}
            onChangeText={setHeadlineDraft}
            placeholder="Paste a headline to score its sentiment…"
            placeholderTextColor={colors.muted}
            multiline
            style={[styles.input, styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          <ActionButton label="Score headline" icon={"psychology" as never} variant="secondary" disabled={busyAction === "headline" || !headlineDraft.trim()} onPress={() => void submitHeadline()} />
        </LearningCard>

        <View style={[styles.infoCard, { backgroundColor: `${colors.primary}0D`, borderColor: `${colors.primary}38` }]}>
          <Text style={[styles.infoTitle, { color: colors.foreground }]}>Adapted, not bolted-on</Text>
          <Text style={[styles.infoBody, { color: colors.muted }]}>Every system here (registry, drift, anomaly guard, shadow deployment, explainability, sentiment, order-flow) runs inside the existing FastAPI + SQLite + numpy stack — no external ML services, message queues, or clusters required.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: "center", gap: 16, maxWidth: 1120, padding: 18, paddingBottom: 38, width: "100%" },
  header: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between" },
  headerCopy: { flex: 1 },
  headerStatus: { alignItems: "flex-end", flexDirection: "row", gap: 8 },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginBottom: 9 },
  title: { fontSize: 30, fontWeight: "900", letterSpacing: -1 },
  subtitle: { fontSize: 13, marginTop: 5 },
  errorBanner: { borderRadius: 14, borderWidth: 1, padding: 12 },
  errorText: { fontSize: 12, fontWeight: "700" },
  card: { borderRadius: 18, borderWidth: 1, padding: 16 },
  cardInner: { zIndex: 1, gap: 10 },
  cardHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  cardTitle: { fontSize: 15, fontWeight: "900" },
  cardCaption: { fontSize: 12, lineHeight: 17 },
  statRow: { flexDirection: "row", gap: 18 },
  statItem: { gap: 3 },
  statLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  statValue: { fontSize: 15, fontWeight: "800" },
  barRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  barLabel: { fontSize: 10, fontWeight: "700", width: 108 },
  barTrack: { borderRadius: 99, flex: 1, height: 6, overflow: "hidden" },
  barFill: { borderRadius: 99, height: "100%" },
  barPct: { fontSize: 10, fontWeight: "700", width: 40, textAlign: "right" },
  registryRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  registryNameCol: { flex: 1, gap: 2 },
  registryName: { fontSize: 13, fontWeight: "800" },
  registryMeta: { fontSize: 11 },
  registryAcc: { fontSize: 14, fontWeight: "900" },
  eventList: { gap: 6 },
  eventRow: { alignItems: "center", flexDirection: "row", gap: 7 },
  eventDot: { borderRadius: 3, height: 6, width: 6 },
  eventText: { flex: 1, fontSize: 11 },
  actionRow: { flexDirection: "row", gap: 10 },
  filterScroll: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  filterChip: { borderRadius: 10, borderWidth: 1, fontSize: 10, fontWeight: "900", overflow: "hidden", paddingHorizontal: 10, paddingVertical: 9 },
  input: { borderRadius: 12, borderWidth: 1, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10 },
  textArea: { minHeight: 64, textAlignVertical: "top" },
  infoCard: { borderRadius: 16, borderWidth: 1, gap: 5, padding: 14 },
  infoTitle: { fontSize: 13, fontWeight: "900" },
  infoBody: { fontSize: 11, lineHeight: 17 },
});
