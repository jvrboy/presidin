import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Calculator, Shield, AlertTriangle, TrendingUp, DollarSign } from "lucide-react";

interface Props {
  defaultBalance?: number;
  defaultRiskPct?: number;
  defaultStopPips?: number;
  pair?: string;
  volatilityMultiplier?: number;
}

export function PositionSizeCalculator({
  defaultBalance = 10000,
  defaultRiskPct = 1,
  defaultStopPips = 25,
  pair = "EUR/USD",
  volatilityMultiplier = 1.0,
}: Props) {
  const [balance, setBalance] = useState(defaultBalance);
  const [riskPct, setRiskPct] = useState(defaultRiskPct);
  const [stopPips, setStopPips] = useState(defaultStopPips);
  const [leverage, setLeverage] = useState(100);

  const calc = useMemo(() => {
    const riskAmount = balance * (riskPct / 100);
    const adjustedStop = stopPips * volatilityMultiplier;
    const isJPY = pair.includes("JPY");
    const pipValue = isJPY ? 0.01 : 0.0001;

    // Standard lot = 100,000 units
    // Pip value per standard lot = $10 for most pairs
    const pipValuePerLot = isJPY ? 1000 / 100 : 10; // simplified
    const lotSize = adjustedStop > 0 ? riskAmount / (adjustedStop * pipValuePerLot) : 0;
    const units = lotSize * 100000;
    const marginRequired = units / leverage;

    // Kelly criterion (simplified)
    const assumedWinRate = 0.55;
    const assumedRR = 2.0;
    const kellyPct = (assumedWinRate * assumedRR - (1 - assumedWinRate)) / assumedRR;
    const kellyLotSize = kellyPct > 0 ? lotSize * Math.min(kellyPct * 2, 1) : 0;

    // Risk assessment
    let riskLevel: "low" | "moderate" | "high" | "extreme" = "low";
    if (riskPct >= 5) riskLevel = "extreme";
    else if (riskPct >= 3) riskLevel = "high";
    else if (riskPct >= 2) riskLevel = "moderate";

    // Max loss streak before 50% drawdown
    const maxLossStreak = Math.floor(Math.log(0.5) / Math.log(1 - riskPct / 100));

    return {
      riskAmount,
      adjustedStop,
      lotSize,
      units,
      marginRequired,
      kellyLotSize,
      riskLevel,
      maxLossStreak,
      pipValuePerLot,
    };
  }, [balance, riskPct, stopPips, leverage, pair, volatilityMultiplier]);

  const riskColors = {
    low: "text-bull bg-bull/10 border-bull/30",
    moderate: "text-primary bg-primary/10 border-primary/30",
    high: "text-medium bg-medium/10 border-medium/30",
    extreme: "text-bear bg-bear/10 border-bear/30",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" /> Position Size Calculator
          </span>
          <Badge className={`${riskColors[calc.riskLevel]} text-[10px]`}>
            {calc.riskLevel === "low" && <Shield className="w-3 h-3 mr-1" />}
            {calc.riskLevel === "extreme" && <AlertTriangle className="w-3 h-3 mr-1" />}
            {calc.riskLevel.toUpperCase()} RISK
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Input Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] uppercase tracking-wider text-muted-foreground block mb-0.5">
              Account Balance ($)
            </label>
            <input
              type="number"
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value) || 0)}
              className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-[9px] uppercase tracking-wider text-muted-foreground block mb-0.5">
              Risk Per Trade (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              value={riskPct}
              onChange={(e) => setRiskPct(Number(e.target.value) || 0)}
              className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-[9px] uppercase tracking-wider text-muted-foreground block mb-0.5">
              Stop Loss (pips)
            </label>
            <input
              type="number"
              value={stopPips}
              onChange={(e) => setStopPips(Number(e.target.value) || 0)}
              className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-[9px] uppercase tracking-wider text-muted-foreground block mb-0.5">
              Leverage
            </label>
            <select
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
              className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
            >
              <option value={30}>1:30</option>
              <option value={50}>1:50</option>
              <option value={100}>1:100</option>
              <option value={200}>1:200</option>
              <option value={500}>1:500</option>
            </select>
          </div>
        </div>

        {/* Volatility adjustment notice */}
        {volatilityMultiplier !== 1.0 && (
          <div className="text-[10px] text-medium bg-medium/5 border border-medium/20 rounded px-2 py-1.5">
            ⚠️ Stop adjusted by {volatilityMultiplier.toFixed(1)}x due to current volatility regime
            → Effective stop: <strong>{calc.adjustedStop.toFixed(1)} pips</strong>
          </div>
        )}

        {/* Results */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-center">
            <div className="text-[9px] text-muted-foreground uppercase">Lot Size</div>
            <div className="text-lg font-mono font-bold text-primary">
              {calc.lotSize.toFixed(2)}
            </div>
            <div className="text-[9px] text-muted-foreground">
              {Math.round(calc.units).toLocaleString()} units
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-bear/10 border border-bear/20 text-center">
            <div className="text-[9px] text-muted-foreground uppercase">Risk Amount</div>
            <div className="text-lg font-mono font-bold text-bear">
              ${calc.riskAmount.toFixed(0)}
            </div>
            <div className="text-[9px] text-muted-foreground">{riskPct}% of balance</div>
          </div>
          <div className="p-2.5 rounded-lg bg-muted border border-border text-center">
            <div className="text-[9px] text-muted-foreground uppercase">Margin</div>
            <div className="text-lg font-mono font-bold text-foreground">
              ${calc.marginRequired.toFixed(0)}
            </div>
            <div className="text-[9px] text-muted-foreground">1:{leverage}</div>
          </div>
        </div>

        {/* Advanced metrics */}
        <div className="space-y-1.5 pt-1 border-t border-border">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Kelly Criterion Lot Size
            </span>
            <span className="font-mono font-semibold">{calc.kellyLotSize.toFixed(3)}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Pip Value (per lot)
            </span>
            <span className="font-mono font-semibold">${calc.pipValuePerLot.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground flex items-center gap-1">
              <Shield className="w-3 h-3" /> Losses to 50% Drawdown
            </span>
            <span
              className={`font-mono font-semibold ${calc.maxLossStreak < 10 ? "text-bear" : "text-bull"}`}
            >
              {calc.maxLossStreak} consecutive
            </span>
          </div>
        </div>

        {/* Risk warning */}
        {calc.riskLevel === "extreme" && (
          <div className="p-2 rounded bg-bear/10 border border-bear/30 text-[10px] text-bear flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              <strong>Warning:</strong> Risking {riskPct}% per trade is extremely aggressive. Only{" "}
              {calc.maxLossStreak} consecutive losses would halve your account. Consider reducing to
              1-2% for sustainable growth.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
