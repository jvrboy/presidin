import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { useColors } from "@/hooks/use-colors";

/**
 * Top-level error boundary.
 *
 * Catches any uncaught exception thrown during React render of the
 * entire app tree, displays a friendly crash screen with the error
 * message + stack trace, and offers a "Reload app" button. Without
 * this, a single uncaught render error in production would leave
 * the user staring at a blank white screen with no way to recover.
 *
 * On native, "Reload" calls `Updates.reloadAsync()` (Expo's OTA update
 * re-fetch). On web, it does `window.location.reload()`.
 *
 * The boundary does NOT report crashes to an external service — this
 * is a personal-use app and the user IS the developer, so the on-
 * device crash screen IS the crash report. The error message + stack
 * are visible inline; the user can copy them to share or fix the bug
 * directly. (For a production app with non-developer users, you'd
 * wire this to Sentry/Bugsnag here.)
 */

type ErrorBoundaryState = { error: Error | null };

export class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In a personal-use app, just log to console so the developer
    // can see it in the dev-server terminal too. Production builds
    // with Hermes will surface this in the device log.
    console.error("[AppErrorBoundary] Uncaught error during render:", error, info.componentStack);
  }

  handleReload = async () => {
    this.setState({ error: null });
    try {
      if (typeof window !== "undefined") {
        window.location.reload();
        return;
      }
      // Native: try Expo Updates reload. Wrapped in a dynamic import
      // so web builds don't pull in the expo-updates module.
      const Updates = await import("expo-updates");
      if (Updates.reloadAsync) {
        await Updates.reloadAsync();
      }
    } catch (e) {
      console.error("[AppErrorBoundary] Reload failed:", e);
    }
  };

  handleGoToSettings = () => {
    this.setState({ error: null });
    try {
      router.push("/settings");
    } catch {
      // If router push fails (e.g. during a Stack unmount), fall back
      // to a full reload.
      void this.handleReload();
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <CrashScreen error={error} onReload={this.handleReload} onSettings={this.handleGoToSettings} />;
  }
}

function CrashScreen({ error, onReload, onSettings }: { error: Error; onReload: () => void; onSettings: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.error}18`, borderColor: `${colors.error}55` }]}>
          <Text style={[styles.iconText, { color: colors.error }]}>!</Text>
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Something broke</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          An unexpected error occurred while rendering the app. The error details are below — reload to try again, or
          open Settings to check the backend connection.
        </Text>

        <View style={[styles.errorBox, { backgroundColor: `${colors.error}0D`, borderColor: `${colors.error}44` }]}>
          <Text style={[styles.errorName, { color: colors.error }]}>{error.name}</Text>
          <Text style={[styles.errorMessage, { color: colors.foreground }]}>{error.message}</Text>
          {error.stack ? (
            <Text style={[styles.errorStack, { color: colors.muted }]} selectable>
              {error.stack.split("\n").slice(0, 15).join("\n")}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Pressable onPress={onReload} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.buttonText, { color: "#FFFFFF" }]}>Reload app</Text>
          </Pressable>
          <Pressable onPress={onSettings} style={({ pressed }) => [styles.button, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.buttonText, { color: colors.foreground }]}>Open Settings</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignItems: "center", gap: 16, padding: 24, paddingBottom: 60 },
  iconWrap: { alignItems: "center", borderRadius: 40, borderWidth: 2, height: 80, justifyContent: "center", marginTop: 24, width: 80 },
  iconText: { fontSize: 38, fontWeight: "900" },
  title: { fontSize: 24, fontWeight: "900", letterSpacing: -0.5, textAlign: "center" },
  subtitle: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  errorBox: { borderRadius: 12, borderWidth: 1, gap: 8, padding: 14, width: "100%" },
  errorName: { fontSize: 11, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase" },
  errorMessage: { fontSize: 14, fontWeight: "700" },
  errorStack: { fontFamily: "monospace", fontSize: 10, lineHeight: 15, marginTop: 4 },
  actions: { flexDirection: "row", gap: 12, marginTop: 8 },
  button: { alignItems: "center", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  buttonText: { fontSize: 13, fontWeight: "900" },
});
