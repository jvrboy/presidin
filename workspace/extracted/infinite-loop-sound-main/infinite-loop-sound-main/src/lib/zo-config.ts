// Zo Computer Configuration
// The API key is a server-side secret (ZO_API_KEY) and is never bundled here.

export const ZO_CONFIG = {
  baseUrl: "https://api.zo.computer/v1",
  automations: {
    keepalive: {
      name: "divergenceiq-keepalive",
      schedule: "*/1 * * * *", // Every minute
      enabled: true,
    },
    scanner: {
      name: "divergenceiq-scanner",
      schedule: "*/5 * * * *", // Every 5 minutes
      enabled: true,
    },
  },
  endpoints: {
    ping: "/ping",
    automations: "/automations",
    files: "/files",
    user: "/user",
  },
};

/** Server-only: resolve the Zo API key from the environment. Returns "" in the browser. */
export function getZoApiKey(): string {
  if (typeof process === "undefined" || !process.env) return "";
  return process.env.ZO_API_KEY ?? "";
}
