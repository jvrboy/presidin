"use client";

import { useState, useEffect } from "react";
import { GlassPanel, SectionTitle, KpiCard, DirectionBadge, ShimmerButton, LiquidProgress, ConfidenceMeter } from "@/components/presidin/glass";
import { CandlestickChart, TrendingUp, TrendingDown, Wallet, Activity, Plus, X } from "lucide-react";
import { useWatchlistStore, useAccountStore } from "@/stores/presidin";
import { SYMBOL_MAP, DEFAULT_ACTIVE_SYMBOLS, formatCurrency, formatPrice } from "@/lib/presidin/symbols";
import { marketData } from "@/lib/presidin/market-data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Position {
  id: string;
  symbol: string;
  direction: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPct: number;
  openedAt: number;
  broker: "paper" | "deriv" | "mt5";
}

interface Order {
  id: string;
  symbol: string;
  direction: "BUY" | "SELL";
  quantity: number;
  type: "market" | "limit" | "stop";
  price?: number;
  status: "pending" | "filled" | "cancelled";
  createdAt: number;
}

interface ClosedTrade {
  id: string;
  symbol: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  openedAt: number;
  closedAt: number;
}

export function TradingSection() {
  const { activeSymbol, setActiveSymbol } = useWatchlistStore();
  const { equity, balance, setEquity, setOpenPnl } = useAccountStore();
  const [broker, setBroker] = useState<"paper" | "deriv" | "mt5">("paper");
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<ClosedTrade[]>([]);
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const [size, setSize] = useState(0.1);
  const [direction, setDirection] = useState<"BUY" | "SELL">("BUY");
  const [tab, setTab] = useState("positions");

  // Subscribe to live quotes
  useEffect(() => {
    marketData.connect();
    const unsubs = DEFAULT_ACTIVE_SYMBOLS.map((sym) =>
      marketData.subscribe(sym, (tick) => {
        setQuotes((q) => ({ ...q, [sym]: tick.quote }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  // Update P&L on positions
  useEffect(() => {
    const updated = positions.map((p) => {
      const cur = quotes[p.symbol] ?? p.currentPrice;
      const pnl = (p.direction === "BUY" ? cur - p.entryPrice : p.entryPrice - cur) * p.quantity * 100000;
      const pnlPct = ((cur - p.entryPrice) / p.entryPrice) * 100 * (p.direction === "BUY" ? 1 : -1);
      return { ...p, currentPrice: cur, pnl, pnlPct };
    });
    if (JSON.stringify(updated) !== JSON.stringify(positions)) {
      setPositions(updated);
      const totalPnl = updated.reduce((a, p) => a + p.pnl, 0);
      setOpenPnl(totalPnl);
    }
  }, [quotes]);

  const placeMarketOrder = () => {
    const price = quotes[activeSymbol] ?? 1;
    const pos: Position = {
      id: `pos_${Date.now()}`,
      symbol: activeSymbol,
      direction,
      quantity: size,
      entryPrice: price,
      currentPrice: price,
      pnl: 0,
      pnlPct: 0,
      openedAt: Date.now(),
      broker,
    };
    setPositions((p) => [...p, pos]);
  };

  const closePosition = (id: string) => {
    const pos = positions.find((p) => p.id === id);
    if (!pos) return;
    const closed: ClosedTrade = {
      id: pos.id,
      symbol: pos.symbol,
      direction: pos.direction,
      entryPrice: pos.entryPrice,
      exitPrice: pos.currentPrice,
      pnl: pos.pnl,
      pnlPct: pos.pnlPct,
      openedAt: pos.openedAt,
      closedAt: Date.now(),
    };
    setHistory((h) => [closed, ...h]);
    setEquity(equity + pos.pnl);
    setPositions((p) => p.filter((x) => x.id !== id));
  };

  const totalPnl = positions.reduce((a, p) => a + p.pnl, 0);
  const winRate = history.length > 0
    ? (history.filter((t) => t.pnl > 0).length / history.length) * 100
    : 0;

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="Live Trading"
        subtitle="Paper · Deriv · MT5 — positions, orders, history"
        icon={<CandlestickChart className="h-5 w-5" />}
        right={
          <Select value={broker} onValueChange={(v) => setBroker(v as any)}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="paper">Paper (simulated)</SelectItem>
              <SelectItem value="deriv">Deriv (live)</SelectItem>
              <SelectItem value="mt5">MT5 bridge</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Account Balance"
          value={formatCurrency(balance)}
          delta={formatCurrency(equity - balance) + " unrealized"}
          deltaType={equity >= balance ? "up" : "down"}
          icon={<Wallet className="h-4 w-4" />}
        />
        <KpiCard
          label="Open P&L"
          value={`${totalPnl >= 0 ? "+" : ""}${formatCurrency(totalPnl)}`}
          delta={`${positions.length} positions open`}
          deltaType={totalPnl >= 0 ? "up" : "down"}
          icon={totalPnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
        />
        <KpiCard
          label="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          delta={`${history.filter((t) => t.pnl > 0).length}W / ${history.filter((t) => t.pnl <= 0).length}L`}
          deltaType={winRate >= 50 ? "up" : "down"}
          icon={<Activity className="h-4 w-4" />}
        />
        <KpiCard
          label="Total Trades"
          value={history.length}
          delta={`${history.length + positions.length} lifetime`}
          deltaType="neutral"
          icon={<CandlestickChart className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Order ticket */}
        <GlassPanel veil>
          <h3 className="mb-3 text-sm font-semibold">Order Ticket</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Symbol</label>
              <Select value={activeSymbol} onValueChange={setActiveSymbol}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_ACTIVE_SYMBOLS.map((s) => (
                    <SelectItem key={s} value={s}>{SYMBOL_MAP[s]?.display ?? s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Current price</label>
              <div className="mt-1 rounded-md bg-secondary/40 p-2 text-sm tnum font-semibold">
                {quotes[activeSymbol] ? formatPrice(quotes[activeSymbol], SYMBOL_MAP[activeSymbol]?.digits ?? 4) : "—"}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Size (lots)</label>
              <input
                type="number"
                value={size}
                step={0.01}
                min={0.01}
                onChange={(e) => setSize(parseFloat(e.target.value) || 0.01)}
                className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm tnum"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setDirection("BUY")}
                className={`rounded-lg py-2 text-sm font-bold transition ${
                  direction === "BUY"
                    ? "bg-emerald-500 text-white"
                    : "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                }`}
              >
                BUY
              </button>
              <button
                onClick={() => setDirection("SELL")}
                className={`rounded-lg py-2 text-sm font-bold transition ${
                  direction === "SELL"
                    ? "bg-rose-500 text-white"
                    : "bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                }`}
              >
                SELL
              </button>
            </div>
            <ShimmerButton onClick={placeMarketOrder} className="w-full">
              <Plus className="h-4 w-4" />
              Place market order ({broker})
            </ShimmerButton>
            {broker === "deriv" && (
              <p className="text-[10px] text-amber-400/80">⚠ Deriv live trading requires API token (Settings → Providers)</p>
            )}
            {broker === "mt5" && (
              <p className="text-[10px] text-amber-400/80">⚠ MT5 bridge requires NexusBridge EA running on MT5 terminal</p>
            )}
          </div>
        </GlassPanel>

        {/* Positions / orders / history */}
        <GlassPanel className="lg:col-span-2" veil>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-3 max-w-md">
              <TabsTrigger value="positions">
                Positions ({positions.length})
              </TabsTrigger>
              <TabsTrigger value="orders">
                Orders ({orders.length})
              </TabsTrigger>
              <TabsTrigger value="history">
                History ({history.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="positions" className="space-y-2">
              {positions.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No open positions.</div>
              ) : (
                positions.map((p) => (
                  <div key={p.id} className="grid grid-cols-12 items-center gap-2 rounded-lg bg-secondary/30 p-3 text-xs ring-1 ring-border/30">
                    <div className="col-span-2 flex items-center gap-2">
                      <DirectionBadge direction={p.direction} className="!px-1.5 !py-0 !text-[10px]" />
                      <span className="font-semibold">{SYMBOL_MAP[p.symbol]?.display ?? p.symbol}</span>
                    </div>
                    <div className="col-span-2 tnum text-muted-foreground">
                      {p.quantity.toFixed(2)} @ {formatPrice(p.entryPrice, 4)}
                    </div>
                    <div className="col-span-2 tnum text-muted-foreground">
                      → {formatPrice(p.currentPrice, 4)}
                    </div>
                    <div className={`col-span-2 tnum font-semibold ${p.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {p.pnl >= 0 ? "+" : ""}{formatCurrency(p.pnl)}
                    </div>
                    <div className={`col-span-2 tnum ${p.pnlPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {p.pnlPct >= 0 ? "+" : ""}{p.pnlPct.toFixed(3)}%
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <button
                        onClick={() => closePosition(p.id)}
                        className="rounded-md bg-secondary/60 p-1.5 text-muted-foreground hover:bg-rose-500/20 hover:text-rose-300"
                        title="Close position"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
            <TabsContent value="orders" className="space-y-2">
              {orders.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No pending orders. Market orders fill instantly — use limit/stop orders for delayed fills.</div>
              ) : orders.map((o) => (
                <div key={o.id} className="grid grid-cols-12 items-center gap-2 rounded-lg bg-secondary/30 p-3 text-xs">
                  <div className="col-span-3 font-semibold">{SYMBOL_MAP[o.symbol]?.display ?? o.symbol}</div>
                  <div className="col-span-2">{o.direction}</div>
                  <div className="col-span-2 tnum">{o.quantity}</div>
                  <div className="col-span-2">{o.type}</div>
                  <div className="col-span-2">{o.status}</div>
                </div>
              ))}
            </TabsContent>
            <TabsContent value="history" className="space-y-2 max-h-96 overflow-y-auto scroll-fancy">
              {history.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No closed trades yet.</div>
              ) : history.map((t) => (
                <div key={t.id} className="grid grid-cols-12 items-center gap-2 rounded-lg bg-secondary/20 p-3 text-xs">
                  <div className="col-span-3 flex items-center gap-2">
                    <DirectionBadge direction={t.direction} className="!px-1.5 !py-0 !text-[10px]" />
                    <span className="font-semibold">{SYMBOL_MAP[t.symbol]?.display ?? t.symbol}</span>
                  </div>
                  <div className="col-span-3 tnum text-muted-foreground">
                    {formatPrice(t.entryPrice, 4)} → {formatPrice(t.exitPrice, 4)}
                  </div>
                  <div className={`col-span-3 tnum font-semibold ${t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {t.pnl >= 0 ? "+" : ""}{formatCurrency(t.pnl)}
                  </div>
                  <div className="col-span-3 text-right text-muted-foreground">
                    {new Date(t.closedAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </GlassPanel>
      </div>
    </div>
  );
}
