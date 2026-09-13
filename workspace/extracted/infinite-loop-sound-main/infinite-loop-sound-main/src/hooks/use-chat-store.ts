// Phase 4 — Chat history + artifacts + usage hooks.
// Storage is localStorage-first (works offline + before auth) with a documented
// path to Supabase mirroring (see supabase/migrations/*_chats_artifacts_usage.sql).
// Extended: folders, clone, restore (trash), move chats between folders.
import { useCallback, useEffect, useState } from "react";

export type Msg = {
  role: "system" | "user" | "assistant";
  content: string;
  ts: number;
  provider?: string;
};

export interface Thread {
  id: string;
  title: string;
  messages: Msg[];
  updated: number;
  pinned?: boolean;
  archived?: boolean;
  deleted?: boolean;
  deletedAt?: number;
  folderId?: string | null;
  clonedFrom?: string;
}

export interface ChatFolder {
  id: string;
  name: string;
  color: string;
  order: number;
  createdAt: number;
}

export interface Artifact {
  id: string;
  threadId: string;
  name: string;
  kind: "json" | "csv" | "html" | "css" | "js" | "ts" | "py" | "md" | "pdf" | "txt" | "other";
  bytes: number;
  content: string;
  createdAt: number;
}

export interface UsageEvent {
  ts: number;
  provider: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  threadId?: string;
}

const THREADS_KEY = "diq.chat.threads.v1";
const FOLDERS_KEY = "diq.chat.folders.v1";
const ARTIFACTS_KEY = "diq.chat.artifacts.v1";
const USAGE_KEY = "diq.chat.usage.v1";

const safeRead = <T>(k: string, fallback: T, validate?: (value: unknown) => value is T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(localStorage.getItem(k) || "null") ?? fallback;
    return validate && !validate(parsed) ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
};

const isArray = <T = unknown>(value: unknown): value is T[] => Array.isArray(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const safeId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const safeTimestamp = (value: unknown, fallback = Date.now()) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const sanitizeMessage = (value: unknown): Msg | null => {
  if (!isRecord(value)) return null;
  const role = value.role;
  const content = value.content;
  if (role !== "system" && role !== "user" && role !== "assistant") return null;
  if (typeof content !== "string") return null;

  return {
    role,
    content,
    ts: safeTimestamp(value.ts),
    provider: typeof value.provider === "string" ? value.provider : undefined,
  };
};

const sanitizeThread = (value: unknown): Thread | null => {
  if (!isRecord(value)) return null;
  const rawMessages = Array.isArray(value.messages) ? value.messages : [];
  const messages = rawMessages.map(sanitizeMessage).filter((msg): msg is Msg => Boolean(msg));
  const updatedFallback = messages.at(0)?.ts ?? Date.now();

  return {
    id: typeof value.id === "string" && value.id ? value.id : safeId(),
    title: typeof value.title === "string" && value.title.trim() ? value.title : "New chat",
    messages,
    updated: safeTimestamp(value.updated, updatedFallback),
    pinned: typeof value.pinned === "boolean" ? value.pinned : undefined,
    archived: typeof value.archived === "boolean" ? value.archived : undefined,
    deleted: typeof value.deleted === "boolean" ? value.deleted : undefined,
    deletedAt: typeof value.deletedAt === "number" ? value.deletedAt : undefined,
    folderId: typeof value.folderId === "string" ? value.folderId : null,
    clonedFrom: typeof value.clonedFrom === "string" ? value.clonedFrom : undefined,
  };
};

const sanitizeFolder = (value: unknown, index: number): ChatFolder | null => {
  if (!isRecord(value)) return null;
  const name = typeof value.name === "string" && value.name.trim() ? value.name : "Untitled";
  return {
    id: typeof value.id === "string" && value.id ? value.id : safeId(),
    name,
    color: typeof value.color === "string" && value.color ? value.color : "#3b82f6",
    order: typeof value.order === "number" && Number.isFinite(value.order) ? value.order : index,
    createdAt: safeTimestamp(value.createdAt),
  };
};

const safeWrite = (k: string, v: unknown) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

export function useThreads() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = safeRead<unknown[]>(THREADS_KEY, [], isArray)
      .map(sanitizeThread)
      .filter((thread): thread is Thread => Boolean(thread));
    setThreads(stored);
    setReady(true);
  }, []);

  const persist = useCallback((next: Thread[] | ((previous: Thread[]) => Thread[])) => {
    setThreads((previous) => {
      const resolved = typeof next === "function" ? next(previous) : next;
      safeWrite(THREADS_KEY, resolved);
      return resolved;
    });
  }, []);

  const create = useCallback(
    (title = "New chat", folderId: string | null = null): Thread => {
      const thread: Thread = {
        id: safeId(),
        title,
        messages: [],
        updated: Date.now(),
        folderId,
      };
      persist((previous) => [thread, ...previous]);
      return thread;
    },
    [persist],
  );

  const update = useCallback(
    (id: string, patch: Partial<Thread>) => {
      persist((previous) =>
        previous.map((thread) =>
          thread.id === id ? { ...thread, ...patch, updated: Date.now() } : thread,
        ),
      );
    },
    [persist],
  );

  const remove = useCallback(
    (id: string) => {
      persist((previous) =>
        previous.map((thread) =>
          thread.id === id
            ? { ...thread, deleted: true, deletedAt: Date.now(), pinned: false }
            : thread,
        ),
      );
    },
    [persist],
  );

  const hardRemove = useCallback(
    (id: string) => {
      persist((previous) => previous.filter((thread) => thread.id !== id));
    },
    [persist],
  );

  const restore = useCallback(
    (id: string) => {
      persist((previous) =>
        previous.map((thread) =>
          thread.id === id ? { ...thread, deleted: false, deletedAt: undefined } : thread,
        ),
      );
    },
    [persist],
  );

  const emptyTrash = useCallback(() => {
    persist((previous) => previous.filter((thread) => !thread.deleted));
  }, [persist]);

  const clone = useCallback(
    (id: string): Thread | null => {
      const original = threads.find((thread) => thread.id === id);
      if (!original) return null;
      const copy: Thread = {
        ...original,
        id: safeId(),
        title: `${original.title} (clone)`,
        updated: Date.now(),
        pinned: false,
        archived: false,
        deleted: false,
        deletedAt: undefined,
        clonedFrom: id,
      };
      persist((previous) => [copy, ...previous]);
      return copy;
    },
    [persist, threads],
  );

  const move = useCallback(
    (id: string, folderId: string | null) => {
      persist((previous) =>
        previous.map((thread) =>
          thread.id === id ? { ...thread, folderId, updated: Date.now() } : thread,
        ),
      );
    },
    [persist],
  );

  const togglePin = useCallback(
    (id: string) => {
      persist((previous) =>
        previous.map((thread) =>
          thread.id === id ? { ...thread, pinned: !thread.pinned, updated: Date.now() } : thread,
        ),
      );
    },
    [persist],
  );

  const toggleArchive = useCallback(
    (id: string) => {
      persist((previous) =>
        previous.map((thread) =>
          thread.id === id
            ? { ...thread, archived: !thread.archived, updated: Date.now() }
            : thread,
        ),
      );
    },
    [persist],
  );

  return {
    threads,
    ready,
    persist,
    create,
    update,
    remove,
    hardRemove,
    restore,
    emptyTrash,
    clone,
    move,
    togglePin,
    toggleArchive,
  };
}

