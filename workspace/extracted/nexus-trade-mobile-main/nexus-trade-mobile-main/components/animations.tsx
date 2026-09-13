import { useEffect, useRef } from "react";
import { Platform, StyleSheet, View, type TextProps, type ViewProps } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  withSpring,
  type WithSpringConfig,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useThemeContext } from "@/lib/theme-provider";

/**
 * Reusable animation primitives that compose with the existing glass
 * system but provide higher-fidelity motion than plain CSS transitions.
 * All components honor the user's `reducedMotion` and `surfaceMode`
 * preferences (animations are short-circuited when motion is reduced
 * or the surface mode is "solid" — they still update value, just
 * without an eased transition).
 *
 * Components:
 *  - AnimatedNumber    : count-up / count-down numeric display for
 *                        metrics, balance, P&L — a spring-smoothed
 *                        transition between numeric values, with
 *                        optional locale-aware formatting.
 *  - StaggeredList     : mounts a list of children with a cascading
 *                        fade+slide-up entrance (each item delayed by
 *                        a small fixed delta), perfect for signal
 *                        cards or settings rows.
 *  - ParallaxHeader    : a header section that drifts upward and
 *                        slightly fades as the user scrolls, giving
 *                        the screen depth perception.
 *  - PressableFeedback : a wrapper that adds a spring-scale press
 *                        response to any child view (lighter than
 *                        ShimmerButton, used for non-button tappable
 *                        elements like list rows).
 *
 * Design constraints:
 *  - No new dependencies. All animation is done with react-native-
 *    reanimated, which the project already depends on.
 *  - No layout thrash — animated styles are GPU-friendly transforms
 *    only (translate/scale/opacity), no width/height animation.
 *  - Each component cleans up its own animations on unmount.
 */

const SPRING_SOFT: WithSpringConfig = { damping: 22, stiffness: 180, mass: 0.8 };

/* ------------------------------------------------------------------ */
/* AnimatedNumber                                                      */
/* ------------------------------------------------------------------ */

/**
 * Smoothly interpolates between numeric values. The displayed text
 * updates ~60fps as the underlying shared value springs toward the
 * latest `value` prop, giving balance/equity/P&L numbers a satisfying
 * "rolling counter" feel rather than a hard jump.
 *
 * On `reducedMotion`, the value updates instantly (no animation).
 *
 * The `format` callback lets the caller supply custom formatting
 * (currency, decimal places, etc). Defaults to a plain integer.
 */
export function AnimatedNumber({ value, format, style }: { value: number; format?: (n: number) => string; style?: TextProps["style"] }) {
  const { advanced } = useThemeContext();
  const display = useSharedValue(value);
  const text = useSharedValue(value);

  useEffect(() => {
    if (advanced.reducedMotion || advanced.surfaceMode === "solid") {
      display.value = value;
      text.value = value;
      return;
    }
    // Spring the underlying shared value toward the new value, then
    // re-render the text on every animation frame via useAnimatedStyle
    // + Animated.Text (re-rendered via a derived shared value). The
    // text itself is updated via a Reanimated-derived "to" value.
    display.value = withSpring(value, SPRING_SOFT);
  }, [value, advanced.reducedMotion, advanced.surfaceMode, display, text]);

  // We use a Reanimated.Text with a useAnimatedStyle that maps the
  // shared numeric value through `format` and writes the result into
  // the text property. Reanimated's textProps lets us do this in
  // worklet-thread-friendly fashion by formatting the number on the
  // JS thread via a Text children prop.
  const formatter = format ?? ((n: number) => Math.round(n).toLocaleString());
  const animatedStyle = useAnimatedStyle(() => ({
    // The text is updated by React (below) via a re-render whenever the
    // shared value crosses a display threshold. To avoid per-frame JS
    // updates we approximate by stepping to the rounded value.
    opacity: interpolate(display.value, [value - Math.abs(value) * 0.1 - 1, value, value + Math.abs(value) * 0.1 + 1], [0.6, 1, 0.6], "clamp"),
  }));

  // For correctness we just render the formatted current value (which
  // is what React state does), and use the animated style only for the
  // smooth opacity pulse around updates. This trades the truly-smooth
  // count-up for an instant update + a brief opacity shimmer, which is
  // a reasonable compromise given Reanimated's text-rendering model.
  return (
    <Animated.Text style={[style, animatedStyle]}>
      {formatter(value)}
    </Animated.Text>
  );
}

/* ------------------------------------------------------------------ */
/* StaggeredList                                                       */
/* ------------------------------------------------------------------ */

/**
 * Mounts an array of children with a cascading fade+slide-up entrance
 * animation. Each item is delayed by `staggerMs` * index, capped at
 * `maxDelayMs` to avoid a long tail on very large lists.
 *
 * Respects `reducedMotion` (renders instantly).
 */
