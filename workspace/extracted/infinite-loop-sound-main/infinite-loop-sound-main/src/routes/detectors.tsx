import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DetectorDashboard } from "@/components/app/DetectorDashboard";
import { SpikeDetector } from "@/components/app/SpikeDetector";
import { MarketHeatScanner } from "@/components/app/MarketHeatScanner";
import { TradeIdeaCard } from "@/components/app/TradeIdeaCard";
import { FibonacciLevels } from "@/components/app/FibonacciLevels";
import { ErrorBoundary } from "@/components/app/ErrorBoundary";
import type { TF } from "@/lib/engine/deriv";

export const Route = createFileRoute("/detectors")({ component: DetectorsPage });

function DetectorsPage() {
  const [symbol, setSymbol] = useState("frxEURUSD");
  const [tf, setTf] = useState<TF>("M15");

  return (
    <div className="container mx-auto space-y-4 p-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Market Detectors</h1>
        <p className="text-sm text-muted-foreground">
          Unified spike, volume, liquidity-sweep, gap, range-break, and regime-shift detection.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px]">
          <Label htmlFor="det-sym">Symbol</Label>
          <Input id="det-sym" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
        </div>
        <div>
          <Label>Timeframe</Label>
          <ToggleGroup
            type="single"
            value={tf}
            onValueChange={(v) => v && setTf(v as TF)}
            className="justify-start"
          >
            {(["M1", "M5", "M15", "H1", "H4", "D1"] as TF[]).map((t) => (
              <ToggleGroupItem key={t} value={t} className="text-xs">
                {t}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {/* Each widget is independently wrapped so one crash doesn't blank the page. */}
      <div className="grid gap-4 md:grid-cols-2">
        <ErrorBoundary label="Detector Dashboard">
          <DetectorDashboard symbol={symbol} tf={tf} />
        </ErrorBoundary>
        <ErrorBoundary label="Spike Detector">
          <SpikeDetector symbol={symbol} tf={tf} />
        </ErrorBoundary>
        <ErrorBoundary label="Trade Idea">
          <TradeIdeaCard symbol={symbol} tf={tf} />
        </ErrorBoundary>
        <ErrorBoundary label="Fibonacci Levels">
          <FibonacciLevels symbol={symbol} tf={tf} />
        </ErrorBoundary>
      </div>

      <ErrorBoundary label="Heat Scanner">
        <MarketHeatScanner tf={tf} />
      </ErrorBoundary>
    </div>
  );
}
