// Self-Learning Agent — tracks signal outcomes and adjusts confluence weights
// via exponential moving average. Persists to Supabase (signal_outcomes,
// confluence_weights tables).

import { supabase } from "@/integrations/supabase/client";

export interface SignalOutcomeRecord {
  pair: string;
  timeframe: string;
  session?: string;
  strategy: string;
  direction: "BUY" | "SELL";
  confluenceFactors: string[];
  entryPrice?: number;
  exitPrice?: number;
  outcome: "win" | "loss" | "breakeven" | "pending";
  pnlPips?: number;
  confidenceAtSignal?: number;
}

export interface LearnedWeights {
  [key: string]: { weight: number; samples: number; winRate: number };
}

export interface SelfLearningResult {
  recorded: boolean;
  weightsUpdated: number;
  totalSamples: number;
  insights: string[];
}

const LEARNING_RATE = 0.15;

function sessionFromHour(hourUtc: number): string {
  if (hourUtc >= 0 && hourUtc < 7) return "asia";
  if (hourUtc >= 7 && hourUtc < 12) return "london";
  if (hourUtc >= 12 && hourUtc < 16) return "overlap";
  if (hourUtc >= 16 && hourUtc < 21) return "ny";
  return "off";
}

export async function recordSignalOutcome(
  record: SignalOutcomeRecord,
): Promise<SelfLearningResult> {
  const insights: string[] = [];
  const session = record.session ?? sessionFromHour(new Date().getUTCHours());

  const { error } = await supabase.from("signal_outcomes").insert({
    pair: record.pair,
    timeframe: record.timeframe,
    session,
    strategy: record.strategy,
    direction: record.direction,
    confluence_factors: record.confluenceFactors,
    entry_price: record.entryPrice ?? null,
    exit_price: record.exitPrice ?? null,
    outcome: record.outcome,
    pnl_pips: record.pnlPips ?? null,
    confidence_at_signal: record.confidenceAtSignal ?? null,
    resolved_at: record.outcome !== "pending" ? new Date().toISOString() : null,
  });

  if (error) {
    return {
      recorded: false,
      weightsUpdated: 0,
      totalSamples: 0,
      insights: [`Insert failed: ${error.message}`],
    };
  }

  insights.push(`Recorded ${record.outcome} for ${record.strategy} on ${record.pair}`);

  let weightsUpdated = 0;

  if (record.outcome === "win" || record.outcome === "loss") {
    const isWin = record.outcome === "win";
    for (const factor of record.confluenceFactors) {
      weightsUpdated += await updateWeight(record.pair, session, record.strategy, factor, isWin);
    }
  }

  const { count } = await supabase
    .from("signal_outcomes")
    .select("*", { count: "exact", head: true })
    .eq("pair", record.pair)
    .eq("strategy", record.strategy);

  insights.push(`Total samples for ${record.pair}/${record.strategy}: ${count ?? 0}`);

  return {
    recorded: true,
    weightsUpdated,
    totalSamples: count ?? 0,
    insights,
  };
}

async function updateWeight(
  pair: string,
  session: string,
  strategy: string,
  factor: string,
  isWin: boolean,
): Promise<number> {
  const { data: existing } = await supabase
    .from("confluence_weights")
    .select("weight, samples, win_count")
    .eq("pair", pair)
    .eq("session", session)
    .eq("strategy", strategy)
    .eq("factor", factor)
    .maybeSingle();

  if (!existing) {
    const initWeight = isWin ? 0.55 : 0.45;
    await supabase.from("confluence_weights").insert({
      pair,
      session,
      strategy,
      factor,
      weight: initWeight,
      samples: 1,
      win_count: isWin ? 1 : 0,
      updated_at: new Date().toISOString(),
    });
    return 1;
  }

  const oldWeight = Number(existing.weight);
  const target = isWin ? 1.0 : 0.0;
  const newWeight = oldWeight + LEARNING_RATE * (target - oldWeight);
  const clamped = Math.max(0.05, Math.min(0.95, newWeight));

  await supabase
    .from("confluence_weights")
    .update({
      weight: clamped,
      samples: existing.samples + 1,
      win_count: existing.win_count + (isWin ? 1 : 0),
      updated_at: new Date().toISOString(),
    })
    .eq("pair", pair)
    .eq("session", session)
    .eq("strategy", strategy)
    .eq("factor", factor);

  return 1;
}

export async function getLearnedWeights(pair: string, session?: string): Promise<LearnedWeights> {
  let query = supabase.from("confluence_weights").select("*").eq("pair", pair);
  if (session) query = query.eq("session", session);

  const { data, error } = await query;
  if (error || !data) return {};

  const result: LearnedWeights = {};
  for (const row of data) {
    const key = `${row.strategy}:${row.factor}`;
    result[key] = {
      weight: Number(row.weight),
      samples: row.samples,
      winRate: row.samples > 0 ? row.win_count / row.samples : 0,
    };
  }
  return result;
}

export async function getStrategyPerformance(pair?: string) {
  let query = supabase
    .from("signal_outcomes")
    .select("strategy, outcome, pnl_pips")
    .order("created_at", { ascending: false })
    .limit(500);

  if (pair) query = query.eq("pair", pair);

  const { data, error } = await query;
  if (error || !data) return { total: 0, wins: 0, losses: 0, winRate: 0, avgPnl: 0 };

  const total = data.length;
  const wins = data.filter((r) => r.outcome === "win").length;
  const losses = data.filter((r) => r.outcome === "loss").length;
  const winRate = total > 0 ? wins / total : 0;
  const avgPnl = total > 0 ? data.reduce((sum, r) => sum + Number(r.pnl_pips ?? 0), 0) / total : 0;

  return { total, wins, losses, winRate, avgPnl };
}
