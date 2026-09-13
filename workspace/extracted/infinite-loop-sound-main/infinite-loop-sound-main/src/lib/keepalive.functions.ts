import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ZO_CONFIG, getZoApiKey } from "./zo-config";

const ZO_API_BASE = ZO_CONFIG.baseUrl;

// Store last ping times
let lastZoPing = 0;
let lastAppPing = 0;
let pingInterval: ReturnType<typeof setInterval> | null = null;

export const pingZoComputer = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        apiKey: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = data.apiKey || getZoApiKey();
    if (!apiKey) {
      return { success: false, error: "No Zo API key" };
    }

    try {
      // Ping Zo to keep it alive
      const response = await fetch(`${ZO_API_BASE}/ping`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "divergenceiq",
          timestamp: Date.now(),
          action: "keepalive",
        }),
      }).catch(() => null);

      if (!response?.ok) {
        return {
          success: false,
          error: `Zo ping failed${response ? ` (${response.status})` : " (unreachable)"}`,
        };
      }
      lastZoPing = Date.now();

      // Also trigger Zo automation
      await fetch(`${ZO_API_BASE}/automations/trigger`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "divergenceiq-keepalive",
          data: { ping: true },
        }),
      }).catch(() => {});

      return {
        success: true,
        timestamp: lastZoPing,
        zoStatus: "alive",
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

export const receiveZoPing = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        source: z.string(),
        timestamp: z.number().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    lastAppPing = Date.now();

    // Log the ping
    console.log(`[KEEPALIVE] Received ping from ${data.source} at ${new Date().toISOString()}`);

    // Trigger internal keepalive tasks
    await performKeepaliveTasks();

    return {
      success: true,
      appStatus: "alive",
      timestamp: lastAppPing,
      uptime: process.uptime(),
    };
  });

export const getKeepaliveStatus = createServerFn({ method: "GET" }).handler(async () => {
  const now = Date.now();
  return {
    app: {
      lastPing: lastAppPing,
      secondsAgo: lastAppPing ? Math.floor((now - lastAppPing) / 1000) : null,
      status: lastAppPing && now - lastAppPing < 120000 ? "alive" : "unknown",
    },
    zo: {
      lastPing: lastZoPing,
      secondsAgo: lastZoPing ? Math.floor((now - lastZoPing) / 1000) : null,
      status: lastZoPing && now - lastZoPing < 120000 ? "alive" : "unknown",
    },
    mutual: lastAppPing && lastZoPing && now - lastAppPing < 120000 && now - lastZoPing < 120000,
  };
});

export const start24x7Keepalive = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        apiKey: z.string(),
        intervalSeconds: z.number().optional().default(300),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (data.intervalSeconds < 30 || data.intervalSeconds > 86_400) {
      throw new Error("intervalSeconds must be between 30 and 86400.");
    }
    if (pingInterval) {
      clearInterval(pingInterval);
    }

    // Start pinging Zo every minute
    pingInterval = setInterval(async () => {
      try {
        await pingZoComputer({ data: { apiKey: data.apiKey } });
        console.log(`[KEEPALIVE] Pinged Zo at ${new Date().toISOString()}`);
      } catch (e) {
        console.error("[KEEPALIVE] Failed to ping Zo:", e);
      }
    }, data.intervalSeconds * 1000);

    // Initial ping
    await pingZoComputer({ data: { apiKey: data.apiKey } });

    return {
      success: true,
      message: `24/7 keepalive started - pinging every ${data.intervalSeconds}s`,
    };
  });

export const stopKeepalive = createServerFn({ method: "POST" }).handler(async () => {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  return { success: true };
});

async function performKeepaliveTasks() {
  // Tasks to run on each keepalive ping
  try {
    // 1. Refresh signal data
    // 2. Update neural network
    // 3. Check for new opportunities
    // 4. Sync with Zo
    console.log("[KEEPALIVE] Performing maintenance tasks...");
  } catch (e) {
    console.error("[KEEPALIVE] Task error:", e);
  }
}
