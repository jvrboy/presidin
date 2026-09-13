import { useEffect } from "react";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useColors } from "@/hooks/use-colors";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * Liquid-glass surface system.
 *
 * Respects the user's `surfaceMode` preference:
 *  - "liquid": genuine backdrop blur (expo-blur) + a soft animated
 *    gradient sheen that drifts slowly across the panel, PLUS an
 *    independent diagonal specular sweep (a bright glint that glides
 *    across on its own cadence) for a more physically-real reflective
 *    surface. Falls back to the static depth-only look when
 *    `reducedMotion` is on.
 *  - "glass": backdrop blur without any animation — a calmer,
 *    still frosted-glass surface for users who want less visual noise.
 *  - "solid": no blur at all, just a flat tinted surface — the
 *    cheapest to render and the most accessible/high-contrast option.
 *
 * Every mode except "solid" also gets a set of always-on, zero-cost
 * depth cues that make the surface read as physical glass rather than
 * a flat tinted rectangle:
 *  - a soft vertical "light-fall" gradient (brighter near the top,
 *    fading to a faint cool shadow near the bottom)
 *  - a bevelled edge: a light top/left inner border and a darker
 *    bottom/right inner border, simulating how a refractive edge
 *    catches light on one side and casts shadow on the other
 *  - a small top-left corner "glint" — a soft radial-ish highlight,
 *    the kind of specular dot you see on real glass/acrylic corners
 *
 * `intensity` (0-100, from the Settings glass-intensity slider) maps
 * onto both the native blur intensity and the sheen/shadow strength
 * so the whole effect scales together.
 */
export function GlassPanel({ children, intensity, style, ...props }: ViewProps & { intensity?: number }) {
  const colors = useColors();
  const { advanced, colorScheme } = useThemeContext();
  const effectiveIntensity = intensity ?? advanced.glassIntensity;
  const mode = advanced.surfaceMode;
  const animated = mode === "liquid" && !advanced.reducedMotion;

  const shimmer = useSharedValue(0);
  const sweep = useSharedValue(-1);
  useEffect(() => {
    if (!animated) {
      cancelAnimation(shimmer);
      cancelAnimation(sweep);
      shimmer.value = 0;
      sweep.value = -1;
      return;
    }
    shimmer.value = withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.sin) }), -1, true);
    sweep.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 0 }),
        withDelay(1400, withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.cubic) })),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(shimmer);
      cancelAnimation(sweep);
    };
  }, [animated, shimmer, sweep]);

  const sheenStyle = useAnimatedStyle(() => ({
    opacity: 0.16 + shimmer.value * 0.16,
    transform: [{ translateX: -40 + shimmer.value * 80 }, { translateY: -20 + shimmer.value * 40 }],
  }));

  const sweepStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sweep.value, [-1, -0.6, 0, 0.6, 1], [0, 0.5, 0.85, 0.5, 0]),
    transform: [{ translateX: interpolate(sweep.value, [-1, 1], [-160, 240]) }, { rotate: "18deg" }],
  }));

  if (mode === "solid") {
    return (
      <View
        {...props}
        style={[
          styles.base,
          { backgroundColor: `${colors.surface}F5`, borderColor: `${colors.border}CC` },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  const blurAmount = Platform.OS === "web" ? Math.round(effectiveIntensity * 0.6) : Math.round(effectiveIntensity * 1.1);

  return (
    <View {...props} style={[styles.base, { borderColor: `${colors.border}A0` }, style]}>
      <BlurView
        intensity={Math.min(100, Math.max(4, blurAmount))}
        tint={colorScheme === "dark" ? "dark" : "light"}
        style={StyleSheet.absoluteFillObject}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: `${colors.surface}${Platform.OS === "web" ? "55" : "38"}` }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[`${colors.foreground}14`, `${colors.foreground}00`, `${colors.background}14`]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      {mode === "liquid" ? (
        <>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, sheenStyle]}>
            <LinearGradient
              colors={[`${colors.primary}00`, `${colors.primary}66`, `${colors.primary}00`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.specular, sweepStyle]}>
            <LinearGradient
              colors={["#FFFFFF00", "#FFFFFF40", "#FFFFFF00"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
          </Animated.View>
        </>
      ) : null}
      <View pointerEvents="none" style={[styles.edgeHighlight, { borderColor: `${colors.foreground}1A` }]} />
      <View pointerEvents="none" style={[styles.edgeShadow, { borderColor: "#00000020" }]} />
      <View pointerEvents="none" style={[styles.glint, { backgroundColor: `${colors.foreground}22` }]} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

/**
 * Soft glowing orb used as a decorative accent inside panels/headers.
 * In "liquid" mode it breathes gently (scale + opacity pulse) and
 * drifts on a slow independent path (translateX/Y), giving it a
 * weightless, faintly alive quality. A layered bokeh core (two nested
 * highlight circles) reads as a real out-of-focus light source rather
 * than a flat tinted disc. In "glass"/"solid" modes, or with
 * reducedMotion on, it stays fully static.
 */
export function LiquidGlassOrb({ size = 120, color }: { size?: number; color?: string }) {
  const colors = useColors();
  const { advanced } = useThemeContext();
  const tone = color ?? colors.primary;
  const animated = advanced.surfaceMode === "liquid" && !advanced.reducedMotion;

  const pulse = useSharedValue(0);
  const drift = useSharedValue(0);
  useEffect(() => {
    if (!animated) {
      cancelAnimation(pulse);
      cancelAnimation(drift);
      pulse.value = 0;
      drift.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 3600, easing: Easing.inOut(Easing.quad) }), -1, true);
    drift.value = withRepeat(withTiming(1, { duration: 8400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(drift);
    };
  }, [animated, pulse, drift]);

  const orbStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + pulse.value * 0.3,
    transform: [
      { scale: 1 + pulse.value * 0.08 },
      { translateX: interpolate(drift.value, [0, 1], [-6, 6]) },
      { translateY: interpolate(drift.value, [0, 1], [4, -4]) },
    ],
  }));

  const coreStyle = useAnimatedStyle(() => ({ opacity: 0.35 + pulse.value * 0.35 }));

  const coreSize = size * 0.55;
  const highlightSize = size * 0.22;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.orb,
        orbStyle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: `${tone}28`, borderColor: `${tone}55` },
      ]}
    >
      <Animated.View
        style={[
          styles.orbCore,
          coreStyle,
          {
            width: coreSize,
            height: coreSize,
            borderRadius: coreSize / 2,
            backgroundColor: `${tone}40`,
            top: size * 0.1,
            left: size * 0.12,
          },
        ]}
      />
      <View
        style={[
          styles.orbHighlight,
          {
            width: highlightSize,
            height: highlightSize,
            borderRadius: highlightSize / 2,
            backgroundColor: `${tone}70`,
            top: size * 0.14,
            left: size * 0.18,
          },
        ]}
      />
    </Animated.View>
  );
}

