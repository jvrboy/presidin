import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useContext, useEffect, useMemo, useState, createContext, type ReactNode } from "react";

import {
  DEFAULT_API_BASE_URL,
  forexApi,
  normalizeBaseUrl,
  type Signal,
  type StatusSnapshot,
} from "@/lib/forex-api";
import {
  cacheStatusSnapshot,
  loadCachedStatusSnapshot,
  enqueueWrite,
  getPendingWrites,
  dequeueWrite,
  markWriteAttempted,
  setConnectivity,
  getConnectivity,
  type QueuedWrite,
} from "@/lib/offline-persistence";

const API_URL_STORAGE_KEY = "nexus-trade.api-base-url";

type TradingContextValue = {
  apiBaseUrl: string;
  draftApiBaseUrl: string;
  status: StatusSnapshot | null;
  signals: Signal[];
  loading: boolean;
  connected: boolean;
  /** True if the last network poll actually reached the backend. The
   *  app may show stale-but-cached data while `online === false`. */
  online: boolean;
  /** Pending writes queued for retry (offline mode). Empty when online. */
  pendingWrites: readonly QueuedWrite[];
  hydrated: boolean;
  error: string | null;
  lastSyncedAt: Date | null;
  setDraftApiBaseUrl: (value: string) => void;
  saveApiBaseUrl: () => Promise<void>;
  resetApiBaseUrl: () => Promise<void>;
  refresh: (silent?: boolean) => Promise<void>;
  controlBot: (action: "start" | "stop" | "pause" | "resume") => Promise<void>;
  rescan: () => Promise<void>;
  killSwitch: () => Promise<void>;
  clearError: () => void;
};

const TradingContext = createContext<TradingContextValue | null>(null);

