import { Platform } from "react-native";

import themeConfig from "@/theme.config";

export type ColorScheme = "light" | "dark";
export type ThemeName = "nexus" | "midnight" | "ocean" | "ember" | "forest" | "aurora" | "cyberpunk" | "lavender" | "rose" | "solar" | "monochrome" | "neon" | "desert" | "arctic" | "volcanic" | "emerald" | "royal" | "plasma" | "carbon" | "coral" | "indigo" | "amber" | "teal" | "crimson" | "slate";

export const ThemeColors = themeConfig.themeColors;
export const ThemeNames: ThemeName[] = ["nexus", "midnight", "ocean", "ember", "forest", "aurora", "cyberpunk", "lavender", "rose", "solar", "monochrome", "neon", "desert", "arctic", "volcanic", "emerald", "royal", "plasma", "carbon", "coral", "indigo", "amber", "teal", "crimson", "slate"];
export const ThemeCatalog: Array<{ id: ThemeName; label: string; color: string }> = [
  ["nexus", "Nexus", "#3B82F6"], ["midnight", "Midnight", "#7C83FD"], ["ocean", "Ocean", "#0891B2"], ["ember", "Ember", "#EA580C"], ["forest", "Forest", "#15803D"],
  ["aurora", "Aurora", "#14B8A6"], ["cyberpunk", "Cyberpunk", "#E879F9"], ["lavender", "Lavender", "#8B5CF6"], ["rose", "Rose", "#E11D48"], ["solar", "Solar", "#F59E0B"],
  ["monochrome", "Mono", "#64748B"], ["neon", "Neon", "#22D3EE"], ["desert", "Desert", "#C2410C"], ["arctic", "Arctic", "#38BDF8"], ["volcanic", "Volcanic", "#DC2626"],
  ["emerald", "Emerald", "#10B981"], ["royal", "Royal", "#4F46E5"], ["plasma", "Plasma", "#D946EF"], ["carbon", "Carbon", "#94A3B8"], ["coral", "Coral", "#F97316"],
  ["indigo", "Indigo", "#6366F1"], ["amber", "Amber", "#D97706"], ["teal", "Teal", "#0D9488"], ["crimson", "Crimson", "#BE123C"], ["slate", "Slate", "#475569"],
].map(([id, label, color]) => ({ id: id as ThemeName, label, color }));

type SchemePalette = Record<ColorScheme, Record<keyof typeof ThemeColors, string>>;
type SchemePaletteItem = SchemePalette[ColorScheme];
function buildSchemePalette(colors: typeof ThemeColors): SchemePalette {
  const palette: SchemePalette = { light: {} as SchemePalette["light"], dark: {} as SchemePalette["dark"] };
  (Object.keys(colors) as Array<keyof typeof ThemeColors>).forEach((name) => { palette.light[name] = colors[name].light; palette.dark[name] = colors[name].dark; });
  return palette;
}
export const SchemeColors = buildSchemePalette(ThemeColors);

