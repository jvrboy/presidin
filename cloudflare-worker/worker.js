export default {
  async scheduled(event, env, ctx) {
    try {
      const res = await fetch(`${env.PRESIDIN_URL}/api/cron/tick`, {
        method: "POST",
        headers: {
          "X-Presidin-Secret": env.PRESIDIN_CRON_SECRET || "presidin-cron-dev",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ts: Date.now() }),
      });
      console.log(`[cron] tick ${res.status}`.slice(0, 200));
    } catch (err) {
      console.error(`[cron] tick failed: ${err?.message}`);
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "presidin-cron", ts: Date.now(), target: env.PRESIDIN_URL || "(not set)" }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response("PRESIDIN Cloudflare Worker — cron heartbeat\n\nHealth: /health\n", { headers: { "Content-Type": "text/plain" } });
  },
};
