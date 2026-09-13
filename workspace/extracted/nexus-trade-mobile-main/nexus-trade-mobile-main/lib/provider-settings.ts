import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export { AI_PROVIDERS, MARKET_PROVIDERS, defaultProviderPreferences, maskSecret, keyCount, primaryKey, type ProviderConfig, type ProviderKind, type ProviderPreferences } from "@/lib/provider-catalog";
import { defaultProviderPreferences, type ProviderConfig, type ProviderPreferences } from "@/lib/provider-catalog";

const STORAGE_KEY = "nexus-trade.provider-settings.v2";
const LEGACY_STORAGE_KEY = "nexus-trade.provider-settings.v1";

/** Normalizes one stored provider entry into the current multi-key shape.
 * Handles three cases: already-current (`apiKeys: string[]`), the old
 * single-key shape (`apiKey: string`), and a partially-missing entry. */
function normalizeProvider(defaultItem: ProviderConfig, stored: unknown): ProviderConfig {
  const raw = (stored ?? {}) as Partial<ProviderConfig> & { apiKey?: string };
  let apiKeys: string[];
  if (Array.isArray(raw.apiKeys)) {
    apiKeys = raw.apiKeys.filter((k): k is string => typeof k === "string");
  } else if (typeof raw.apiKey === "string" && raw.apiKey) {
    apiKeys = [raw.apiKey]; // migrate legacy single-key field
  } else {
    apiKeys = [];
  }
  return { ...defaultItem, ...raw, apiKeys };
}

async function readRaw(key: string): Promise<string | null> {
  return Platform.OS === "web" ? await AsyncStorage.getItem(key) : await SecureStore.getItemAsync(key);
}

export async function loadProviderPreferences(): Promise<ProviderPreferences> {
  const defaults = defaultProviderPreferences();
  let raw = await readRaw(STORAGE_KEY);
  if (!raw) {
    // First run after the multi-key upgrade — migrate the old v1 store
    // (single apiKey per provider) into the new v2 shape if it exists.
    raw = await readRaw(LEGACY_STORAGE_KEY);
  }
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<{ ai: unknown[]; market: unknown[]; defaultAi: string; defaultMarket: string }>;
    const findStored = (list: unknown[] | undefined, id: string) => (list ?? []).find((p) => (p as { id?: string })?.id === id);
    return {
      ai: defaults.ai.map((item) => normalizeProvider(item, findStored(parsed.ai, item.id))),
      market: defaults.market.map((item) => normalizeProvider(item, findStored(parsed.market, item.id))),
      defaultAi: parsed.defaultAi ?? defaults.defaultAi,
      defaultMarket: parsed.defaultMarket ?? defaults.defaultMarket,
    };
  } catch {
    return defaults;
  }
}

export async function saveProviderPreferences(preferences: ProviderPreferences) {
  const serialized = JSON.stringify(preferences);
  if (Platform.OS === "web") await AsyncStorage.setItem(STORAGE_KEY, serialized);
  else await SecureStore.setItemAsync(STORAGE_KEY, serialized, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