export function useFolders() {
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  useEffect(() => {
    const stored = safeRead<unknown[]>(FOLDERS_KEY, [], isArray)
      .map(sanitizeFolder)
      .filter((folder): folder is ChatFolder => Boolean(folder))
      .sort((a, b) => a.order - b.order);
    setFolders(stored);
  }, []);

  const persist = useCallback((f: ChatFolder[]) => {
    setFolders(f);
    safeWrite(FOLDERS_KEY, f);
  }, []);

  const create = useCallback(
    (name: string, color = "#3b82f6"): ChatFolder => {
      const f: ChatFolder = {
        id: safeId(),
        name,
        color,
        order: folders.length,
        createdAt: Date.now(),
      };
      persist([...folders, f]);
      return f;
    },
    [persist, folders],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      persist(folders.map((f) => (f.id === id ? { ...f, name } : f)));
    },
    [persist, folders],
  );

  const recolor = useCallback(
    (id: string, color: string) => {
      persist(folders.map((f) => (f.id === id ? { ...f, color } : f)));
    },
    [persist, folders],
  );

  const remove = useCallback(
    (id: string) => {
      persist(folders.filter((f) => f.id !== id));
    },
    [persist, folders],
  );

  const reorder = useCallback(
    (id: string, newOrder: number) => {
      const sorted = [...folders].sort((a, b) => a.order - b.order);
      const item = sorted.find((f) => f.id === id);
      if (!item) return;
      const filtered = sorted.filter((f) => f.id !== id);
      filtered.splice(newOrder, 0, { ...item, order: newOrder });
      persist(filtered.map((f, i) => ({ ...f, order: i })));
    },
    [persist, folders],
  );

  return { folders, persist, create, rename, recolor, remove, reorder };
}

export function useArtifacts(threadId?: string | null) {
  const [all, setAll] = useState<Artifact[]>([]);
  useEffect(() => {
    setAll(safeRead<Artifact[]>(ARTIFACTS_KEY, [], isArray));
  }, []);

  const persist = useCallback((a: Artifact[]) => {
    setAll(a);
    safeWrite(ARTIFACTS_KEY, a);
  }, []);

  const add = useCallback(
    (a: Omit<Artifact, "id" | "createdAt">) => {
      const full: Artifact = { ...a, id: safeId(), createdAt: Date.now() };
      persist([full, ...all]);
      return full;
    },
    [persist, all],
  );

  const remove = useCallback(
    (id: string) => persist(all.filter((a) => a.id !== id)),
    [persist, all],
  );

  const forThread = threadId ? all.filter((a) => a.threadId === threadId) : all;

  return { all, forThread, add, remove };
}

export function useUsage() {
  const [events, setEvents] = useState<UsageEvent[]>([]);
  useEffect(() => {
    setEvents(safeRead<UsageEvent[]>(USAGE_KEY, [], isArray));
  }, []);

  const track = useCallback((e: UsageEvent) => {
    setEvents((prev) => {
      const next = [e, ...prev].slice(0, 2000);
      safeWrite(USAGE_KEY, next);
      return next;
    });
  }, []);

  const totalTokens = events.reduce((a, e) => a + e.inputTokens + e.outputTokens, 0);
  const last24h = events.filter((e) => e.ts > Date.now() - 24 * 3600_000);
  const tokens24h = last24h.reduce((a, e) => a + e.inputTokens + e.outputTokens, 0);
  const byProvider = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.provider] = (acc[e.provider] || 0) + e.inputTokens + e.outputTokens;
    return acc;
  }, {});

  return { events, track, totalTokens, tokens24h, byProvider };
}
