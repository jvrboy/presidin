"use client";

import { useEffect, useState } from "react";
import { GlassPanel, SectionTitle, KpiCard, ShimmerButton, DirectionBadge } from "@/components/presidin/glass";
import { Wrench, Activity, Grid3x3, Coins, Clock, BarChart3, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { analyzeSentiment, type SentimentResult } from "@/lib/presidin/tools";
import { SYMBOL_MAP } from "@/lib/presidin/symbols";

interface CurrencyStrength {
  currency: string;
  score: number;
  change: number;
  rank: number;
}

interface OnChainMetrics {
  symbol: string;
  activeAddresses: number;
  transactionCount: number;
  totalSupply: number;
  circulatingSupply: number;
  marketCap: number;
  mvrvRatio: number;
  nupl: number;
  exchangeInflow: number;
  exchangeOutflow: number;
  sentiment: string;
}

export function ToolsSection() {
  const [tab, setTab] = useState("strength");
  const [strengths, setStrengths] = useState<CurrencyStrength[]>([]);
  const [session, setSession] = useState<any>(null);
  const [onchain, setOnchain] = useState<OnChainMetrics | null>(null);
  const [cryptoSymbol, setCryptoSymbol] = useState("cryBTCUSD");
  const [sentimentText, setSentimentText] = useState("The dollar surged today on hawkish Fed comments, boosting Treasury yields and weighing on risk assets. Euro tumbled on weak German PMI data.");
  const [sentiment, setSentiment] = useState<SentimentResult | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, sessRes, ocRes] = await Promise.all([
        fetch("/api/currency-strength"),
        fetch("/api/session"),
        fetch(`/api/onchain?symbol=${cryptoSymbol}`),
      ]);
      setStrengths((await sRes.json()).strengths ?? []);
      setSession(await sessRes.json());
      setOnchain((await ocRes.json()).metrics ?? null);
      setSentiment(analyzeSentiment(sentimentText));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSentiment(analyzeSentiment(sentimentText));
  }, [sentimentText]);

  useEffect(() => {
    fetch(`/api/onchain?symbol=${cryptoSymbol}`).then(r => r.json()).then(d => setOnchain(d.metrics));
  }, [cryptoSymbol]);

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="Market Tools"
        subtitle="Currency strength · Correlation matrix · On-chain · Session · Sentiment analyzer"
        icon={<Wrench className="h-5 w-5" />}
        right={
          <ShimmerButton onClick={load} disabled={loading} className="text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </ShimmerButton>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-5 max-w-2xl">
          <TabsTrigger value="strength">Strength</TabsTrigger>
          <TabsTrigger value="correlation">Correlation</TabsTrigger>
          <TabsTrigger value="onchain">On-Chain</TabsTrigger>
          <TabsTrigger value="session">Session</TabsTrigger>
          <TabsTrigger value="sentiment">Sentiment</TabsTrigger>
        </TabsList>

        {/* Currency Strength */}
        <TabsContent value="strength" className="space-y-3">
          <GlassPanel veil>
            <h3 className="mb-1 text-sm font-semibold">Currency Strength Meter</h3>
            <p className="mb-3 text-xs text-muted-foreground">Computed from 24h change vs USD across 7 majors. +100 = strongest, -100 = weakest.</p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={strengths} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5% 95% / 0.08)" />
                <XAxis type="number" domain={[-100, 100]} tick={{ fill: "hsl(220 14% 65%)", fontSize: 11 }} />
                <YAxis type="category" dataKey="currency" width={50} tick={{ fill: "hsl(220 14% 65%)", fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "hsl(240 6% 10% / 0.95)", border: "1px solid hsl(240 5% 30%)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [v.toFixed(2), "Score"]} />
                <Bar dataKey="score" radius={6}>
                  {strengths.map((s, i) => (
                    <Cell key={i} fill={s.score > 30 ? "#10b981" : s.score > 0 ? "#84cc16" : s.score > -30 ? "#f59e0b" : "#f43f5e"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {strengths.slice(0, 4).map((s) => (
                <div key={s.currency} className={`rounded-lg p-2 ${s.rank <= 2 ? "bg-emerald-500/10" : "bg-rose-500/10"}`}>
                  <div className="text-xs text-muted-foreground">#{s.rank} {s.currency}</div>
                  <div className="tnum text-sm font-bold">{s.score.toFixed(1)}</div>
                </div>
              ))}
            </div>
          </GlassPanel>
        </TabsContent>

        {/* Correlation Matrix */}
        <TabsContent value="correlation" className="space-y-3">
          <GlassPanel veil>
            <h3 className="mb-1 text-sm font-semibold">Correlation Matrix (simulated)</h3>
            <p className="mb-3 text-xs text-muted-foreground">Pearson correlation between major pairs. +1 (green) = positively correlated, -1 (red) = inversely correlated.</p>
            <CorrelationMatrix />
          </GlassPanel>
        </TabsContent>

        {/* On-Chain */}
        <TabsContent value="onchain" className="space-y-3">
          <GlassPanel veil>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">On-Chain Metrics</h3>
              <Select value={cryptoSymbol} onValueChange={setCryptoSymbol}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cryBTCUSD">BTCUSD</SelectItem>
                  <SelectItem value="cryETHUSD">ETHUSD</SelectItem>
                  <SelectItem value="crySOLUSD">SOLUSD</SelectItem>
                  <SelectItem value="cryBNBUSD">BNBUSD</SelectItem>
                  <SelectItem value="cryXRPUSD">XRPUSD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {onchain ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  <KpiCard label="Active Addresses" value={onchain.activeAddresses.toLocaleString()} delta="24h" deltaType="neutral" icon={<Activity className="h-4 w-4" />} />
                  <KpiCard label="Transactions" value={onchain.transactionCount.toLocaleString()} delta="24h" deltaType="neutral" icon={<BarChart3 className="h-4 w-4" />} />
                  <KpiCard label="MVRV Ratio" value={onchain.mvrvRatio.toFixed(2)} delta={onchain.mvrvRatio > 3 ? "top zone" : onchain.mvrvRatio < 1 ? "undervalued" : "neutral"} deltaType={onchain.mvrvRatio > 3 ? "down" : onchain.mvrvRatio < 1 ? "up" : "neutral"} icon={<Coins className="h-4 w-4" />} />
                  <KpiCard label="Market Cap" value={`$${(onchain.marketCap / 1e9).toFixed(1)}B`} delta="USD" deltaType="neutral" icon={<Coins className="h-4 w-4" />} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-secondary/40 p-3">
                    <div className="text-xs text-muted-foreground">Net Exchange Flow</div>
                    <div className={`tnum text-lg font-bold ${onchain.exchangeOutflow > onchain.exchangeInflow ? "text-emerald-400" : "text-rose-400"}`}>
                      {(onchain.exchangeOutflow - onchain.exchangeInflow).toFixed(0)} {onchain.symbol.replace("cry", "")}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{onchain.exchangeOutflow > onchain.exchangeInflow ? "outflow (bullish)" : "inflow (bearish)"}</div>
                  </div>
                  <div className="rounded-lg bg-secondary/40 p-3">
                    <div className="text-xs text-muted-foreground">Fear & Greed</div>
                    <div className={`tnum text-lg font-bold capitalize ${
                      onchain.sentiment === "extreme_fear" ? "text-rose-400"
                      : onchain.sentiment === "fear" ? "text-amber-400"
                      : onchain.sentiment === "neutral" ? "text-slate-400"
                      : onchain.sentiment === "greed" ? "text-lime-400"
                      : "text-emerald-400"
                    }`}>{onchain.sentiment.replace("_", " ")}</div>
                    <div className="text-[10px] text-muted-foreground">NUPL: {onchain.nupl.toFixed(2)}</div>
                  </div>
                </div>
                <div className="mt-3 rounded-lg bg-amber-500/10 p-2 text-[10px] text-amber-300">
                  ⚠ On-chain data is currently simulated. Wire in Glassnode / CryptoQuant / Santiment API for production.
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            )}
          </GlassPanel>
        </TabsContent>

        {/* Session */}
        <TabsContent value="session" className="space-y-3">
          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">Trading Session</h3>
            {session && (
              <div className="space-y-3">
                <div className="rounded-lg bg-violet-500/10 p-4 ring-1 ring-violet-500/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Current session</div>
                      <div className="mt-1 text-2xl font-bold text-violet-200">{session.session.replace("_", " ")}</div>
                    </div>
                    <Clock className="h-8 w-8 text-violet-400" />
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">{session.description}</div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { name: "Sydney", hours: "22:00–07:00 UTC", focus: "AUD/NZD" },
                    { name: "Tokyo", hours: "00:00–09:00 UTC", focus: "JPY" },
                    { name: "London", hours: "07:00–16:00 UTC", focus: "EUR/GBP" },
                    { name: "New York", hours: "12:00–21:00 UTC", focus: "USD/CAD" },
                  ].map((s) => {
                    const isCurrent = session.session === s.name.toUpperCase().replace(" ", "_");
                    return (
                      <div key={s.name} className={`rounded-lg p-3 ${isCurrent ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : "bg-secondary/30"}`}>
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold">{s.name}</div>
                          {isCurrent && <span className="pulse-dot" />}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{s.hours}</div>
                        <div className="text-[10px] text-muted-foreground">Focus: {s.focus}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="rounded-lg bg-secondary/30 p-3 text-xs">
                  <strong>Peak liquidity:</strong> London-NY overlap (12:00–16:00 UTC) — best for EURUSD, GBPUSD, XAUUSD.
                  <br /><strong>Range bias:</strong> Asian session tends to range; London/NY tend to trend.
                </div>
              </div>
            )}
          </GlassPanel>
        </TabsContent>

        {/* Sentiment */}
        <TabsContent value="sentiment" className="space-y-3">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <GlassPanel veil>
              <h3 className="mb-3 text-sm font-semibold">Input Text</h3>
              <textarea
                value={sentimentText}
                onChange={(e) => setSentimentText(e.target.value)}
                rows={8}
                className="w-full rounded-md border border-border bg-background/60 p-3 text-sm"
                placeholder="Paste news article or social media text…"
              />
              <div className="mt-2 text-xs text-muted-foreground">{sentimentText.length} chars · {sentimentText.split(/\s+/).length} words</div>
            </GlassPanel>
            <GlassPanel veil>
              <h3 className="mb-3 text-sm font-semibold">Sentiment Analysis</h3>
              {sentiment && (
                <div className="space-y-3">
                  <div className={`rounded-lg p-4 text-center ${
                    sentiment.label === "bullish" ? "bg-emerald-500/10 ring-1 ring-emerald-500/20"
                    : sentiment.label === "bearish" ? "bg-rose-500/10 ring-1 ring-rose-500/20"
                    : "bg-slate-500/10 ring-1 ring-slate-500/20"
                  }`}>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Sentiment</div>
                    <div className={`mt-1 text-3xl font-bold capitalize ${
                      sentiment.label === "bullish" ? "text-emerald-300"
                      : sentiment.label === "bearish" ? "text-rose-300"
                      : "text-slate-300"
                    }`}>{sentiment.label}</div>
                    <div className="mt-1 tnum text-sm">Score: {sentiment.score.toFixed(3)}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-emerald-500/10 p-3">
                      <div className="text-xs text-emerald-300">Positive words</div>
                      <div className="tnum text-xl font-bold text-emerald-200">{sentiment.positiveCount}</div>
                    </div>
                    <div className="rounded-lg bg-rose-500/10 p-3">
                      <div className="text-xs text-rose-300">Negative words</div>
                      <div className="tnum text-xl font-bold text-rose-200">{sentiment.negativeCount}</div>
                    </div>
                  </div>
                  {sentiment.topPhrases.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">Key phrases</div>
                      <div className="flex flex-wrap gap-1.5">
                        {sentiment.topPhrases.map((p, i) => (
                          <span key={i} className="rounded bg-secondary/60 px-2 py-0.5 text-[10px]">{p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground">
                    Lexicon-based NLP with negation + intensifier handling. No API key required.
                  </div>
                </div>
              )}
            </GlassPanel>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CorrelationMatrix() {
  const symbols = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD", "US30"];
  // Synthetic correlation matrix
  const matrix = [
    [1.00, 0.72, -0.58, 0.41, 0.28, 0.32],
    [0.72, 1.00, -0.49, 0.38, 0.22, 0.29],
    [-0.58, -0.49, 1.00, -0.31, -0.18, -0.24],
    [0.41, 0.38, -0.31, 1.00, 0.54, 0.46],
    [0.28, 0.22, -0.18, 0.54, 1.00, 0.61],
    [0.32, 0.29, -0.24, 0.46, 0.61, 1.00],
  ];
  const color = (v: number) => {
    if (v > 0.7) return "bg-emerald-500/60 text-white";
    if (v > 0.4) return "bg-emerald-500/30";
    if (v > 0.1) return "bg-emerald-500/10";
    if (v < -0.7) return "bg-rose-500/60 text-white";
    if (v < -0.4) return "bg-rose-500/30";
    if (v < -0.1) return "bg-rose-500/10";
    return "bg-secondary/40";
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="p-2"></th>
            {symbols.map((s) => (
              <th key={s} className="p-2 text-muted-foreground font-semibold">{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td className="p-2 text-right text-muted-foreground font-semibold">{symbols[i]}</td>
              {row.map((v, j) => (
                <td key={j} className={`p-2 text-center tnum font-medium ${color(v)}`}>
                  {v.toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-500/60" /> Strong positive</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-500/30" /> Mild positive</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-rose-500/30" /> Mild negative</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-rose-500/60" /> Strong negative</span>
      </div>
    </div>
  );
}
