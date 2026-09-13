// Multi-Deriv-account store (localStorage only).
export interface DerivAccount {
  id: string; // uuid
  label: string; // user-friendly name
  token: string; // Deriv API token (needs Trade scope for the bot)
  loginid?: string;
  currency?: string;
  isVirtual?: boolean;
  balance?: number;
  scopes?: string[]; // granted token scopes from Deriv authorize response
  canTrade?: boolean; // convenience flag derived from scopes
}
const KEY = "diq.deriv.accounts.v1";
const ACTIVE = "diq.deriv.active.v1";

export function loadAccounts(): DerivAccount[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
export function saveAccounts(a: DerivAccount[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(a));
  window.dispatchEvent(new CustomEvent("diq:deriv-accounts", { detail: a }));
}
export function getActiveAccount(): DerivAccount | null {
  if (typeof window === "undefined") return null;
  const id = localStorage.getItem(ACTIVE);
  return loadAccounts().find((a) => a.id === id) || loadAccounts()[0] || null;
}
export function setActiveAccount(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE, id);
  window.dispatchEvent(new CustomEvent("diq:deriv-active", { detail: id }));
}
export function addAccount(a: Omit<DerivAccount, "id">) {
  const accounts = loadAccounts();
  const next: DerivAccount = { ...a, id: crypto.randomUUID() };
  accounts.push(next);
  saveAccounts(accounts);
  if (accounts.length === 1) setActiveAccount(next.id);
  return next;
}
export function removeAccount(id: string) {
  saveAccounts(loadAccounts().filter((a) => a.id !== id));
}
