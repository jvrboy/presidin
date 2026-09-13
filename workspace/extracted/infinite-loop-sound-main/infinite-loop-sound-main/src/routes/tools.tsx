import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { FOREX_ASSETS, deriv, displayPair } from "@/lib/engine/deriv";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart,
  Calculator,
  Clock,
  Gauge,
  LineChart,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
  AlignJustify,
  ArrowUpFromLine,
  Dices,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  classicPivots,
  fibonacciPivots,
  camarillaPivots,
  type PivotLevels,
} from "@/lib/engine/pivots";
import { riskOfRuin, type RiskOfRuinResult } from "@/lib/engine/risk-of-ruin";

export const Route = createFileRoute("/tools")({
  head: () => ({
    meta: [
      { title: "Forex Tools — DivergenceIQ" },
      {
        name: "description",
        content:
          "Real-time forex calculators, sessions, tick volatility, and currency strength tools powered by live market quotes.",
      },
    ],
  }),
  component: ToolsPage,
});

type LiveQuote = {
  symbol: string;
  price: number;
  previous: number;
  change: number;
  changePct: number;
  ticks: number[];
  updatedAt: number;
};

const WATCHLIST = FOREX_ASSETS.slice(0, 12);
const USD_PAIRS = [
  "frxEURUSD",
  "frxGBPUSD",
  "frxAUDUSD",
  "frxNZDUSD",
  "frxUSDJPY",
  "frxUSDCAD",
  "frxUSDCHF",
  "frxEURJPY",
  "frxGBPJPY",
];
const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"];

