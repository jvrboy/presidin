import { useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { useColors } from "@/hooks/use-colors";
import { formatMoney } from "@/components/trading-ui";

export type EquityPoint = { t?: string; equity?: number; balance?: number };

function buildSmoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = (prev.x + curr.x) / 2;
    d += ` Q ${prev.x} ${prev.y} ${midX} ${(prev.y + curr.y) / 2}`;
  }
  const last = points[points.length - 1];
  d += ` T ${last.x} ${last.y}`;
  return d;
}

/**
 * Portfolio equity / P&L area chart. Pure react-native-svg (no chart
 * library dependency) — plots the backend's equity_history series as
 * a smoothed line with a soft gradient fill beneath it, colored green
 * or red depending on whether the period's net change is positive.
 */
export function EquityChart({ history, height = 140 }: { history: EquityPoint[]; height?: number }) {
  const colors = useColors();
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const values = useMemo(() => history.map((point) => point.equity ?? point.balance ?? 0).filter((v) => Number.isFinite(v)), [history]);

  const stats = useMemo(() => {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const first = values[0];
    const last = values[values.length - 1];
    const change = last - first;
    const changePct = first !== 0 ? (change / Math.abs(first)) * 100 : 0;
    return { min, max, first, last, change, changePct };
  }, [values]);

  const positive = (stats?.change ?? 0) >= 0;
  const lineColor = positive ? colors.success : colors.error;

  const { linePath, areaPath, points } = useMemo(() => {
    if (!stats || width <= 0 || values.length < 2) return { linePath: "", areaPath: "", points: [] as { x: number; y: number }[] };
    const padding = 10;
    const usableHeight = height - padding * 2;
    const range = stats.max - stats.min || 1;
    const step = (width - padding * 2) / (values.length - 1);
    const pts = values.map((value, index) => ({
      x: padding + index * step,
      y: padding + usableHeight - ((value - stats.min) / range) * usableHeight,
    }));
    const line = buildSmoothPath(pts);
    const area = `${line} L ${pts[pts.length - 1].x} ${height} L ${pts[0].x} ${height} Z`;
    return { linePath: line, areaPath: area, points: pts };
  }, [stats, values, width, height]);

  if (!stats) {
    return (
      <View style={[styles.emptyWrap, { height }]}>
        <Text style={[styles.emptyText, { color: colors.muted }]}>No equity history yet — the chart fills in once the backend starts logging snapshots.</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.currentValue, { color: colors.foreground }]}>{formatMoney(stats.last)}</Text>
          <Text style={[styles.changeText, { color: lineColor }]}>
            {positive ? "+" : ""}
            {formatMoney(stats.change)} ({positive ? "+" : ""}
            {stats.changePct.toFixed(2)}%)
          </Text>
        </View>
      </View>
      <View onLayout={onLayout} style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={lineColor} stopOpacity={0.35} />
                <Stop offset="1" stopColor={lineColor} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={areaPath} fill="url(#equityFill)" stroke="none" />
            <Path d={linePath} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {points.length > 0 ? <Circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={4} fill={lineColor} /> : null}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  currentValue: { fontSize: 22, fontWeight: "900" },
  changeText: { fontSize: 12, fontWeight: "800", marginTop: 3 },
  emptyWrap: { alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 12, textAlign: "center", paddingHorizontal: 20 },
});
