import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { deriv, type TF } from "@/lib/engine/deriv";
import { createReplay, type ReplayController, type ReplayState } from "@/lib/engine/replay";
import { analyze } from "@/lib/engine/signal";

interface Props {
  symbol?: string;
  tf?: TF;
  bars?: number;
}

/**
 * ReplayPlayer — step / play through historical candles and see analyze()
 * recompute on the visible-only data. Useful for visual backtests and
 * discretionary setup practice.
 */
export function ReplayPlayer({ symbol = "frxEURUSD", tf = "M5", bars = 500 }: Props) {
  const [controller, setController] = useState<ReplayController | null>(null);
  const [state, setState] = useState<ReplayState | null>(null);

  useEffect(() => {
    let active = true;
    let ctrl: ReplayController | null = null;
    (async () => {
      const candles = await deriv.getCandles(symbol, tf, bars);
      if (!active || !candles.length) return;
      ctrl = createReplay(candles, { startIdx: 50, speedMs: 400 });
      ctrl.subscribe(setState);
      setController(ctrl);
    })();
    return () => {
      active = false;
      ctrl?.destroy();
    };
  }, [symbol, tf, bars]);

  const liveAnalysis = useMemo(() => {
    if (!controller || !state) return null;
    const visible = controller.visible();
    if (visible.length < 30) return null;
    return analyze(symbol, tf, visible, {});
  }, [controller, state, symbol, tf]);

  if (!state) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Replay…</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const pct = ((state.index + 1) / state.total) * 100;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          Replay · {symbol} {tf}
        </CardTitle>
        <Badge variant="outline">
          {state.index + 1} / {state.total}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">Open</div>
            <div className="font-mono">{state.candle.open.toFixed(5)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">High</div>
            <div className="font-mono">{state.candle.high.toFixed(5)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Low</div>
            <div className="font-mono">{state.candle.low.toFixed(5)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Close</div>
            <div className="font-mono">{state.candle.close.toFixed(5)}</div>
          </div>
        </div>
        <Slider
          value={[state.index]}
          min={0}
          max={state.total - 1}
          step={1}
          onValueChange={(v) => controller?.jumpTo(v[0])}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => controller?.step(-10)}>
            «
          </Button>
          <Button size="sm" variant="outline" onClick={() => controller?.step(-1)}>
            ‹
          </Button>
          {state.isPlaying ? (
            <Button size="sm" onClick={() => controller?.pause()}>
              Pause
            </Button>
          ) : (
            <Button size="sm" onClick={() => controller?.play()}>
              Play
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => controller?.step(1)}>
            ›
          </Button>
          <Button size="sm" variant="outline" onClick={() => controller?.step(10)}>
            »
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">{pct.toFixed(1)}%</span>
        </div>
        {liveAnalysis && (
          <div className="rounded-md border bg-muted/30 p-2 text-xs">
            Live <span className="font-medium">analyze()</span> on visible bars:{" "}
            <span className="font-mono">{liveAnalysis.rating}</span> (
            {liveAnalysis.scorePct.toFixed(1)}%) {liveAnalysis.direction ?? "NEUTRAL"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ReplayPlayer;
