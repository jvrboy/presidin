// Supabase Edge Function: hf-proxy
// Range-aware proxy for HuggingFace model downloads.
// Solves two production problems:
//   1) HF anonymous CDN occasionally returns 401 on direct browser fetches.
//   2) wllama needs Range request support to chunk-download large GGUF files.
//
// Usage from the client:
//   const proxied = `${SUPABASE_URL}/functions/v1/hf-proxy?u=${encodeURIComponent(hfUrl)}`;
//   wllama.loadModelFromUrl(proxied, opts);
//
// Optional secret: HF_TOKEN — set this on the Supabase project to access gated repos.
//
// Deploy:
//   supabase functions deploy hf-proxy --no-verify-jwt
//   supabase secrets set HF_TOKEN=hf_xxx   # optional

const ALLOWED_HOST = "huggingface.co";
// Simple in-memory rate limit per client IP (per cold-start instance)
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders(),
    });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown";
  if (rateLimited(ip)) {
    return json({ error: "rate limit exceeded" }, 429);
  }

  const url = new URL(req.url);
  const target = url.searchParams.get("u");
  if (!target) {
    return json({ error: "missing ?u=<huggingface url>" }, 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return json({ error: "invalid url" }, 400);
  }

  if (parsed.protocol !== "https:") {
    return json({ error: "only https allowed" }, 400);
  }
  if (parsed.hostname !== ALLOWED_HOST && !parsed.hostname.endsWith(".huggingface.co")) {
    return json({ error: "only huggingface.co allowed" }, 400);
  }

  // Forward Range so wllama can chunk
  const fwd: HeadersInit = {
    // a real-looking UA avoids the anonymous-401 some HF CDN edges return
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 divergenceiq-hf-proxy/1",
    Accept: "*/*",
  };
  const range = req.headers.get("range");
  if (range) fwd["Range"] = range;
  const ifRange = req.headers.get("if-range");
  if (ifRange) fwd["If-Range"] = ifRange;

  const token = Deno.env.get("HF_TOKEN");
  if (token) fwd["Authorization"] = `Bearer ${token}`;

  // Manual redirect handling: re-validate every hop against the host allowlist
  // so a 302 can't turn this into an open relay
  let currentUrl = parsed;
  let upstream: Response | null = null;
  for (let hop = 0; hop < 5; hop++) {
    upstream = await fetch(currentUrl.toString(), {
      method: req.method,
      headers: fwd,
      redirect: "manual",
    });
    const location = upstream.headers.get("location");
    if (upstream.status >= 300 && upstream.status < 400 && location) {
      currentUrl = new URL(location, currentUrl);
      if (currentUrl.protocol !== "https:") {
        return json({ error: "redirect to non-https blocked" }, 400);
      }
      if (
        currentUrl.hostname !== ALLOWED_HOST &&
        !currentUrl.hostname.endsWith(".huggingface.co")
      ) {
        return json({ error: "redirect outside huggingface.co blocked" }, 400);
      }
      continue;
    }
    break;
  }
  if (!upstream) return json({ error: "upstream fetch failed" }, 502);

  // Stream the body straight back; copy useful headers.
  const resHeaders = new Headers(corsHeaders());
  for (const h of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
    "cache-control",
  ]) {
    const v = upstream.headers.get(h);
    if (v) resHeaders.set(h, v);
  }
  // ensure ranges are advertised even if upstream forgot
  if (!resHeaders.has("accept-ranges")) resHeaders.set("accept-ranges", "bytes");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
});

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "range, if-range, content-type, authorization",
    "Access-Control-Expose-Headers":
      "content-range, content-length, accept-ranges, etag, last-modified",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders() },
  });
}