/**
 * Small pulsing status indicator — a solid core dot with an expanding,
 * fading ring behind it, like a radar/sonar "live" ping. Useful
 * anywhere the app needs an at-a-glance "this is active/live" or
 * "this needs attention" cue (e.g. a running learning system, an
 * anomaly-guard pause, a drift alert) without a full text badge.
 * Respects reducedMotion (falls back to a static dot) and can be
 * turned off entirely via `active={false}`.
 */
export function PulseDot({ size = 10, color, active = true }: { size?: number; color?: string; active?: boolean }) {
  const colors = useColors();
  const { advanced } = useThemeContext();
  const tone = color ?? colors.primary;
  const animated = active && !advanced.reducedMotion;

  const ring = useSharedValue(0);
  useEffect(() => {
    if (!animated) {
      cancelAnimation(ring);
      ring.value = 0;
      return;
    }
    ring.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.cubic) }), -1, false);
    return () => cancelAnimation(ring);
  }, [animated, ring]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 1], [0.55, 0]),
    transform: [{ scale: interpolate(ring.value, [0, 1], [1, 2.6]) }],
  }));

  const coreSize = Math.max(2, size * 0.55);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {animated ? (
        <Animated.View
          pointerEvents="none"
          style={[ringStyle, { position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: tone }]}
        />
      ) : null}
      <View
        style={{
          width: coreSize,
          height: coreSize,
          borderRadius: coreSize / 2,
          backgroundColor: active ? tone : `${tone}80`,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  content: { position: "relative", zIndex: 1 },
  edgeHighlight: {
    borderRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  edgeShadow: {
    borderRadius: 20,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  glint: {
    position: "absolute",
    top: -14,
    left: -14,
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  specular: {
    position: "absolute",
    top: "-60%",
    width: 90,
    height: "220%",
  },
  orb: { borderWidth: 1, position: "absolute", right: -28, top: -28 },
  orbCore: { position: "absolute" },
  orbHighlight: { position: "absolute" },
});
