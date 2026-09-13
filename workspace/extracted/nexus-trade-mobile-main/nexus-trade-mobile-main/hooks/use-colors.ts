import { Colors, type ColorScheme, type ThemeColorPalette } from "@/constants/theme";
import { useThemeContext } from "@/lib/theme-provider";

export function useColors(colorSchemeOverride?: ColorScheme): ThemeColorPalette {
  const theme = useThemeContext();
  if (colorSchemeOverride) return Colors[colorSchemeOverride];
  return theme.palette;
}
