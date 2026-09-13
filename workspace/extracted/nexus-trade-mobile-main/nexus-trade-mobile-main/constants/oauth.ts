import * as ReactNative from "react-native";

/**
 * API base URL configuration.
 *
 * This is a personal-use app — the OAuth / session-token plumbing
 * that used to live in this file has been removed. Only the API base
 * URL resolution is kept, since `lib/trpc.ts` and any future server-
 * side procedures still need to locate the backend.
 *
 * Set `EXPO_PUBLIC_API_BASE_URL` to point at your backend in production
 * (e.g. `https://nexus.example.com`). In dev it falls back to deriving
 * the backend URL from the current web hostname (Metro port 8081 →
 * API server port 3000).
 */

const env = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
};

export const API_BASE_URL = env.apiBaseUrl;

/**
 * Get the API base URL, deriving from current hostname if not set.
 * Metro runs on 8081, API server runs on 3000.
 * URL pattern: https://PORT-sandboxid.region.domain
 */
export function getApiBaseUrl(): string {
  // If API_BASE_URL is set, use it
  if (API_BASE_URL) {
    return API_BASE_URL.replace(/\/$/, "");
  }

  // On web, derive from current hostname by replacing port 8081 with 3000
  if (ReactNative.Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    // Pattern: 8081-sandboxid.region.domain -> 3000-sandboxid.region.domain
    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) {
      return `${protocol}//${apiHostname}`;
    }
  }

  // Fallback to empty (will use relative URL)
  return "";
}
