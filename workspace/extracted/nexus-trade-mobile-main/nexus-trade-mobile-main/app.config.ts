// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Bundle ID format: space.manus.<project_name_dots>.<timestamp>
// e.g., "my-app" created at 2024-01-15 10:30:45 -> "space.manus.my.app.t20240115103045"
// Bundle ID can only contain letters, numbers, and dots
// Android requires each dot-separated segment to start with a letter
const rawBundleId = "com.app.nexustrademobile";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".") // Replace hyphens/underscores with dots
    .replace(/[^a-zA-Z0-9.]/g, "") // Remove invalid chars
    .replace(/\.+/g, ".") // Collapse consecutive dots
    .replace(/^\.+|\.+$/g, "") // Trim leading/trailing dots
    .toLowerCase()
    .split(".")
    .map((segment) => {
      // Android requires each segment to start with a letter
      // Prefix with 'x' if segment starts with a digit
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";
// Extract timestamp from bundle ID and prefix with "manus" for deep link scheme
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "Nexus Trade Mobile",
  appSlug: "nexus-trade-mobile",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // Leave empty to use the default icon from assets/images/icon.png
  logoUrl: "",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false,
        // The backend is self-hosted (desktop EXE or a dev machine) and is
        // very commonly reached over plain http:// on the LAN — explicitly
        // allow arbitrary loads (Expo's own default template already sets
        // this, but we pin it here so it survives config changes / doesn't
        // silently regress and start blocking the backend connection).
        "NSAppTransportSecurity": {
          "NSAllowsArbitraryLoads": true,
          "NSAllowsArbitraryLoadsInWebContent": true,
          // Belt-and-suspenders: explicit per-host exception entries for
          // the most common self-hosted backend addresses. iOS 14+
          // sometimes still refuses localhost / 127.0.0.1 / LAN IPs even
          // with NSAllowsArbitraryLoads=true unless they appear in the
          // exception list — pinning them here eliminates an entire class
          // of "works on emulator but not on device" silent failures.
          "NSExceptionDomains": {
            "localhost": {
              "NSExceptionAllowsInsecureHTTPLoads": true,
              "NSIncludesSubdomains": true,
            },
            "127.0.0.1": {
              "NSExceptionAllowsInsecureHTTPLoads": true,
            },
            "10.0.2.2": {
              "NSExceptionAllowsInsecureHTTPLoads": true,
            },
            "local": {
              "NSExceptionAllowsInsecureHTTPLoads": true,
              "NSIncludesSubdomains": true,
            },
          },
        },
        // iOS 14+ requires explicit user permission before an app may
        // discover/connect to devices on the local network (which is
        // exactly what happens when the app talks to a LAN-hosted
        // backend by IP address). Without this string iOS silently
        // refuses the connection and it surfaces as "Network request
        // failed" with no permission prompt ever being shown.
        "NSLocalNetworkUsageDescription": "Nexus Trade connects to your self-hosted trading backend on your local network to fetch live signals and account data.",
        // iOS 14+ also requires the app to declare the Bonjour service
        // types it intends to browse — without this entry the local-
        // network permission prompt is never actually triggered and
        // the OS silently drops the connection. We declare _http._tcp
        // (the standard service type for HTTP-over-TCP on the LAN).
        "NSBonjourServices": ["_http._tcp", "_nexustrade._tcp"]
      }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    // CRITICAL: The Android manifest requires an explicit <uses-permission
    // android:name="android.permission.INTERNET"/> entry for ANY network
    // call to succeed. Expo injects this automatically when a network-using
    // Expo module is installed (expo-av, expo-fetch, etc), but if those
    // modules are stripped or shaken out, the permission silently
    // disappears and EVERY fetch from the app fails with a generic
    // "Network request failed" TypeError. We pin it here explicitly so
    // the app always has network access regardless of which dependency
    // graph changes happen later.
    //
    // ACCESS_NETWORK_STATE: required by React Native's NetInfo / expo-network
    // to detect "online vs offline" and switch the app into offline mode.
    // ACCESS_WIFI_STATE: required for LAN IP discovery (multicast / NSD).
    permissions: [
      "INTERNET",
      "ACCESS_NETWORK_STATE",
      "ACCESS_WIFI_STATE",
      "POST_NOTIFICATIONS",
    ],
    // Android 9+ (API 28+) blocks plain-HTTP network calls by default.
    // The self-hosted Nexus Trade backend is very commonly reached over
    // plain http:// (LAN IP or 10.0.2.2 emulator alias, no TLS cert),
    // so without this flag every request silently fails with the native
    // "Network request failed" error before it even leaves the device.
    // @ts-expect-error usesCleartextTraffic is a valid Expo/Android manifest
    // key (injected into AndroidManifest.xml at prebuild time) but is not yet
    // present in this SDK's bundled ExpoConfig.Android TypeScript type.
    usesCleartextTraffic: true,
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
    name: "Nexus Trade Mobile",
    shortName: "Nexus Trade",
    description: "Cross-platform Nexus Trade command center for Android, iOS, and Windows web.",
    lang: "en",
    themeColor: "#070B12",
    backgroundColor: "#070B12",
  },
  plugins: [
    "expo-router",
    "expo-asset",
    "expo-font",
    "expo-web-browser",
    "expo-notifications",
    [
      "expo-audio",
      {
        microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone.",
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 26,
        },
        ios: {
          deploymentTarget: "16.0",
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