function ToolsPage() {
  const [selectedPair, setSelectedPair] = useState("frxEURUSD");
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [balance, setBalance] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [stopPips, setStopPips] = useState(25);
  const [lots, setLots] = useState(0.1);
  const [leverage, setLeverage] = useState(100);
  const [targetPips, setTargetPips] = useState(50);
  const [fromCurrency, setFromCurrency] = useState("EUR");
  const [toCurrency, setToCurrency] = useState("USD");
  const [convertAmount, setConvertAmount] = useState(1000);
  const [clock, setClock] = useState<Date | null>(null);
  const [pivotKind, setPivotKind] = useState<"classic" | "fibonacci" | "camarilla">("classic");
  const [pivotH, setPivotH] = useState(1.085);
  const [pivotL, setPivotL] = useState(1.072);
  const [pivotC, setPivotC] = useState(1.079);
  const [rorWin, setRorWin] = useState(55);
  const [rorPayoff, setRorPayoff] = useState(1.5);
  const [rorRisk, setRorRisk] = useState(1);
  const [rorUnits, setRorUnits] = useState(100);
  const unsubRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    setClock(new Date());
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let mounted = true;
    const symbols = Array.from(new Set([...WATCHLIST.map((p) => p.symbol), ...USD_PAIRS]));
    setLastError(null);
    deriv
      .connect()
      .then(() => {
        if (!mounted) return;
        setConnected(true);
        unsubRef.current = symbols.map((symbol) =>
          deriv.subscribeTicks(symbol, (tick) => {
            if (!mounted) return;
            setQuotes((prev) => {
              const old = prev[symbol];
              const previous = old?.price ?? tick.quote;
              const ticks = [...(old?.ticks ?? []), tick.quote].slice(-90);
              const change = tick.quote - previous;
              return {
                ...prev,
                [symbol]: {
                  symbol,
                  price: tick.quote,
                  previous,
                  change,
                  changePct: previous ? (change / previous) * 100 : 0,
                  ticks,
                  updatedAt: Date.now(),
                },
              };
            });
          }),
        );
      })
      .catch((error) => {
        if (!mounted) return;
        setConnected(false);
        setLastError(error?.message || "Live quote connection failed");
      });
    return () => {
      mounted = false;
      unsubRef.current.forEach((unsub) => unsub());
      unsubRef.current = [];
    };
  }, []);

  const quote = quotes[selectedPair];
  const pairParts = splitPair(selectedPair);
  const entry = quote?.price ?? 0;
  const pipValue = entry ? pipValueUsd(selectedPair, entry, lots, quotes) : null;
  const recommendedLots =
    entry && stopPips > 0
      ? Math.max(
          0,
          (balance * (riskPct / 100)) /
            (stopPips * (pipValueUsd(selectedPair, entry, 1, quotes) || 1)),
        )
      : 0;
  const riskAmount = balance * (riskPct / 100);
  const profitAtTarget = pipValue ? pipValue * targetPips : 0;
  const lossAtStop = pipValue ? pipValue * stopPips : 0;
  const margin = entry ? marginUsd(selectedPair, entry, lots, leverage, quotes) : 0;
  const conversionRate = currencyRate(fromCurrency, toCurrency, quotes);
  const convertedAmount = conversionRate ? convertAmount * conversionRate : null;
  const strength = useMemo(() => buildCurrencyStrength(quotes), [quotes]);
  const sessions = useMemo(() => buildSessions(clock), [clock]);
  const pivotResult = useMemo<PivotLevels | null>(() => {
    if (!pivotH || !pivotL || !pivotC) return null;
    if (pivotKind === "fibonacci") return fibonacciPivots(pivotH, pivotL, pivotC);
    if (pivotKind === "camarilla") return camarillaPivots(pivotH, pivotL, pivotC);
    return classicPivots(pivotH, pivotL, pivotC);
  }, [pivotH, pivotL, pivotC, pivotKind]);
  const rorResult = useMemo<RiskOfRuinResult | null>(() => {
    if (!rorWin || !rorPayoff || !rorRisk) return null;
    return riskOfRuin({
      winRate: rorWin / 100,
      payoffRatio: rorPayoff,
      riskPerTradePct: rorRisk,
      bankrollUnits: rorUnits,
    });
  }, [rorWin, rorPayoff, rorRisk, rorUnits]);
  const volatilityRows = WATCHLIST.map((asset) => ({
    asset,
    quote: quotes[asset.symbol],
    pips: tickVolatilityPips(asset.symbol, quotes[asset.symbol]),
  })).sort((a, b) => b.pips - a.pips);

  return (
    <AppShell>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pb-24 pt-4 sm:px-5 md:px-6 md:pb-8 md:pt-6">
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-card/80 p-4 shadow-sm md:flex-row md:items-end md:justify-between md:p-5">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1">
                <span className={`h-2 w-2 rounded-full ${connected ? "bg-bull" : "bg-bear"}`} />
                {connected ? "Live market data" : "Disconnected"}
              </span>
              <span>{clock ? clock.toUTCString().slice(17, 25) : "--:--:--"} UTC</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-normal md:text-3xl">
              Professional Forex Tools
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Real-time calculators, session timing, volatility, conversion, and currency strength
              built from live Deriv quote streams.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <select
              value={selectedPair}
              onChange={(event) => setSelectedPair(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {WATCHLIST.map((asset) => (
                <option key={asset.symbol} value={asset.symbol}>
                  {asset.display}
                </option>
              ))}
            </select>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground transition hover:bg-accent"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </section>

        {lastError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {lastError}. Calculators remain available, but live values will appear once the quote
            stream reconnects.
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={LineChart}
            label="Selected pair"
            value={displayPair(selectedPair)}
            detail={entry ? formatPrice(entry, pairParts.quote) : "Waiting for first tick"}
            tone={quote ? (quote.change >= 0 ? "bull" : "bear") : "neutral"}
          />
          <MetricCard
            icon={Activity}
            label="Live move"
            value={
              quote ? `${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(4)}%` : "--"
            }
            detail={quote ? `${quote.ticks.length} live ticks sampled` : "No tick yet"}
            tone={quote ? (quote.changePct >= 0 ? "bull" : "bear") : "neutral"}
          />
          <MetricCard
            icon={Gauge}
            label="Tick volatility"
            value={`${tickVolatilityPips(selectedPair, quote).toFixed(1)} pips`}
            detail="Range from the latest live ticks"
            tone="neutral"
          />
          <MetricCard
            icon={Clock}
            label="Open sessions"
            value={sessions.filter((s) => s.open).length.toString()}
            detail={
              sessions
                .filter((s) => s.open)
                .map((s) => s.name)
                .join(" / ") || "Markets transitioning"
            }
            tone="neutral"
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <Panel title="Risk, Position & P/L Calculator" icon={Calculator}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField
                label="Account balance"
                value={balance}
                onChange={setBalance}
                prefix="$"
              />
              <NumberField
                label="Risk"
                value={riskPct}
                onChange={setRiskPct}
                suffix="%"
                step={0.1}
              />
              <NumberField
                label="Stop loss"
                value={stopPips}
                onChange={setStopPips}
                suffix="pips"
              />
              <NumberField label="Lot size" value={lots} onChange={setLots} step={0.01} />
              <NumberField label="Leverage" value={leverage} onChange={setLeverage} prefix="1:" />
              <NumberField
                label="Target"
                value={targetPips}
                onChange={setTargetPips}
                suffix="pips"
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Result label="Pip value" value={pipValue ? money(pipValue) : "Need live price"} />
              <Result
                label="Suggested lots"
                value={recommendedLots ? recommendedLots.toFixed(2) : "--"}
              />
              <Result label="Risk amount" value={money(riskAmount)} />
              <Result label="Margin required" value={margin ? money(margin) : "--"} />
              <Result
                label="Profit at target"
                value={profitAtTarget ? money(profitAtTarget) : "--"}
                tone="bull"
              />
              <Result
                label="Loss at stop"
                value={lossAtStop ? money(lossAtStop) : "--"}
                tone="bear"
              />
              <Result
                label="Risk : reward"
                value={stopPips ? `1:${(targetPips / stopPips).toFixed(2)}` : "--"}
              />
              <Result
                label="Breakeven win rate"
                value={
                  targetPips > 0
                    ? `${((stopPips / (stopPips + targetPips)) * 100).toFixed(1)}%`
                    : "--"
                }
              />
            </div>
          </Panel>

          <Panel title="Live Currency Converter" icon={Wallet}>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
              <NumberField label="Amount" value={convertAmount} onChange={setConvertAmount} />
              <div className="grid grid-cols-2 gap-2 sm:contents">
                <SelectField
                  label="From"
                  value={fromCurrency}
                  onChange={setFromCurrency}
                  options={CURRENCIES}
                />
                <SelectField
                  label="To"
                  value={toCurrency}
                  onChange={setToCurrency}
                  options={CURRENCIES}
                />
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-border bg-background p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Converted value
              </div>
              <div className="mt-1 text-2xl font-semibold tabular">
                {convertedAmount == null
                  ? "Waiting for rate"
                  : `${convertedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${toCurrency}`}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {conversionRate
                  ? `1 ${fromCurrency} = ${conversionRate.toFixed(5)} ${toCurrency}`
                  : "Rate appears when matching live pair data is available."}
              </div>
            </div>
          </Panel>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <Panel title="Live Watchlist" icon={BarChart} className="xl:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 text-left font-medium">Pair</th>
                    <th className="py-2 text-right font-medium">Price</th>
                    <th className="py-2 text-right font-medium">Move</th>
                    <th className="py-2 text-right font-medium">Volatility</th>
                    <th className="py-2 text-right font-medium">Ticks</th>
                  </tr>
                </thead>
                <tbody>
                  {WATCHLIST.map((asset) => {
                    const row = quotes[asset.symbol];
                    const parts = splitPair(asset.symbol);
                    const up = (row?.change ?? 0) >= 0;
                    return (
                      <tr key={asset.symbol} className="border-b border-border/60 last:border-0">
                        <td className="py-3 font-medium">{asset.display}</td>
                        <td className="py-3 text-right font-mono tabular">
                          {row ? formatPrice(row.price, parts.quote) : "--"}
                        </td>
                        <td
                          className={`py-3 text-right font-mono tabular ${up ? "text-bull" : "text-bear"}`}
                        >
                          {row ? `${up ? "+" : ""}${row.changePct.toFixed(4)}%` : "--"}
                        </td>
                        <td className="py-3 text-right font-mono tabular">
                          {tickVolatilityPips(asset.symbol, row).toFixed(1)} pips
                        </td>
                        <td className="py-3 text-right font-mono tabular">
                          {row?.ticks.length ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Market Sessions" icon={Clock}>
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.name}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{session.name}</div>
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${session.open ? "bg-bull/15 text-bull" : "bg-muted text-muted-foreground"}`}
                    >
                      {session.open ? "OPEN" : "CLOSED"}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${session.progress}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">{session.hours} UTC</div>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <Panel title="Currency Strength" icon={ShieldCheck}>
            <div className="space-y-3">
              {strength.map((item) => (
                <div key={item.currency}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{item.currency}</span>
                    <span
                      className={`font-mono tabular ${item.score >= 0 ? "text-bull" : "text-bear"}`}
                    >
                      {item.score >= 0 ? "+" : ""}
                      {item.score.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${item.score >= 0 ? "bg-bull" : "bg-bear"}`}
                      style={{ width: `${Math.min(100, Math.abs(item.score) * 18)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Volatility Leaderboard" icon={Zap}>
            <div className="space-y-2">
              {volatilityRows.slice(0, 7).map(({ asset, pips }, index) => (
                <div
                  key={asset.symbol}
                  className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-xs text-muted-foreground">#{index + 1}</span>
                    <span className="font-medium">{asset.display}</span>
                  </div>
                  <span className="font-mono tabular">{pips.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Trade Readiness" icon={Target}>
            <div className="space-y-3">
              <ReadinessItem
                icon={entry ? Activity : RefreshCw}
                label="Live price"
                ok={Boolean(entry)}
              />
              <ReadinessItem
                icon={riskPct <= 2 ? ShieldCheck : TrendingDown}
                label="Risk ≤ 2%"
                ok={riskPct <= 2}
              />
              <ReadinessItem
                icon={targetPips > stopPips ? TrendingUp : TrendingDown}
                label="Positive reward"
                ok={targetPips > stopPips}
              />
              <ReadinessItem
                icon={margin < balance ? Wallet : TrendingDown}
                label="Margin within balance"
                ok={Boolean(margin && margin < balance)}
              />
            </div>
          </Panel>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Panel title="Pivot Points" icon={ArrowUpFromLine}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label="Method"
                  value={pivotKind}
                  onChange={(v) => setPivotKind(v as "classic" | "fibonacci" | "camarilla")}
                  options={["classic", "fibonacci", "camarilla"]}
                />
                <NumberField label="Prev High" value={pivotH} onChange={setPivotH} step={0.0001} />
                <NumberField label="Prev Low" value={pivotL} onChange={setPivotL} step={0.0001} />
                <NumberField label="Prev Close" value={pivotC} onChange={setPivotC} step={0.0001} />
              </div>
              {pivotResult && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <PivotRow label="R3" value={pivotResult.r3} tone="bear" />
                  <PivotRow label="R2" value={pivotResult.r2} tone="bear" />
                  <PivotRow label="R1" value={pivotResult.r1} tone="bear" />
                  <PivotRow label="PP" value={pivotResult.pp} tone="neutral" />
                  <PivotRow label="S1" value={pivotResult.s1} tone="bull" />
                  <PivotRow label="S2" value={pivotResult.s2} tone="bull" />
                  <PivotRow label="S3" value={pivotResult.s3} tone="bull" />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {pivotResult?.kind.toUpperCase()} pivots from the previous session's H/L/C.
                Resistance above PP, support below.
              </p>
            </div>
          </Panel>

          <Panel title="Risk of Ruin" icon={Dices}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Win Rate %"
                  value={rorWin}
                  onChange={setRorWin}
                  suffix="%"
                  step={1}
                />
                <NumberField
                  label="Payoff Ratio"
                  value={rorPayoff}
                  onChange={setRorPayoff}
                  step={0.1}
                />
                <NumberField
                  label="Risk / Trade %"
                  value={rorRisk}
                  onChange={setRorRisk}
                  suffix="%"
                  step={0.1}
                />
                <NumberField
                  label="Bankroll Units"
                  value={rorUnits}
                  onChange={setRorUnits}
                  step={10}
                />
              </div>
              {rorResult && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Result
                    label="Risk of Ruin"
                    value={`${(rorResult.ror * 100).toFixed(2)}%`}
                    tone={rorResult.ror < 0.01 ? "bull" : rorResult.ror > 0.5 ? "bear" : "neutral"}
                  />
                  <Result
                    label="Edge (R/trade)"
                    value={rorResult.edge.toFixed(3)}
                    tone={rorResult.isProfitable ? "bull" : "bear"}
                  />
                  <Result
                    label="Kelly Fraction"
                    value={`${(rorResult.kellyFraction * 100).toFixed(1)}%`}
                  />
                  <Result
                    label="Half-Kelly Risk"
                    value={`${rorResult.recommendedRiskPct.toFixed(2)}%`}
                    tone="bull"
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {rorResult?.isProfitable
                  ? "System has a positive edge. Half-Kelly is the recommended max risk per trade."
                  : "System is NOT profitable at these inputs — edge must be positive for ruin probability to be meaningful."}
              </p>
            </div>
          </Panel>
        </section>
      </main>
    </AppShell>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
  className = "",
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-border bg-card/80 p-4 shadow-sm md:p-5 ${className}`}
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/12 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-base font-semibold tracking-normal">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: "bull" | "bear" | "neutral";
}) {
  const toneClass =
    tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className={`text-xl font-semibold tabular ${toneClass}`}>{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
        {prefix && <span className="mr-1 text-sm text-muted-foreground">{prefix}</span>}
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          min={0}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
        />
        {suffix && <span className="ml-1 text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Result({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "bull" | "bear" | "neutral";
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-lg font-semibold tabular ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

function PivotRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "bull" | "bear" | "neutral";
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 text-sm font-semibold tabular ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground"}`}
      >
        {value.toFixed(5)}
      </div>
    </div>
  );
}

function ReadinessItem({
  icon: Icon,
  label,
  ok,
}: {
  icon: LucideIcon;
  label: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4 text-muted-foreground" /> {label}
      </div>
      <span
        className={`rounded-md px-2 py-1 text-xs font-semibold ${ok ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear"}`}
      >
        {ok ? "OK" : "CHECK"}
      </span>
    </div>
  );
}

function splitPair(symbol: string) {
  const clean = symbol.replace(/^frx/, "");
  return { base: clean.slice(0, 3), quote: clean.slice(3, 6) };
}

function formatPrice(price: number, quoteCurrency: string) {
  return price.toLocaleString(undefined, {
    minimumFractionDigits: quoteCurrency === "JPY" ? 3 : 5,
    maximumFractionDigits: quoteCurrency === "JPY" ? 3 : 5,
  });
}

function money(value: number) {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function currencyRate(from: string, to: string, quotes: Record<string, LiveQuote>): number | null {
  if (from === to) return 1;
  const directOrInverse = (base: string, quote: string) => {
    const direct = quotes[`frx${base}${quote}`]?.price;
    if (direct) return direct;
    const inverse = quotes[`frx${quote}${base}`]?.price;
    return inverse ? 1 / inverse : null;
  };
  const directRate = directOrInverse(from, to);
  if (directRate) return directRate;
  const fromUsd = from === "USD" ? 1 : directOrInverse(from, "USD");
  const toUsd = to === "USD" ? 1 : directOrInverse(to, "USD");
  return fromUsd && toUsd ? fromUsd / toUsd : null;
}

function pipValueUsd(
  symbol: string,
  price: number,
  lots: number,
  quotes: Record<string, LiveQuote>,
) {
  const { quote } = splitPair(symbol);
  const pipSize = quote === "JPY" ? 0.01 : 0.0001;
  const quotePipValue = pipSize * 100000 * lots;
  if (quote === "USD") return quotePipValue;
  if (symbol === `frxUSD${quote}`) return quotePipValue / price;
  const rate = currencyRate(quote, "USD", quotes);
  return rate ? quotePipValue * rate : null;
}

function marginUsd(
  symbol: string,
  price: number,
  lots: number,
  leverage: number,
  quotes: Record<string, LiveQuote>,
) {
  if (!leverage) return 0;
  const { base, quote } = splitPair(symbol);
  const baseUnits = 100000 * lots;
  if (base === "USD") return baseUnits / leverage;
  if (quote === "USD") return (baseUnits * price) / leverage;
  const baseUsd = currencyRate(base, "USD", quotes);
  return baseUsd ? (baseUnits * baseUsd) / leverage : 0;
}

function tickVolatilityPips(symbol: string, quote?: LiveQuote) {
  if (!quote?.ticks.length) return 0;
  const { quote: quoteCurrency } = splitPair(symbol);
  const pipSize = quoteCurrency === "JPY" ? 0.01 : 0.0001;
  const high = Math.max(...quote.ticks);
  const low = Math.min(...quote.ticks);
  return (high - low) / pipSize;
}

function buildCurrencyStrength(quotes: Record<string, LiveQuote>) {
  const scores = Object.fromEntries(CURRENCIES.map((currency) => [currency, 0])) as Record<
    string,
    number
  >;
  Object.values(quotes).forEach((quote) => {
    if (!quote.symbol.startsWith("frx") || !quote.changePct) return;
    const { base, quote: quoteCurrency } = splitPair(quote.symbol);
    if (scores[base] == null || scores[quoteCurrency] == null) return;
    scores[base] += quote.changePct;
    scores[quoteCurrency] -= quote.changePct;
  });
  return Object.entries(scores)
    .map(([currency, score]) => ({ currency, score }))
    .sort((a, b) => b.score - a.score);
}

function buildSessions(now: Date | null) {
  const hour = now ? now.getUTCHours() + now.getUTCMinutes() / 60 : 0;
  const sessions = [
    { name: "Sydney", start: 21, end: 6, hours: "21:00–06:00" },
    { name: "Tokyo", start: 0, end: 9, hours: "00:00–09:00" },
    { name: "London", start: 7, end: 16, hours: "07:00–16:00" },
    { name: "New York", start: 12, end: 21, hours: "12:00–21:00" },
  ];
  return sessions.map((session) => {
    const open =
      session.start < session.end
        ? hour >= session.start && hour < session.end
        : hour >= session.start || hour < session.end;
    const length =
      session.start < session.end ? session.end - session.start : 24 - session.start + session.end;
    const elapsed = open
      ? hour >= session.start
        ? hour - session.start
        : 24 - session.start + hour
      : 0;
    return { ...session, open, progress: open ? Math.min(100, (elapsed / length) * 100) : 0 };
  });
}
