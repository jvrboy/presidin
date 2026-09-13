import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, View, useColorScheme as useSystemColorScheme } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";

import { getThemePalette, ThemeNames, type ColorScheme, type ThemeName, type ThemeColorPalette } from "@/constants/theme";
import { FontNames, fontFamilyFor, type FontProfile } from "@/lib/font-catalog";

export type { FontProfile } from "@/lib/font-catalog";

const THEME_STORAGE_KEY = "nexus-trade.theme-preferences.v1";
export type SurfaceMode = "glass" | "liquid" | "solid";
export type DensityMode = "comfortable" | "compact" | "dense";
export type DashboardLayout = "focus" | "balanced" | "wide";
export type DashboardModules = { market: boolean; providers: boolean; strategies: boolean; activity: boolean; risk: boolean };

/** Per-screen alert thresholds for the in-app signal-strength alerting
 *  layer. When a fresh signal arrives whose `strength` is at or above
 *  the configured threshold, the app fires a local push notification
 *  (subject to the platform notification permission). */
export type SignalAlertMode = "off" | "all" | "high";
export type BiometricGate = "off" | "onLaunch" | "onForeground";

export type AdvancedPreferences = {
  surfaceMode: SurfaceMode;
  glassIntensity: number;
  density: DensityMode;
  reducedMotion: boolean;
  haptics: boolean;
  showAccountValues: boolean;
  dashboardLayout: DashboardLayout;
  refreshIntervalSeconds: number;
  dashboardModules: DashboardModules;
  // --- new advanced controls (this pass) ---
  /** Multiplier (0.5 - 2.0) applied to every UI animation duration.
   *  1.0 = default speed. Lower = snappier; higher = dreamier. */
  animationSpeed: number;
  /** Master toggle for the local-signal-strength push-notification
   *  layer (off / all / high-only). */
  signalAlertMode: SignalAlertMode;
  /** Numeric strength threshold (0-100) above which "high" alerts
   *  fire (only effective when signalAlertMode === "high"). */
  signalAlertThreshold: number;
  /** When non-null, the user's chosen custom accent color overrides
   *  the theme palette's `primary`. Stored as a hex string. */
  customAccent: string | null;
  /** When enabled, the app gates screen access behind a biometric /
   *  device-credential prompt at the chosen trigger point. */
  biometricGate: BiometricGate;
  /** When enabled, the AuroraVeil and other large surface gradients
   *  render at higher contrast — improves visibility on AMOLED but
   *  uses more battery. */
  highContrastSurfaces: boolean;
  /** When enabled, every long-running network request shows a
   *  top-of-screen latency indicator (avg / p95) — useful for
   *  diagnosing flaky backend connections. */
  showNetworkLatency: boolean;
};

const DEFAULT_ADVANCED_PREFERENCES: AdvancedPreferences = {
  surfaceMode: "liquid",
  glassIntensity: 22,
  density: "comfortable",
  reducedMotion: false,
  haptics: true,
  showAccountValues: true,
  dashboardLayout: "balanced",
  refreshIntervalSeconds: 30,
  dashboardModules: { market: true, providers: true, strategies: true, activity: true, risk: true },
  // New defaults: animation speed at 1.0 (default), signal alerts on
  // for high-strength only (≥80%), no custom accent, no biometric
  // gate, normal-contrast surfaces, network latency indicator shown.
  animationSpeed: 1.0,
  signalAlertMode: "high",
  signalAlertThreshold: 80,
  customAccent: null,
  biometricGate: "off",
  highContrastSurfaces: false,
  showNetworkLatency: true,
};

