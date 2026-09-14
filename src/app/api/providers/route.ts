import { NextResponse } from "next/server";
import { getProviderStatus, PROVIDERS } from "@/lib/presidin/ai-providers";

export const runtime = "nodejs";

export async function GET() {
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
  const statuses = getProviderStatus(env);
  return NextResponse.json({
    providers: PROVIDERS,
    statuses,
    configuredCount: statuses.filter((s) => s.configured).length,
    totalCount: statuses.length,
  });
}
