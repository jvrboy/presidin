import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { deriv, type TF } from "@/lib/engine/deriv";
import { detectSpikes, type SpikeEvent } from "@/lib/engine/detectors";

interface Props {
  symbol?: string;
  tf?: TF;
  zThreshold?: number;
}

const severityColor: Record<string, string> = {
  mild: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  strong: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  extreme: "bg-red-500/20 text-red-300 border-red-500/30 animate-pulse",
  none: "",
};

export function SpikeDetector({ symbol = "frxEURUSD", tf = "M5", zThreshold = 2.5 }: Props) {
  const [events, setEvents] = useState<SpikeEvent[]>([]);
  const [latest, setLatest] = useState<SpikeEvent | null>(null);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      const candles = await deriv.getCandles(symbol, tf, 200);
      if (!live) return;
      const scan = detectSpikes(candles, 50, zThreshold);
      setEvents(scan.events.slice(-8).reverse());
      setLatest(scan.latest);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [symbol, tf, zThreshold]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          Spike Detector · {symbol} {tf}
        </CardTitle>
        {latest && (
          <Badge className={severityColor[latest.severity]}>
            {latest.severity.toUpperCase()} · z={latest.zScore.toFixed(2)}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {!events.length && <div className="text-sm text-muted-foreground">No spikes detected.</div>}
        {events.map((e) => (
          <div
            key={`${e.index}-${e.epoch}`}
            className="flex items-center justify-between rounded-md border p-2 text-xs"
          >
            <span className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize">
                {e.kind}
              </Badge>
              <span className="text-muted-foreground">
                {new Date(e.epoch * 1000).toUTCString().slice(17, 25)}
              </span>
            </span>
            <span className="flex items-center gap-2 font-mono">
              <span>
                {e.returnPct >= 0 ? "+" : ""}
                {e.returnPct.toFixed(3)}%
              </span>
              <Badge className={severityColor[e.severity]}>{e.severity}</Badge>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default SpikeDetector;
