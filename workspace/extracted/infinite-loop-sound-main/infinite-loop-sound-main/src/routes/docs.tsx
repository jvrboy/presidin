import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { BookOpen, Code as CodeIcon } from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "API Docs — DivergenceIQ" },
      {
        name: "description",
        content:
          "REST API for latest signals, on-demand analysis, and webhook subscriptions. Free to use with an API key.",
      },
    ],
  }),
  component: DocsPage,
});

const BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://confluence-divergence-engine.lovable.app";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wider">{title}</h2>
      <div className="text-sm space-y-2">{children}</div>
    </section>
  );
}
function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="text-[11px] font-mono bg-muted/50 rounded p-2 overflow-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}

function DocsPage() {
  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" /> Public API
          </h1>
          <p className="text-sm text-muted-foreground">
            Free REST API. Authenticate every request with an <code>X-API-Key</code> header. Create
            keys on the{" "}
            <a href="/api-keys" className="text-primary underline">
              API Keys
            </a>{" "}
            page.
          </p>
        </div>

        <Block title="Base URL">
          <Code>{BASE}/api/public/v1</Code>
        </Block>

        <Block title="Authentication">
          <p>Every endpoint requires either header form:</p>
          <Code>{`X-API-Key: sk_live_...\n# or\nAuthorization: Bearer sk_live_...`}</Code>
        </Block>

        <Block title="GET /signals — latest signals">
          <p>
            Query params: <code>limit</code> (1-100, default 20), <code>pair</code>,{" "}
            <code>min_score</code>.
          </p>
          <Code>{`curl "${BASE}/api/public/v1/signals?limit=10&min_score=70" \\
  -H "X-API-Key: $API_KEY"`}</Code>
          <Code>{`{
  "count": 10,
  "signals": [
    { "id": "...", "pair": "frxEURUSD", "timeframe": "M15",
      "direction": "BUY", "entry": 1.0834, "sl": 1.0820,
      "tp1": 1.0848, "tp2": 1.0862, "tp3": 1.0876,
      "score": 88, "rating": "ELITE",
      "confluence": [...], "created_at": "..." }
  ]
}`}</Code>
        </Block>

        <Block title="POST /analysis — on-demand analysis">
          <p>Runs the full divergence + confluence engine on live Deriv candles.</p>
          <Code>{`curl -X POST "${BASE}/api/public/v1/analysis" \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"pair":"frxEURUSD","timeframe":"M15"}'`}</Code>
          <Code>{`{
  "pair": "frxEURUSD", "timeframe": "M15",
  "direction": "BUY", "score": 92, "scorePct": 61, "rating": "ELITE",
  "trade": { "entry": 1.0834, "sl": ..., "tp1": ..., "tp2": ..., "tp3": ..., "rr": 2.1 },
  "confluence": [{ "label": "RSI Divergence", "passed": true, "pts": 18 }, ...],
  "divergences": [{ "name": "RSI", "detected": true, "type": "regular_bull" }]
}`}</Code>
        </Block>

        <Block title="POST /webhooks/subscribe — receive signal push">
          <p>
            Subscribe a URL. We POST every signal whose <code>score</code> ≥ <code>min_score</code>.
          </p>
          <Code>{`curl -X POST "${BASE}/api/public/v1/webhooks/subscribe" \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://your.app/webhooks/diviq","min_score":75}'`}</Code>
          <p>Unsubscribe:</p>
          <Code>{`curl -X DELETE "${BASE}/api/public/v1/webhooks/subscribe?id=YOUR_SUB_ID" \\
  -H "X-API-Key: $API_KEY"`}</Code>
          <p>Payload your endpoint will receive:</p>
          <Code>{`POST https://your.app/webhooks/diviq
Content-Type: application/json

{ "event": "signal.created",
  "signal": { "id": "...", "pair": "...", "direction": "BUY", "entry": ..., "score": 88, ... } }`}</Code>
        </Block>

        <Block title="GET /api/public/health — uptime check">
          <Code>{`curl "${BASE}/api/public/health"`}</Code>
          <Code>{`{ "status": "ok", "last_ping": "...", "ws_ok": true, "latest_signal_at": "...", "server_time": "..." }`}</Code>
        </Block>

        <Block title="POST /signals/incoming — push a signed signal IN">
          <p>
            External system pushes a signal into DivergenceIQ. The body is HMAC-SHA256 signed with
            your API key as the secret. Every request — pass or fail — is recorded in the{" "}
            <code>/webhook-events</code> audit log.
          </p>
          <Code>{`# bash example
BODY='{"pair":"frxEURUSD","timeframe":"M15","direction":"BUY","entry":1.0834,"sl":1.0810,"tp1":1.0855,"tp2":1.0880,"tp3":1.0910,"score":86,"rating":"ELITE"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$API_KEY" | awk '{print $2}')
curl -X POST "${BASE}/api/public/v1/signals/incoming" \\
  -H "X-API-Key: $API_KEY" \\
  -H "X-Signature: sha256=$SIG" \\
  -H "Content-Type: application/json" \\
  -d "$BODY"`}</Code>
        </Block>

        <Block title="Rate limits & errors">
          <p>Soft limit: 60 req/min per key. Errors follow:</p>
          <Code>{`{ "error": "Missing X-API-Key" }     // 401
{ "error": "Invalid API key" }       // 401
{ "error": "<zod validation>" }      // 400`}</Code>
        </Block>

        <Block title="Connecting other apps">
          <p className="flex items-center gap-1">
            <CodeIcon className="w-3 h-3" /> Examples — Node, n8n, Make, Zapier, custom bots:
          </p>
          <Code>{`// Node.js (any runtime)
const r = await fetch("${BASE}/api/public/v1/signals?min_score=80", {
  headers: { "X-API-Key": process.env.DIVIQ_KEY }
});
const { signals } = await r.json();`}</Code>
        </Block>
      </div>
    </AppShell>
  );
}
