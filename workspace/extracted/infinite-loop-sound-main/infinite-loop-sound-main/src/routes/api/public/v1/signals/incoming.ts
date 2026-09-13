// Inbound signed-signal endpoint. External systems POST a JSON signal payload
// with an HMAC-SHA256 signature derived from the shared API key.
// Every request is recorded in the webhook_events audit log regardless of
// signature verification outcome.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { admin, CORS, sha256 } from "@/lib/api/auth";
import { recordWebhookEvent, clientIp, headerSnapshot, verifyHmac } from "@/lib/api/audit";
import { raiseAlert } from "@/lib/alerts.server";

const Body = z.object({
  pair: z.string().min(2).max(40),
  timeframe: z.string().min(2).max(8),
  direction: z.enum(["BUY", "SELL"]),
  entry: z.number(),
  sl: z.number(),
  tp1: z.number(),
  tp2: z.number(),
  tp3: z.number(),
  score: z.number().int().min(0).max(150),
  rating: z.string().min(1).max(20),
  confluence: z.record(z.string(), z.any()).optional(),
});

export const Route = createFileRoute("/api/public/v1/signals/incoming")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const endpoint = new URL(request.url).pathname;
        const ip = clientIp(request);
        const headers = headerSnapshot(request);
        const raw = await request.text();

        const apiKey = request.headers.get("x-api-key") || "";
        const sigHeader = request.headers.get("x-signature");
        const idemHeader = request.headers.get("x-idempotency-key");

        let signatureValid = false;
        let payload: any = {};
        let error: string | null = null;

        try {
          payload = JSON.parse(raw);
        } catch {
          error = "Invalid JSON";
        }

        // Resolve secret = the API key value (caller derives HMAC over raw body with their key).
        if (apiKey) {
          const { data } = await admin()
            .from("api_keys")
            .select("id")
            .eq("key_hash", sha256(apiKey))
            .maybeSingle();
          if (data) signatureValid = await verifyHmac(apiKey, raw, sigHeader);
        }

        if (!signatureValid) {
          await recordWebhookEvent({
            source: "signals.incoming",
            endpoint,
            ip,
            signatureValid: false,
            statusCode: 401,
            payload,
            headers,
            error: error || "Signature verification failed",
          });
          await raiseAlert({
            severity: "warn",
            kind: "webhook.signature_failed",
            message: `Signature verification failed on ${endpoint}`,
            context: { ip, error: error || "bad signature" },
          });
          return new Response(JSON.stringify({ error: "Invalid signature" }), {
            status: 401,
            headers: { "content-type": "application/json", ...CORS },
          });
        }

        // Idempotency: dedupe duplicate signed deliveries.
        const idemKey =
          idemHeader ||
          (payload && typeof payload === "object"
            ? (payload.idempotency_key as string | undefined)
            : undefined) ||
          sha256(raw);
        const { data: existing } = await admin()
          .from("webhook_idempotency")
          .select("signal_id")
          .eq("idempotency_key", idemKey)
          .maybeSingle();
        if (existing) {
          await recordWebhookEvent({
            source: "signals.incoming",
            endpoint,
            ip,
            signatureValid: true,
            statusCode: 200,
            payload,
            headers,
            error: "duplicate (idempotent replay)",
          });
          return new Response(
            JSON.stringify({ ok: true, id: existing.signal_id, duplicate: true }),
            {
              headers: { "content-type": "application/json", ...CORS },
            },
          );
        }

        const p = Body.safeParse(payload);
        if (!p.success) {
          await recordWebhookEvent({
            source: "signals.incoming",
            endpoint,
            ip,
            signatureValid: true,
            statusCode: 400,
            payload,
            headers,
            error: p.error.message,
          });
          return new Response(JSON.stringify({ error: p.error.message }), {
            status: 400,
            headers: { "content-type": "application/json", ...CORS },
          });
        }

        const { data, error: insertErr } = await admin()
          .from("signals")
          .insert({
            ...p.data,
            status: "active",
            confluence: p.data.confluence ?? {},
          })
          .select()
          .single();

        if (insertErr) {
          await recordWebhookEvent({
            source: "signals.incoming",
            endpoint,
            ip,
            signatureValid: true,
            statusCode: 500,
            payload,
            headers,
            error: insertErr.message,
          });
          return new Response(JSON.stringify({ error: insertErr.message }), {
            status: 500,
            headers: { "content-type": "application/json", ...CORS },
          });
        }

        await admin()
          .from("webhook_idempotency")
          .insert({
            idempotency_key: idemKey,
            source: "signals.incoming",
            signal_id: data.id,
          })
          .then(
            () => null,
            () => null,
          );

        await recordWebhookEvent({
          source: "signals.incoming",
          endpoint,
          ip,
          signatureValid: true,
          statusCode: 200,
          payload,
          headers,
          error: null,
        });
        return new Response(JSON.stringify({ ok: true, id: data.id }), {
          headers: { "content-type": "application/json", ...CORS },
        });
      },
    },
  },
});
