import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

import { ActionButton, Panel, SectionHeader, StatusPill } from "@/components/trading-ui";
import { ScreenContainer } from "@/components/screen-container";
import { NetworkDiagnosticsPanel } from "@/components/network-diagnostics";
import { ICON_CATALOG, IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { DEFAULT_API_BASE_URL, forexApi, type BackendSettings, type CapabilityCatalog, type ProviderTestResult, type ProviderTelemetrySample, type ProviderUsageSnapshot, type ProviderKeysStatusSnapshot, type ProviderPoolStatus } from "@/lib/forex-api";
import { AI_PROVIDERS, MARKET_PROVIDERS, keyCount, loadProviderPreferences, maskSecret, primaryKey, saveProviderPreferences, type ProviderConfig, type ProviderPreferences } from "@/lib/provider-settings";
import { useThemeContext, type FontProfile } from "@/lib/theme-provider";
import { useTrading } from "@/lib/trading-context";
import { ThemeCatalog } from "@/constants/theme";
import { FONT_CATALOG } from "@/lib/font-catalog";

const THEME_OPTIONS = ThemeCatalog;

export default function SettingsScreen() {
  const colors = useColors();
  const { colorScheme, themeName, setColorScheme, setThemeName, fontProfile, setFontProfile, advanced, updateAdvanced, resetAdvanced } = useThemeContext();
  const { apiBaseUrl, draftApiBaseUrl, setDraftApiBaseUrl, saveApiBaseUrl, resetApiBaseUrl, connected, error, status, loading, refresh } = useTrading();
  const [saved, setSaved] = useState(false);
  const [providerSaved, setProviderSaved] = useState(false);
  const [providerTests, setProviderTests] = useState<Record<string, ProviderTestResult>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [usage, setUsage] = useState<ProviderUsageSnapshot | null>(null);
  const [healthInterval, setHealthInterval] = useState("300");
  const [healthLoading, setHealthLoading] = useState(false);
  const [history, setHistory] = useState<ProviderTelemetrySample[]>([]);
  const [latencyThreshold, setLatencyThreshold] = useState("1500");
  const [errorRateThreshold, setErrorRateThreshold] = useState("20");
  const [rangeHours, setRangeHours] = useState(24);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [analysisSymbol, setAnalysisSymbol] = useState("EURUSD");
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const seenNotificationIds = useRef<Set<number>>(new Set());
  const notificationPrimed = useRef(false);
  const pushRegistered = useRef(false);
  const alertSettingsLoaded = useRef(false);
  const [preferences, setPreferences] = useState<ProviderPreferences | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityCatalog | null>(null);
  const [keysStatus, setKeysStatus] = useState<ProviderKeysStatusSnapshot | null>(null);
  const [draftKeyText, setDraftKeyText] = useState<Record<string, string>>({});
  // Proactive rate-limit + proxy rotation drafts, keyed by provider id.
  // Both are OFF by default server-side (unlimited / direct connection);
  // these only take effect once explicitly saved per provider.
  const [rateLimitDraft, setRateLimitDraft] = useState<Record<string, string>>({});
  const [proxyListDraft, setProxyListDraft] = useState<Record<string, string[]>>({});
  const [proxyInputDraft, setProxyInputDraft] = useState<Record<string, string>>({});
  const [savingLimit, setSavingLimit] = useState<string | null>(null);
  const [savingProxies, setSavingProxies] = useState<string | null>(null);
  const backendSettings = status?.settings;

  // Learning-system + agent-weight settings are edited locally, then
  // pushed to the backend as a full SystemSettings PATCH-via-PUT (the
  // backend's /api/settings endpoint expects the entire model). We seed
  // the draft from the live backend snapshot the first time it arrives,
  // then let local edits win until the user explicitly saves.
  const [learningSettings, setLearningSettings] = useState<Partial<BackendSettings>>({});
  const [learningSettingsHydrated, setLearningSettingsHydrated] = useState(false);
  const [learningSaved, setLearningSaved] = useState(false);
  const [learningSaving, setLearningSaving] = useState(false);
  useEffect(() => {
    if (learningSettingsHydrated || !backendSettings) return;
    setLearningSettings({
      enable_deep_neural: backendSettings.enable_deep_neural,
      enable_drift_monitoring: backendSettings.enable_drift_monitoring,
      enable_anomaly_guard: backendSettings.enable_anomaly_guard,
      enable_shadow_deployment: backendSettings.enable_shadow_deployment,
      sentiment_enabled: backendSettings.sentiment_enabled,
      auto_retrain_on_drift: backendSettings.auto_retrain_on_drift,
      anomaly_pause_minutes: backendSettings.anomaly_pause_minutes,
      drift_check_interval_min: backendSettings.drift_check_interval_min,
      agent_weight_sentiment: backendSettings.agent_weight_sentiment,
      agent_weight_orderflow: backendSettings.agent_weight_orderflow,
    });
    setLearningSettingsHydrated(true);
  }, [backendSettings, learningSettingsHydrated]);

  const updateLearningSetting = <K extends keyof BackendSettings>(key: K, value: BackendSettings[K]) => {
    setLearningSettings((current) => ({ ...current, [key]: value }));
  };

  const saveLearningSettings = async () => {
    if (!connected || !backendSettings) return;
    if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLearningSaving(true);
    try {
      // Merge onto the FULL current backend settings snapshot — the
      // endpoint replaces the whole SystemSettings object, so omitted
      // fields would otherwise reset to their Pydantic defaults.
      await forexApi.updateSettings(apiBaseUrl, { ...backendSettings, ...learningSettings });
      await refresh(true);
      setLearningSaved(true);
      setTimeout(() => setLearningSaved(false), 1800);
    } catch {
      // Surface nothing destructive here — the connection banner and
      // existing error state already cover backend-unreachable cases.
    } finally {
      setLearningSaving(false);
    }
  };

  useEffect(() => { void loadProviderPreferences().then(setPreferences); }, []);
  useEffect(() => { if (connected) void forexApi.getCapabilities(apiBaseUrl).then(setCapabilities).catch(() => setCapabilities(null)); }, [apiBaseUrl, connected]);
  useEffect(() => {
    if (!connected) return;
    let active = true;
    const pollKeys = () => void forexApi.getProviderKeysStatus(apiBaseUrl).then((snapshot) => { if (active) setKeysStatus(snapshot); }).catch(() => { if (active) setKeysStatus(null); });
    pollKeys();
    const timer = setInterval(pollKeys, 20000);
    return () => { active = false; clearInterval(timer); };
  }, [apiBaseUrl, connected]);

  useEffect(() => {
    if (!connected) return;
    if (Platform.OS !== "web") void Notifications.requestPermissionsAsync();
    let active = true;
    const poll = async () => {
      try {
        const [usageSnapshot, historySnapshot, notificationSnapshot, alertSettings] = await Promise.all([forexApi.getProviderUsage(apiBaseUrl), forexApi.getProviderHistory(apiBaseUrl), forexApi.getProviderNotifications(apiBaseUrl), forexApi.getProviderAlertSettings(apiBaseUrl)]);
        if (!active) return;
        setUsage(usageSnapshot);
        setHistory(historySnapshot.samples);
        if (!alertSettingsLoaded.current) {
          setLatencyThreshold(String(alertSettings.latency_threshold_ms));
          setErrorRateThreshold(String(alertSettings.error_rate_threshold_pct));
          alertSettingsLoaded.current = true;
        }
        if (!pushRegistered.current && Platform.OS !== "web") {
          const permission = await Notifications.requestPermissionsAsync();
          if (permission.granted) {
            const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
            const pushToken = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
            await forexApi.registerPushToken(apiBaseUrl, pushToken.data, Platform.OS);
            pushRegistered.current = true;
          }
        }
        const fresh = notificationSnapshot.events.filter((event) => !seenNotificationIds.current.has(event.id));
        notificationSnapshot.events.forEach((event) => seenNotificationIds.current.add(event.id));
        if (notificationPrimed.current && Platform.OS !== "web") for (const event of fresh) void Notifications.scheduleNotificationAsync({ content: { title: "Nexus Trade provider alert", body: event.message, data: { providerEventId: event.id } }, trigger: null });
        notificationPrimed.current = true;
      } catch { /* backend connection state is shown by the main connection card */ }
    };
    void poll();
    const timer = setInterval(() => void poll(), 60000);
    return () => { active = false; clearInterval(timer); };
  }, [apiBaseUrl, connected]);

  const enabledAiCount = useMemo(() => preferences?.ai.filter((provider) => provider.enabled && keyCount(provider) > 0).length ?? 0, [preferences]);
  const enabledMarketCount = useMemo(() => preferences?.market.filter((provider) => provider.enabled && keyCount(provider) > 0).length ?? 0, [preferences]);
  const totalAiKeys = useMemo(() => preferences?.ai.reduce((sum, provider) => sum + keyCount(provider), 0) ?? 0, [preferences]);
  const totalMarketKeys = useMemo(() => preferences?.market.reduce((sum, provider) => sum + keyCount(provider), 0) ?? 0, [preferences]);
  const providerIds = useMemo(() => Array.from(new Set(history.map((sample) => sample.provider_id))), [history]);
  const chartHistory = useMemo(() => {
    const cutoff = Date.now() - rangeHours * 60 * 60 * 1000;
    const selected = selectedProviders.length ? selectedProviders : providerIds;
    return history.filter((sample) => selected.includes(sample.provider_id) && new Date(sample.ts.replace(" ", "T") + "Z").getTime() >= cutoff);
  }, [history, providerIds, rangeHours, selectedProviders]);

  const save = async () => {
    if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await saveApiBaseUrl();
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const saveProviders = async () => {
    if (!preferences) return;
    if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await saveProviderPreferences(preferences);
    if (connected) {
      // Push every provider's FULL key list to its own server-side pool
      // (unlimited keys, automatic failover) — this is the source of
      // truth the backend actually routes requests through.
      const keySets = [
        ...preferences.ai.map((provider) => ({ provider_id: provider.id, kind: "ai" as const, keys: provider.apiKeys })),
        ...preferences.market.map((provider) => ({ provider_id: provider.id, kind: "market" as const, keys: provider.apiKeys })),
      ].filter((entry) => entry.keys.length > 0);
      await Promise.all(keySets.map((entry) => forexApi.setProviderKeys(apiBaseUrl, entry).catch(() => null)));
      // Legacy single-key health registration — still used for latency/
      // error telemetry charts, kept in sync with the FIRST key per
      // provider so observability doesn't require a separate code path.
      const providers = [...preferences.ai.map((provider) => ({ ...provider, provider_id: provider.id, kind: "ai" as const, api_key: primaryKey(provider) })), ...preferences.market.map((provider) => ({ ...provider, provider_id: provider.id, kind: "market" as const, api_key: primaryKey(provider) }))];
      try { await forexApi.registerProviderHealth(apiBaseUrl, providers, Number(healthInterval) || 300, { latency_threshold_ms: Number(latencyThreshold) || 1500, error_rate_threshold_pct: Number(errorRateThreshold) || 20 }); } catch { /* health registration retries on the next save */ }
      try { setKeysStatus(await forexApi.getProviderKeysStatus(apiBaseUrl)); } catch { /* status refreshes on the next poll tick */ }
    }
    setProviderSaved(true);
    setTimeout(() => setProviderSaved(false), 1800);
  };

  const addProviderKeyDraft = (kind: "ai" | "market", id: string) => {
    const draft = (draftKeyText[id] ?? "").trim();
    if (!draft) return;
    setPreferences((current) => current ? { ...current, [kind]: current[kind].map((provider) => provider.id === id ? { ...provider, apiKeys: [...provider.apiKeys, draft] } : provider) } : current);
    setDraftKeyText((current) => ({ ...current, [id]: "" }));
  };

  const removeProviderKeyDraft = (kind: "ai" | "market", id: string, index: number) => {
    setPreferences((current) => current ? { ...current, [kind]: current[kind].map((provider) => provider.id === id ? { ...provider, apiKeys: provider.apiKeys.filter((_, i) => i !== index) } : provider) } : current);
  };

  const reset = () => {
    Alert.alert("Reset backend URL?", `Use the Android emulator default (${DEFAULT_API_BASE_URL})?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", onPress: () => void resetApiBaseUrl() },
    ]);
  };

  const updateProvider = (kind: "ai" | "market", id: string, patch: Partial<ProviderConfig>) => {
    setPreferences((current) => current ? { ...current, [kind]: current[kind].map((provider) => provider.id === id ? { ...provider, ...patch } : provider) } : current);
  };

  const setDefaultProvider = (kind: "ai" | "market", id: string) => {
    setPreferences((current) => current ? { ...current, [kind === "ai" ? "defaultAi" : "defaultMarket"]: id } : current);
  };

  const testProvider = async (kind: "ai" | "market", id: string) => {
    const config = preferences?.[kind].find((provider) => provider.id === id);
    const configuredKeys = config ? keyCount(config) : 0;
    setTestingProvider(id);
    try {
      // Save this provider's keys to its server-side pool first, then
      // test through the pool (rotates automatically if the FIRST key
      // happens to be unhealthy) rather than always testing only one
      // hardcoded key.
      if (configuredKeys > 0 && config) {
        await forexApi.setProviderKeys(apiBaseUrl, { provider_id: id, kind, keys: config.apiKeys }).catch(() => null);
        const result = await forexApi.testProviderPooled(apiBaseUrl, { provider_id: id, kind, base_url: config.baseUrl, model: config.model });
        setProviderTests((current) => ({ ...current, [id]: result }));
      } else {
        setProviderTests((current) => ({ ...current, [id]: { ok: false, provider_id: id, message: "Add at least one API key first" } }));
      }
    } catch (testError) {
      setProviderTests((current) => ({ ...current, [id]: { ok: false, provider_id: id, message: testError instanceof Error ? testError.message : "Connection test failed" } }));
    } finally {
      setTestingProvider(null);
      try { setKeysStatus(await forexApi.getProviderKeysStatus(apiBaseUrl)); } catch { /* status refreshes on the next poll tick */ }
    }
  };

  const saveProviderRateLimit = async (id: string) => {
    const raw = (rateLimitDraft[id] ?? "").trim();
    const maxPerWindow = raw === "" ? 0 : Math.max(0, Number(raw) || 0);
    setSavingLimit(id);
    try {
      const result = await forexApi.setProviderRateLimit(apiBaseUrl, { provider_id: id, max_per_window: maxPerWindow, window_sec: 60 });
      setKeysStatusForProvider(id, "rate_limit", result.rate_limit);
    } catch { /* surfaced via keysStatus not refreshing */ } finally {
      setSavingLimit(null);
    }
  };

  const addProxyDraft = (id: string) => {
    const draft = (proxyInputDraft[id] ?? "").trim();
    if (!draft) return;
    setProxyListDraft((current) => ({ ...current, [id]: [...(current[id] ?? []), draft] }));
    setProxyInputDraft((current) => ({ ...current, [id]: "" }));
  };

  const removeProxyDraft = (id: string, index: number) => {
    setProxyListDraft((current) => ({ ...current, [id]: (current[id] ?? []).filter((_, i) => i !== index) }));
  };

  const saveProviderProxies = async (id: string) => {
    setSavingProxies(id);
    try {
      const proxies = proxyListDraft[id] ?? [];
      const result = await forexApi.setProviderProxies(apiBaseUrl, { provider_id: id, proxies });
      setKeysStatusForProvider(id, "proxy_count", result.proxy_count);
    } catch { /* surfaced via keysStatus not refreshing */ } finally {
      setSavingProxies(null);
    }
  };

  // Optimistically patch the cached pool-status snapshot for one provider
  // right after a rate-limit/proxy save, so the UI reflects the change
  // immediately instead of waiting for the next poll tick.
  const setKeysStatusForProvider = (id: string, field: "rate_limit" | "proxy_count", value: unknown) => {
    setKeysStatus((current) => {
      if (!current) return current;
      const patchKind = (bucket: Record<string, ProviderPoolStatus>) =>
        bucket[id] ? { ...bucket, [id]: { ...bucket[id], [field]: value } } : bucket;
      return { ai: patchKind(current.ai), market: patchKind(current.market) };
    });
  };

  const filteredThemes = useMemo(() => THEME_OPTIONS.filter((option) => option.label.toLowerCase().includes(catalogQuery.toLowerCase()) || option.id.toLowerCase().includes(catalogQuery.toLowerCase())), [catalogQuery]);
  const filteredFonts = useMemo(() => FONT_CATALOG.filter(([profile, label]) => profile.toLowerCase().includes(catalogQuery.toLowerCase()) || label.toLowerCase().includes(catalogQuery.toLowerCase())), [catalogQuery]);

  const runAnalysis = async () => {
    if (!connected || !selectedToolId) return;
    setAnalysisLoading(true);
    setAnalysisMessage(null);
    try {
      const result = await forexApi.runAnalysis(apiBaseUrl, { tool_id: selectedToolId, symbol: analysisSymbol.trim().toUpperCase(), timeframe: backendSettings?.primary_timeframe ?? "H1" });
      setAnalysisMessage(result.summary ?? `${result.tool_id} completed with ${Math.round((result.confidence ?? 0) * 100)}% confidence.`);
    } catch (analysisError) {
      setAnalysisMessage(analysisError instanceof Error ? analysisError.message : "Analysis request failed");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const refreshUsage = async (checkNow = false) => {
    if (!connected) return;
    setHealthLoading(true);
    try {
      if (checkNow) await forexApi.checkProvidersNow(apiBaseUrl);
      const [nextUsage, nextHistory] = await Promise.all([forexApi.getProviderUsage(apiBaseUrl), forexApi.getProviderHistory(apiBaseUrl)]);
      setUsage(nextUsage);
      setHistory(nextHistory.samples);
    } finally {
      setHealthLoading(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>CONTROL PLANE</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>Tune the look, data sources, and AI routing.</Text>
            </View>
            <StatusPill label={connected ? "ONLINE" : "OFFLINE"} tone={connected ? "success" : "warning"} icon={connected ? "wifi" : "wifi.slash"} />
          </View>

          <Panel>
            <SectionHeader title="Appearance" subtitle="Personalize the command center on every platform." />
            <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
              <View style={styles.rowCopy}><Text style={[styles.settingLabel, { color: colors.foreground }]}>Dark mode</Text><Text style={[styles.helper, { color: colors.muted }]}>Use a low-glare trading palette</Text></View>
              <Switch value={colorScheme === "dark"} onValueChange={(value) => setColorScheme(value ? "dark" : "light")} trackColor={{ false: colors.border, true: `${colors.primary}80` }} thumbColor={colorScheme === "dark" ? colors.primary : colors.muted} />
            </View>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>CATALOG SEARCH</Text>
            <TextInput value={catalogQuery} onChangeText={setCatalogQuery} placeholder="Search themes, fonts, or styles" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 14 }]}>COLOR THEME · {filteredThemes.length}/{THEME_OPTIONS.length}</Text>
            <View style={styles.themeGrid}>
              {filteredThemes.map((option) => {
                const selected = option.id === themeName;
                return <Pressable key={option.id} onPress={() => setThemeName(option.id)} style={({ pressed }) => [styles.themeChip, { backgroundColor: selected ? `${option.color}18` : colors.background, borderColor: selected ? option.color : colors.border, opacity: pressed ? 0.72 : 1 }]}><View style={[styles.themeDot, { backgroundColor: option.color }]} /><Text style={[styles.themeText, { color: selected ? option.color : colors.foreground }]}>{option.label}</Text>{selected ? <IconSymbol name="checkmark.circle.fill" size={15} color={option.color} /> : null}</Pressable>;
              })}
            </View>
            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 14 }]}>TYPE PROFILE</Text>
            <View style={styles.themeGrid}>{filteredFonts.map(([profile, label]) => <Pressable key={profile} onPress={() => setFontProfile(profile as FontProfile)} style={({ pressed }) => [styles.themeChip, { backgroundColor: fontProfile === profile ? `${colors.primary}18` : colors.background, borderColor: fontProfile === profile ? colors.primary : colors.border, opacity: pressed ? 0.72 : 1 }]}><Text style={[styles.themeText, { color: fontProfile === profile ? colors.primary : colors.foreground }]}>{label}</Text></Pressable>)}</View>
            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 14 }]}>ICON GALLERY · 25 NEW</Text><View style={styles.iconGrid}>{ICON_CATALOG.map((name) => <View key={name} style={[styles.iconTile, { backgroundColor: colors.background, borderColor: colors.border }]}><IconSymbol name={name as never} size={17} color={colors.primary} /><Text numberOfLines={1} style={[styles.iconLabel, { color: colors.muted }]}>{name}</Text></View>)}</View>
          </Panel>

          <Panel>
            <SectionHeader title="Advanced controls" subtitle="Tune surfaces, density, motion, and command-center modules." />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>SURFACE MODE</Text>
            <View style={styles.themeGrid}>{(["liquid", "glass", "solid"] as const).map((mode) => <Pressable key={mode} onPress={() => updateAdvanced({ surfaceMode: mode })} style={[styles.themeChip, { backgroundColor: advanced.surfaceMode === mode ? `${colors.primary}18` : colors.background, borderColor: advanced.surfaceMode === mode ? colors.primary : colors.border }]}><Text style={[styles.themeText, { color: advanced.surfaceMode === mode ? colors.primary : colors.foreground }]}>{mode.toUpperCase()}</Text></Pressable>)}</View>
            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 14 }]}>GLASS INTENSITY · {advanced.glassIntensity}</Text>
            <View style={styles.themeGrid}>{[8, 16, 22, 32, 44].map((intensity) => <Pressable key={intensity} onPress={() => updateAdvanced({ glassIntensity: intensity })} style={[styles.themeChip, { backgroundColor: advanced.glassIntensity === intensity ? `${colors.primary}18` : colors.background, borderColor: advanced.glassIntensity === intensity ? colors.primary : colors.border }]}><Text style={[styles.themeText, { color: advanced.glassIntensity === intensity ? colors.primary : colors.foreground }]}>{intensity}</Text></Pressable>)}</View>
            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 14 }]}>DASHBOARD LAYOUT</Text>
            <View style={styles.themeGrid}>{(["focus", "balanced", "wide"] as const).map((layout) => <Pressable key={layout} onPress={() => updateAdvanced({ dashboardLayout: layout })} style={[styles.themeChip, { backgroundColor: advanced.dashboardLayout === layout ? `${colors.primary}18` : colors.background, borderColor: advanced.dashboardLayout === layout ? colors.primary : colors.border }]}><Text style={[styles.themeText, { color: advanced.dashboardLayout === layout ? colors.primary : colors.foreground }]}>{layout}</Text></Pressable>)}</View>
            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 14 }]}>REFRESH CADENCE</Text>
            <View style={styles.themeGrid}>{[15, 30, 60, 120].map((seconds) => <Pressable key={seconds} onPress={() => updateAdvanced({ refreshIntervalSeconds: seconds })} style={[styles.themeChip, { backgroundColor: advanced.refreshIntervalSeconds === seconds ? `${colors.primary}18` : colors.background, borderColor: advanced.refreshIntervalSeconds === seconds ? colors.primary : colors.border }]}><Text style={[styles.themeText, { color: advanced.refreshIntervalSeconds === seconds ? colors.primary : colors.foreground }]}>{seconds}s</Text></Pressable>)}</View>
            <View style={styles.toggleRow}><View style={styles.rowCopy}><Text style={[styles.settingLabel, { color: colors.foreground }]}>Show account values</Text><Text style={[styles.helper, { color: colors.muted }]}>Keep balances visible in command center modules.</Text></View><Switch value={advanced.showAccountValues} onValueChange={(value) => updateAdvanced({ showAccountValues: value })} /></View>
            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 14 }]}>DENSITY</Text>
            <View style={styles.themeGrid}>{(["comfortable", "compact", "dense"] as const).map((density) => <Pressable key={density} onPress={() => updateAdvanced({ density })} style={[styles.themeChip, { backgroundColor: advanced.density === density ? `${colors.primary}18` : colors.background, borderColor: advanced.density === density ? colors.primary : colors.border }]}><Text style={[styles.themeText, { color: advanced.density === density ? colors.primary : colors.foreground }]}>{density}</Text></Pressable>)}</View>
            <View style={styles.toggleRow}><View style={styles.rowCopy}><Text style={[styles.settingLabel, { color: colors.foreground }]}>Reduced motion</Text><Text style={[styles.helper, { color: colors.muted }]}>Prefer calmer transitions and fewer effects.</Text></View><Switch value={advanced.reducedMotion} onValueChange={(value) => updateAdvanced({ reducedMotion: value })} /></View>
            <View style={styles.toggleRow}><View style={styles.rowCopy}><Text style={[styles.settingLabel, { color: colors.foreground }]}>Haptic feedback</Text><Text style={[styles.helper, { color: colors.muted }]}>Confirm important actions with native feedback.</Text></View><Switch value={advanced.haptics} onValueChange={(value) => updateAdvanced({ haptics: value })} /></View>
            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 14 }]}>VISIBLE MODULES</Text>
            {(["market", "providers", "strategies", "activity", "risk"] as const).map((module) => <View key={module} style={styles.toggleRow}><Text style={[styles.settingLabel, { color: colors.foreground }]}>{module}</Text><Switch value={advanced.dashboardModules[module]} onValueChange={(value) => updateAdvanced({ dashboardModules: { [module]: value } })} /></View>)}
            <ActionButton label="Reset advanced controls" icon="arrow.clockwise" variant="secondary" onPress={resetAdvanced} />
          </Panel>

          <Panel>
            <SectionHeader title="Advanced behaviors" subtitle="New: motion tuning, signal alerts, biometric gate, network diagnostics." />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>ANIMATION SPEED · {advanced.animationSpeed.toFixed(2)}×</Text>
            <View style={styles.themeGrid}>{[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((speed) => <Pressable key={speed} onPress={() => updateAdvanced({ animationSpeed: speed })} style={[styles.themeChip, { backgroundColor: advanced.animationSpeed === speed ? `${colors.primary}18` : colors.background, borderColor: advanced.animationSpeed === speed ? colors.primary : colors.border }]}><Text style={[styles.themeText, { color: advanced.animationSpeed === speed ? colors.primary : colors.foreground }]}>{speed}×</Text></Pressable>)}</View>
            <Text style={[styles.helper, { color: colors.muted }]}>Multiplies every UI animation duration. Lower = snappier, higher = dreamier.</Text>

            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 14 }]}>SIGNAL ALERTS</Text>
            <View style={styles.themeGrid}>{(["off", "all", "high"] as const).map((mode) => <Pressable key={mode} onPress={() => updateAdvanced({ signalAlertMode: mode })} style={[styles.themeChip, { backgroundColor: advanced.signalAlertMode === mode ? `${colors.primary}18` : colors.background, borderColor: advanced.signalAlertMode === mode ? colors.primary : colors.border }]}><Text style={[styles.themeText, { color: advanced.signalAlertMode === mode ? colors.primary : colors.foreground }]}>{mode.toUpperCase()}</Text></Pressable>)}</View>
            {advanced.signalAlertMode === "high" ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 12 }]}>STRENGTH THRESHOLD · {advanced.signalAlertThreshold}%</Text>
                <View style={styles.themeGrid}>{[60, 70, 80, 90, 95].map((threshold) => <Pressable key={threshold} onPress={() => updateAdvanced({ signalAlertThreshold: threshold })} style={[styles.themeChip, { backgroundColor: advanced.signalAlertThreshold === threshold ? `${colors.primary}18` : colors.background, borderColor: advanced.signalAlertThreshold === threshold ? colors.primary : colors.border }]}><Text style={[styles.themeText, { color: advanced.signalAlertThreshold === threshold ? colors.primary : colors.foreground }]}>{threshold}%</Text></Pressable>)}</View>
              </>
            ) : null}
            <Text style={[styles.helper, { color: colors.muted }]}>Fires a local push notification when a new signal meets the threshold (mobile only).</Text>

            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 14 }]}>BIOMETRIC GATE</Text>
            <View style={styles.themeGrid}>{(["off", "onLaunch", "onForeground"] as const).map((mode) => <Pressable key={mode} onPress={() => updateAdvanced({ biometricGate: mode })} style={[styles.themeChip, { backgroundColor: advanced.biometricGate === mode ? `${colors.primary}18` : colors.background, borderColor: advanced.biometricGate === mode ? colors.primary : colors.border }]}><Text style={[styles.themeText, { color: advanced.biometricGate === mode ? colors.primary : colors.foreground }]}>{mode.toUpperCase()}</Text></Pressable>)}</View>
            <Text style={[styles.helper, { color: colors.muted }]}>Gates screen access behind a biometric / device-credential prompt. (Settings tab is always accessible.)</Text>

            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 14 }]}>CUSTOM ACCENT</Text>
            <View style={styles.themeGrid}>
              <Pressable onPress={() => updateAdvanced({ customAccent: null })} style={[styles.themeChip, { backgroundColor: advanced.customAccent === null ? `${colors.primary}18` : colors.background, borderColor: advanced.customAccent === null ? colors.primary : colors.border }]}><Text style={[styles.themeText, { color: advanced.customAccent === null ? colors.primary : colors.foreground }]}>DEFAULT</Text></Pressable>
              {["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4"].map((hex) => <Pressable key={hex} onPress={() => updateAdvanced({ customAccent: hex })} style={[styles.themeChip, { backgroundColor: advanced.customAccent === hex ? `${hex}18` : colors.background, borderColor: advanced.customAccent === hex ? hex : colors.border }]}><View style={[styles.themeDot, { backgroundColor: hex }]} /><Text style={[styles.themeText, { color: advanced.customAccent === hex ? hex : colors.foreground }]}>{hex.replace("#", "").toUpperCase()}</Text></Pressable>)}
            </View>
            <Text style={[styles.helper, { color: colors.muted }]}>Overrides the theme&apos;s primary color across the entire app.</Text>

            <View style={styles.toggleRow}><View style={styles.rowCopy}><Text style={[styles.settingLabel, { color: colors.foreground }]}>High-contrast surfaces</Text><Text style={[styles.helper, { color: colors.muted }]}>Stronger gradients — better on AMOLED, slightly more battery.</Text></View><Switch value={advanced.highContrastSurfaces} onValueChange={(value) => updateAdvanced({ highContrastSurfaces: value })} trackColor={{ false: colors.border, true: `${colors.primary}80` }} thumbColor={advanced.highContrastSurfaces ? colors.primary : colors.muted} /></View>
            <View style={styles.toggleRow}><View style={styles.rowCopy}><Text style={[styles.settingLabel, { color: colors.foreground }]}>Network latency indicator</Text><Text style={[styles.helper, { color: colors.muted }]}>Show live avg / p95 latency in the command center.</Text></View><Switch value={advanced.showNetworkLatency} onValueChange={(value) => updateAdvanced({ showNetworkLatency: value })} trackColor={{ false: colors.border, true: `${colors.primary}80` }} thumbColor={advanced.showNetworkLatency ? colors.primary : colors.muted} /></View>
          </Panel>

          <Panel>
            <SectionHeader title="Advanced analysis stack" subtitle={capabilities ? `${capabilities.count} backend capabilities detected` : "Connect to inspect analysis tools and strategy agents."} />
            {capabilities ? <><Text style={[styles.helper, { color: colors.muted }]}>Analysis tools</Text><View style={styles.capabilityGrid}>{capabilities.analysis_tools.map((tool) => <Pressable key={tool.id} onPress={() => setSelectedToolId(tool.id)} style={[styles.capabilityChip, { backgroundColor: selectedToolId === tool.id ? `${colors.primary}18` : colors.background, borderColor: selectedToolId === tool.id ? colors.primary : colors.border }]}><IconSymbol name={"insights" as never} size={14} color={colors.primary} /><Text style={[styles.capabilityText, { color: colors.foreground }]}>{tool.label}</Text></Pressable>)}</View><Text style={[styles.helper, { color: colors.muted, marginTop: 10 }]}>Strategy agents</Text><View style={styles.capabilityGrid}>{capabilities.strategy_agents.map((agent) => <View key={agent.id} style={[styles.capabilityChip, { backgroundColor: colors.background, borderColor: colors.border }]}><IconSymbol name={"hub" as never} size={14} color={colors.success} /><Text style={[styles.capabilityText, { color: colors.foreground }]}>{agent.label}</Text></View>)}</View><TextInput value={analysisSymbol} onChangeText={setAnalysisSymbol} autoCapitalize="characters" placeholder="Symbol · EURUSD" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, marginTop: 12 }]} /><ActionButton label={analysisLoading ? "Running analysis…" : selectedToolId ? `Run ${selectedToolId}` : "Select an analysis tool"} icon="shield.fill" variant="primary" disabled={!selectedToolId || !connected || analysisLoading} onPress={() => void runAnalysis()} />{analysisMessage ? <Text style={[styles.helper, { color: colors.primary }]}>{analysisMessage}</Text> : null}</> : <Text style={[styles.helper, { color: colors.muted }]}>Connect the backend to discover SMC, ensemble, multi-timeframe, correlation, risk, RL, and execution analysis tools.</Text>}
          </Panel>

          <Panel>
            <SectionHeader title="Backend connection" subtitle="The app stores only this URL on the device." />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>FASTAPI BASE URL</Text>
            <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={setDraftApiBaseUrl} placeholder="http://10.0.2.2:8000" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} value={draftApiBaseUrl} />
            <Text style={[styles.helper, { color: colors.muted }]}>Android emulator: use 10.0.2.2. Physical phone or Windows/web: use your computer&apos;s LAN IP shown when the backend starts (e.g. http://192.168.1.20:8000) — same Wi-Fi network required. Same device as the backend: use http://127.0.0.1:8000. Plain http:// is fine; the app explicitly allows insecure local connections.</Text>
            <View style={styles.actionRow}><View style={styles.flexButton}><ActionButton label={saved ? "Saved" : "Save & connect"} icon="link" variant="primary" onPress={() => void save()} /></View><Pressable onPress={reset} style={({ pressed }) => [styles.resetButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={[styles.resetText, { color: colors.muted }]}>Reset</Text></Pressable></View>
            {error ? <Text style={[styles.connectionError, { color: colors.warning }]}>{error}</Text> : <Text style={[styles.connectionStatus, { color: connected ? colors.success : colors.muted }]}>{connected ? `Connected to ${apiBaseUrl}` : "Not connected yet"}</Text>}
          </Panel>

          <NetworkDiagnosticsPanel baseUrl={apiBaseUrl} connected={connected} />

          <ProviderSection kind="ai" title="AI providers" subtitle={`${enabledAiCount} configured · ${totalAiKeys} total keys (unlimited per provider) · priority 1 is tried first`} providers={AI_PROVIDERS} configs={preferences?.ai ?? []} defaultId={preferences?.defaultAi ?? "gemini"} onChange={(id, patch) => updateProvider("ai", id, patch)} onDefault={(id) => setDefaultProvider("ai", id)} onTest={(id) => void testProvider("ai", id)} testResults={providerTests} testingProvider={testingProvider} colors={colors} poolStatus={keysStatus?.ai} draftKeyText={draftKeyText} onDraftKeyChange={(id, value) => setDraftKeyText((current) => ({ ...current, [id]: value }))} onAddKey={(id) => addProviderKeyDraft("ai", id)} onRemoveKey={(id, index) => removeProviderKeyDraft("ai", id, index)} rateLimitDraft={rateLimitDraft} onRateLimitDraftChange={(id, value) => setRateLimitDraft((current) => ({ ...current, [id]: value }))} onSaveRateLimit={(id) => void saveProviderRateLimit(id)} savingLimit={savingLimit} proxyListDraft={proxyListDraft} proxyInputDraft={proxyInputDraft} onProxyInputChange={(id, value) => setProxyInputDraft((current) => ({ ...current, [id]: value }))} onAddProxy={(id) => addProxyDraft(id)} onRemoveProxy={(id, index) => removeProxyDraft(id, index)} onSaveProxies={(id) => void saveProviderProxies(id)} savingProxies={savingProxies} />
          <ProviderSection kind="market" title="Forex & market-data providers" subtitle={`${enabledMarketCount} configured · ${totalMarketKeys} total keys (unlimited per provider) · priority 1 is tried first`} providers={MARKET_PROVIDERS} configs={preferences?.market ?? []} defaultId={preferences?.defaultMarket ?? "finnhub"} onChange={(id, patch) => updateProvider("market", id, patch)} onDefault={(id) => setDefaultProvider("market", id)} onTest={(id) => void testProvider("market", id)} testResults={providerTests} testingProvider={testingProvider} colors={colors} poolStatus={keysStatus?.market} draftKeyText={draftKeyText} onDraftKeyChange={(id, value) => setDraftKeyText((current) => ({ ...current, [id]: value }))} onAddKey={(id) => addProviderKeyDraft("market", id)} onRemoveKey={(id, index) => removeProviderKeyDraft("market", id, index)} rateLimitDraft={rateLimitDraft} onRateLimitDraftChange={(id, value) => setRateLimitDraft((current) => ({ ...current, [id]: value }))} onSaveRateLimit={(id) => void saveProviderRateLimit(id)} savingLimit={savingLimit} proxyListDraft={proxyListDraft} proxyInputDraft={proxyInputDraft} onProxyInputChange={(id, value) => setProxyInputDraft((current) => ({ ...current, [id]: value }))} onAddProxy={(id) => addProxyDraft(id)} onRemoveProxy={(id, index) => removeProxyDraft(id, index)} onSaveProxies={(id) => void saveProviderProxies(id)} savingProxies={savingProxies} />
          <View style={styles.actionRow}><View style={styles.flexButton}><ActionButton label={providerSaved ? "Provider settings saved" : "Save provider settings"} icon="shield.fill" variant="primary" disabled={!preferences} onPress={() => void saveProviders()} /></View></View>
          <Text style={[styles.helper, { color: colors.muted }]}>AI and data-provider keys are not sent to GitHub or copied into the Nexus backend. Native devices use secure storage; Windows web uses browser-local storage. Provider adapters still need to be enabled in the backend before they can drive live analysis.</Text>
          <Panel>
            <SectionHeader title="Provider observability" subtitle="Session-only health checks and request telemetry." />
            <View style={styles.toggleRow}><View style={styles.rowCopy}><Text style={[styles.settingLabel, { color: colors.foreground }]}>Health-check interval</Text><Text style={[styles.helper, { color: colors.muted }]}>Minimum 60 seconds; keys remain in backend memory only.</Text></View><TextInput keyboardType="numeric" value={healthInterval} onChangeText={setHealthInterval} style={[styles.input, styles.intervalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} /></View>
            <View style={styles.thresholdRow}><View style={styles.thresholdField}><Text style={[styles.fieldLabel, { color: colors.muted }]}>LATENCY ALERT (MS)</Text><TextInput keyboardType="numeric" value={latencyThreshold} onChangeText={setLatencyThreshold} style={[styles.input, styles.compactInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} /></View><View style={styles.thresholdField}><Text style={[styles.fieldLabel, { color: colors.muted }]}>ERROR ALERT (%)</Text><TextInput keyboardType="numeric" value={errorRateThreshold} onChangeText={setErrorRateThreshold} style={[styles.input, styles.compactInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} /></View></View>
            <View style={styles.actionRow}><View style={styles.flexButton}><ActionButton label={healthLoading ? "Checking…" : "Refresh health"} icon="arrow.clockwise" variant="secondary" disabled={!connected || healthLoading} onPress={() => void refreshUsage(true)} /></View></View>
            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 14 }]}>CHART WINDOW</Text><View style={styles.themeGrid}>{[6, 24, 72, 168].map((hours) => <Pressable key={hours} onPress={() => setRangeHours(hours)} style={[styles.themeChip, { backgroundColor: rangeHours === hours ? `${colors.primary}18` : colors.background, borderColor: rangeHours === hours ? colors.primary : colors.border }]}><Text style={[styles.themeText, { color: rangeHours === hours ? colors.primary : colors.foreground }]}>{hours < 24 ? `${hours}h` : `${hours / 24}d`}</Text></Pressable>)}</View>
            {providerIds.length ? <><Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 12 }]}>COMPARE PROVIDERS</Text><View style={styles.themeGrid}>{providerIds.map((id) => { const active = !selectedProviders.length || selectedProviders.includes(id); return <Pressable key={id} onPress={() => setSelectedProviders((current) => { const base = current.length ? current : providerIds; const next = base.includes(id) ? base.filter((item) => item !== id) : [...base, id]; return next.length === providerIds.length ? [] : next; })} style={[styles.themeChip, { backgroundColor: active ? `${colors.primary}18` : colors.background, borderColor: active ? colors.primary : colors.border }]}><Text style={[styles.themeText, { color: active ? colors.primary : colors.muted }]}>{id.toUpperCase()}</Text></Pressable>; })}</View></> : null}
            {usage ? <View style={styles.usageGrid}>{usage.providers.map((item) => <View key={item.provider_id} style={[styles.usageCard, { backgroundColor: colors.background, borderColor: item.healthy === false ? `${colors.warning}70` : colors.border }]}><Text style={[styles.usageName, { color: colors.foreground }]}>{item.provider_id.toUpperCase()}</Text><Text style={[styles.usageHealth, { color: item.healthy === false ? colors.warning : item.healthy ? colors.success : colors.muted }]}>{item.healthy === false ? "DEGRADED" : item.healthy ? "HEALTHY" : "PENDING"}</Text><Text style={[styles.usageMeta, { color: colors.muted }]}>{item.requests} requests · {item.errors} errors</Text><Text style={[styles.usageMeta, { color: colors.muted }]}>{item.avg_latency_ms ? `${item.avg_latency_ms} ms avg` : "No latency yet"} · {item.health_checks} checks</Text>{item.last_error ? <Text numberOfLines={2} style={[styles.usageError, { color: colors.warning }]}>{item.last_error}</Text> : null}</View>)}</View> : <Text style={[styles.helper, { color: colors.muted }]}>Save provider settings to register enabled sources and view health history.</Text>}
            {chartHistory.length ? <View style={styles.chartStack}><View style={[styles.chartCard, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[styles.chartTitle, { color: colors.foreground }]}>Latency over time</Text><View style={styles.chartBars}>{chartHistory.slice(0, 24).reverse().map((sample) => <View key={`latency-${sample.id}`} style={[styles.chartBar, { height: Math.max(4, Math.min(68, (sample.latency_ms ?? 0) / 5)), backgroundColor: sample.ok ? colors.primary : `${colors.warning}90` }]} />)}</View><Text style={[styles.chartCaption, { color: colors.muted }]}>{chartHistory.length} samples · {rangeHours}h window · higher bars indicate slower responses</Text></View><View style={[styles.chartCard, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[styles.chartTitle, { color: colors.foreground }]}>Error rate</Text><View style={styles.chartBars}>{chartHistory.slice(0, 24).reverse().map((sample) => <View key={`error-${sample.id}`} style={[styles.chartBar, { height: sample.ok ? 4 : 58, backgroundColor: sample.ok ? `${colors.success}80` : colors.error }]} />)}</View><Text style={[styles.chartCaption, { color: colors.muted }]}>{chartHistory.filter((sample) => !sample.ok).length} failed samples in the selected providers and window</Text></View></View> : null}
          </Panel>

          <Panel>
            <SectionHeader title="Learning system" subtitle="Self-improving backend: deep net, drift monitor, anomaly guard, shadow deployment, sentiment." />
            <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}><View style={styles.rowCopy}><Text style={[styles.settingLabel, { color: colors.foreground }]}>Deep neural net</Text><Text style={[styles.helper, { color: colors.muted }]}>3rd, deeper MLP voter (shadow-evaluated before it&apos;s trusted).</Text></View><Switch value={learningSettings.enable_deep_neural ?? true} onValueChange={(value) => updateLearningSetting("enable_deep_neural", value)} trackColor={{ false: colors.border, true: `${colors.primary}80` }} thumbColor={(learningSettings.enable_deep_neural ?? true) ? colors.primary : colors.muted} /></View>
            <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}><View style={styles.rowCopy}><Text style={[styles.settingLabel, { color: colors.foreground }]}>Drift monitoring</Text><Text style={[styles.helper, { color: colors.muted }]}>Detects when live market data drifts from training data.</Text></View><Switch value={learningSettings.enable_drift_monitoring ?? true} onValueChange={(value) => updateLearningSetting("enable_drift_monitoring", value)} trackColor={{ false: colors.border, true: `${colors.primary}80` }} thumbColor={(learningSettings.enable_drift_monitoring ?? true) ? colors.primary : colors.muted} /></View>
            <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}><View style={styles.rowCopy}><Text style={[styles.settingLabel, { color: colors.foreground }]}>Auto-retrain on drift</Text><Text style={[styles.helper, { color: colors.muted }]}>Retrain RL/Neural/Deep automatically when drift is high or critical.</Text></View><Switch value={learningSettings.auto_retrain_on_drift ?? true} onValueChange={(value) => updateLearningSetting("auto_retrain_on_drift", value)} trackColor={{ false: colors.border, true: `${colors.primary}80` }} thumbColor={(learningSettings.auto_retrain_on_drift ?? true) ? colors.primary : colors.muted} /></View>
            <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}><View style={styles.rowCopy}><Text style={[styles.settingLabel, { color: colors.foreground }]}>Anomaly guard</Text><Text style={[styles.helper, { color: colors.muted }]}>Auto-pause trading on abnormal price/volatility spikes.</Text></View><Switch value={learningSettings.enable_anomaly_guard ?? true} onValueChange={(value) => updateLearningSetting("enable_anomaly_guard", value)} trackColor={{ false: colors.border, true: `${colors.primary}80` }} thumbColor={(learningSettings.enable_anomaly_guard ?? true) ? colors.primary : colors.muted} /></View>
            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 4 }]}>ANOMALY PAUSE DURATION</Text>
            <View style={styles.themeGrid}>{[5, 15, 30, 60].map((minutes) => <Pressable key={minutes} onPress={() => updateLearningSetting("anomaly_pause_minutes", minutes)} style={[styles.themeChip, { backgroundColor: (learningSettings.anomaly_pause_minutes ?? 15) === minutes ? `${colors.primary}18` : colors.background, borderColor: (learningSettings.anomaly_pause_minutes ?? 15) === minutes ? colors.primary : colors.border }]}><Text style={[styles.themeText, { color: (learningSettings.anomaly_pause_minutes ?? 15) === minutes ? colors.primary : colors.foreground }]}>{minutes}m</Text></Pressable>)}</View>
            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 14 }]}>DRIFT CHECK INTERVAL</Text>
            <View style={styles.themeGrid}>{[15, 30, 60, 120].map((minutes) => <Pressable key={minutes} onPress={() => updateLearningSetting("drift_check_interval_min", minutes)} style={[styles.themeChip, { backgroundColor: (learningSettings.drift_check_interval_min ?? 30) === minutes ? `${colors.primary}18` : colors.background, borderColor: (learningSettings.drift_check_interval_min ?? 30) === minutes ? colors.primary : colors.border }]}><Text style={[styles.themeText, { color: (learningSettings.drift_check_interval_min ?? 30) === minutes ? colors.primary : colors.foreground }]}>{minutes}m</Text></Pressable>)}</View>
            <View style={[styles.toggleRow, { borderBottomColor: colors.border, marginTop: 14 }]}><View style={styles.rowCopy}><Text style={[styles.settingLabel, { color: colors.foreground }]}>Shadow deployment</Text><Text style={[styles.helper, { color: colors.muted }]}>Candidate models predict alongside the live model, zero real-order impact.</Text></View><Switch value={learningSettings.enable_shadow_deployment ?? true} onValueChange={(value) => updateLearningSetting("enable_shadow_deployment", value)} trackColor={{ false: colors.border, true: `${colors.primary}80` }} thumbColor={(learningSettings.enable_shadow_deployment ?? true) ? colors.primary : colors.muted} /></View>
            <View style={styles.toggleRow}><View style={styles.rowCopy}><Text style={[styles.settingLabel, { color: colors.foreground }]}>Sentiment agent</Text><Text style={[styles.helper, { color: colors.muted }]}>Let lexicon-based NLP news/headline sentiment vote on signals.</Text></View><Switch value={learningSettings.sentiment_enabled ?? false} onValueChange={(value) => updateLearningSetting("sentiment_enabled", value)} trackColor={{ false: colors.border, true: `${colors.primary}80` }} thumbColor={(learningSettings.sentiment_enabled ?? false) ? colors.primary : colors.muted} /></View>
            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 14 }]}>SENTIMENT VOTE WEIGHT · {(learningSettings.agent_weight_sentiment ?? 0.6).toFixed(1)}</Text>
            <View style={styles.themeGrid}>{[0.2, 0.4, 0.6, 0.8, 1.0, 1.2].map((weight) => <Pressable key={weight} onPress={() => updateLearningSetting("agent_weight_sentiment", weight)} style={[styles.themeChip, { backgroundColor: (learningSettings.agent_weight_sentiment ?? 0.6) === weight ? `${colors.primary}18` : colors.background, borderColor: (learningSettings.agent_weight_sentiment ?? 0.6) === weight ? colors.primary : colors.border }]}><Text style={[styles.themeText, { color: (learningSettings.agent_weight_sentiment ?? 0.6) === weight ? colors.primary : colors.foreground }]}>{weight.toFixed(1)}</Text></Pressable>)}</View>
            <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 14 }]}>ORDER-FLOW VOTE WEIGHT · {(learningSettings.agent_weight_orderflow ?? 0.9).toFixed(1)}</Text>
            <View style={styles.themeGrid}>{[0.3, 0.6, 0.9, 1.2, 1.5].map((weight) => <Pressable key={weight} onPress={() => updateLearningSetting("agent_weight_orderflow", weight)} style={[styles.themeChip, { backgroundColor: (learningSettings.agent_weight_orderflow ?? 0.9) === weight ? `${colors.primary}18` : colors.background, borderColor: (learningSettings.agent_weight_orderflow ?? 0.9) === weight ? colors.primary : colors.border }]}><Text style={[styles.themeText, { color: (learningSettings.agent_weight_orderflow ?? 0.9) === weight ? colors.primary : colors.foreground }]}>{weight.toFixed(1)}</Text></Pressable>)}</View>
            <View style={styles.actionRow}><View style={styles.flexButton}><ActionButton label={learningSaving ? "Saving…" : learningSaved ? "Saved" : "Save learning settings"} icon={"model.training" as never} variant="primary" disabled={!connected || learningSaving} onPress={() => void saveLearningSettings()} /></View></View>
            <Text style={[styles.helper, { color: colors.muted }]}>Full detail — model versions, drift scores, anomaly events, shadow scoreboard, explainability, sentiment history — lives in the Learning tab.</Text>
          </Panel>

          <Panel>
            <SectionHeader title="Backend safety state" subtitle="Read-only snapshot from the source app" />
            <SettingRow label="MT5 bridge" value={backendSettings?.enable_mt5_bridge ? "Enabled" : "Unavailable / disabled"} tone={backendSettings?.enable_mt5_bridge ? "success" : "neutral"} />
            <SettingRow label="Live trading" value={backendSettings?.allow_live_trading ? "Allowed by backend" : "Analysis only"} tone={backendSettings?.allow_live_trading ? "warning" : "success"} />
            <SettingRow label="Agentic mode" value={backendSettings?.enable_agentic_mode ? "Enabled" : "Disabled"} tone={backendSettings?.enable_agentic_mode ? "warning" : "neutral"} />
            <SettingRow label="Risk mode" value={String(backendSettings?.risk_mode ?? "Unknown").toUpperCase()} tone="neutral" />
            <SettingRow label="Max risk / trade" value={backendSettings?.max_risk_per_trade_pct !== undefined ? `${backendSettings.max_risk_per_trade_pct}%` : "Unknown"} tone="neutral" />
            <Text style={[styles.helper, { color: colors.muted }]}>Broker credentials, AI keys, and live-trading permissions belong in the backend configuration. They are intentionally not copied into the app bundle.</Text>
          </Panel>

          <Panel>
            <SectionHeader title="App behavior" subtitle="Connection diagnostics" />
            <SettingRow label="Polling" value={backendSettings?.refresh_interval_sec ? `Every ${backendSettings.refresh_interval_sec}s` : "Every 8s"} tone="neutral" />
            <SettingRow label="Last known bot state" value={status?.bot_state?.toUpperCase() ?? "UNKNOWN"} tone={status?.bot_state === "running" ? "success" : "neutral"} />
            <View style={styles.actionRow}><View style={styles.flexButton}><ActionButton label="Refresh now" icon="arrow.clockwise" variant="secondary" disabled={loading} onPress={() => void refresh()} /></View></View>
          </Panel>

          <View style={[styles.notice, { backgroundColor: `${colors.warning}12`, borderColor: `${colors.warning}40` }]}><IconSymbol name="exclamationmark.triangle.fill" size={16} color={colors.warning} /><Text style={[styles.noticeText, { color: colors.muted }]}>Nexus Trade is educational software. Confirm the backend safety state before enabling any real-money execution.</Text></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function ProviderSection({ kind, title, subtitle, providers, configs, defaultId, onChange, onDefault, onTest, testResults, testingProvider, colors, poolStatus, draftKeyText, onDraftKeyChange, onAddKey, onRemoveKey, rateLimitDraft, onRateLimitDraftChange, onSaveRateLimit, savingLimit, proxyListDraft, proxyInputDraft, onProxyInputChange, onAddProxy, onRemoveProxy, onSaveProxies, savingProxies }: { kind: "ai" | "market"; title: string; subtitle: string; providers: readonly { id: string; label: string; baseUrl: string; placeholder: string; defaultModel?: string }[]; configs: ProviderConfig[]; defaultId: string; onChange: (id: string, patch: Partial<ProviderConfig>) => void; onDefault: (id: string) => void; onTest: (id: string) => void; testResults: Record<string, ProviderTestResult>; testingProvider: string | null; colors: ReturnType<typeof useColors>; poolStatus?: Record<string, ProviderPoolStatus>; draftKeyText: Record<string, string>; onDraftKeyChange: (id: string, value: string) => void; onAddKey: (id: string) => void; onRemoveKey: (id: string, index: number) => void; rateLimitDraft: Record<string, string>; onRateLimitDraftChange: (id: string, value: string) => void; onSaveRateLimit: (id: string) => void; savingLimit: string | null; proxyListDraft: Record<string, string[]>; proxyInputDraft: Record<string, string>; onProxyInputChange: (id: string, value: string) => void; onAddProxy: (id: string) => void; onRemoveProxy: (id: string, index: number) => void; onSaveProxies: (id: string) => void; savingProxies: string | null }) {
  return <Panel><SectionHeader title={title} subtitle={subtitle} />{providers.map((provider) => {
    const config = configs.find((item) => item.id === provider.id) ?? { id: provider.id, enabled: false, apiKeys: [], baseUrl: provider.baseUrl, model: provider.defaultModel ?? "", priority: 99 };
    const isDefault = defaultId === provider.id;
    const result = testResults[provider.id];
    const pool = poolStatus?.[provider.id];
    const configuredKeys = keyCount(config);
    return <View key={provider.id} style={[styles.providerCard, { backgroundColor: colors.background, borderColor: isDefault ? colors.primary : colors.border }]}>
      <View style={styles.providerHeader}>
        <View style={styles.providerCopy}>
          <Text style={[styles.providerLabel, { color: colors.foreground }]}>{provider.label}</Text>
          <Text style={[styles.providerMeta, { color: colors.muted }]}>{isDefault ? "Default route" : `Fallback priority ${config.priority}`} · {configuredKeys > 0 ? `${configuredKeys} key${configuredKeys === 1 ? "" : "s"} configured (unlimited allowed)` : "Not configured"}</Text>
        </View>
        <Switch value={config.enabled} onValueChange={(value) => onChange(provider.id, { enabled: value })} trackColor={{ false: colors.border, true: `${colors.primary}80` }} thumbColor={config.enabled ? colors.primary : colors.muted} />
      </View>

      {/* Configured keys list — unlimited keys per provider, each removable, each with its own live health chip once saved server-side. */}
      {config.apiKeys.length > 0 ? <View style={styles.keyList}>{config.apiKeys.map((key, index) => {
        const health = pool?.keys?.[index];
        const statusColor = health?.status === "parked" ? colors.error : health?.status === "cooldown" ? colors.warning : health?.status === "healthy" ? colors.success : colors.muted;
        const statusLabel = health ? health.status.toUpperCase() : "UNSAVED";
        return <View key={`${provider.id}-key-${index}`} style={[styles.keyRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.keyRowCopy}>
            <Text style={[styles.keyRowText, { color: colors.foreground }]}>{maskSecret(key)}</Text>
            <Text style={[styles.keyRowMeta, { color: statusColor }]}>{statusLabel}{health ? ` · ${health.requests} reqs · ${health.cooldown_sec > 0 ? `cools ${Math.round(health.cooldown_sec)}s` : "ready"}` : ""}</Text>
          </View>
          <Pressable onPress={() => onRemoveKey(provider.id, index)} style={({ pressed }) => [styles.keyRemoveButton, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
            <IconSymbol name="trash" size={13} color={colors.warning} />
          </Pressable>
        </View>;
      })}</View> : null}

      {/* Add another key — unlimited, automatic failover once >1 is configured. */}
      <View style={styles.compactRow}>
        <TextInput autoCapitalize="none" autoCorrect={false} secureTextEntry keyboardType="default" onChangeText={(value) => onDraftKeyChange(provider.id, value)} onSubmitEditing={() => onAddKey(provider.id)} placeholder={configuredKeys > 0 ? "Add another key (unlimited)" : provider.placeholder} placeholderTextColor={colors.muted} style={[styles.input, styles.providerInput, styles.flexField, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} value={draftKeyText[provider.id] ?? ""} />
        <Pressable onPress={() => onAddKey(provider.id)} style={({ pressed }) => [styles.keyAddButton, { borderColor: colors.primary, backgroundColor: `${colors.primary}12`, opacity: pressed ? 0.7 : 1 }]}>
          <IconSymbol name="plus" size={13} color={colors.primary} />
          <Text style={[styles.keyAddText, { color: colors.primary }]}>Add key</Text>
        </Pressable>
      </View>

      <View style={styles.compactRow}>
        <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={(value) => onChange(provider.id, { baseUrl: value })} placeholder="Provider base URL" placeholderTextColor={colors.muted} style={[styles.input, styles.providerInput, styles.flexField, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} value={config.baseUrl} />
        <TextInput keyboardType="numeric" onChangeText={(value) => onChange(provider.id, { priority: Math.max(1, Number(value) || 99) })} placeholder="Priority" placeholderTextColor={colors.muted} style={[styles.input, styles.priorityInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} value={String(config.priority)} />
      </View>
      {provider.defaultModel !== undefined ? <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={(value) => onChange(provider.id, { model: value })} placeholder={`Model (default ${provider.defaultModel || "custom"})`} placeholderTextColor={colors.muted} style={[styles.input, styles.providerInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} value={config.model ?? ""} /> : null}

      <View style={styles.providerActions}>
        <Pressable onPress={() => onTest(provider.id)} style={({ pressed }) => [styles.defaultButton, { borderColor: colors.primary, backgroundColor: `${colors.primary}12`, opacity: pressed || testingProvider === provider.id ? 0.65 : 1 }]}>
          <Text style={[styles.defaultButtonText, { color: colors.primary }]}>{testingProvider === provider.id ? "Testing…" : "Test connection"}</Text>
        </Pressable>
        <Pressable onPress={() => onDefault(provider.id)} style={({ pressed }) => [styles.defaultButton, { borderColor: isDefault ? colors.primary : colors.border, backgroundColor: isDefault ? `${colors.primary}12` : colors.surface, opacity: pressed ? 0.72 : 1 }]}>
          <Text style={[styles.defaultButtonText, { color: isDefault ? colors.primary : colors.muted }]}>{isDefault ? "Default provider" : "Make default"}</Text>
        </Pressable>
      </View>
      {pool ? <Text style={[styles.testResult, { color: pool.healthy_keys > 0 ? colors.success : colors.warning }]}>{pool.healthy_keys}/{pool.total_keys} keys healthy in the rotation pool</Text> : null}
      {result ? <Text style={[styles.testResult, { color: result.ok ? colors.success : colors.warning }]}>{result.ok ? `Connected · ${result.latency_ms ?? "?"} ms${result.key_used ? ` · via ${result.key_used}` : ""}` : result.message ?? result.error ?? "Connection failed"}{result.rate_limit?.remaining ? ` · ${result.rate_limit.remaining} requests remaining` : ""}</Text> : null}

      {/* Proactive per-key rate limit — caps requests BEFORE the provider
          ever returns 429, distinct from the reactive cooldown shown
          above. 0/empty = unlimited (server default, unchanged). */}
      <View style={[styles.limitBlock, { borderTopColor: colors.border }]}>
        <Text style={[styles.limitLabel, { color: colors.muted }]}>Rate limit (requests/min per key){pool?.rate_limit?.max_per_window ? ` · currently ${pool.rate_limit.max_per_window}/min` : " · currently unlimited"}</Text>
        <View style={styles.compactRow}>
          <TextInput keyboardType="numeric" onChangeText={(value) => onRateLimitDraftChange(provider.id, value)} placeholder="Unlimited" placeholderTextColor={colors.muted} style={[styles.input, styles.intervalInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} value={rateLimitDraft[provider.id] ?? ""} />
          <Pressable onPress={() => onSaveRateLimit(provider.id)} style={({ pressed }) => [styles.defaultButton, styles.flexButton, { borderColor: colors.primary, backgroundColor: `${colors.primary}12`, opacity: pressed || savingLimit === provider.id ? 0.65 : 1 }]}>
            <Text style={[styles.defaultButtonText, { color: colors.primary }]}>{savingLimit === provider.id ? "Saving…" : "Save limit"}</Text>
          </Pressable>
        </View>
      </View>

      {/* Optional outbound proxy rotation — round-robins alongside key
          rotation. Empty list = direct connection (server default). */}
      <View style={styles.limitBlock}>
        <Text style={[styles.limitLabel, { color: colors.muted }]}>Proxy rotation{pool?.proxy_count ? ` · ${pool.proxy_count} configured` : " · direct connection"}</Text>
        {(proxyListDraft[provider.id] ?? []).length > 0 ? <View style={styles.keyList}>{(proxyListDraft[provider.id] ?? []).map((proxyUrl, index) => (
          <View key={`${provider.id}-proxy-${index}`} style={[styles.keyRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.keyRowText, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{proxyUrl}</Text>
            <Pressable onPress={() => onRemoveProxy(provider.id, index)} style={({ pressed }) => [styles.keyRemoveButton, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
              <IconSymbol name="trash" size={13} color={colors.warning} />
            </Pressable>
          </View>
        ))}</View> : null}
        <View style={styles.compactRow}>
          <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={(value) => onProxyInputChange(provider.id, value)} onSubmitEditing={() => onAddProxy(provider.id)} placeholder="http://user:pass@host:port" placeholderTextColor={colors.muted} style={[styles.input, styles.providerInput, styles.flexField, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} value={proxyInputDraft[provider.id] ?? ""} />
          <Pressable onPress={() => onAddProxy(provider.id)} style={({ pressed }) => [styles.keyAddButton, { borderColor: colors.primary, backgroundColor: `${colors.primary}12`, opacity: pressed ? 0.7 : 1 }]}>
            <IconSymbol name="plus" size={13} color={colors.primary} />
          </Pressable>
        </View>
        <Pressable onPress={() => onSaveProxies(provider.id)} style={({ pressed }) => [styles.defaultButton, { borderColor: colors.primary, backgroundColor: `${colors.primary}12`, opacity: pressed || savingProxies === provider.id ? 0.65 : 1, marginTop: 6 }]}>
          <Text style={[styles.defaultButtonText, { color: colors.primary }]}>{savingProxies === provider.id ? "Saving…" : "Save proxies"}</Text>
        </Pressable>
      </View>
    </View>;
  })}</Panel>;
}

function SettingRow({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "neutral" }) {
  const colors = useColors();
  return <View style={[styles.settingRow, { borderBottomColor: colors.border }]}><Text style={[styles.settingLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.settingValue, { color: tone === "success" ? colors.success : tone === "warning" ? colors.warning : colors.foreground }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, content: { alignSelf: "center", gap: 18, maxWidth: 1120, padding: 18, paddingBottom: 38, width: "100%" }, header: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between" }, eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginBottom: 9 }, title: { fontSize: 30, fontWeight: "900", letterSpacing: -1 }, subtitle: { fontSize: 13, marginTop: 5 }, fieldLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 8 }, input: { borderRadius: 12, borderWidth: 1, fontFamily: "monospace", fontSize: 13, minHeight: 46, paddingHorizontal: 13 }, helper: { fontSize: 11, lineHeight: 17, marginTop: 10 }, actionRow: { alignItems: "center", flexDirection: "row", gap: 9, marginTop: 14 }, flexButton: { flex: 1 }, resetButton: { alignItems: "center", borderRadius: 12, borderWidth: 1, minHeight: 42, justifyContent: "center", paddingHorizontal: 16 }, resetText: { fontSize: 12, fontWeight: "800" }, connectionError: { fontSize: 11, lineHeight: 16, marginTop: 12 }, connectionStatus: { fontFamily: "monospace", fontSize: 10, marginTop: 12 }, toggleRow: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 14 }, rowCopy: { flex: 1, gap: 3 }, themeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, themeChip: { alignItems: "center", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 7, paddingHorizontal: 10, paddingVertical: 9 }, themeDot: { borderRadius: 99, height: 10, width: 10 }, themeText: { fontSize: 11, fontWeight: "800" }, iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 6 }, iconTile: { alignItems: "center", borderRadius: 10, borderWidth: 1, gap: 4, justifyContent: "center", minHeight: 58, padding: 7, width: 74 }, iconLabel: { fontSize: 8, maxWidth: 64, textAlign: "center" }, capabilityGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 7 }, capabilityChip: { alignItems: "center", borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 6, paddingHorizontal: 9, paddingVertical: 8 }, capabilityText: { fontSize: 10, fontWeight: "700" }, providerCard: { borderRadius: 15, borderWidth: 1, gap: 8, marginBottom: 10, padding: 12 }, providerHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, providerCopy: { flex: 1, gap: 3 }, providerLabel: { fontSize: 13, fontWeight: "900" }, providerMeta: { fontFamily: "monospace", fontSize: 10 }, compactRow: { alignItems: "center", flexDirection: "row", gap: 8 }, flexField: { flex: 1 }, priorityInput: { width: 78 }, providerInput: { minHeight: 40, fontSize: 11 }, providerActions: { flexDirection: "row", gap: 8 }, defaultButton: { alignItems: "center", borderRadius: 9, borderWidth: 1, flex: 1, minHeight: 34, justifyContent: "center" }, defaultButtonText: { fontSize: 10, fontWeight: "900" }, testResult: { fontFamily: "monospace", fontSize: 10 }, intervalInput: { minHeight: 40, width: 78 }, thresholdRow: { flexDirection: "row", gap: 10, marginTop: 12 }, thresholdField: { flex: 1 }, compactInput: { minHeight: 40, fontSize: 11 }, usageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 10 }, usageCard: { borderRadius: 14, borderWidth: 1, gap: 4, minWidth: 150, padding: 12, flexGrow: 1 }, usageName: { fontSize: 12, fontWeight: "900", letterSpacing: 1 }, usageHealth: { fontSize: 10, fontWeight: "900", letterSpacing: 1 }, usageMeta: { fontFamily: "monospace", fontSize: 10 }, usageError: { fontSize: 10, lineHeight: 14, marginTop: 5 }, chartStack: { gap: 10, marginTop: 10 }, chartCard: { borderRadius: 14, borderWidth: 1, padding: 12 }, chartTitle: { fontSize: 12, fontWeight: "900", marginBottom: 10 }, chartBars: { alignItems: "flex-end", flexDirection: "row", gap: 3, height: 72 }, chartBar: { borderRadius: 3, flex: 1, minWidth: 3 }, chartCaption: { fontSize: 10, lineHeight: 14, marginTop: 8 }, settingRow: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 42 }, settingLabel: { fontSize: 12 }, settingValue: { fontSize: 12, fontWeight: "800", maxWidth: "55%", textAlign: "right" }, notice: { alignItems: "flex-start", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, padding: 13 }, noticeText: { flex: 1, fontSize: 11, lineHeight: 17 },
  keyList: { gap: 6, marginTop: 4 },
  keyRow: { alignItems: "center", borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 8, minHeight: 34, paddingHorizontal: 9, paddingVertical: 6 },
  keyRowCopy: { flex: 1, gap: 1 },
  keyRowText: { fontFamily: "monospace", fontSize: 11, fontWeight: "700" },
  keyRowMeta: { fontSize: 9, fontWeight: "600", letterSpacing: 0.3 },
  keyRemoveButton: { alignItems: "center", borderRadius: 8, height: 26, justifyContent: "center", width: 26 },
  keyAddRow: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 4 },
  keyAddInput: { flex: 1, fontSize: 11, minHeight: 36 },
  keyAddButton: { alignItems: "center", borderRadius: 9, borderWidth: 1, height: 36, justifyContent: "center", width: 44 },
  keyAddText: { fontSize: 16, fontWeight: "900" },
  poolSummary: { fontSize: 9.5, fontWeight: "600", marginTop: 2 },
  limitBlock: { gap: 6, marginTop: 8, paddingTop: 8 },
  limitLabel: { fontSize: 9.5, fontWeight: "700", letterSpacing: 0.2 },
});
