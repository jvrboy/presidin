import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface LivePriceProps {
  symbol: string;
  price: number;
  change?: number;
  className?: string;
}

export function LivePrice({ symbol, price, change, className }: LivePriceProps) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const [prevPrice, setPrevPrice] = useState(price);

  useEffect(() => {
    if (price !== prevPrice) {
      setFlash(price > prevPrice ? "up" : "down");
      setPrevPrice(price);
      const t = setTimeout(() => setFlash(null), 300);
      return () => clearTimeout(t);
    }
  }, [price, prevPrice]);

  const up = (change ?? 0) >= 0;

  return (
    <div className={cn("flex items-center gap-2 font-mono tabular-nums", className)}>
      <span className="text-xs font-bold text-muted-foreground">{symbol}</span>
      <span
        className={cn(
          "text-sm font-semibold transition-colors duration-300",
          flash === "up" && "text-bull",
          flash === "down" && "text-bear",
          !flash && "text-foreground",
        )}
      >
        {price.toFixed(price < 1 ? 5 : 2)}
      </span>
      {change !== undefined && (
        <span className={cn("text-xs", up ? "text-bull" : "text-bear")}>
          {up ? "+" : ""}
          {change.toFixed(2)}
        </span>
      )}
    </div>
  );
}
