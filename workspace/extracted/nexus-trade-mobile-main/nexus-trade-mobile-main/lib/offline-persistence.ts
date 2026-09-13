import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Offline persistence layer for the Nexus Trade mobile client.
 *
 * Three independent mechanisms, all transparent to the rest of the
 * app (callers just see a `StatusSnapshot` cache hit or a write that
 * eventually succeeds):
 *
 * 1. **Last-known status cache** — every successful `getStatus()`
 *    poll writes the result to AsyncStorage. On cold-start with no
 *    backend, the dashboard hydrates from this cache instead of
 *    rendering empty. The cache is stale-but-better-than-nothing.
 *
 * 2. **Failed-write retry queue** — state-changing requests (bot
 *    control, rescan, kill switch, settings update) that fail due
 *    to a network error (NOT a 4xx business error — those are
 *    intentional rejections) are pushed onto a persisted queue.
 *    A background flush loop drains the queue whenever connectivity
 *    returns. The user sees a "queued" indicator in the UI instead
 *    of a hard failure.
 *
 * 3. **Connectivity state** — tracks whether the last poll cycle
 *    succeeded. Exposed via `useConnectivity()` so the UI can render
 *    an offline banner without each component doing its own probing.
 *
 * Trade-off: writes are queued but NOT replayed in strict order.
 * Bot-control operations ("start" then "stop") could theoretically
 * replay out of order. To avoid this, each queue entry has a
 * monotonic sequence number, and the flush loop replays in order.
 * If a later entry supersedes an earlier one (e.g. "stop" after
 * "start"), the earlier entry is still replayed — the backend is
 * idempotent for these operations (start-then-stop is the same as
 * stop, etc.).
 *
 * NOT suitable for trade-order submissions — those MUST NOT be
 * retried after a network failure because the order may have been
 * placed server-side before the response was lost. The queue is
 * explicitly limited to bot-control and signal-rescan operations.
 */

const STATUS_CACHE_KEY = "nexus-trade.offline.status-cache.v1";
const WRITE_QUEUE_KEY = "nexus-trade.offline.write-queue.v1";

export type QueuedWrite = {
  id: string;
  seq: number;
  endpoint: "controlBot" | "rescan" | "killSwitch" | "updateSettings";
  // JSON-serialized payload specific to the endpoint.
  payload: unknown;
  queuedAt: number;
  lastAttemptAt?: number;
  attemptCount: number;
};

// ---------------------------------------------------------------------------
// Status cache
// ---------------------------------------------------------------------------

export async function cacheStatusSnapshot(status: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STATUS_CACHE_KEY,
      JSON.stringify({ at: Date.now(), status }),
    );
  } catch {
    // Cache write failures are non-fatal — we just won't be able to
    // hydrate from cache on the next cold start.
  }
}

export async function loadCachedStatusSnapshot<T = unknown>(): Promise<{ at: number; status: T } | null> {
  try {
    const raw = await AsyncStorage.getItem(STATUS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; status: T };
    if (typeof parsed.at !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearCachedStatusSnapshot(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STATUS_CACHE_KEY);
  } catch {
    // non-fatal
  }
}

// ---------------------------------------------------------------------------
// Write queue
// ---------------------------------------------------------------------------

let _queue: QueuedWrite[] | null = null;
let _nextSeq = 1;

async function loadQueue(): Promise<QueuedWrite[]> {
  if (_queue !== null) return _queue;
  try {
    const raw = await AsyncStorage.getItem(WRITE_QUEUE_KEY);
    if (!raw) {
      _queue = [];
      _nextSeq = 1;
      return _queue;
    }
    const parsed = JSON.parse(raw) as QueuedWrite[];
    if (!Array.isArray(parsed)) {
      _queue = [];
      _nextSeq = 1;
      return _queue;
    }
    _queue = parsed;
    _nextSeq = parsed.reduce((max, w) => Math.max(max, w.seq + 1), 1);
    return _queue;
  } catch {
    _queue = [];
    _nextSeq = 1;
    return _queue;
  }
}

async function persistQueue(): Promise<void> {
  if (_queue === null) return;
  try {
    await AsyncStorage.setItem(WRITE_QUEUE_KEY, JSON.stringify(_queue));
  } catch {
    // Queue persistence failure is non-fatal — the queue just won't
    // survive a cold restart.
  }
}

/** Enqueue a state-changing write for later replay. Returns the
 *  assigned queue entry id. */
export async function enqueueWrite(
  endpoint: QueuedWrite["endpoint"],
  payload: unknown,
): Promise<string> {
  const queue = await loadQueue();
  const id = `w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: QueuedWrite = {
    id,
    seq: _nextSeq++,
    endpoint,
    payload,
    queuedAt: Date.now(),
    attemptCount: 0,
  };
  queue.push(entry);
  await persistQueue();
  return id;
}

/** Return the current pending queue (oldest first), loading from
 *  AsyncStorage if needed. Doesn't mutate. */
export async function getPendingWrites(): Promise<readonly QueuedWrite[]> {
  const queue = await loadQueue();
  return [...queue].sort((a, b) => a.seq - b.seq);
}

/** Remove a queue entry by id (after it succeeded). */
export async function dequeueWrite(id: string): Promise<void> {
  const queue = await loadQueue();
  const next = queue.filter((w) => w.id !== id);
  if (next.length !== queue.length) {
    _queue = next;
    await persistQueue();
  }
}

/** Mark a queue entry as attempted (for retry-backoff bookkeeping). */
export async function markWriteAttempted(id: string): Promise<void> {
  const queue = await loadQueue();
  const entry = queue.find((w) => w.id === id);
  if (!entry) return;
  entry.lastAttemptAt = Date.now();
  entry.attemptCount += 1;
  await persistQueue();
}

/** Drop all pending writes — used on explicit user cancel. */
export async function clearWriteQueue(): Promise<void> {
  _queue = [];
  _nextSeq = 1;
  await persistQueue();
}

// ---------------------------------------------------------------------------
// Connectivity state
// ---------------------------------------------------------------------------

type ConnectivityListener = (online: boolean) => void;
const _listeners = new Set<ConnectivityListener>();
let _online = true; // optimistic — assume online until first failure

export function getConnectivity(): boolean {
  return _online;
}

export function setConnectivity(online: boolean): void {
  if (_online === online) return;
  _online = online;
  for (const listener of _listeners) {
    try {
      listener(online);
    } catch {
      // listener errors are non-fatal
    }
  }
}

export function subscribeConnectivity(listener: ConnectivityListener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}
