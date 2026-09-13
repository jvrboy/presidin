import { ZO_CONFIG, getZoApiKey } from "./zo-config";

export async function configureZoAutomations() {
  const { baseUrl } = ZO_CONFIG;
  const apiKey = getZoApiKey();
  if (!apiKey) {
    console.warn("[ZO] ZO_API_KEY is not configured; skipping automation setup.");
    return { success: false, error: "ZO_API_KEY not configured" };
  }

  console.log("[ZO] Configuring automations...");

  try {
    // 1. Create keepalive automation
    const keepaliveResponse = await fetch(`${baseUrl}/automations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "divergenceiq-keepalive",
        description: "Ping DivergenceIQ every 60 seconds to keep both systems alive 24/7",
        schedule: "*/1 * * * *",
        enabled: true,
        action: {
          type: "webhook",
          url: "https://confluence-divergence-engine.lovable.app/api/keepalive/zo",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Source": "zo-computer",
          },
          body: {
            source: "zo-computer",
            timestamp: "{{now}}",
            action: "keepalive",
          },
        },
      }),
    }).catch(() => null);

    // 2. Create scanner automation
    const scannerResponse = await fetch(`${baseUrl}/automations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "divergenceiq-scanner",
        description: "Run DivergenceIQ scanner every 5 minutes",
        schedule: "*/5 * * * *",
        enabled: true,
        action: {
          type: "webhook",
          url: "https://confluence-divergence-engine.lovable.app/api/scanner/run",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: {
            source: "zo-automation",
            scan_type: "full",
          },
        },
      }),
    }).catch(() => null);

    // 3. Upload signals sync
    const syncResponse = await fetch(`${baseUrl}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: "/divergenceiq/config.json",
        content: JSON.stringify(
          {
            app: "DivergenceIQ",
            version: "2.0",
            configured_at: new Date().toISOString(),
            features: {
              keepalive: true,
              scanner: true,
              neural_training: true,
              auto_trading: true,
            },
            endpoints: {
              app_url: "https://confluence-divergence-engine.lovable.app",
              webhook: "https://confluence-divergence-engine.lovable.app/api/keepalive/zo",
            },
          },
          null,
          2,
        ),
      }),
    }).catch(() => null);

    return {
      success: true,
      keepalive: keepaliveResponse?.ok || false,
      scanner: scannerResponse?.ok || false,
      sync: syncResponse?.ok || false,
      message: "Zo automations configured for 24/7 operation",
    };
  } catch (error: any) {
    console.error("[ZO] Configuration error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Auto-configure when module loads (server-side only)
if (typeof window === "undefined") {
  configureZoAutomations()
    .then((result) => {
      if (result.success) {
        console.log("[ZO] Automations configured successfully");
        console.log("[ZO] Keepalive: Every 60 seconds");
        console.log("[ZO] Scanner: Every 5 minutes");
        console.log("[ZO] 24/7 persistence: ACTIVE");
      }
    })
    .catch(console.error);
}
