/**
 * PRESIDIN — Symbol Universe
 * Unified across all 5 source projects (95% overlap, all use Deriv).
 */

export type AssetClass =
  | "forex"
  | "metals"
  | "indices"
  | "crypto"
  | "synthetic"
  | "stocks";

export interface SymbolDef {
  /** Deriv canonical symbol */
  deriv: string;
  /** Display symbol (used in UI) */
  display: string;
  /** Human-readable name */
  name: string;
  assetClass: AssetClass;
  /** Pip size (e.g. 0.0001 for EURUSD, 0.01 for USDJPY, 0.01 for XAUUSD) */
  pip: number;
  /** Contract size multiplier (default 1) */
  contractSize?: number;
  /** Default decimal places for display */
  digits: number;
  /** Trading hours note */
  session?: string;
}

const s = (
  deriv: string,
  display: string,
  name: string,
  assetClass: AssetClass,
  pip: number,
  digits: number,
  session?: string
): SymbolDef => ({ deriv, display, name, assetClass, pip, digits, session });

export const SYMBOLS: SymbolDef[] = [
  // === Forex majors (26) ===
  s("frxEURUSD", "EURUSD", "Euro / US Dollar", "forex", 0.0001, 5, "24/5"),
  s("frxGBPUSD", "GBPUSD", "British Pound / US Dollar", "forex", 0.0001, 5, "24/5"),
  s("frxUSDJPY", "USDJPY", "US Dollar / Japanese Yen", "forex", 0.01, 3, "24/5"),
  s("frxUSDCHF", "USDCHF", "US Dollar / Swiss Franc", "forex", 0.0001, 5, "24/5"),
  s("frxAUDUSD", "AUDUSD", "Australian Dollar / US Dollar", "forex", 0.0001, 5, "24/5"),
  s("frxUSDCAD", "USDCAD", "US Dollar / Canadian Dollar", "forex", 0.0001, 5, "24/5"),
  s("frxNZDUSD", "NZDUSD", "New Zealand Dollar / US Dollar", "forex", 0.0001, 5, "24/5"),
  s("frxEURGBP", "EURGBP", "Euro / British Pound", "forex", 0.0001, 5, "24/5"),
  s("frxEURJPY", "EURJPY", "Euro / Japanese Yen", "forex", 0.01, 3, "24/5"),
  s("frxGBPJPY", "GBPJPY", "British Pound / Japanese Yen", "forex", 0.01, 3, "24/5"),
  s("frxAUDCAD", "AUDCAD", "Australian Dollar / Canadian Dollar", "forex", 0.0001, 5, "24/5"),
  s("frxAUDJPY", "AUDJPY", "Australian Dollar / Japanese Yen", "forex", 0.01, 3, "24/5"),
  s("frxEURAUD", "EURAUD", "Euro / Australian Dollar", "forex", 0.0001, 5, "24/5"),
  s("frxEURCAD", "EURCAD", "Euro / Canadian Dollar", "forex", 0.0001, 5, "24/5"),
  s("frxCHFJPY", "CHFJPY", "Swiss Franc / Japanese Yen", "forex", 0.01, 3, "24/5"),
  s("frxNZDJPY", "NZDJPY", "New Zealand Dollar / Japanese Yen", "forex", 0.01, 3, "24/5"),

  // === Metals (5) ===
  s("frxXAUUSD", "XAUUSD", "Gold / US Dollar", "metals", 0.01, 2, "24/5"),
  s("frxXAGUSD", "XAGUSD", "Silver / US Dollar", "metals", 0.001, 3, "24/5"),
  s("frxXPTUSD", "XPTUSD", "Platinum / US Dollar", "metals", 0.01, 2, "24/5"),
  s("frxXPDUSD", "XPDUSD", "Palladium / US Dollar", "metals", 0.01, 2, "24/5"),
  s("frxXAUJPY", "XAUJPY", "Gold / Japanese Yen", "metals", 0.01, 2, "24/5"),

  // === Indices (10) ===
  s("stpRNG", "STPRNG", "Step Range Index", "indices", 0.1, 1, "24/7"),
  s("frxUS30", "US30", "Wall Street 30", "indices", 1, 1, "24/5"),
  s("frxUS500", "US500", "US SPX 500", "indices", 0.1, 1, "24/5"),
  s("frxUSNAS", "NAS100", "US Tech 100 (Nasdaq)", "indices", 0.25, 2, "24/5"),
  s("frxDEUIDX", "GER40", "Germany 40 (DAX)", "indices", 0.1, 1, "24/5"),
  s("frxUK100", "UK100", "UK FTSE 100", "indices", 0.1, 1, "24/5"),
  s("frxJP225", "JP225", "Japan 225 (Nikkei)", "indices", 1, 1, "24/5"),
  s("frxAUS200", "AUS200", "Australia 200", "indices", 0.1, 1, "24/5"),
  s("frxFR40", "FR40", "France 40 (CAC)", "indices", 0.1, 1, "24/5"),
  s("frxES35", "ES35", "Spain 35 (IBEX)", "indices", 0.1, 1, "24/5"),

  // === Crypto (10) ===
  s("cryBTCUSD", "BTCUSD", "Bitcoin / US Dollar", "crypto", 0.01, 2, "24/7"),
  s("cryETHUSD", "ETHUSD", "Ethereum / US Dollar", "crypto", 0.01, 2, "24/7"),
  s("cryLTCUSD", "LTCUSD", "Litecoin / US Dollar", "crypto", 0.01, 2, "24/7"),
  s("cryBCHUSD", "BCHUSD", "Bitcoin Cash / US Dollar", "crypto", 0.01, 2, "24/7"),
  s("cryXRPUSD", "XRPUSD", "Ripple / US Dollar", "crypto", 0.0001, 4, "24/7"),
  s("cryEOSUSD", "EOSUSD", "EOS / US Dollar", "crypto", 0.0001, 4, "24/7"),
  s("cryXLMUSD", "XLMUSD", "Stellar / US Dollar", "crypto", 0.0001, 4, "24/7"),
  s("cryBNBUSD", "BNBUSD", "BNB / US Dollar", "crypto", 0.01, 2, "24/7"),
  s("crySOLUSD", "SOLUSD", "Solana / US Dollar", "crypto", 0.01, 2, "24/7"),
  s("cryADAUSD", "ADAUSD", "Cardano / US Dollar", "crypto", 0.0001, 4, "24/7"),

  // === Deriv synthetic indices (29) ===
  s("R_10", "R_10", "Volatility 10 Index", "synthetic", 0.001, 3, "24/7"),
  s("R_25", "R_25", "Volatility 25 Index", "synthetic", 0.001, 3, "24/7"),
  s("R_50", "R_50", "Volatility 50 Index", "synthetic", 0.0001, 4, "24/7"),
  s("R_75", "R_75", "Volatility 75 Index", "synthetic", 0.0001, 4, "24/7"),
  s("R_100", "R_100", "Volatility 100 Index", "synthetic", 0.0001, 4, "24/7"),
  s("1HZ10V", "1HZ10V", "Volatility 10 (1s) Index", "synthetic", 0.01, 2, "24/7"),
  s("1HZ25V", "1HZ25V", "Volatility 25 (1s) Index", "synthetic", 0.01, 2, "24/7"),
  s("1HZ50V", "1HZ50V", "Volatility 50 (1s) Index", "synthetic", 0.001, 3, "24/7"),
  s("1HZ75V", "1HZ75V", "Volatility 75 (1s) Index", "synthetic", 0.0001, 4, "24/7"),
  s("1HZ100V", "1HZ100V", "Volatility 100 (1s) Index", "synthetic", 0.0001, 4, "24/7"),
  s("BOOM500", "BOOM500", "Boom 500 Index", "synthetic", 0.001, 3, "24/7"),
  s("BOOM1000", "BOOM1000", "Boom 1000 Index", "synthetic", 0.001, 3, "24/7"),
  s("CRASH500", "CRASH500", "Crash 500 Index", "synthetic", 0.001, 3, "24/7"),
  s("CRASH1000", "CRASH1000", "Crash 1000 Index", "synthetic", 0.001, 3, "24/7"),
  s("JD10", "JD10", "Jump 10 Index", "synthetic", 0.01, 2, "24/7"),
  s("JD25", "JD25", "Jump 25 Index", "synthetic", 0.01, 2, "24/7"),
  s("JD50", "JD50", "Jump 50 Index", "synthetic", 0.001, 3, "24/7"),
  s("JD75", "JD75", "Jump 75 Index", "synthetic", 0.001, 3, "24/7"),
  s("JD100", "JD100", "Jump 100 Index", "synthetic", 0.001, 3, "24/7"),
  s("stpRNG1", "STPRNG1", "Step Index 1", "synthetic", 0.1, 1, "24/7"),
  s("stpRNG2", "STPRNG2", "Step Index 2", "synthetic", 0.1, 1, "24/7"),
  s("stpRNG3", "STPRNG3", "Step Index 3", "synthetic", 0.1, 1, "24/7"),
  s("stpRNG4", "STPRNG4", "Step Index 4", "synthetic", 0.1, 1, "24/7"),
  s("stpRNG5", "STPRNG5", "Step Index 5", "synthetic", 0.1, 1, "24/7"),
  s("DRIFT_SWITCH_10", "DS10", "Drift Switch 10", "synthetic", 0.001, 3, "24/7"),
  s("DRIFT_SWITCH_20", "DS20", "Drift Switch 20", "synthetic", 0.001, 3, "24/7"),
  s("DRIFT_SWITCH_30", "DS30", "Drift Switch 30", "synthetic", 0.001, 3, "24/7"),
  s("RDB100", "RB100", "Range Break 100", "synthetic", 0.001, 3, "24/7"),
  s("RDB200", "RB200", "Range Break 200", "synthetic", 0.001, 3, "24/7"),
];

