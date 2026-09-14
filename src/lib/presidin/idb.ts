/**
 * PRESIDIN — IndexedDB wrapper for client-side persistence
 * Uses idb-keyval for simplicity; degrades to in-memory on server.
 */

let store: any = null;
function getStore() {
  if (typeof window === "undefined") return null;
  if (!store) {
    try {
      const { createStore } = require("idb-keyval");
      store = createStore("presidin-db", "presidin-store");
    } catch {
      store = null;
    }
  }
  return store;
}

const memFallback = new Map<string, any>();

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const s = getStore();
  if (!s) return memFallback.get(key) as T | undefined;
  try {
    const { get } = require("idb-keyval");
    return (await get(key, s)) as T | undefined;
  } catch {
    return memFallback.get(key) as T | undefined;
  }
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  const s = getStore();
  if (!s) { memFallback.set(key, value); return; }
  try {
    const { set } = require("idb-keyval");
    await set(key, value, s);
  } catch {
    memFallback.set(key, value);
  }
}

export async function idbDel(key: string): Promise<void> {
  const s = getStore();
  if (!s) { memFallback.delete(key); return; }
  try {
    const { del } = require("idb-keyval");
    await del(key, s);
  } catch {
    memFallback.delete(key);
  }
}
