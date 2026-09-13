import { NextResponse } from 'next/server'
import { createServiceClient, acquireLease, releaseLease, requestId, tradingMode, liveExecutionAllowed } from '../../../lib/autonomy'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(request: Request) {
  const secret = process.env.HEARTBEAT_SECRET
  return !secret || request.headers.get('x-heartbeat-secret') === secret
}

export async function GET(request: Request) { return run(request) }
export async function POST(request: Request) { return run(request) }

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  if (!supabase) return NextResponse.json({ ok: false, error: 'Supabase is not configured' }, { status: 503 })
  const id = requestId(request)
  const worker = request.headers.get('x-worker-id') || 'vercel-heartbeat'
  const lease = await acquireLease(supabase, 'heartbeat', worker, id)
  if (!lease.acquired) return NextResponse.json({ ok: true, skipped: true, reason: 'lease-held', requestId: id })
  try {
    const origin = new URL(request.url).origin
    const response = await fetch(`${origin}/api/tick`, { method: 'POST', headers: { 'x-request-id': id, 'x-heartbeat-secret': process.env.HEARTBEAT_SECRET || '' }, cache: 'no-store' })
    const body = await response.json().catch(() => ({}))
    await supabase.from('health_snapshots').insert({ worker_id: worker, status: response.ok ? 'ok' : 'error', latency_ms: 0, checks: { mode: tradingMode(), liveExecutionAllowed: liveExecutionAllowed(), tick: body } })
    await releaseLease(supabase, id, response.ok ? 'SUCCEEDED' : 'FAILED')
    return NextResponse.json(
      {
        ok: response.ok,
        requestId: id,
        mode: tradingMode(),
        liveExecutionAllowed: liveExecutionAllowed(),
        nextDelayMs: 30_000 + Math.floor(Math.random() * 28_000),
        tick: body,
      },
      { status: response.ok ? 200 : 502 },
    )
  } catch (error) {
    await releaseLease(supabase, id, 'FAILED')
    return NextResponse.json({ ok: false, requestId: id, error: error instanceof Error ? error.message : 'heartbeat failed' }, { status: 500 })
  }
}
