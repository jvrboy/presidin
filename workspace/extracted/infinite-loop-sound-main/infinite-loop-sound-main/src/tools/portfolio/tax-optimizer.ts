/**
 * Tax Optimizer - Tax-loss harvesting and tax-efficient position management
 * Extends portfolio tools with wash-sale tracking, lot optimization, and tax drag analysis
 */

export interface Lot {
  id: string;
  symbol: string;
  quantity: number;
  costBasis: number;
  acquisitionDate: number;
  currentPrice: number;
  holdingPeriod: number;
}

export interface TaxLotRecommendation {
  lotId: string;
  symbol: string;
  action: "harvest" | "hold" | "sell_short_term" | "sell_long_term";
  estimatedLoss: number;
  taxSavings: number;
  washSaleRisk: boolean;
  reasoning: string;
}

export interface TaxReport {
  shortTermGains: number;
  longTermGains: number;
  shortTermLosses: number;
  longTermLosses: number;
  netCapitalGains: number;
  estimatedTaxLiability: number;
  taxLossHarvestingOpportunities: TaxLotRecommendation[];
  washSaleViolations: string[];
  taxDragPct: number;
}

export class TaxOptimizer {
  private washSaleWindow = 30 * 24 * 60 * 60 * 1000;
  private recentSales: { symbol: string; date: number; loss: boolean }[] = [];

  constructor(private taxRates: { shortTerm: number; longTerm: number }) {}

  recordSale(symbol: string, date: number, loss: boolean): void {
    this.recentSales.push({ symbol, date, loss });
    this.recentSales = this.recentSales.filter((s) => Date.now() - s.date < this.washSaleWindow);
  }

  analyze(lots: Lot[], currentPriceMap: Record<string, number>): TaxReport {
    const recommendations: TaxLotRecommendation[] = [];
    const washSaleViolations: string[] = [];
    let stGains = 0,
      ltGains = 0,
      stLosses = 0,
      ltLosses = 0;

    for (const lot of lots) {
      const currentPrice = currentPriceMap[lot.symbol] ?? lot.currentPrice;
      const unrealized = (currentPrice - lot.costBasis) * lot.quantity;
      const isLongTerm = lot.holdingPeriod > 365 * 24 * 60 * 60 * 1000;
      const hasWashSaleRisk = this.checkWashSale(lot.symbol);

      if (unrealized < 0) {
        const loss = Math.abs(unrealized);
        if (isLongTerm) ltLosses += loss;
        else stLosses += loss;
        const taxSavings = loss * (isLongTerm ? this.taxRates.longTerm : this.taxRates.shortTerm);
        recommendations.push({
          lotId: lot.id,
          symbol: lot.symbol,
          action: hasWashSaleRisk ? "hold" : "harvest",
          estimatedLoss: loss,
          taxSavings,
          washSaleRisk: hasWashSaleRisk,
          reasoning: hasWashSaleRisk
            ? "Wash sale risk: sold at a loss within 30 days. Holding to avoid disallowed loss."
            : `Tax-loss harvesting opportunity: $${loss.toFixed(2)} unrealized loss. Selling saves ~$${taxSavings.toFixed(2)} in taxes.`,
        });
      } else {
        if (unrealized > 0) {
          if (isLongTerm) ltGains += unrealized;
          else stGains += unrealized;
        }
        recommendations.push({
          lotId: lot.id,
          symbol: lot.symbol,
          action: isLongTerm ? "sell_long_term" : "sell_short_term",
          estimatedLoss: 0,
          taxSavings: 0,
          washSaleRisk: false,
          reasoning: `Holding ${isLongTerm ? "long" : "short"}-term gain of $${unrealized.toFixed(2)}.`,
        });
      }

      if (hasWashSaleRisk) washSaleViolations.push(lot.symbol);
    }

    const netGains = stGains + ltGains - (stLosses + ltLosses);
    const estimatedTax =
      Math.max(0, stGains - stLosses) * this.taxRates.shortTerm +
      Math.max(0, ltGains - ltLosses) * this.taxRates.longTerm;
    const totalValue = lots.reduce(
      (sum, l) => sum + (currentPriceMap[l.symbol] ?? l.currentPrice) * l.quantity,
      0,
    );
    const taxDrag = totalValue > 0 ? (estimatedTax / totalValue) * 100 : 0;

    return {
      shortTermGains: stGains,
      longTermGains: ltGains,
      shortTermLosses: stLosses,
      longTermLosses: ltLosses,
      netCapitalGains: netGains,
      estimatedTaxLiability: estimatedTax,
      taxLossHarvestingOpportunities: recommendations.filter((r) => r.action === "harvest"),
      washSaleViolations,
      taxDragPct: taxDrag,
    };
  }

  private checkWashSale(symbol: string): boolean {
    return this.recentSales.some((s) => s.symbol === symbol && s.loss);
  }

  optimizeLotSelection(
    lots: Lot[],
    amountToSell: number,
    currentPrices: Record<string, number>,
  ): Lot[] {
    const sorted = [...lots].sort((a, b) => {
      const aPrice = currentPrices[a.symbol] ?? a.costBasis;
      const bPrice = currentPrices[b.symbol] ?? b.costBasis;
      const aGain = (aPrice - a.costBasis) / a.costBasis;
      const bGain = (bPrice - b.costBasis) / b.costBasis;
      if (
        a.holdingPeriod > 365 * 24 * 60 * 60 * 1000 &&
        b.holdingPeriod <= 365 * 24 * 60 * 60 * 1000
      )
        return -1;
      if (
        b.holdingPeriod > 365 * 24 * 60 * 60 * 1000 &&
        a.holdingPeriod <= 365 * 24 * 60 * 60 * 1000
      )
        return 1;
      return aGain - bGain;
    });

    const selected: Lot[] = [];
    let remaining = amountToSell;
    for (const lot of sorted) {
      if (remaining <= 0) break;
      const lotValue = (currentPrices[lot.symbol] ?? lot.costBasis) * lot.quantity;
      if (lotValue <= remaining) {
        selected.push(lot);
        remaining -= lotValue;
      } else {
        const fraction = remaining / lotValue;
        selected.push({ ...lot, quantity: lot.quantity * fraction });
        remaining = 0;
      }
    }
    return selected;
  }
}

export default TaxOptimizer;
