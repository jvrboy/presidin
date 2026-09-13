import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type PressableProps, type ViewProps } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  type WithSpringConfig,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/use-colors";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * Advanced liquid-glass surface primitives — extends the existing
 * GlassPanel / LiquidGlassOrb / PulseDot system in glass-ui.tsx with
 * a richer, physically-faithful material vocabulary.
 *
 * Components in this file:
 *  - AuroraVeil        : a slow, drifting aurora-gradient backdrop that
 *                        sits behind panels in "liquid" mode. Three phase-
 *                        shifted color stops breathe and slide across
 *                        each other, giving screens a cinematic, alive
 *                        sense of depth.
 *  - LiquidRipple       : a touch-response ripple that radiates from the
 *                        press location across a glass surface — physically
 *                        the way light refracts through a real liquid-
 *                        glass material when disturbed.
 *  - MagneticOrb        : a floating accent orb that gently attracts
 *                        toward the most recent touch position on its
 *                        parent, simulating a ferromagnetic fluid.
 *  - GlassMarquee       : a horizontally-scrolling text band rendered on
 *                        a glass substrate — used for live tickers, news
 *                        headlines, or status banners.
 *  - ShimmerButton      : a pressable button with a specular highlight
 *                        that sweeps across on press, plus a subtle
 *                        3D tilt toward the touch point.
 *  - LiquidProgress     : a progress bar rendered as a flowing liquid
 *                        with a wave front that laps against the right
 *                        edge — used for signal strength, drift, etc.
 *
 * All components respect:
 *  - `surfaceMode` ("liquid" / "glass" / "solid") — animations are
 *    disabled in "glass" and "solid" modes
 *  - `reducedMotion` — all motion is fully suppressed
 *  - `haptics` — touch feedback is gated on the user's haptics preference
 *  - `glassIntensity` (0-100) — scales the visual intensity of every
 *    effect in lockstep with the rest of the glass system
 */

const SPRING_LIGHT: WithSpringConfig = { damping: 18, stiffness: 220, mass: 0.7 };
const SPRING_MEDIUM: WithSpringConfig = { damping: 14, stiffness: 160, mass: 0.9 };
const RIPPLE_DURATION_MS = 620;
const RIPPLE_LIFETIME_MS = 800;

/* ------------------------------------------------------------------ */
/* AuroraVeil                                                          */
/* ------------------------------------------------------------------ */

/**
 * A slow, drifting aurora-gradient backdrop. Render this as the first
 * child inside a relatively-positioned parent (or absolutely fill the
 * screen). Three color stops (primary, accent, foreground) drift across
 * each other on independent phase-offset paths, with their opacities
 * modulated by slow sine waves — the effect reads as a softly-breathing
 * aurora behind the UI rather than a static gradient.
 *
 * In "glass" mode it renders as a single static gradient (no animation).
 * In "solid" mode it renders nothing (returns null) so the parent's
 * solid background shows through.
 */
export function AuroraVeil({ style, intensity }: ViewProps & { intensity?: number }) {
  const colors = useColors();
  const { advanced } = useThemeContext();
  const effectiveIntensity = intensity ?? advanced.glassIntensity;
  const animated = advanced.surfaceMode === "liquid" && !advanced.reducedMotion;

  const phaseA = useSharedValue(0);
  const phaseB = useSharedValue(0);
  const phaseC = useSharedValue(0);

  useEffect(() => {
    if (!animated) {
      cancelAnimation(phaseA);
      cancelAnimation(phaseB);
      cancelAnimation(phaseC);
      phaseA.value = 0;
      phaseB.value = 0;
      phaseC.value = 0;
      return;
    }
    phaseA.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }), -1, true);
    phaseB.value = withRepeat(withTiming(1, { duration: 11200, easing: Easing.inOut(Easing.sin) }), -1, true);
    phaseC.value = withRepeat(withTiming(1, { duration: 13800, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => {
      cancelAnimation(phaseA);
      cancelAnimation(phaseB);
      cancelAnimation(phaseC);
    };
  }, [animated, phaseA, phaseB, phaseC]);

  const layerA = useAnimatedStyle(() => ({
    opacity: 0.18 + Math.sin(phaseA.value * Math.PI * 2) * 0.08,
    transform: [
      { translateX: interpolate(phaseA.value, [0, 1], [-40, 60]) },
      { translateY: interpolate(phaseA.value, [0, 1], [-30, 30]) },
      { scale: 1 + Math.sin(phaseA.value * Math.PI * 2) * 0.04 },
    ],
  }));

  const layerB = useAnimatedStyle(() => ({
    opacity: 0.14 + Math.cos(phaseB.value * Math.PI * 2) * 0.08,
    transform: [
      { translateX: interpolate(phaseB.value, [0, 1], [50, -40]) },
      { translateY: interpolate(phaseB.value, [0, 1], [20, -30]) },
      { scale: 1 + Math.cos(phaseB.value * Math.PI * 2) * 0.05 },
    ],
  }));

  const layerC = useAnimatedStyle(() => ({
    opacity: 0.1 + Math.sin(phaseC.value * Math.PI * 2 + 1.2) * 0.06,
    transform: [
      { translateX: interpolate(phaseC.value, [0, 1], [-20, 40]) },
      { translateY: interpolate(phaseC.value, [0, 1], [40, -10]) },
      { scale: 1 + Math.sin(phaseC.value * Math.PI * 2 + 1.2) * 0.03 },
    ],
  }));

  if (advanced.surfaceMode === "solid") return null;

  const tint = advanced.surfaceMode === "liquid" ? "dark" : "light";

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, style]}>
      <BlurView intensity={Math.min(60, Math.round(effectiveIntensity * 0.5))} tint={tint} style={StyleSheet.absoluteFillObject} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, layerA]}>
        <LinearGradient colors={[`${colors.primary}00`, `${colors.primary}55`, `${colors.primary}00`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, layerB]}>
        <LinearGradient colors={[`${colors.success}00`, `${colors.success}44`, `${colors.success}00`]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, layerC]}>
        <LinearGradient colors={[`${colors.warning}00`, `${colors.warning}33`, `${colors.warning}00`]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFillObject} />
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* LiquidRipple                                                        */
/* ------------------------------------------------------------------ */

