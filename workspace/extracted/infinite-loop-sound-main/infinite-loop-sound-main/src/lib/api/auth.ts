// Public REST API helpers — key hashing + auth check.
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

export function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireApiKey(
  request: Request,
): Promise<{ ok: true } | { ok: false; res: Response }> {
  const key =
    request.headers.get("x-api-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!key)
    return {
      ok: false,
      res: new Response(JSON.stringify({ error: "Missing X-API-Key" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    };
  const sb = admin();
  const hash = sha256(key);
  const { data } = await sb
    .from("api_keys")
    .select("id, expires_at")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!data)
    return {
      ok: false,
      res: new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    };
  if ((data as any).expires_at && new Date((data as any).expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      res: new Response(JSON.stringify({ error: "API key expired" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    };
  }
  await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { ok: true };
}

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, x-api-key, authorization",
};
