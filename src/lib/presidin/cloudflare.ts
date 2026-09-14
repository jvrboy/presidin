/**
 * PRESIDIN — Cloudflare integration
 * R2 storage + Workers + KV
 */

export interface CloudflareConfig {
  accountId: string;
  apiToken: string;
  r2Bucket?: string;
  kvNamespaceId?: string;
}

export function getCloudflareConfig(): CloudflareConfig | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) return null;
  return {
    accountId,
    apiToken,
    r2Bucket: process.env.CLOUDFLARE_R2_BUCKET,
    kvNamespaceId: process.env.CLOUDFLARE_KV_NAMESPACE_ID,
  };
}

export interface CloudflareStatus {
  configured: boolean;
  accountId?: string;
  r2Bucket?: string;
  kvNamespaceId?: string;
  hasToken: boolean;
}

export function getCloudflareStatus(): CloudflareStatus {
  const cfg = getCloudflareConfig();
  return {
    configured: Boolean(cfg),
    accountId: cfg?.accountId,
    r2Bucket: cfg?.r2Bucket,
    kvNamespaceId: cfg?.kvNamespaceId,
    hasToken: Boolean(cfg?.apiToken),
  };
}

// ============================================================
// R2 storage (S3-compatible)
// ============================================================

export async function r2Upload(
  key: string,
  body: Buffer | string,
  contentType = "application/octet-stream",
  metadata?: Record<string, string>
): Promise<string | null> {
  const cfg = getCloudflareConfig();
  if (!cfg?.r2Bucket) return null;
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/r2/buckets/${cfg.r2Bucket}/objects/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${cfg.apiToken}`,
        "Content-Type": contentType,
        ...(metadata ? Object.fromEntries(Object.entries(metadata).map(([k, v]) => [`X-Amz-Meta-${k}`, v])) : {}),
      },
      body,
    });
    if (!res.ok) {
      console.error("R2 upload failed:", await res.text());
      return null;
    }
    return key;
  } catch (err) {
    console.error("R2 upload exception:", err);
    return null;
  }
}

export async function r2Download(key: string): Promise<Buffer | null> {
  const cfg = getCloudflareConfig();
  if (!cfg?.r2Bucket) return null;
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/r2/buckets/${cfg.r2Bucket}/objects/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.apiToken}` },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function r2Delete(key: string): Promise<boolean> {
  const cfg = getCloudflareConfig();
  if (!cfg?.r2Bucket) return false;
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/r2/buckets/${cfg.r2Bucket}/objects/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${cfg.apiToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function r2List(prefix?: string, limit = 100): Promise<{ key: string; size: number; lastModified?: string }[]> {
  const cfg = getCloudflareConfig();
  if (!cfg?.r2Bucket) return [];
  try {
    const params = new URLSearchParams({ per_page: String(limit) });
    if (prefix) params.set("prefix", prefix);
    const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/r2/buckets/${cfg.r2Bucket}/objects?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.apiToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.result || []).map((o: any) => ({
      key: o.key,
      size: o.size,
      lastModified: o.last_modified,
    }));
  } catch {
    return [];
  }
}

// ============================================================
// KV (key-value store)
// ============================================================

export async function kvGet(key: string): Promise<string | null> {
  const cfg = getCloudflareConfig();
  if (!cfg?.kvNamespaceId) return null;
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/storage/kv/namespaces/${cfg.kvNamespaceId}/values/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.apiToken}` },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
  const cfg = getCloudflareConfig();
  if (!cfg?.kvNamespaceId) return false;
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/storage/kv/namespaces/${cfg.kvNamespaceId}/values/${encodeURIComponent(key)}`;
    const body = new FormData();
    body.append("value", value);
    if (ttlSeconds) body.append("metadata", JSON.stringify({ ttl: ttlSeconds }));
    const res = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${cfg.apiToken}` },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function kvDelete(key: string): Promise<boolean> {
  const cfg = getCloudflareConfig();
  if (!cfg?.kvNamespaceId) return false;
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/storage/kv/namespaces/${cfg.kvNamespaceId}/values/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${cfg.apiToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ============================================================
// Worker deployment helper (text-only — actual deploy via wrangler CLI)
// ============================================================

export const CLOUDFLARE_WORKER_TEMPLATE = `
// PRESIDIN Cloudflare Worker — heartbeat + cron
// Deploy with: wrangler deploy

export default {
  async scheduled(event, env, ctx) {
    // Burst the PRESIDIN tick endpoint every minute
    await fetch(\`\${env.PRESIDIN_URL}/api/cron/tick\`, {
      method: "POST",
      headers: { "X-Presidin-Secret": env.PRESIDIN_CRON_SECRET },
    });
  },
  async fetch(request, env) {
    // Health check endpoint
    return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
`;
