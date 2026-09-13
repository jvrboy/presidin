import { useEffect, useState, useRef } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface TickerItem {
  symbol: string;
  price: number;
  change: number;
}

interface KPITickerProps {
  items: TickerItem[];
  speed?: number;
}

export function KPITicker({ items, speed = 40 }: KPITickerProps) {
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (paused) return;
    const animate = () => {
      offsetRef.current -= speed / 60;
      const el = scrollRef.current;
      if (el) {
        const totalWidth = el.scrollWidth / 2;
        if (Math.abs(offsetRef.current) >= totalWidth) offsetRef.current = 0;
        el.style.transform = `translateX(${offsetRef.current}px)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paused, speed]);

  if (items.length === 0) return null;

  const renderItem = (item: TickerItem, key: string) => {
    const up = item.change >= 0;
    return (
      <div
        key={key}
        className="flex items-center gap-2 px-4 border-r border-border/40 whitespace-nowrap"
      >
        <span className="text-xs font-bold font-mono">{item.symbol}</span>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">
          {item.price.toFixed(item.price < 1 ? 5 : 2)}
        </span>
        <span
          className={`text-xs font-mono flex items-center gap-0.5 ${up ? "text-bull" : "text-bear"}`}
        >
          {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {up ? "+" : ""}
          {item.change.toFixed(2)}
        </span>
      </div>
    );
  };

  return (
    <div
      className="relative overflow-hidden border-y border-border bg-card/60 backdrop-blur-sm py-2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div ref={scrollRef} className="flex will-change-transform">
        {items.map((i) => renderItem(i, `a-${i.symbol}`))}
        {items.map((i) => renderItem(i, `b-${i.symbol}`))}
      </div>
    </div>
  );
}
