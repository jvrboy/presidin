"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/stores/presidin";

/**
 * Applies theme attributes (palette, glass intensity, reduce motion) to the <html> element.
 * Runs once on mount and updates whenever the theme store changes.
 */
export function ThemeAttributes() {
  const { palette, glassIntensity, reducedMotion, auroraFlow } = useThemeStore();

  useEffect(() => {
    const html = document.documentElement;
    if (palette) html.setAttribute("data-palette", palette);
    if (glassIntensity) html.setAttribute("data-glass", glassIntensity);
    html.setAttribute("data-reduce-motion", String(reducedMotion));
    html.setAttribute("data-aurora-flow", String(auroraFlow));
  }, [palette, glassIntensity, reducedMotion, auroraFlow]);

  return null;
}