export function TradingProvider({ children }: { children: ReactNode }) {
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [draftApiBaseUrl, setDraftApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [status, setStatus] = useState<StatusSnapshot | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [online, setOnlineState] = useState(true);
  const [pendingWrites, setPendingWrites] = useState<readonly QueuedWrite[]>([]);

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const nextStatus = await forexApi.getStatus(apiBaseUrl);
        setStatus(nextStatus);
        setSignals(nextStatus.signals ?? []);
        setError(null);
        setLastSyncedAt(new Date());
        setConnectivity(true);
        setOnlineState(true);
        // Persist the snapshot for offline cold-start hydration.
        void cacheStatusSnapshot(nextStatus);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to reach the trading backend");
        setConnectivity(false);
        setOnlineState(false);
        // On the FIRST failure after cold-start, hydrate from cache so
        // the dashboard isn't blank. Subsequent failures keep the
        // existing in-memory status (which is fresher than the cache).
        setStatus((current) => {
          if (current) return current;
          void loadCachedStatusSnapshot<StatusSnapshot>().then((cached) => {
            if (cached?.status) {
              setStatus(cached.status);
              setSignals(cached.status.signals ?? []);
            }
          });
          return current;
        });
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [apiBaseUrl],
  );

  useEffect(() => {
    AsyncStorage.getItem(API_URL_STORAGE_KEY)
      .then((storedUrl) => {
        if (storedUrl) {
          const nextUrl = normalizeBaseUrl(storedUrl);
          setApiBaseUrl(nextUrl);
          setDraftApiBaseUrl(nextUrl);
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void refresh();
    const interval = setInterval(() => void refresh(true), 8000);
    return () => clearInterval(interval);
  }, [hydrated, refresh]);

  // Background write-queue flush loop: when online, drain any pending
  // writes that were queued while offline. Runs every 5s (cheap — the
  // queue is usually empty).
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    const flush = async () => {
      if (!getConnectivity()) return;
      const pending = await getPendingWrites();
      if (pending.length === 0) return;
      setPendingWrites(pending);
      for (const write of pending) {
        if (!active) return;
        await markWriteAttempted(write.id);
        try {
          switch (write.endpoint) {
            case "controlBot":
              await forexApi.controlBot(apiBaseUrl, (write.payload as { action: "start" | "stop" | "pause" | "resume" }).action);
              break;
            case "rescan":
              await forexApi.rescan(apiBaseUrl);
              break;
            case "killSwitch":
              await forexApi.kill(apiBaseUrl);
              break;
            // updateSettings is intentionally NOT replayed here — the
            // settings endpoint replaces the entire SystemSettings
            // object, so replaying a stale snapshot could overwrite
            // newer backend-side changes. We just drop it.
            case "updateSettings":
              break;
          }
          await dequeueWrite(write.id);
        } catch {
          // Network error — leave the entry queued; we'll retry next tick.
          return;
        }
      }
      const remaining = await getPendingWrites();
      setPendingWrites(remaining);
    };
    const timer = setInterval(() => void flush(), 5000);
    // Run once immediately on mount + whenever connectivity returns.
    void flush();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [hydrated, apiBaseUrl]);

  const saveApiBaseUrl = useCallback(async () => {
    const nextUrl = normalizeBaseUrl(draftApiBaseUrl);
    if (!nextUrl) {
      setError("Enter the URL of the FastAPI backend first.");
      return;
    }
    await AsyncStorage.setItem(API_URL_STORAGE_KEY, nextUrl);
    setApiBaseUrl(nextUrl);
    setDraftApiBaseUrl(nextUrl);
  }, [draftApiBaseUrl]);

  const resetApiBaseUrl = useCallback(async () => {
    await AsyncStorage.setItem(API_URL_STORAGE_KEY, DEFAULT_API_BASE_URL);
    setApiBaseUrl(DEFAULT_API_BASE_URL);
    setDraftApiBaseUrl(DEFAULT_API_BASE_URL);
  }, []);

  const runAction = useCallback(
    async (action: "start" | "stop" | "pause" | "resume") => {
      setLoading(true);
      try {
        await forexApi.controlBot(apiBaseUrl, action);
        await refresh(true);
      } catch (requestError) {
        // If the failure is a network error (not a 4xx business
        // rejection), queue the write for later replay.
        const msg = requestError instanceof Error ? requestError.message : "Bot action failed";
        if (/network|reach|timed out|fetch/i.test(msg)) {
          await enqueueWrite("controlBot", { action });
          setPendingWrites(await getPendingWrites());
          setError(`Offline — "${action}" queued for retry. Reconnecting…`);
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl, refresh],
  );

  const rescan = useCallback(async () => {
    setLoading(true);
    try {
      await forexApi.rescan(apiBaseUrl);
      await refresh(true);
    } catch (requestError) {
      const msg = requestError instanceof Error ? requestError.message : "Signal rescan failed";
      if (/network|reach|timed out|fetch/i.test(msg)) {
        await enqueueWrite("rescan", {});
        setPendingWrites(await getPendingWrites());
        setError("Offline — rescan queued for retry. Reconnecting…");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, refresh]);

  const killSwitch = useCallback(async () => {
    setLoading(true);
    try {
      await forexApi.kill(apiBaseUrl);
      await refresh(true);
    } catch (requestError) {
      const msg = requestError instanceof Error ? requestError.message : "Kill switch request failed";
      if (/network|reach|timed out|fetch/i.test(msg)) {
        await enqueueWrite("killSwitch", {});
        setPendingWrites(await getPendingWrites());
        setError("Offline — kill switch queued for retry. Reconnecting…");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, refresh]);

  const value = useMemo<TradingContextValue>(
    () => ({
      apiBaseUrl,
      draftApiBaseUrl,
      status,
      signals,
      loading,
      connected: status !== null && error === null,
      online,
      pendingWrites,
      hydrated,
      error,
      lastSyncedAt,
      setDraftApiBaseUrl,
      saveApiBaseUrl,
      resetApiBaseUrl,
      refresh,
      controlBot: runAction,
      rescan,
      killSwitch,
      clearError: () => setError(null),
    }),
    [apiBaseUrl, draftApiBaseUrl, status, signals, loading, error, online, pendingWrites, hydrated, lastSyncedAt, saveApiBaseUrl, resetApiBaseUrl, refresh, runAction, rescan, killSwitch],
  );

  return <TradingContext.Provider value={value}>{children}</TradingContext.Provider>;
}

export function useTrading() {
  const context = useContext(TradingContext);
  if (!context) throw new Error("useTrading must be used inside TradingProvider");
  return context;
}
