import { ASSETS_BY_CLASS, type AssetClass } from "@/lib/engine/deriv";

const LABELS: Record<AssetClass, string> = {
  forex: "Forex",
  metals: "Metals",
  crypto: "Crypto",
  indices: "Indices",
  synthetics: "Synthetics (Deriv)",
  stocks: "Stocks",
};

export function AssetSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className || "bg-input border border-border rounded px-3 py-2 text-sm font-mono"}
    >
      {(Object.keys(ASSETS_BY_CLASS) as AssetClass[]).map((c) => (
        <optgroup key={c} label={LABELS[c]}>
          {ASSETS_BY_CLASS[c].map((a) => (
            <option key={a.symbol} value={a.symbol}>
              {a.display}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
