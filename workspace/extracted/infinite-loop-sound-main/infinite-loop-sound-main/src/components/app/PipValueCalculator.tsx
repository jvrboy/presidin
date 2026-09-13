import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pipValue, distanceToPips, pipSizeFor } from "@/lib/engine/pip-calc";

/**
 * PipValueCalculator — quick pip value / spread cost / SL distance helper.
 * Designed to sit alongside PositionSizeCalculator in the risk tools panel.
 */
export function PipValueCalculator() {
  const [symbol, setSymbol] = useState("frxEURUSD");
  const [lotSize, setLotSize] = useState(1.0);
  const [spread, setSpread] = useState(1.5);
  const [slDistance, setSlDistance] = useState(0.0025);

  const info = useMemo(() => pipValue(symbol, lotSize), [symbol, lotSize]);
  const slPips = useMemo(() => distanceToPips(symbol, slDistance), [symbol, slDistance]);
  const spreadCost = spread * info.pipValuePerLot * lotSize;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pip Value Calculator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="pip-sym">Symbol</Label>
            <Input id="pip-sym" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pip-lot">Lot size</Label>
            <Input
              id="pip-lot"
              type="number"
              step="0.01"
              value={lotSize}
              onChange={(e) => setLotSize(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label htmlFor="pip-spread">Spread (pips)</Label>
            <Input
              id="pip-spread"
              type="number"
              step="0.1"
              value={spread}
              onChange={(e) => setSpread(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label htmlFor="pip-sl">SL distance (price)</Label>
            <Input
              id="pip-sl"
              type="number"
              step="0.0001"
              value={slDistance}
              onChange={(e) => setSlDistance(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pip size</span>
            <span className="font-mono">{pipSizeFor(symbol)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pip value / std lot</span>
            <span className="font-mono">${info.pipValuePerLot.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">SL distance</span>
            <span className="font-mono">{slPips.toFixed(1)} pips</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Spread cost</span>
            <span className="font-mono">${spreadCost.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default PipValueCalculator;
