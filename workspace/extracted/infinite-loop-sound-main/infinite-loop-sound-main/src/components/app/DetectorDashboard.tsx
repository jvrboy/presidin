import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { deriv, type TF } from "@/lib/engine/deriv";
import { runAllDetectors, type DetectorReport } from "@/lib/engine/detectors";

interface Props {
  symbol?: string;
  tf?: TF;
}

interface Row {
  label: string;
  state: string;
  hot: boolean;
  tone?: "default" | "warn" | "danger";
}

const toneClass = {
  default: "",
  warn: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  danger: "bg-red-500/15 text-red-300 border-red-500/30 animate-pulse",
};

/**
 * DetectorDashboard — single-pane status of every detector.
 * Auto-refreshes every 30 s. Renders a heat badge in the header showing
 * how many detectors are firing on the most recent bar.
 */
export function DetectorDashboard({ symbol = "frxEURUSD", tf = "M5" }: Props) {
  const [report, setReport] = useState<DetectorReport | null>(null);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      const candles = await deriv.getCandles(symbol, tf, 300);
      if (!live || !candles.length) return;
      setReport(runAllDetectors(candles));
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [symbol, tf]);

  const rows: Row[] = report
    ? [
        {
          label: "Spike",
          state: report.spike.latest
            ? `${report.spike.latest.kind} · z=${report.spike.latest.zScore.toFixed(2)}`
            : "quiet",
          hot: !!report.spike.latest,
          tone:
            report.spike.latest?.severity === "extreme"
              ? "danger"
              : report.spike.latest
                ? "warn"
                : "default",
        },
        {
          label: "Volume",
          state: report.volume.hasVolume
            ? report.volume.latest
              ? `${report.volume.latest.kind} · ${report.volume.latest.volumeRatio.toFixed(1)}×`
              : "normal"
            : "no data",
          hot: !!report.volume.latest,
          tone:
            report.volume.latest?.kind === "climactic"
              ? "danger"
              : report.volume.latest
                ? "warn"
                : "default",
        },
        {
          label: "Liquidity sweep",
          state: report.liquiditySweeps.latest
            ? `${report.liquiditySweeps.latest.side}-side · ${report.liquiditySweeps.latest.wickPenetrationPct.toFixed(1)}%`
            : "none",
          hot: !!report.liquiditySweeps.latest,
          tone: report.liquiditySweeps.latest ? "warn" : "default",
        },
        {
          label: "Gap",
          state: report.gaps.latest
            ? `${report.gaps.latest.kind} · ${report.gaps.latest.gapAtrMult.toFixed(2)}× ATR`
            : `${report.gaps.unfilledGaps.length} unfilled`,
          hot: !!report.gaps.latest,
          tone: report.gaps.latest ? "warn" : "default",
        },
        {
          label: "Range break",
          state: report.rangeBreaks.latest
            ? `${report.rangeBreaks.latest.direction} · ${report.rangeBreaks.latest.expansionAtrMult.toFixed(2)}× ATR`
            : "compressed",
          hot: !!report.rangeBreaks.latest,
          tone: report.rangeBreaks.latest ? "warn" : "default",
        },
        {
          label: "Regime shift",
          state:
            report.regimeShift.shift === "none"
              ? "stable"
              : `${report.regimeShift.shift} · ×${report.regimeShift.ratio.toFixed(2)}`,
          hot: report.regimeShift.shift !== "none",
          tone:
            report.regimeShift.shift === "expansion"
              ? "danger"
              : report.regimeShift.shift === "contraction"
                ? "warn"
                : "default",
        },
      ]
    : [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          Detector Dashboard · {symbol} {tf}
        </CardTitle>
        {report && (
          <Badge
            className={
              report.hotCount >= 3 ? toneClass.danger : report.hotCount >= 1 ? toneClass.warn : ""
            }
          >
            {report.hotCount} hot
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {!report && <div className="text-sm text-muted-foreground">Scanning…</div>}
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between rounded-md border p-2 text-sm"
          >
            <span className="font-medium">{r.label}</span>
            <Badge variant="outline" className={r.hot ? toneClass[r.tone || "default"] : ""}>
              {r.state}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default DetectorDashboard;
