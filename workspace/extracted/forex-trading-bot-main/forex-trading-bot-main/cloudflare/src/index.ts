export interface Env {
  VERCEL_TICK_URL: string;
  VERCEL_HEARTBEAT_URL?: string;
  VERCEL_MANAGE_URL?: string;
  HEARTBEAT_SECRET?: string;
  FAILOVER_URL?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default {
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runBurst(env));
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/trigger') return Response.json(await runBurst(env));
    if (path === '/tick-once') return Response.json(await runTick(env));
    if (path === '/manage') return Response.json(await runManage(env));
    if (path === '/health') {
      return Response.json({
        ok: true,
        hasTick: !!env.VERCEL_TICK_URL,
        hasManage: !!(env.VERCEL_MANAGE_URL || env.VERCEL_TICK_URL),
      });
    }
    return new Response('Forex Bot Heartbeat. /trigger /tick-once /manage /health', { status: 200 });
  },
};

async function runBurst(env: Env) {
  const results: any[] = [];
  // 2 cycles × 15s ≈ ~every 15–30s coverage without long CPU
  for (let i = 0; i < 2; i++) {
    results.push({ cycle: i + 1, tick: await runTick(env), manage: await runManage(env), ts: Date.now() });
    if (i < 1) await sleep(15000);
  }
  return { ok: results.some((r) => r.tick?.ok), cycles: results.length, results };
}

async function post(url: string, env: Env, body: object) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'forex-bot-cf-heartbeat/2.1',
  };
  if (env.HEARTBEAT_SECRET) headers['x-heartbeat-secret'] = env.HEARTBEAT_SECRET;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: any = text;
    try { parsed = JSON.parse(text); } catch { /* */ }
    return { ok: res.ok, status: res.status, body: typeof parsed === 'object' ? { ok: parsed.ok, executed: parsed.executed?.length, ticks: parsed.ticks } : parsed };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

async function runTick(env: Env) {
  const heartbeatUrl = env.VERCEL_HEARTBEAT_URL || (env.VERCEL_TICK_URL ? env.VERCEL_TICK_URL.replace(/\/api\/tick\/?$/, '/api/heartbeat') : '');
  if (!heartbeatUrl) return { ok: false, error: 'VERCEL_HEARTBEAT_URL missing' };
  const primary = await post(heartbeatUrl, env, { source: 'cf-burst', ts: Date.now() });
  if (!primary.ok && env.FAILOVER_URL) {
    return { ok: false, primary, failover: await post(env.FAILOVER_URL, env, { source: 'cf-failover', ts: Date.now() }) };
  }
  return primary;
}

async function runManage(env: Env) {
  const url = env.VERCEL_MANAGE_URL || (env.VERCEL_TICK_URL ? env.VERCEL_TICK_URL.replace(/\/api\/tick\/?$/, '/api/manage') : '');
  if (!url) return { ok: false, error: 'manage URL missing' };
  return post(url, env, { source: 'cf-manage', ts: Date.now() });
}
