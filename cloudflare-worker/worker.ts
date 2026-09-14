/**
 * PRESIDIN Cloudflare Worker — heartbeat / cron
 *
 * Keeps the Next.js app alive 24/7 by hitting /api/cron/tick every minute.
 * Also exposes /health for uptime monitoring.
 *
 * Deploy:
 *   npm install -g wrangler
 *   wrangler login  (or set CLOUDFLARE_API_TOKEN env var)
 *   wrangler deploy
 *
 * Cron schedule: every minute (* * * * *)
 */
export interface Env {
  PRESIDIN_URL: string;       // e.g. https://presidin.vercel.app
  PRESIDIN_CRON_SECRET: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      const res = await fetch(`${env.PRESIDIN_URL}/api/cron/tick`, {
        method: "POST",
        headers: {
          "X-Presidin-Secret": env.PRESIDIN_CRON_SECRET,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ts: Date.now() }),
      });
      // Log to Cloudflare Workers logs (viewable in dashboard)
      console.log(`[cron] tick ${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));
    } catch (err: any) {
      console.error(`[cron] tick failed: ${err?.message}`);
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "presidin-cron",
          ts: Date.now(),
          target: env.PRESIDIN_URL ?? "(not set)",
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.pathname === "/") {
      return new Response(
        `PRESIDIN Cloudflare Worker — cron heartbeat\n\n` +
        `Health: /health\n` +
        `Target: ${env.PRESIDIN_URL ?? "(not set)"}\n`,
        { headers: { "Content-Type": "text/plain" } }
      );
    }
    return new Response("Not Found", { status: 404 });
  },
};
