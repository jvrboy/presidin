// Server-side AI proxy. Bypasses browser CORS and normalizes responses across
// OpenAI-compatible / Anthropic / Gemini / Cohere / local llama.cpp providers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Msg = z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() });
const Input = z.object({
  provider: z.string(),
  apiKey: z.string().optional().default(""),
  model: z.string(),
  baseUrl: z.string().optional(),
  messages: z.array(Msg).min(1),
  temperature: z.number().optional(),
});

type ProxyResult = { ok: true; text: string } | { ok: false; error: string };

export const aiProxy = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<ProxyResult> => {
    const { provider, apiKey, model, messages, baseUrl } = data;
    try {
      // Lovable AI Gateway (built-in, uses LOVABLE_API_KEY)
      if (provider === "lovable") {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return { ok: false, error: "LOVABLE_API_KEY not configured on server" };
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": key,
            "X-Lovable-AIG-SDK": "vercel-ai-sdk",
          },
          body: JSON.stringify({ model, messages, temperature: data.temperature ?? 0.4 }),
        });
        const j: any = await r.json();
        if (!r.ok) return { ok: false, error: j?.error?.message || `Lovable ${r.status}` };
        return { ok: true, text: j.choices?.[0]?.message?.content ?? "" };
      }

      if (provider === "anthropic") {
        const sys = messages
          .filter((m) => m.role === "system")
          .map((m) => m.content)
          .join("\n");
        const rest = messages.filter((m) => m.role !== "system");
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({ model, max_tokens: 1024, system: sys, messages: rest }),
        });
        const j: any = await r.json();
        if (!r.ok) return { ok: false, error: j?.error?.message || `Anthropic ${r.status}` };
        return { ok: true, text: j.content?.[0]?.text ?? "" };
      }

      if (provider === "gemini") {
        const sys = messages
          .filter((m) => m.role === "system")
          .map((m) => m.content)
          .join("\n");
        const contents = messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          }));
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
              contents,
            }),
          },
        );
        const j: any = await r.json();
        if (!r.ok) return { ok: false, error: j?.error?.message || `Gemini ${r.status}` };
        return {
          ok: true,
          text: j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "",
        };
      }

      if (provider === "cohere") {
        const r = await fetch("https://api.cohere.com/v2/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages }),
        });
        const j: any = await r.json();
        if (!r.ok) return { ok: false, error: j?.message || `Cohere ${r.status}` };
        return { ok: true, text: j.message?.content?.[0]?.text ?? "" };
      }

      // OpenAI-compatible: openai, openrouter, groq, mistral, deepseek, perplexity, together, xai, gguf
      const urls: Record<string, string> = {
        openai: "https://api.openai.com/v1/chat/completions",
        openrouter: "https://openrouter.ai/api/v1/chat/completions",
        groq: "https://api.groq.com/openai/v1/chat/completions",
        mistral: "https://api.mistral.ai/v1/chat/completions",
        deepseek: "https://api.deepseek.com/v1/chat/completions",
        perplexity: "https://api.perplexity.ai/chat/completions",
        together: "https://api.together.xyz/v1/chat/completions",
        xai: "https://api.x.ai/v1/chat/completions",
        nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
      };
      const url =
        provider === "gguf" ? baseUrl?.replace(/\/$/, "") + "/v1/chat/completions" : urls[provider];
      if (!url) return { ok: false, error: `Unknown provider: ${provider}` };
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, messages, temperature: data.temperature ?? 0.4 }),
      });
      const j: any = await r.json();
      if (!r.ok)
        return { ok: false, error: j?.error?.message || j?.error || `${provider} ${r.status}` };
      return { ok: true, text: j.choices?.[0]?.message?.content ?? "" };
    } catch (e: any) {
      return { ok: false, error: e?.message || "proxy error" };
    }
  });