export const SYMBOL_MAP: Record<string, SymbolDef> = Object.fromEntries(
  SYMBOLS.map((x) => [x.deriv, x])
);

export const DEFAULT_ACTIVE_SYMBOLS = [
  "frxEURUSD",
  "frxGBPUSD",
  "frxUSDJPY",
  "frxXAUUSD",
  "frxUS30",
  "frxUS500",
  "frxUSNAS",
  "cryBTCUSD",
  "R_100",
  "BOOM1000",
];

export const TIMEFRAMES = [
  { value: "1m", label: "1m", seconds: 60 },
  { value: "5m", label: "5m", seconds: 300 },
  { value: "15m", label: "15m", seconds: 900 },
  { value: "30m", label: "30m", seconds: 1800 },
  { value: "1h", label: "1H", seconds: 3600 },
  { value: "2h", label: "2H", seconds: 7200 },
  { value: "4h", label: "4H", seconds: 14400 },
  { value: "8h", label: "8H", seconds: 28800 },
  { value: "1d", label: "1D", seconds: 86400 },
  { value: "1w", label: "1W", seconds: 604800 },
] as const;

export type Timeframe = (typeof TIMEFRAMES)[number]["value"];

export function formatPrice(value: number, digits = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPips(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} pips`;
}

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number, withSign = true): string {
  const sign = withSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
