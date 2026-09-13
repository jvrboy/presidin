import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type TradingMode = 'research' | 'paper' | 'shadow' | 'demo' | 'restricted-live' | 'live' | 'emergency-stop'
export type GateResult = { allowed: boolean; reason: string; riskScore: number }

export function tradingMode(): TradingMode {
  const raw = process.env.TRADING_MODE || 'paper'
  return ['research','paper','shadow','demo','restricted-live','live','emergency-stop'].includes(raw) ? raw as TradingMode : 'paper'
}

export function liveExecutionAllowed() {
  // demo = real Deriv demo account contracts; paper/shadow stay local-only
  const mode = tradingMode()
  const execModes: TradingMode[] = ['demo', 'restricted-live', 'live']
  return execModes.includes(mode) && process.env.ENABLE_LIVE_TRADES === 'true' && Boolean(process.env.DERIV_TOKEN && process.env.DERIV_APP_ID)
}

export function collectMode() {
  return process.env.COLLECT_MODE === 'true' || process.env.COLLECT_MODE === '1'
}

export function requestId(request: Request) {
  return request.headers.get('x-request-id') || crypto.randomUUID()
}

export async function acquireLease(supabase: SupabaseClient, type: string, worker: string, id: string) {
  const { data, error } = await supabase.rpc('acquire_bot_lease', { p_run_type: type, p_worker_id: worker, p_request_id: id, p_lease_seconds: 90 })
  // Fail-open: if RPC missing/broken, allow the tick (prefer progress over stall)
  if (error) return { acquired: true, error: error.message, failOpen: true }
  return { acquired: data === true }
}

export async function releaseLease(supabase: SupabaseClient, id: string, status = 'SUCCEEDED') {
  await supabase.rpc('release_bot_lease', { p_request_id: id, p_status: status })
}

export async function event(supabase: SupabaseClient, eventType: string, payload: Record<string, unknown>, tradeId?: string, id?: string) {
  await supabase.from('trade_events').insert({ event_type: eventType, payload, trade_id: tradeId || null, request_id: id || null })
}

export function expectedValue(probability: number, payout: number, loss = 1) {
  return probability * payout - (1 - probability) * loss
}

export function dynamicStake(balance: number, baseStake: number, confidence: number, drawdown: number, riskBudget = 0.01) {
  if (!Number.isFinite(balance) || balance <= 0) return 0
  const drawdownFactor = Math.max(0.2, 1 - Math.min(0.8, Math.max(0, drawdown)))
  const confidenceFactor = Math.max(0.25, Math.min(1.25, confidence))
  return Math.max(0.01, Math.min(baseStake, balance * riskBudget * drawdownFactor * confidenceFactor))
}

export function autonomousGate(input: { confidence: number; payout: number; dailyPnl: number; maxDailyLoss: number; expectedMin?: number; emergency?: boolean }): GateResult {
  if (input.emergency) return { allowed: false, reason: 'emergency-stop', riskScore: 1 }
  if (input.dailyPnl <= -Math.abs(input.maxDailyLoss)) return { allowed: false, reason: 'daily-loss-limit', riskScore: 1 }
  const ev = expectedValue(input.confidence, input.payout)
  if (ev < (input.expectedMin ?? 0.02)) return { allowed: false, reason: `negative-expected-value:${ev.toFixed(3)}`, riskScore: 0.8 }
  if (input.confidence < 0.55) return { allowed: false, reason: 'confidence-below-threshold', riskScore: 0.6 }
  return { allowed: true, reason: 'risk-gates-passed', riskScore: Math.max(0, 1 - ev) }
}

export function variableHeartbeatDelay(confidence = 0.5, unstable = false) {
  if (unstable) return 58_000
  return Math.round(58_000 - Math.max(0, Math.min(1, confidence)) * 28_000)
}

export function createServiceClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? createClient(url, key) : null
}
