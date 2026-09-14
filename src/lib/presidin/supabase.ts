/**
 * PRESIDIN — Supabase client
 * Postgres + Auth + Realtime + Storage
 *
 * Used for server-side persistence (signals, trades, chat threads, audit logs)
 * and optional client-side realtime subscriptions.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
  anonKey?: string;
}

let _serverClient: SupabaseClient | null = null;
let _browserClient: SupabaseClient | null = null;

/**
 * Server-side Supabase client (uses service role key — bypasses RLS).
 * Only call from server components / API routes.
 */
export function getSupabaseServer(config?: SupabaseConfig): SupabaseClient | null {
  if (typeof window !== "undefined") return null; // server-only
  if (_serverClient) return _serverClient;
  const url = config?.url || process.env.SUPABASE_URL;
  const key = config?.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.includes("your-project")) return null;
  _serverClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
    global: { headers: { "x-application-name": "presidin" } },
  });
  return _serverClient;
}

/**
 * Browser-side Supabase client (uses anon key — subject to RLS).
 */
export function getSupabaseBrowser(url?: string, anonKey?: string): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (_browserClient) return _browserClient;
  const u = url || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const k = anonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!u || !k || u.includes("your-project")) return null;
  _browserClient = createClient(u, k, {
    auth: { persistSession: true, autoRefreshToken: true },
    db: { schema: "public" },
  });
  return _browserClient;
}

export interface SupabaseStatus {
  connected: boolean;
  url?: string;
  hasServiceKey: boolean;
  hasAnonKey: boolean;
  error?: string;
}

export function getSupabaseStatus(): SupabaseStatus {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const configured = Boolean(url && serviceKey && !url.includes("your-project"));
  return {
    connected: configured,
    url: url?.replace(/^(https?:\/\/[^.]+\.).+$/, "$1supabase.co"),
    hasServiceKey: Boolean(serviceKey),
    hasAnonKey: Boolean(anonKey),
  };
}

// ============================================================
// Repository helpers (server-side)
// ============================================================

export async function saveSignalToSupabase(signal: {
  symbol: string;
  timeframe: string;
  direction: string;
  confidence: number;
  consensus: number;
  votes: any[];
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  rrRatio: number;
  positionSize: number;
}): Promise<string | null> {
  const supa = getSupabaseServer();
  if (!supa) return null;
  try {
    const { data, error } = await supa.from("signals").insert({
      ...signal,
      votes: JSON.stringify(signal.votes),
      created_at: new Date().toISOString(),
      status: "active",
    }).select("id").single();
    if (error) {
      console.error("Supabase saveSignal error:", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.error("Supabase saveSignal exception:", err);
    return null;
  }
}

export async function fetchRecentSignals(limit = 50): Promise<any[]> {
  const supa = getSupabaseServer();
  if (!supa) return [];
  try {
    const { data, error } = await supa
      .from("signals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

export async function saveTradeToSupabase(trade: {
  symbol: string;
  broker: string;
  direction: string;
  quantity: number;
  entry_price: number;
  exit_price?: number;
  entry_time: string;
  exit_time?: string;
  pnl?: number;
  pnl_pct?: number;
  status: string;
  notes?: string;
}): Promise<string | null> {
  const supa = getSupabaseServer();
  if (!supa) return null;
  try {
    const { data, error } = await supa.from("trades").insert(trade).select("id").single();
    if (error) return null;
    return data?.id ?? null;
  } catch {
    return null;
  }
}

export async function saveBotLog(level: string, source: string, message: string, data?: any): Promise<void> {
  const supa = getSupabaseServer();
  if (!supa) return;
  try {
    await supa.from("bot_logs").insert({
      level,
      source,
      message,
      data: data ? JSON.stringify(data) : null,
      created_at: new Date().toISOString(),
    });
  } catch {}
}

// Alias for API routes (avoid name clashes)
export const saveBotLogToSupabase = saveBotLog;

// ============================================================
// SQL schema for Supabase (run this in the SQL editor)
// ============================================================

export const SUPABASE_SCHEMA_SQL = `
-- PRESIDIN Supabase schema
-- Run this in the Supabase SQL editor to create the schema.

-- Signals table
create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  timeframe text not null,
  direction text not null check (direction in ('BUY','SELL','NEUTRAL')),
  confidence double precision not null,
  consensus double precision not null,
  votes jsonb,
  entry_price double precision not null,
  stop_loss double precision not null,
  take_profit double precision not null,
  rr_ratio double precision not null,
  position_size double precision not null default 0,
  status text not null default 'active' check (status in ('active','expired','executed','invalidated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists signals_symbol_timeframe_idx on public.signals (symbol, timeframe);
create index if not exists signals_created_at_idx on public.signals (created_at desc);
create index if not exists signals_status_idx on public.signals (status);

-- Trades table
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  symbol text not null,
  broker text not null default 'paper',
  direction text not null check (direction in ('BUY','SELL')),
  quantity double precision not null,
  entry_price double precision not null,
  exit_price double precision,
  entry_time timestamptz not null default now(),
  exit_time timestamptz,
  stop_loss double precision,
  take_profit double precision,
  pnl double precision,
  pnl_pct double precision,
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trades_symbol_idx on public.trades (symbol);
create index if not exists trades_status_idx on public.trades (status);
create index if not exists trades_created_at_idx on public.trades (created_at desc);

-- Chat threads
create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  provider text not null default 'zai',
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  tokens_in integer default 0,
  tokens_out integer default 0,
  provider text,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_thread_id_idx on public.chat_messages (thread_id, created_at);

-- Bot logs
create table if not exists public.bot_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('info','warn','error','debug')),
  source text not null,
  message text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bot_logs_created_at_idx on public.bot_logs (created_at desc);
create index if not exists bot_logs_level_idx on public.bot_logs (level);

-- Notification log
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  level text not null,
  title text not null,
  body text not null,
  source text not null,
  sent_at timestamptz not null default now(),
  success boolean not null default true
);
create index if not exists notification_log_sent_at_idx on public.notification_log (sent_at desc);

-- Backtest results
create table if not exists public.backtests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  symbol text not null,
  timeframe text not null,
  config jsonb not null,
  metrics jsonb not null,
  trades_count integer not null,
  created_at timestamptz not null default now()
);
create index if not exists backtests_created_at_idx on public.backtests (created_at desc);

-- User settings (key-value)
create table if not exists public.user_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Enable RLS
alter table public.signals enable row level security;
alter table public.trades enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.bot_logs enable row level security;
alter table public.notification_log enable row level security;
alter table public.backtests enable row level security;
alter table public.user_settings enable row level security;

-- Public read for signals (read-only market data)
create policy "Signals are readable by all" on public.signals for select using (true);

-- Authenticated users can CRUD their own trades / chat / backtests / settings
create policy "Users manage own trades" on public.trades for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own chat_threads" on public.chat_threads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own chat_messages" on public.chat_messages for all using (
  exists (select 1 from public.chat_threads t where t.id = chat_messages.thread_id and t.user_id = auth.uid())
);
create policy "Users manage own backtests" on public.backtests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own settings" on public.user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Updated_at triggers
create or replace function public.handle_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists signals_updated_at on public.signals;
create trigger signals_updated_at before update on public.signals for each row execute function public.handle_updated_at();

drop trigger if exists trades_updated_at on public.trades;
create trigger trades_updated_at before update on public.trades for each row execute function public.handle_updated_at();

drop trigger if exists chat_threads_updated_at on public.chat_threads;
create trigger chat_threads_updated_at before update on public.chat_threads for each row execute function public.handle_updated_at();
`;
