import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/autonomy';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/** Independent liveness probe — writes a keepalive row every time it's hit.
 *  External schedulers (Cloudflare, GHA cron, Netlify, UptimeRobot) call this to
 *  guarantee the Vercel function is warm. Returns a full breadcrumb trail.
 */
export async function GET(request: Request) {
  return probe(request, 'GET');
}
export async function POST(request: Request) {
  return probe(request, 'POST');
}

async function probe(request: Request, method: string) {
  const t0 = Date.now();
  const worker = request.headers.get('x-worker-id') || `${method.toLowerCase()}-anonymous`;
  const supabase = createServiceClient();
  const meta = { method, url: request.url, ua: request.headers.get('user-agent')?.slice(0, 120) };
  if (supabase) {
    try {
      await supabase.from('keepalive_pings').insert({ worker, status: 'ok', latency_ms: Date.now() - t0, meta });
    } catch { /* non-fatal */ }
  }
  return NextResponse.json({
    ok: true,
    worker,
    latencyMs: Date.now() - t0,
    supabase: !!supabase,
    ts: new Date().toISOString(),
  });
}
