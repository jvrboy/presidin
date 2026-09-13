import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { displayPair } from "@/lib/engine/deriv";
import { Check, X, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { validationStatsFor } from "@/lib/validations.functions";

export interface ConfluenceItem {
  label: string;
  passed: boolean;
  pts: number;
}

const oscKey = (label: string): string | null => {
  const m = label.toUpperCase();
  if (m.startsWith("RSI")) return "RSI";
  if (m.startsWith("MACD")) return "MACD";
  if (m.startsWith("STOCH")) return "STOCH";
  if (m.startsWith("RVI")) return "RVI";
  if (m.startsWith("OBV")) return "OBV";
  return null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  signal: any | null;
}

export function SignalDrawer({ open, onOpenChange, signal }: Props) {
  const fetchStats = useServerFn(validationStatsFor);
  const [stats, setStats] = useState<Record<string, any>>({});
  const passedDivOscs = signal
    ? (((signal.confluence || []) as ConfluenceItem[])
        .filter((c) => c.passed && c.label.toLowerCase().includes("divergence"))
        .map((c) => oscKey(c.label))
        .filter(Boolean) as string[])
    : [];

  useEffect(() => {
    if (!open || !signal) return;
    setStats({});
    const oscs = passedDivOscs.length ? passedDivOscs : ["RSI", "MACD", "STOCH"];
    oscs.forEach((osc) => {
      fetchStats({
        data: { pair: signal.pair, timeframe: signal.timeframe, oscillator: osc, limit: 5 },
      })
        .then((r) => setStats((s) => ({ ...s, [osc]: r })))
        .catch(() => {});
    });
    // eslint-disable-next-line
  }, [open, signal?.id]);

  if (!signal) return null;
  const conf: ConfluenceItem[] = (signal.confluence || []) as ConfluenceItem[];
  const passedTotal = conf.filter((c) => c.passed).reduce((a, c) => a + c.pts, 0);
  const maxTotal = conf.reduce((a, c) => a + c.pts, 0);
  const explanations: Record<string, string> = {
    "RSI Divergence":
      "RSI(14) and price disagree on the latest two pivots — classic reversal signal.",
    "MACD Divergence": "MACD histogram and price diverged — momentum is fading against the trend.",
    "Stochastic Divergence": "Stochastic %K and price diverged — short-term reversal cue.",
    "RVI Divergence": "Relative Vigor Index disagrees with price action.",
    "OBV Divergence": "On-Balance Volume diverged from price — flow no longer supports move.",
    "RVI Line Cross": "RVI line crossed its signal line in trade direction.",
    "RSI Extreme Zone": "RSI in oversold (<35) or overbought (>65) zone — reversal-prone.",
    "Volume / OBV Confirm": "Volume spike or OBV trend supports the trade direction.",
    "EMA 50/200 Aligned": "EMA50 and EMA200 stacked in trade direction — trend agreement.",
    "EMA 8/21 Momentum": "Fast EMA stack confirms short-term momentum shift.",
    "HTF Bias Aligned": "Higher-timeframe price/EMA200 bias matches signal direction.",
    "ADX Trending (>22)": "ADX > 22 — there is a trend strong enough to ride.",
    "ADX Strong (>35)": "ADX > 35 — strong trend; trail stops aggressively.",
    "BB Squeeze Breakout": "Bollinger bands compressed (squeeze) and price broke past mid-band.",
    "Candle Pattern Confirm": "Engulfing / pin-bar / 3-bar pattern in trade direction at signal.",
    "Williams %R Extreme": "Williams %R in extreme zone — reversal probability up.",
    "CCI Confirms": "CCI exiting extreme back toward zero in trade direction.",
    "MFI Extreme": "Money Flow Index in extreme zone (<30 / >70).",
    "Supertrend Aligned": "Supertrend(10,3) flipped or aligned with the signal.",
    "Parabolic SAR Aligned": "PSAR dots flipped to the signal side of price.",
    "Ichimoku T/K Aligned": "Tenkan crossed Kijun in trade direction.",
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-mono">
            <span className={signal.direction === "BUY" ? "text-bull" : "text-bear"}>
              {signal.direction}
            </span>
            {displayPair(signal.pair)} · {signal.timeframe}
            <span className="ml-auto text-xs px-2 py-0.5 rounded bg-elite/20 text-elite">
              {signal.rating}
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2 font-mono text-xs">
            <Stat label="Score" value={`${signal.score}/100`} />
            <Stat label="Confluence pts" value={`${passedTotal}/${maxTotal}`} />
            <Stat label="Entry" value={(+signal.entry).toFixed(5)} />
            <Stat label="SL" value={(+signal.sl).toFixed(5)} className="text-bear" />
            <Stat label="TP1" value={(+signal.tp1).toFixed(5)} className="text-bull" />
            <Stat label="TP2" value={(+signal.tp2).toFixed(5)} className="text-bull" />
            <Stat label="TP3" value={(+signal.tp3).toFixed(5)} className="text-bull" />
            <Stat label="Sent TG" value={signal.sent_telegram ? "Yes" : "No"} />
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3" /> Your validation accuracy (
              {signal.pair === signal.pair ? displayPair(signal.pair) : ""} · {signal.timeframe})
            </div>
            {Object.keys(stats).length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No validations yet — open the Chart tab and mark divergences Valid/Invalid to
                calibrate scoring.
              </p>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats).map(([osc, s]: any) => (
                  <div key={osc} className="rounded border border-border bg-card p-2.5">
                    <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                      <span className="font-bold">{osc}</span>
                      <span>
                        <span
                          className={
                            s.accuracy >= 60
                              ? "text-bull"
                              : s.accuracy >= 40
                                ? "text-medium"
                                : "text-bear"
                          }
                        >
                          {s.accuracy}%
                        </span>
                        <span className="text-muted-foreground ml-1.5">
                          ({s.valid}/{s.total})
                        </span>
                      </span>
                    </div>
                    {s.recent?.length ? (
                      <div className="flex gap-1 flex-wrap">
                        {s.recent.map((r: any) => (
                          <span
                            key={r.id}
                            title={new Date(r.created_at).toLocaleString()}
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${r.is_valid ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear"}`}
                          >
                            {r.is_valid ? "Valid" : "Invalid"}{" "}
                            {(r.div_type || "").replace("_", " ")}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">no verdicts</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-2">
              Confluence breakdown
            </div>
            <ul className="space-y-1.5">
              {conf.map((c, i) => (
                <li
                  key={i}
                  className={`p-2 rounded border text-xs ${c.passed ? "border-bull/30 bg-bull/5" : "border-border bg-card opacity-60"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium">
                      {c.passed ? (
                        <Check className="w-3.5 h-3.5 text-bull" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                      {c.label}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">{c.pts} pts</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 ml-5">
                    {explanations[c.label] || "—"}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded border border-border bg-card p-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-bold ${className || ""}`}>{value}</div>
    </div>
  );
}
