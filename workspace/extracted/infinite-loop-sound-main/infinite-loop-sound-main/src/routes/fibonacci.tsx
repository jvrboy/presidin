import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { AlignJustify, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/fibonacci")({
  head: () => ({ meta: [{ title: "Fibonacci Calculator — DivergenceIQ" }] }),
  component: FibonacciPage,
});

function FibonacciPage() {
  const [high, setHigh] = useState<number>();
  const [low, setLow] = useState<number>();
  const [direction, setDirection] = useState<"UP" | "DOWN">("UP");

  const h = high || 0;
  const l = low || 0;
  const diff = h - l;

  // Retracements
  const retracements = [
    { level: "0%", value: direction === "UP" ? h : l },
    { level: "23.6%", value: direction === "UP" ? h - diff * 0.236 : l + diff * 0.236 },
    { level: "38.2%", value: direction === "UP" ? h - diff * 0.382 : l + diff * 0.382 },
    { level: "50.0%", value: direction === "UP" ? h - diff * 0.5 : l + diff * 0.5 },
    { level: "61.8%", value: direction === "UP" ? h - diff * 0.618 : l + diff * 0.618 },
    { level: "78.6%", value: direction === "UP" ? h - diff * 0.786 : l + diff * 0.786 },
    { level: "100%", value: direction === "UP" ? l : h },
  ];

  // Extensions
  const extensions = [
    { level: "127.2%", value: direction === "UP" ? h + diff * 0.272 : l - diff * 0.272 },
    { level: "161.8%", value: direction === "UP" ? h + diff * 0.618 : l - diff * 0.618 },
    { level: "261.8%", value: direction === "UP" ? h + diff * 1.618 : l - diff * 1.618 },
  ];

  const fmt = (n: number) => (n ? n.toFixed(5) : "—");

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <AlignJustify className="w-6 h-6 text-primary" /> Fibonacci Calculator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Identify potential retracement support/resistance and extension targets.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-card border border-border p-6 rounded-lg space-y-4 h-fit">
            <div>
              <label className="text-sm font-medium mb-1 block">Trend Direction</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setDirection("UP")}
                  className={`p-2 rounded flex items-center justify-center gap-1.5 border transition-colors ${direction === "UP" ? "bg-bull/20 border-bull/50 text-bull" : "bg-background border-border text-muted-foreground hover:bg-accent"}`}
                >
                  <ArrowUpRight className="w-4 h-4" /> Uptrend
                </button>
                <button
                  onClick={() => setDirection("DOWN")}
                  className={`p-2 rounded flex items-center justify-center gap-1.5 border transition-colors ${direction === "DOWN" ? "bg-bear/20 border-bear/50 text-bear" : "bg-background border-border text-muted-foreground hover:bg-accent"}`}
                >
                  <ArrowDownRight className="w-4 h-4" /> Downtrend
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">High Price</label>
              <input
                type="number"
                value={high || ""}
                onChange={(e) => setHigh(Number(e.target.value))}
                className="w-full p-2 border border-input rounded bg-background font-mono text-lg"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Low Price</label>
              <input
                type="number"
                value={low || ""}
                onChange={(e) => setLow(Number(e.target.value))}
                className="w-full p-2 border border-input rounded bg-background font-mono text-lg"
              />
            </div>
          </div>

          <div className="md:col-span-2 grid sm:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-lg overflow-hidden h-fit">
              <div className="bg-muted/50 p-3 border-b border-border font-semibold flex items-center justify-between">
                <span>Retracement Levels</span>
                <span className="text-[10px] text-muted-foreground uppercase">Pullback</span>
              </div>
              <div className="divide-y divide-border">
                {retracements.map((r, i) => (
                  <div
                    key={r.level}
                    className={`p-3 flex justify-between items-center hover:bg-accent/30 transition-colors ${r.level === "50.0%" || r.level === "61.8%" ? "bg-primary/5" : ""}`}
                  >
                    <span
                      className={`font-mono text-sm ${r.level === "50.0%" || r.level === "61.8%" ? "text-primary font-bold" : "text-muted-foreground"}`}
                    >
                      {r.level}
                    </span>
                    <span
                      className={`font-mono ${r.level === "50.0%" || r.level === "61.8%" ? "font-bold" : ""}`}
                    >
                      {fmt(r.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden h-fit">
              <div className="bg-muted/50 p-3 border-b border-border font-semibold flex items-center justify-between">
                <span>Extension Levels</span>
                <span className="text-[10px] text-muted-foreground uppercase">Targets</span>
              </div>
              <div className="divide-y divide-border">
                {extensions.map((e) => (
                  <div
                    key={e.level}
                    className="p-3 flex justify-between items-center hover:bg-accent/30 transition-colors"
                  >
                    <span className="font-mono text-sm text-primary">{e.level}</span>
                    <span className="font-mono font-bold">{fmt(e.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