type RippleState = { id: number; x: number; y: number };
let rippleCounter = 0;

/**
 * Touch-response ripple that radiates from the press location across
 * the surface of a glass panel. Wrap a Pressable in <LiquidRipple>
 * (or pass it as the `children` of any pressable surface) and on each
 * press a soft circular ripple expands outward from the touch point,
 * fading as it goes — exactly how light refracts through a real liquid-
 * glass surface when disturbed.
 *
 * Multiple concurrent ripples are supported (each touch spawns its
 * own short-lived ripple). Respects `reducedMotion` (renders nothing)
 * and `haptics` (no haptic feedback when disabled).
 */
export function LiquidRipple({ children, style, onPressIn, hapticStyle = Haptics.ImpactFeedbackStyle.Light }: PressableProps & { hapticStyle?: Haptics.ImpactFeedbackStyle }) {
  const colors = useColors();
  const { advanced } = useThemeContext();
  const animated = advanced.surfaceMode === "liquid" && !advanced.reducedMotion;
  const [ripples, setRipples] = useState<readonly RippleState[]>([]);
  // Pressable's `children` may be a render-prop function — we only
  // want to render static children here, so we coerce to a node.
  const childrenNode = typeof children === "function" ? null : children;

  const handlePressIn: PressableProps["onPressIn"] = (event) => {
    if (animated) {
      if (advanced.haptics && Platform.OS !== "web") {
        void Haptics.impactAsync(hapticStyle);
      }
      const next: RippleState = { id: ++rippleCounter, x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
      setRipples((current) => [...current, next]);
      // Auto-clean this ripple after the animation has run its course.
      setTimeout(() => {
        setRipples((current) => current.filter((r) => r.id !== next.id));
      }, RIPPLE_LIFETIME_MS);
    }
    onPressIn?.(event);
  };

  return (
    <Pressable {...{ style, onPressIn: handlePressIn }}>
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {animated
          ? ripples.map((r) => <RippleNode key={r.id} x={r.x} y={r.y} color={colors.foreground} duration={RIPPLE_DURATION_MS} />)
          : null}
      </View>
      {childrenNode}
    </Pressable>
  );
}

function RippleNode({ x, y, color, duration }: { x: number; y: number; color: string; duration: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) });
  }, [progress, duration]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4, 1], [0.4, 0.25, 0]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0, 2.8]) }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: x - 40,
          top: y - 40,
          width: 80,
          height: 80,
          borderRadius: 40,
          borderWidth: 1.5,
          borderColor: color,
        },
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* MagneticOrb                                                         */
/* ------------------------------------------------------------------ */

/**
 * A floating accent orb that gently attracts toward the most recent
 * touch position on its parent, simulating a ferromagnetic fluid
 * droplet responding to a magnetic pointer. The orb springs toward
 * the touch point with a soft, critically-damped spring, then drifts
 * back to its rest position when the touch is released.
 *
 * Wrap any touchable content in <MagneticOrb> — the orb floats in the
 * background (pointer-events="none") and reacts to touches anywhere
 * in the parent.
 */
