import { NextResponse } from "next/server";
import { getSupabaseStatus, getSupabaseServer } from "@/lib/presidin/supabase";
import { getCloudflareStatus, getCloudflareConfig } from "@/lib/presidin/cloudflare";
import { getProviderStatus } from "@/lib/presidin/ai-providers";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const supaStatus = getSupabaseStatus();
  const cfStatus = getCloudflareStatus();
  const cfCfg = getCloudflareConfig();

  // Check Prisma DB
  let prismaOk = false;
  try {
    await db.botLog.count();
    prismaOk = true;
  } catch {}

  // Check Supabase
  let supaReachable = false;
  const supa = getSupabaseServer();
  if (supa) {
    try {
      const { error } = await supa.from("bot_logs").select("id", { count: "exact", head: true }).limit(1);
      supaReachable = !error;
    } catch {
      supaReachable = false;
    }
  }

  // Provider statuses
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
    CUSTOM_ANTHROPIC_ENDPOINT: process.env.CUSTOM_ANTHROPIC_ENDPOINT,
    CUSTOM_ANTHROPIC_API_KEY: process.env.CUSTOM_ANTHROPIC_API_KEY,
  };
  const providers = getProviderStatus(env);

  return NextResponse.json({
    status: prismaOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      prisma: { ok: prismaOk, provider: "sqlite" },
      supabase: { ...supaStatus, reachable: supaReachable },
      cloudflare: cfStatus,
      mlService: "http://localhost:8100",
    },
    providers: {
      total: providers.length,
      configured: providers.filter((p) => p.configured).length,
      list: providers,
    },
  });
}