type ThemeContextValue = {
  colorScheme: ColorScheme;
  themeName: ThemeName;
  palette: ThemeColorPalette;
  setColorScheme: (scheme: ColorScheme) => void;
  setThemeName: (name: ThemeName) => void;
  fontProfile: FontProfile;
  setFontProfile: (profile: FontProfile) => void;
  advanced: AdvancedPreferences;
  updateAdvanced: (patch: Partial<Omit<AdvancedPreferences, "dashboardModules">> & { dashboardModules?: Partial<DashboardModules> }) => void;
  resetAdvanced: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme() ?? "light";
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(systemScheme);
  const [themeName, setThemeNameState] = useState<ThemeName>("nexus");
  const [fontProfile, setFontProfileState] = useState<FontProfile>("system");
  const [advanced, setAdvanced] = useState<AdvancedPreferences>(DEFAULT_ADVANCED_PREFERENCES);
  const palette = useMemo(() => getThemePalette(colorScheme, themeName) as ThemeColorPalette, [colorScheme, themeName]);

  const updateAdvanced = useCallback((patch: Partial<Omit<AdvancedPreferences, "dashboardModules">> & { dashboardModules?: Partial<DashboardModules> }) => {
    setAdvanced((current) => {
      const next = { ...current, ...patch, dashboardModules: patch.dashboardModules ? { ...current.dashboardModules, ...patch.dashboardModules } : current.dashboardModules };
      void AsyncStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ colorScheme, themeName, fontProfile, advanced: next }));
      return next;
    });
  }, [colorScheme, themeName, fontProfile]);

  const resetAdvanced = useCallback(() => {
    setAdvanced(DEFAULT_ADVANCED_PREFERENCES);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ colorScheme, themeName, fontProfile, advanced: DEFAULT_ADVANCED_PREFERENCES }));
  }, [colorScheme, themeName, fontProfile]);

  const applyTheme = useCallback((scheme: ColorScheme, name: ThemeName) => {
    const nextPalette = getThemePalette(scheme, name);
    nativewindColorScheme.set(scheme);
    Appearance.setColorScheme?.(scheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = scheme;
      root.dataset.colorTheme = name;
      root.classList.toggle("dark", scheme === "dark");
      Object.entries(nextPalette).forEach(([token, value]) => {
        if (typeof value === "string") root.style.setProperty(`--color-${token}`, value);
      });
      root.style.colorScheme = scheme;
    }
  }, []);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    applyTheme(scheme, themeName);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ colorScheme: scheme, themeName }));
  }, [applyTheme, themeName]);

  const setThemeName = useCallback((name: ThemeName) => {
    setThemeNameState(name);
    applyTheme(colorScheme, name);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ colorScheme, themeName: name }));
  }, [applyTheme, colorScheme]);

  const setFontProfile = useCallback((profile: FontProfile) => {
    setFontProfileState(profile);
    if (typeof document !== "undefined") document.documentElement.style.fontFamily = fontFamilyFor(profile);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ colorScheme, themeName, fontProfile: profile }));
  }, [colorScheme, themeName]);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (!stored) return;
      try {
        const parsed = JSON.parse(stored) as { colorScheme?: ColorScheme; themeName?: ThemeName; fontProfile?: FontProfile; advanced?: Partial<AdvancedPreferences> };
        if (parsed.colorScheme === "light" || parsed.colorScheme === "dark") setColorSchemeState(parsed.colorScheme);
        if (parsed.themeName && ThemeNames.includes(parsed.themeName as ThemeName)) setThemeNameState(parsed.themeName as ThemeName);
        if (parsed.fontProfile && FontNames.includes(parsed.fontProfile as FontProfile)) setFontProfileState(parsed.fontProfile as FontProfile);
        if (parsed.advanced) {
          // Defensive merge: only known keys make it through, and
          // nested `dashboardModules` is shallow-merged key-by-key so
          // a partial older preferences blob (missing newly-added
          // fields like `animationSpeed`) doesn't blow away the new
          // defaults — they fall back to the DEFAULT_ADVANCED_PREFERENCES
          // values instead.
          setAdvanced((current) => ({
            ...current,
            ...parsed.advanced as Partial<AdvancedPreferences>,
            dashboardModules: { ...current.dashboardModules, ...parsed.advanced?.dashboardModules },
          }));
        }
      } catch {
        // Ignore malformed local preferences and keep defaults.
      }
    });
  }, []);

  useEffect(() => {
    applyTheme(colorScheme, themeName);
  }, [applyTheme, colorScheme, themeName]);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.style.fontFamily = fontFamilyFor(fontProfile);
  }, [fontProfile]);

  const value = useMemo(() => ({ colorScheme, themeName, palette, setColorScheme, setThemeName, fontProfile, setFontProfile, advanced, updateAdvanced, resetAdvanced }), [colorScheme, themeName, palette, setColorScheme, setThemeName, fontProfile, setFontProfile, advanced, updateAdvanced, resetAdvanced]);

  return <ThemeContext.Provider value={value}><View style={[{ flex: 1 }, vars({ "color-primary": palette.primary, "color-background": palette.background, "color-surface": palette.surface, "color-foreground": palette.foreground, "color-muted": palette.muted, "color-border": palette.border, "color-success": palette.success, "color-warning": palette.warning, "color-error": palette.error })]}>{children}</View></ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used within ThemeProvider");
  return ctx;
}