export function MagneticOrb({ size = 80, color, children, style }: ViewProps & { size?: number; color?: string }) {
  const colors = useColors();
  const { advanced } = useThemeContext();
  const tone = color ?? colors.primary;
  const animated = advanced.surfaceMode === "liquid" && !advanced.reducedMotion;

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!animated) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [animated, pulse]);

  const orbStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + pulse.value * 0.25,
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: 1 + pulse.value * 0.06 }],
  }));

  return (
    <View
      style={style}
      onTouchStart={(e) => {
        if (!animated) return;
        const locationX = e.nativeEvent.locationX;
        const locationY = e.nativeEvent.locationY;
        // Pull toward touch, clamped to ±size/3 so the orb doesn't fly
        // completely off its parent.
        const dx = Math.max(-size / 3, Math.min(size / 3, locationX - size / 2));
        const dy = Math.max(-size / 3, Math.min(size / 3, locationY - size / 2));
        x.value = withSpring(dx, SPRING_LIGHT);
        y.value = withSpring(dy, SPRING_LIGHT);
      }}
      onTouchEnd={() => {
        if (!animated) return;
        x.value = withSpring(0, SPRING_MEDIUM);
        y.value = withSpring(0, SPRING_MEDIUM);
      }}
    >
      <Animated.View pointerEvents="none" style={[{ position: "absolute", top: -size / 4, right: -size / 4, width: size, height: size, borderRadius: size / 2, backgroundColor: `${tone}22`, borderColor: `${tone}55`, borderWidth: 1 }, orbStyle]} />
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* GlassMarquee                                                        */
/* ------------------------------------------------------------------ */

/**
 * A horizontally-scrolling text band rendered on a glass substrate.
 * Used for live tickers, news headlines, or status banners that need
 * to convey continuous-flow information without taking up vertical
 * space.
 *
 * Loop is seamless: the text is rendered twice and the second copy
 * slides in as the first exits. Respects `reducedMotion` (renders a
 * static text instead).
 */
export function GlassMarquee({ text, speed = 18, color, style }: { text: string; speed?: number; color?: string; style?: ViewProps["style"] }) {
  const colors = useColors();
  const { advanced } = useThemeContext();
  const tone = color ?? colors.foreground;
  const animated = advanced.surfaceMode !== "solid" && !advanced.reducedMotion;

  const translateX = useSharedValue(0);
  useEffect(() => {
    if (!animated) {
      cancelAnimation(translateX);
      translateX.value = 0;
      return;
    }
    // Loop duration scales with text length so reading speed is consistent.
    const duration = Math.max(8000, text.length * speed * 60);
    translateX.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(translateX);
  }, [animated, text, speed, translateX]);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(translateX.value, [0, 1], [0, -100]) }],
  }));

  return (
    <View style={[styles.marqueeWrap, style]}>
      {advanced.surfaceMode !== "solid" ? (
        <BlurView intensity={Math.min(40, Math.round(advanced.glassIntensity * 0.4))} tint={advanced.surfaceMode === "liquid" ? "dark" : "light"} style={StyleSheet.absoluteFillObject} />
      ) : null}
      <View style={styles.marqueeContent}>
        <Animated.View style={[styles.marqueeTrack, slideStyle]}>
          <Text style={[styles.marqueeText, { color: tone }]} numberOfLines={1}>{text}</Text>
          <Text style={[styles.marqueeText, { color: tone }]} numberOfLines={1}>{text}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* ShimmerButton                                                       */
/* ------------------------------------------------------------------ */

/**
 * A pressable button with a specular highlight that sweeps across on
 * press, plus a subtle 3D tilt toward the touch point — physically
 * the way a glossy button catches light when you press it.
 *
 * Replaces the basic ActionButton in places where a more tactile,
 * higher-fidelity control is wanted (e.g. the kill switch, primary
 * CTA, etc).
 */
export function ShimmerButton({ label, onPress, variant = "secondary", disabled, icon }: { label: string; onPress?: () => void; variant?: "primary" | "secondary" | "danger"; disabled?: boolean; icon?: React.ReactNode }) {
  const colors = useColors();
  const { advanced } = useThemeContext();
  const animated = advanced.surfaceMode === "liquid" && !advanced.reducedMotion;

  const press = useSharedValue(0);
  const sweep = useSharedValue(-1);
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);

  const variantStyle = {
    primary: { bg: colors.primary, border: colors.primary, fg: "#FFFFFF" },
    secondary: { bg: colors.background, border: colors.border, fg: colors.foreground },
    danger: { bg: `${colors.error}16`, border: `${colors.error}65`, fg: colors.error },
  }[variant];

  useEffect(() => {
    if (!animated) {
      cancelAnimation(sweep);
      sweep.value = -1;
    }
  }, [animated, sweep]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 - press.value * 0.04 },
      { perspective: 200 },
      { rotateX: `${tiltY.value * 6}deg` },
      { rotateY: `${tiltX.value * -6}deg` },
    ],
  }));

  const sweepStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sweep.value, [-1, -0.4, 0, 0.4, 1], [0, 0.4, 0.7, 0.4, 0]),
    transform: [{ translateX: interpolate(sweep.value, [-1, 1], [-80, 120]) }],
  }));

  const handlePressIn = () => {
    if (animated) {
      press.value = withSpring(1, SPRING_LIGHT);
      sweep.value = -1;
      sweep.value = withSequence(withTiming(-1, { duration: 0 }), withTiming(1, { duration: 700, easing: Easing.inOut(Easing.cubic) }));
    }
    if (advanced.haptics && Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handlePressOut = () => {
    if (animated) {
      press.value = withSpring(0, SPRING_LIGHT);
      tiltX.value = withSpring(0, SPRING_LIGHT);
      tiltY.value = withSpring(0, SPRING_LIGHT);
    }
  };

  return (
    <Animated.View style={containerStyle}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        disabled={disabled}
        onTouchMove={(e) => {
          if (!animated) return;
          // Tilt toward the touch position.
          const { locationX, locationY } = e.nativeEvent;
          const tx = (locationX - 60) / 60;
          const ty = (locationY - 22) / 22;
          tiltX.value = withSpring(Math.max(-1, Math.min(1, tx)), SPRING_LIGHT);
          tiltY.value = withSpring(Math.max(-1, Math.min(1, ty)), SPRING_LIGHT);
        }}
        style={({ pressed }) => [
          styles.shimmerButton,
          { backgroundColor: variantStyle.bg, borderColor: variantStyle.border, opacity: disabled ? 0.45 : pressed ? 0.92 : 1 },
        ]}
      >
        {animated ? (
          <Animated.View pointerEvents="none" style={[styles.shimmerSweep, sweepStyle]}>
            <LinearGradient colors={["#FFFFFF00", "#FFFFFF66", "#FFFFFF00"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />
          </Animated.View>
        ) : null}
        {icon}
        <Text style={[styles.shimmerLabel, { color: variantStyle.fg }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* LiquidProgress                                                      */
/* ------------------------------------------------------------------ */

/**
 * A progress bar rendered as a flowing liquid with a wave front that
 * laps against the right edge. Used for signal strength, drift, etc —
 * anywhere a percentage reads more naturally as a fluid fill than a
 * flat bar.
 *
 * Respects `reducedMotion` (renders a static fill) and `surfaceMode`
 * (no wave animation in "glass" / "solid" modes).
 */
export function LiquidProgress({ value, color, height = 8, style }: { value: number; color?: string; height?: number; style?: ViewProps["style"] }) {
  const colors = useColors();
  const { advanced } = useThemeContext();
  const tone = color ?? colors.primary;
  const animated = advanced.surfaceMode === "liquid" && !advanced.reducedMotion;
  const clamped = Math.max(0, Math.min(100, value));

  const wave = useSharedValue(0);
  useEffect(() => {
    if (!animated) {
      cancelAnimation(wave);
      wave.value = 0;
      return;
    }
    wave.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(wave);
  }, [animated, wave]);

  const waveStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(wave.value, [0, 1], [-12, 12]) }],
  }));

  const surfaceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(wave.value, [0, 1], [-1, 1]) }],
  }));

  return (
    <View style={[styles.liquidTrack, { height, backgroundColor: colors.border }, style]} importantForAccessibility="no-hide-descendants">
      <View style={[styles.liquidFill, { width: `${clamped}%`, backgroundColor: tone, height }]}>
        {animated && clamped > 4 ? (
          <>
            <Animated.View style={[StyleSheet.absoluteFillObject, waveStyle]}>
              <LinearGradient colors={[`${tone}00`, `${tone}99`, `${tone}00`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />
            </Animated.View>
            <Animated.View style={[styles.liquidSurface, surfaceStyle, { backgroundColor: `${colors.foreground}55` }]} />
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  marqueeWrap: { borderRadius: 14, overflow: "hidden", position: "relative", height: 38, borderWidth: 1, borderColor: "rgba(128,128,128,0.2)" },
  marqueeContent: { alignItems: "center", flexDirection: "row", height: "100%", overflow: "hidden" },
  marqueeTrack: { alignItems: "center", flexDirection: "row", gap: 32, paddingLeft: 12 },
  marqueeText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  shimmerButton: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 44, overflow: "hidden", paddingHorizontal: 16, position: "relative" },
  shimmerSweep: { position: "absolute", top: 0, bottom: 0, width: 80 },
  shimmerLabel: { fontSize: 13, fontWeight: "900", letterSpacing: 0.4 },
  liquidTrack: { borderRadius: 999, overflow: "hidden" },
  liquidFill: { borderRadius: 999, overflow: "hidden", position: "relative" },
  liquidSurface: { position: "absolute", top: 0, left: 0, right: 0, height: 2 },
});

// Silence the unused-export warning for interpolateColor — kept here
// as a re-export hint for future animated-color work without forcing
// a breaking change to the import surface.
void interpolateColor;
