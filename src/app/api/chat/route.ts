import { NextRequest, NextResponse } from "next/server";
import { routeChat, PROVIDER_MAP, type ProviderId, type ChatMessage } from "@/lib/presidin/ai-providers";
import { saveBotLogToSupabase } from "@/lib/presidin/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatRequestBody {
  messages: ChatMessage[];
  provider?: ProviderId;
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestBody;
    const {
      messages,
      provider = "zai",
      system,
      model,
      temperature,
      maxTokens,
    } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const providerCfg = PROVIDER_MAP[provider];
    if (!providerCfg) {
      return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
    }

    // === ZAI (default) — uses z-ai-web-dev-sdk ===
    if (provider === "zai") {
      try {
        const ZAI = await import("z-ai-web-dev-sdk").then((m) => m.default || m);
        const zai = await ZAI.create();
        const systemPrompt = system || "You are PRESIDIN AI, an expert trading intelligence assistant.";
        const fullMessages: ChatMessage[] = [
          { role: "system", content: systemPrompt },
          ...messages,
        ];
        const completion = await zai.chat.completions.create({
          messages: fullMessages,
          temperature: temperature ?? 0.7,
          max_tokens: maxTokens ?? 1024,
          stream: false,
        });
        const content: string =
          (completion as any)?.choices?.[0]?.message?.content ??
          (completion as any)?.choices?.[0]?.delta?.content ??
          "";
        return NextResponse.json({
          content: content || "I couldn't generate a response. Please try again.",
          provider: "zai",
          model: model || "glm-4.6",
          tokensIn: (completion as any)?.usage?.prompt_tokens,
          tokensOut: (completion as any)?.usage?.completion_tokens,
        });
      } catch (sdkErr: any) {
        return NextResponse.json({
          content: `PRESIDIN AI is temporarily unavailable: ${sdkErr?.message ?? "unknown error"}. Try a different provider in Settings.`,
          provider: "fallback",
          model: "rule-based",
          tokensIn: 0,
          tokensOut: 0,
        });
      }
    }

    // === Other providers — route via ai-providers ===
    try {
      const env: Record<string, string | undefined> = {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GROQ_API_KEY: process.env.GROQ_API_KEY,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
        COHERE_API_KEY: process.env.COHERE_API_KEY,
        TOGETHER_API_KEY: process.env.TOGETHER_API_KEY,
        FIREWORKS_API_KEY: process.env.FIREWORKS_API_KEY,
        REPLICATE_API_KEY: process.env.REPLICATE_API_KEY,
        PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
        XAI_API_KEY: process.env.XAI_API_KEY,
        HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY,
        AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
        AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
        CUSTOM_OPENAI_ENDPOINT: process.env.CUSTOM_OPENAI_ENDPOINT,
        CUSTOM_OPENAI_API_KEY: process.env.CUSTOM_OPENAI_API_KEY,
        CUSTOM_OPENAI_MODEL: process.env.CUSTOM_OPENAI_MODEL,
        CUSTOM_ANTHROPIC_ENDPOINT: process.env.CUSTOM_ANTHROPIC_ENDPOINT,
        CUSTOM_ANTHROPIC_API_KEY: process.env.CUSTOM_ANTHROPIC_API_KEY,
        CUSTOM_ANTHROPIC_MODEL: process.env.CUSTOM_ANTHROPIC_MODEL,
      };
      const response = await routeChat(provider, { messages, system, model, temperature, maxTokens }, env);
      // Log to Supabase (best-effort)
      saveBotLogToSupabase("info", "chat", `${provider} responded (${response.tokensOut ?? 0} tokens)`, {
        provider,
        model: response.model,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
      }).catch(() => {});
      return NextResponse.json({
        content: response.content,
        provider: response.provider,
        model: response.model,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        finishReason: response.finishReason,
      });
    } catch (err: any) {
      const errorMsg = err?.message ?? "unknown error";
      return NextResponse.json({
        content: `Provider ${provider} error: ${errorMsg}. Make sure the API key is set in environment variables or Settings → API Keys.`,
        provider: "fallback",
        model: "error",
        tokensIn: 0,
        tokensOut: 0,
        error: errorMsg,
      }, { status: 200 }); // 200 so client still renders the message
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: `Server error: ${err?.message ?? "unknown"}` },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/chat",
    method: "POST",
    body: {
      messages: "ChatMessage[]",
      provider: "ProviderId (default: 'zai')",
      system: "string (optional system prompt)",
      model: "string (optional, defaults to provider default)",
      temperature: "number (0-2, default 0.7)",
      maxTokens: "number (default 1024)",
    },
    providers: Object.values(PROVIDER_MAP).map((p) => ({
      id: p.id,
      label: p.label,
      apiStyle: p.apiStyle,
      defaultModel: p.defaultModel,
    })),
  });
}
