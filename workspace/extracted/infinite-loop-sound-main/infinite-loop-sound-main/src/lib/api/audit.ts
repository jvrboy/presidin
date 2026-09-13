// Webhook audit log helper — records every signed inbound webhook request.
import { admin } from "./auth";

export interface AuditEntry {
  source: string; // logical source (e.g. "signals.incoming", "telegram", "deriv.callback")
  endpoint: string; // request URL path
  ip?: string | null;
  signatureValid: boolean;
  statusCode: number;
  payload?: unknown; // small JSON-serializable body
  headers?: Record<string, string>;
  error?: string | null;
}

export async function recordWebhookEvent(e: AuditEntry) {
  try {
    await admin()
      .from("webhook_events")
      .insert({
        source: e.source,
        endpoint: e.endpoint,
        ip: e.ip ?? null,
        signature_valid: e.signatureValid,
        status_code: e.statusCode,
        payload: (e.payload ?? {}) as any,
        headers: (e.headers ?? {}) as any,
        error: e.error ?? null,
      });
  } catch (err) {
    console.error("[audit] failed to record webhook event", err);
  }
}

export function clientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

export function headerSnapshot(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    if (/authorization|cookie|x-api-key/i.test(k)) return;
    out[k] = v.length > 256 ? v.slice(0, 256) + "…" : v;
  });
  return out;
}

// HMAC-SHA256 verification of a raw body using a shared secret.
// Accepts headers like `sha256=<hex>` or bare hex.
export async function verifyHmac(
  secret: string,
  body: string,
  header: string | null,
): Promise<boolean> {
  if (!header || !secret) return false;
  const provided = header
    .replace(/^sha256=/i, "")
    .trim()
    .toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (hex.length !== provided.length) return false;
  let mismatch = 0;
  for (let i = 0; i < hex.length; i++) mismatch |= hex.charCodeAt(i) ^ provided.charCodeAt(i);
  return mismatch === 0;
}
