// Trade replay engine — step through historical candles bar-by-bar and
// dispatch state changes to a subscriber. Used by the /replay route and the
// `replay` chat skill to backtest discretionary setups visually.

import type { Candle } from "./indicators";

export interface ReplayState {
  index: number; // current bar index (inclusive)
  candle: Candle;
  isPlaying: boolean;
  speedMs: number;
  total: number;
}

export interface ReplayController {
  state(): ReplayState;
  visible(): Candle[];
  play(): void;
  pause(): void;
  step(n?: number): void;
  jumpTo(idx: number): void;
  setSpeed(ms: number): void;
  subscribe(fn: (s: ReplayState) => void): () => void;
  destroy(): void;
}

export function createReplay(
  candles: Candle[],
  opts: { startIdx?: number; speedMs?: number } = {},
): ReplayController {
  if (!candles.length) throw new Error("createReplay: empty candle array");
  let index = Math.max(0, Math.min(candles.length - 1, opts.startIdx ?? 0));
  let isPlaying = false;
  let speedMs = opts.speedMs ?? 500;
  let timer: ReturnType<typeof setInterval> | null = null;
  const subs = new Set<(s: ReplayState) => void>();

  const snapshot = (): ReplayState => ({
    index,
    candle: candles[index],
    isPlaying,
    speedMs,
    total: candles.length,
  });

  const emit = () => subs.forEach((fn) => fn(snapshot()));

  const stopTimer = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    timer = setInterval(() => {
      if (index >= candles.length - 1) {
        isPlaying = false;
        stopTimer();
        emit();
        return;
      }
      index++;
      emit();
    }, speedMs);
  };

  return {
    state: snapshot,
    visible: () => candles.slice(0, index + 1),
    play() {
      if (isPlaying || index >= candles.length - 1) return;
      isPlaying = true;
      startTimer();
      emit();
    },
    pause() {
      isPlaying = false;
      stopTimer();
      emit();
    },
    step(n = 1) {
      this.pause();
      index = Math.max(0, Math.min(candles.length - 1, index + n));
      emit();
    },
    jumpTo(idx) {
      this.pause();
      index = Math.max(0, Math.min(candles.length - 1, idx));
      emit();
    },
    setSpeed(ms) {
      speedMs = Math.max(50, ms);
      if (isPlaying) startTimer();
      emit();
    },
    subscribe(fn) {
      subs.add(fn);
      fn(snapshot());
      return () => subs.delete(fn);
    },
    destroy() {
      stopTimer();
      subs.clear();
    },
  };
}
