// Real-time multi-symbol tick feed hook, backed by the existing Deriv WS client.
// Public API only — no token, no key. Resolves the "fake data" problem on the
// Sentiment / Dark Pool / Options Flow / Neural tabs.
//
// Usage:
//   const { ticks, ready } = useDerivFeed(["frxEURUSD","frxXAUUSD"]);
//   ticks["frxEURUSD"]?.last  // latest quote
//   ticks["frxEURUSD"]?.window // rolling array of last 200 quotes
import { useEffect, useRef, useState } from "react";
import { deriv } from "@/lib/engine/deriv";

export interface FeedTick {
  symbol: string;
  last: number;
  prev: number;
  delta: number;
  pctDelta: number;
  epoch: number;
  window: number[]; // last N quotes for rolling stats
  volWindow: number[]; // |pctDelta| samples for realised vol
  updatedAt: number;
}

const WINDOW = 200;

export function useDerivFeed(symbols: string[]) {
  const [ticks, setTicks] = useState<Record<string, FeedTick>>({});
  const [ready, setReady] = useState(false);
  const unsubsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (symbols.length === 0) return;
    setReady(false);
    const unsubs: Array<() => void> = [];

    for (const sym of symbols) {
      const off = deriv.subscribeTicks(sym, (t) => {
        setTicks((cur) => {
          const prevEntry = cur[sym];
          const last = t.quote;
          const prev = prevEntry?.last ?? last;
          const delta = last - prev;
          const pct = prev > 0 ? (delta / prev) * 100 : 0;
          const window = [...(prevEntry?.window ?? []), last].slice(-WINDOW);
          const volWindow = [...(prevEntry?.volWindow ?? []), Math.abs(pct)].slice(-WINDOW);
          return {
            ...cur,
            [sym]: {
              symbol: sym,
              last,
              prev,
              delta,
              pctDelta: pct,
              epoch: t.epoch,
              window,
              volWindow,
              updatedAt: Date.now(),
            },
          };
        });
      });
      unsubs.push(off);
    }
    unsubsRef.current = unsubs;
    // we're "ready" the moment the first tick lands for any symbol
    const readyTimer = setInterval(() => {
      setTicks((cur) => {
        if (Object.keys(cur).length > 0) setReady(true);
        return cur;
      });
    }, 250);

    return () => {
      clearInterval(readyTimer);
      unsubs.forEach((u) => u());
      unsubsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join("|")]);

  return { ticks, ready };
}
