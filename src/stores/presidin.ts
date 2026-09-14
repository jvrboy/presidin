/**
 * PRESIDIN — UI state stores (Zustand)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Section =
  | "dashboard"
  | "signals"
  | "trading"
  | "journal"
  | "risk"
  | "chat"
  | "audio"
  | "notifications"
  | "settings";

interface UIState {
  section: Section;
  sidebarOpen: boolean;
  setSection: (s: Section) => void;
  toggleSidebar: () => void;
  setSidebar: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      section: "dashboard",
      sidebarOpen: true,
      setSection: (section) => set({ section, sidebarOpen: false }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebar: (sidebarOpen) => set({ sidebarOpen }),
    }),
    {
      name: "presidin-ui",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? localStorage : (undefined as any))),
      partialize: (s) => ({ section: s.section }) as UIState,
    }
  )
);

// ============================================================
// Account / Equity state
// ============================================================

interface AccountState {
  equity: number;
  balance: number;
  openPnl: number;
  currency: string;
  riskPerTrade: number;
  setEquity: (e: number) => void;
  setBalance: (b: number) => void;
  setOpenPnl: (p: number) => void;
  setRisk: (r: number) => void;
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set) => ({
      equity: 10000,
      balance: 10000,
      openPnl: 0,
      currency: "USD",
      riskPerTrade: 1.0,
      setEquity: (equity) => set({ equity }),
      setBalance: (balance) => set({ balance }),
      setOpenPnl: (openPnl) => set({ openPnl }),
      setRisk: (riskPerTrade) => set({ riskPerTrade }),
    }),
    {
      name: "presidin-account",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? localStorage : (undefined as any))),
    }
  )
);

// ============================================================
// Watchlist / active symbols
// ============================================================

interface WatchlistState {
  symbols: string[];
  activeSymbol: string;
  activeTimeframe: string;
  addSymbol: (s: string) => void;
  removeSymbol: (s: string) => void;
  setActiveSymbol: (s: string) => void;
  setActiveTimeframe: (tf: string) => void;
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set) => ({
      symbols: ["frxEURUSD", "frxGBPUSD", "frxUSDJPY", "frxXAUUSD", "frxUS30", "frxUS500", "R_100", "BOOM1000"],
      activeSymbol: "frxEURUSD",
      activeTimeframe: "15m",
      addSymbol: (sym) => set((s) => ({ symbols: Array.from(new Set([...s.symbols, sym])) })),
      removeSymbol: (sym) => set((s) => ({ symbols: s.symbols.filter((x) => x !== sym) })),
      setActiveSymbol: (activeSymbol) => set({ activeSymbol }),
      setActiveTimeframe: (activeTimeframe) => set({ activeTimeframe }),
    }),
    {
      name: "presidin-watchlist",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? localStorage : (undefined as any))),
    }
  )
);

// ============================================================
// Agent configuration
// ============================================================

import { AGENT_REGISTRY, DEFAULT_MASTER_CONFIG, type MasterAgentConfig } from "../lib/presidin/agents";

interface AgentConfigState {
  enabledAgents: string[];
  weights: Record<string, number>;
  minConfidence: number;
  rrRatio: number;
  setEnabled: (id: string, enabled: boolean) => void;
  setWeight: (id: string, weight: number) => void;
  setMinConfidence: (c: number) => void;
  setRRRatio: (r: number) => void;
  getConfig: (equity: number, risk: number) => MasterAgentConfig;
  reset: () => void;
}

export const useAgentConfigStore = create<AgentConfigState>()(
  persist(
    (set, get) => ({
      enabledAgents: DEFAULT_MASTER_CONFIG.enabledAgents,
      weights: DEFAULT_MASTER_CONFIG.weights,
      minConfidence: DEFAULT_MASTER_CONFIG.minConfidence,
      rrRatio: DEFAULT_MASTER_CONFIG.rrRatio,
      setEnabled: (id, enabled) =>
        set((s) => ({
          enabledAgents: enabled
            ? [...s.enabledAgents, id]
            : s.enabledAgents.filter((x) => x !== id),
        })),
      setWeight: (id, weight) =>
        set((s) => ({ weights: { ...s.weights, [id]: weight } })),
      setMinConfidence: (minConfidence) => set({ minConfidence }),
      setRRRatio: (rrRatio) => set({ rrRatio }),
      getConfig: (equity, risk) => {
        const s = get();
        return {
          enabledAgents: s.enabledAgents,
          weights: s.weights,
          minConfidence: s.minConfidence,
          rrRatio: s.rrRatio,
          riskPerTrade: risk,
          accountEquity: equity,
        };
      },
      reset: () =>
        set({
          enabledAgents: DEFAULT_MASTER_CONFIG.enabledAgents,
          weights: DEFAULT_MASTER_CONFIG.weights,
          minConfidence: DEFAULT_MASTER_CONFIG.minConfidence,
          rrRatio: DEFAULT_MASTER_CONFIG.rrRatio,
        }),
    }),
    {
      name: "presidin-agent-config",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? localStorage : (undefined as any))),
    }
  )
);

// ============================================================
// API keys / providers (BYOK)
// ============================================================

export interface ProviderKey {
  id: string;
  provider: string;
  label: string;
  apiKeyMasked: string; // we never store the raw key in localStorage beyond first 4 / last 4
  addedAt: number;
  enabled: boolean;
}

interface ProvidersState {
  keys: ProviderKey[];
  addKey: (provider: string, label: string, apiKey: string) => void;
  removeKey: (id: string) => void;
  toggleKey: (id: string, enabled: boolean) => void;
  derivToken?: string;
  setDerivToken: (t: string) => void;
  telegramBotToken?: string;
  telegramChatId?: string;
  setTelegram: (bot: string, chat: string) => void;
  discordWebhook?: string;
  setDiscord: (w: string) => void;
  // Custom OpenAI-compatible endpoint
  customOpenaiEndpoint?: string;
  customOpenaiKey?: string;
  customOpenaiModel?: string;
  setCustomOpenai: (endpoint: string, key: string, model: string) => void;
  // Custom Anthropic-compatible endpoint
  customAnthropicEndpoint?: string;
  customAnthropicKey?: string;
  customAnthropicModel?: string;
  setCustomAnthropic: (endpoint: string, key: string, model: string) => void;
  // Supabase
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  setSupabase: (url: string, anonKey: string) => void;
  // Active AI provider (default zai)
  activeProvider: string;
  activeModel?: string;
  setActiveProvider: (p: string, m?: string) => void;
  // Default model per provider
  providerModels: Record<string, string>;
  setProviderModel: (provider: string, model: string) => void;
}

function mask(key: string): string {
  if (key.length < 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export const useProvidersStore = create<ProvidersState>()(
  persist(
    (set) => ({
      keys: [],
      addKey: (provider, label, apiKey) =>
        set((s) => ({
          keys: [
            ...s.keys,
            {
              id: `key_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              provider, label,
              apiKeyMasked: mask(apiKey),
              addedAt: Date.now(),
              enabled: true,
            },
          ],
        })),
      removeKey: (id) => set((s) => ({ keys: s.keys.filter((k) => k.id !== id) })),
      toggleKey: (id, enabled) =>
        set((s) => ({ keys: s.keys.map((k) => (k.id === id ? { ...k, enabled } : k)) })),
      setDerivToken: (derivToken) => set({ derivToken }),
      setTelegram: (telegramBotToken, telegramChatId) => set({ telegramBotToken, telegramChatId }),
      setDiscord: (discordWebhook) => set({ discordWebhook }),
      setCustomOpenai: (customOpenaiEndpoint, customOpenaiKey, customOpenaiModel) =>
        set({ customOpenaiEndpoint, customOpenaiKey, customOpenaiModel }),
      setCustomAnthropic: (customAnthropicEndpoint, customAnthropicKey, customAnthropicModel) =>
        set({ customAnthropicEndpoint, customAnthropicKey, customAnthropicModel }),
      setSupabase: (supabaseUrl, supabaseAnonKey) => set({ supabaseUrl, supabaseAnonKey }),
      activeProvider: "zai",
      setActiveProvider: (activeProvider, activeModel) => set({ activeProvider, activeModel }),
      providerModels: {},
      setProviderModel: (provider, model) =>
        set((s) => ({ providerModels: { ...s.providerModels, [provider]: model } })),
    }),
    {
      name: "presidin-providers",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? localStorage : (undefined as any))),
    }
  )
);

// ============================================================
// Theme accent
// ============================================================

interface ThemeState {
  density: "comfortable" | "compact";
  reducedMotion: boolean;
  setDensity: (d: "comfortable" | "compact") => void;
  setReducedMotion: (r: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      density: "comfortable",
      reducedMotion: false,
      setDensity: (density) => set({ density }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
    }),
    {
      name: "presidin-theme",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? localStorage : (undefined as any))),
    }
  )
);

// ============================================================
// Signal Engine config (auto-signal + learning)
// ============================================================

interface EngineConfigState {
  enabled: boolean;
  intervalMs: number;
  symbols: string[];
  timeframes: string[];
  minConfidence: number;
  autoExecute: boolean;
  autoExecuteThreshold: number;
  learningEnabled: boolean;
  retrainIntervalHours: number;
  setConfig: (c: Partial<EngineConfigState>) => void;
  toggle: () => void;
}

export const useEngineConfigStore = create<EngineConfigState>()(
  persist(
    (set) => ({
      enabled: true,
      intervalMs: 60_000,
      symbols: ["frxEURUSD", "frxGBPUSD", "frxUSDJPY", "frxXAUUSD", "frxUS30", "frxUS500", "R_100", "BOOM1000"],
      timeframes: ["15m", "1h", "4h"],
      minConfidence: 60,
      autoExecute: false,
      autoExecuteThreshold: 85,
      learningEnabled: true,
      retrainIntervalHours: 6,
      setConfig: (c) => set((s) => ({ ...s, ...c })),
      toggle: () => set((s) => ({ enabled: !s.enabled })),
    }),
    {
      name: "presidin-engine",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? localStorage : (undefined as any))),
    }
  )
);