type Preset = { light: string; dark: string; backgroundLight: string; backgroundDark: string; surfaceLight: string; surfaceDark: string; borderLight: string; borderDark: string };
const p = (light: string, dark: string, backgroundLight: string, backgroundDark: string, surfaceLight: string, surfaceDark: string, borderLight: string, borderDark: string): Preset => ({ light, dark, backgroundLight, backgroundDark, surfaceLight, surfaceDark, borderLight, borderDark });
const PRESET_ACCENTS: Record<ThemeName, Preset> = {
  nexus: p("#3B82F6", "#6EA8FF", "#F5F7FB", "#070B12", "#FFFFFF", "#101722", "#E5E7EB", "#1F2B3D"),
  midnight: p("#7C83FD", "#A5B4FC", "#F5F5FF", "#0B0B17", "#FFFFFF", "#15152A", "#E3E3F5", "#29294A"),
  ocean: p("#0891B2", "#22D3EE", "#F0FDFA", "#06131A", "#FFFFFF", "#0C2029", "#CDEFEF", "#1A3D48"),
  ember: p("#EA580C", "#FB923C", "#FFF7ED", "#160C08", "#FFFFFF", "#25140D", "#F7D7B8", "#4B2A1A"),
  forest: p("#15803D", "#4ADE80", "#F0FDF4", "#07130B", "#FFFFFF", "#102219", "#CDE8D3", "#23462D"),
  aurora: p("#0F766E", "#2DD4BF", "#F0FDFA", "#061817", "#FFFFFF", "#0D2927", "#B7E4DF", "#1D4B47"),
  cyberpunk: p("#C026D3", "#F0ABFC", "#FDF4FF", "#16091A", "#FFFFFF", "#26112C", "#F0C5F5", "#572663"),
  lavender: p("#7C3AED", "#C4B5FD", "#F5F3FF", "#100A1F", "#FFFFFF", "#1D1233", "#DDD1FE", "#3E2A66"),
  rose: p("#E11D48", "#FB7185", "#FFF1F2", "#1A080D", "#FFFFFF", "#2A1018", "#F8C6D0", "#5C2634"),
  solar: p("#D97706", "#FBBF24", "#FFFBEB", "#181005", "#FFFFFF", "#2A1C08", "#F5D990", "#5D4314"),
  monochrome: p("#475569", "#CBD5E1", "#F8FAFC", "#0F172A", "#FFFFFF", "#1E293B", "#CBD5E1", "#475569"),
  neon: p("#0891B2", "#67E8F9", "#ECFEFF", "#03151A", "#FFFFFF", "#09282E", "#BCECF2", "#1B5660"),
  desert: p("#C2410C", "#FDBA74", "#FFF7ED", "#1B0E08", "#FFFFFF", "#2B180E", "#F6C4A7", "#63351F"),
  arctic: p("#0284C7", "#7DD3FC", "#F0F9FF", "#06131D", "#FFFFFF", "#0C2535", "#BBDFF3", "#24536B"),
  volcanic: p("#DC2626", "#F87171", "#FEF2F2", "#1A0707", "#FFFFFF", "#2C1010", "#F5BABA", "#632626"),
  emerald: p("#059669", "#34D399", "#ECFDF5", "#041711", "#FFFFFF", "#0A2920", "#B8E8D5", "#1D5844"),
  royal: p("#4F46E5", "#818CF8", "#EEF2FF", "#0A0B1E", "#FFFFFF", "#15183A", "#C7D0FE", "#303A77"),
  plasma: p("#C026D3", "#E879F9", "#FDF4FF", "#18091B", "#FFFFFF", "#2A112F", "#F0C5F5", "#5B2766"),
  carbon: p("#334155", "#94A3B8", "#F1F5F9", "#0B0F14", "#FFFFFF", "#18212B", "#CBD5E1", "#334155"),
  coral: p("#EA580C", "#FB7185", "#FFF7ED", "#1B0B0B", "#FFFFFF", "#2A1414", "#F6C8B5", "#633033"),
  indigo: p("#6366F1", "#A5B4FC", "#EEF2FF", "#0D0D20", "#FFFFFF", "#191936", "#C7D2FE", "#38386B"),
  amber: p("#B45309", "#FCD34D", "#FFFBEB", "#171004", "#FFFFFF", "#2A1D08", "#F6D98D", "#5A4314"),
  teal: p("#0D9488", "#5EEAD4", "#F0FDFA", "#041614", "#FFFFFF", "#0B2926", "#B5E7DF", "#1F554F"),
  crimson: p("#BE123C", "#FB7185", "#FFF1F2", "#19070D", "#FFFFFF", "#2B101A", "#F6C2CF", "#5D2636"),
  slate: p("#475569", "#94A3B8", "#F8FAFC", "#111827", "#FFFFFF", "#1F2937", "#CBD5E1", "#4B5563"),
};

type RuntimePalette = SchemePaletteItem & { text: string; background: string; tint: string; icon: string; tabIconDefault: string; tabIconSelected: string };
export function getThemePalette(scheme: ColorScheme, themeName: ThemeName = "nexus"): RuntimePalette {
  const base = SchemeColors[scheme];
  const preset = PRESET_ACCENTS[themeName] ?? PRESET_ACCENTS.nexus;
  const primary = scheme === "dark" ? preset.dark : preset.light;
  const background = scheme === "dark" ? preset.backgroundDark : preset.backgroundLight;
  const surface = scheme === "dark" ? preset.surfaceDark : preset.surfaceLight;
  const border = scheme === "dark" ? preset.borderDark : preset.borderLight;
  return { ...base, primary, background, surface, border, text: base.foreground, tint: primary, icon: base.muted, tabIconDefault: base.muted, tabIconSelected: primary };
}
export const Colors = { light: getThemePalette("light"), dark: getThemePalette("dark") };
export type ThemeColorPalette = (typeof Colors)[ColorScheme];
export const Fonts = Platform.select({ ios: { sans: "system-ui", serif: "ui-serif", rounded: "ui-rounded", mono: "ui-monospace" }, default: { sans: "normal", serif: "serif", rounded: "normal", mono: "monospace" }, web: { sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", serif: "Georgia, 'Times New Roman', serif", rounded: "'SF Pro Rounded', sans-serif", mono: "SFMono-Regular, Menlo, Monaco, Consolas, monospace" } });