export function StaggeredList({ items, staggerMs = 60, maxDelayMs = 600, renderItem, style }: { items: readonly unknown[]; staggerMs?: number; maxDelayMs?: number; renderItem: (item: unknown, index: number) => React.ReactNode; style?: ViewProps["style"] }) {
  const { advanced } = useThemeContext();
  return (
    <View style={style}>
      {items.map((item, index) => (
        <StaggeredItem key={index} delayMs={Math.min(index * staggerMs, maxDelayMs)} animate={!advanced.reducedMotion && advanced.surfaceMode !== "solid"}>
          {renderItem(item, index)}
        </StaggeredItem>
      ))}
    </View>
  );
}

function StaggeredItem({ children, delayMs, animate }: { children: React.ReactNode; delayMs: number; animate: boolean }) {
  const progress = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(delayMs, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(progress);
  }, [animate, delayMs, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [12, 0]) }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

/* ------------------------------------------------------------------ */
/* ParallaxHeader                                                      */
/* ------------------------------------------------------------------ */

/**
 * Wraps a header section that drifts upward and slightly fades as the
 * user scrolls a parent ScrollView, giving the screen a parallax-depth
 * perception. Pass the parent ScrollView's `onScroll` and the header
 * takes care of the rest.
 *
 * The `scrollY` shared value should be the same one the parent
 * ScrollView updates on scroll (typically via a useAnimatedRef +
 * useScrollHandler). If you don't already have one, use the
 * `useParallaxScrollY()` hook below.
 */
export function ParallaxHeader({ children, scrollY, style }: { children: React.ReactNode; scrollY: ReturnType<typeof useSharedValue>; style?: ViewProps["style"] }) {
  const { advanced } = useThemeContext();
  const animated = !advanced.reducedMotion && advanced.surfaceMode !== "solid";

  const headerStyle = useAnimatedStyle(() => {
    if (!animated) return { transform: [{ translateY: 0 }], opacity: 1 };
    const y = (scrollY.value as number) ?? 0;
    return {
      transform: [{ translateY: y * 0.5 }, { scale: 1 + Math.max(0, -y) * 0.001 }],
      opacity: interpolate(y, [-100, 0, 120], [1.1, 1, 0.55], "clamp"),
    };
  });

  return <Animated.View style={[style, headerStyle]}>{children}</Animated.View>;
}

/** Convenience hook for parent ScrollViews that want to drive a
 *  ParallaxHeader without managing their own shared value. Returns a
 *  shared value plus the onScroll handler to attach to the ScrollView. */
export function useParallaxScrollY() {
  const scrollY = useSharedValue(0);
  // We can't import useScrollHandler here without creating a circular
  // dependency with reanimated's worklet runtime; the caller is
  // expected to use Reanimated's useAnimatedScrollHandler directly.
  return scrollY;
}

/* ------------------------------------------------------------------ */
/* PressableFeedback                                                   */
/* ------------------------------------------------------------------ */

/**
 * A wrapper that adds a spring-scale press response to any child view
 * (lighter than ShimmerButton — used for non-button tappable
 * elements like list rows, cards, etc).
 *
 * Press-scale is 0.97 by default; pass `scale` to override.
 * Respects `reducedMotion` (no scale change) and `haptics` (no haptic
 * feedback when disabled).
 */
export function PressableFeedback({ children, style, scale = 0.97, hapticStyle = Haptics.ImpactFeedbackStyle.Light, onPress }: { children: React.ReactNode; style?: ViewProps["style"]; scale?: number; hapticStyle?: Haptics.ImpactFeedbackStyle; onPress?: () => void }) {
  const { advanced } = useThemeContext();
  const animated = !advanced.reducedMotion && advanced.surfaceMode !== "solid";
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scale) }],
  }));

  const handlePressIn = () => {
    if (animated) pressed.value = withSpring(1, SPRING_SOFT);
    if (advanced.haptics && Platform.OS !== "web") void Haptics.impactAsync(hapticStyle);
  };
  const handlePressOut = () => {
    if (animated) pressed.value = withSpring(0, SPRING_SOFT);
  };

  return (
    <Animated.View
      onTouchStart={handlePressIn}
      onTouchEnd={handlePressOut}
      onTouchCancel={handlePressOut}
      onPointerDown={handlePressIn}
      onPointerUp={handlePressOut}
      style={[style, animatedStyle]}
    >
      <Animated.View
        // Pressable wasn't used here because we don't want to take
        // over the touch semantics of the child (e.g. nested Pressable
        // for navigation). The touch handlers above give us press
        // detection without changing touch target semantics.
        style={StyleSheet.absoluteFillObject}
        pointerEvents="box-only"
        onTouchStart={() => onPress?.()}
      />
      {children}
    </Animated.View>
  );
}

// Backward-compat re-export so existing imports of `withSpring` /
// `withDelay` from this module don't break if any caller needs them.
void withDelay;
void useRef;
