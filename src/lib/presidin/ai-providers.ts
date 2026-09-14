/**
 * PRESIDIN — Unified AI Provider Router
 *
 * Supports 15+ providers + custom OpenAI/Anthropic-compatible endpoints.
 * Each provider has a normalized `chat()` method that returns
 * { content, tokensIn, tokensOut, model, provider }.
 *
 * Provider list:
 *   1.  zai           (default — z-ai-web-dev-sdk)
 *   2.  openai        (GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo, o1, o3)
 *   3.  anthropic     (Claude 3.5 Sonnet, Opus, Haiku)
 *   4.  gemini        (Gemini 1.5 Pro, Flash, 2.0 Flash)
 *   5.  groq          (Llama 3.1 70B, 405B, Mixtral)
 *   6.  openrouter    (300+ models via unified API)
 *   7.  mistral       (Mistral Large, Medium, Small)
 *   8.  cohere        (Command R+, Command R)
 *   9.  together      (Llama, Qwen, DeepSeek via Together)
 *   10. fireworks     (Llama, FireFunction, Qwen)
 *   11. replicate     (Llama, Mistral via Replicate)
 *   12. perplexity    (Llama 3.1 Sonar, Sonar Huge)
 *   13. deepseek      (DeepSeek V3, R1)
 *   14. xai           (Grok-2, Grok-2 Vision)
 *   15. huggingface   (Inference API / Endpoints)
 *   16. azure_openai  (Azure-hosted OpenAI)
 *   17. bedrock       (AWS Bedrock — Anthropic / Llama / Mistral)
 *   18. custom_openai (any OpenAI-compatible endpoint)
 *   19. custom_anthropic (any Anthropic-compatible endpoint)
 */

export type ProviderId =
  | "zai"
  | "openai"
  | "anthropic"
  | "gemini"
  | "groq"
  | "openrouter"
  | "mistral"
  | "cohere"
  | "together"
  | "fireworks"
  | "replicate"
  | "perplexity"
  | "deepseek"
  | "xai"
  | "huggingface"
  | "azure_openai"
  | "bedrock"
  | "custom_openai"
  | "custom_anthropic";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  system?: string;
}

export interface ChatResponse {
  content: string;
  tokensIn?: number;
  tokensOut?: number;
  model: string;
  provider: ProviderId;
  finishReason?: string;
}

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  description: string;
  defaultModel: string;
  availableModels: string[];
  apiStyle: "openai" | "anthropic" | "gemini" | "cohere" | "custom";
  baseURL?: string;
  envVar: string;
  docsURL: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "zai",
    label: "PRESIDIN AI (default)",
    description: "Built-in Z.ai GLM-4.6 — works without API key",
    defaultModel: "glm-4.6",
    availableModels: ["glm-4.6", "glm-4.5-air", "glm-4-plus", "glm-4-air"],
    apiStyle: "custom",
    envVar: "",
    docsURL: "https://z.ai",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "GPT-4o, GPT-4 Turbo, o1, o3, GPT-3.5 Turbo",
    defaultModel: "gpt-4o",
    availableModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo", "o1", "o1-mini", "o3", "o3-mini"],
    apiStyle: "openai",
    baseURL: "https://api.openai.com/v1",
    envVar: "OPENAI_API_KEY",
    docsURL: "https://platform.openai.com/docs",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude 3.5 Sonnet, Opus, Haiku",
    defaultModel: "claude-3-5-sonnet-20241022",
    availableModels: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"],
    apiStyle: "anthropic",
    baseURL: "https://api.anthropic.com/v1",
    envVar: "ANTHROPIC_API_KEY",
    docsURL: "https://docs.anthropic.com",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Gemini 2.0 Flash, 1.5 Pro, 1.5 Flash",
    defaultModel: "gemini-2.0-flash-exp",
    availableModels: ["gemini-2.0-flash-exp", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.5-flash-8b"],
    apiStyle: "gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    envVar: "GEMINI_API_KEY",
    docsURL: "https://ai.google.dev",
  },
  {
    id: "groq",
    label: "Groq",
    description: "Llama 3.1 70B/405B, Mixtral — ultra-fast inference",
    defaultModel: "llama-3.1-70b-versatile",
    availableModels: ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "llama3-70b-8192", "llama3-8b-8192", "mixtral-8x7b-32768", "gemma2-9b-it"],
    apiStyle: "openai",
    baseURL: "https://api.groq.com/openai/v1",
    envVar: "GROQ_API_KEY",
    docsURL: "https://console.groq.com/docs",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "300+ models via unified API (GPT, Claude, Llama, Mistral, etc.)",
    defaultModel: "openai/gpt-4o",
    availableModels: ["openai/gpt-4o", "openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "meta-llama/llama-3.1-405b-instruct", "mistralai/mistral-large", "google/gemini-flash-1.5", "x-ai/grok-2", "deepseek/deepseek-chat"],
    apiStyle: "openai",
    baseURL: "https://openrouter.ai/api/v1",
    envVar: "OPENROUTER_API_KEY",
    docsURL: "https://openrouter.ai/docs",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    description: "Mistral Large, Medium, Small, Codestral",
    defaultModel: "mistral-large-latest",
    availableModels: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest", "open-mistral-7b", "open-mixtral-8x7b", "codestral-latest"],
    apiStyle: "openai",
    baseURL: "https://api.mistral.ai/v1",
    envVar: "MISTRAL_API_KEY",
    docsURL: "https://docs.mistral.ai",
  },
  {
    id: "cohere",
    label: "Cohere",
    description: "Command R+, Command R, Command",
    defaultModel: "command-r-plus-08-2024",
    availableModels: ["command-r-plus-08-2024", "command-r-08-2024", "command-r", "command", "command-light"],
    apiStyle: "cohere",
    baseURL: "https://api.cohere.com/v1",
    envVar: "COHERE_API_KEY",
    docsURL: "https://docs.cohere.com",
  },
  {
    id: "together",
    label: "Together AI",
    description: "Llama, Qwen, DeepSeek, Mistral via Together",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    availableModels: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct-Turbo", "deepseek-ai/DeepSeek-V3", "mistralai/Mixtral-8x7B-Instruct-v0.1"],
    apiStyle: "openai",
    baseURL: "https://api.together.xyz/v1",
    envVar: "TOGETHER_API_KEY",
    docsURL: "https://docs.together.ai",
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    description: "Llama, FireFunction, Qwen — fast inference",
    defaultModel: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    availableModels: ["accounts/fireworks/models/llama-v3p1-70b-instruct", "accounts/fireworks/models/llama-v3p1-405b-instruct", "accounts/fireworks/models/firefunction-v2", "accounts/fireworks/models/qwen2p5-72b-instruct"],
    apiStyle: "openai",
    baseURL: "https://api.fireworks.ai/inference/v1",
    envVar: "FIREWORKS_API_KEY",
    docsURL: "https://docs.fireworks.ai",
  },
  {
    id: "replicate",
    label: "Replicate",
    description: "Llama, Mistral, custom models via Replicate",
    defaultModel: "meta/llama-3.1-70b-instruct",
    availableModels: ["meta/llama-3.1-70b-instruct", "meta/llama-3.1-405b-instruct", "mistralai/mistral-7b-instruct-v0.3"],
    apiStyle: "custom",
    baseURL: "https://api.replicate.com/v1",
    envVar: "REPLICATE_API_KEY",
    docsURL: "https://replicate.com/docs",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    description: "Sonar models with web search built-in",
    defaultModel: "llama-3.1-sonar-large-128k-online",
    availableModels: ["llama-3.1-sonar-large-128k-online", "llama-3.1-sonar-large-128k-chat", "llama-3.1-sonar-small-128k-online", "llama-3.1-sonar-huge-128k-online"],
    apiStyle: "openai",
    baseURL: "https://api.perplexity.ai",
    envVar: "PERPLEXITY_API_KEY",
    docsURL: "https://docs.perplexity.ai",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek V3, R1 (reasoning)",
    defaultModel: "deepseek-chat",
    availableModels: ["deepseek-chat", "deepseek-reasoner", "deepseek-coder"],
    apiStyle: "openai",
    baseURL: "https://api.deepseek.com/v1",
    envVar: "DEEPSEEK_API_KEY",
    docsURL: "https://platform.deepseek.com",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    description: "Grok-2, Grok-2 Vision",
    defaultModel: "grok-2-latest",
    availableModels: ["grok-2-latest", "grok-2", "grok-2-vision-latest", "grok-beta", "grok-vision-beta"],
    apiStyle: "openai",
    baseURL: "https://api.x.ai/v1",
    envVar: "XAI_API_KEY",
    docsURL: "https://docs.x.ai",
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    description: "Inference API / Endpoints — 1000s of models",
    defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct",
    availableModels: ["meta-llama/Meta-Llama-3.1-70B-Instruct", "mistralai/Mistral-7B-Instruct-v0.3", "Qwen/Qwen2.5-72B-Instruct", "google/gemma-2-27b-it"],
    apiStyle: "custom",
    baseURL: "https://api-inference.huggingface.co/models",
    envVar: "HUGGINGFACE_API_KEY",
    docsURL: "https://huggingface.co/docs/api-inference",
  },
  {
    id: "azure_openai",
    label: "Azure OpenAI",
    description: "Azure-hosted OpenAI models (enterprise)",
    defaultModel: "gpt-4o",
    availableModels: ["gpt-4o", "gpt-4", "gpt-4-turbo", "gpt-35-turbo", "o1", "o3"],
    apiStyle: "openai",
    envVar: "AZURE_OPENAI_API_KEY",
    docsURL: "https://learn.microsoft.com/azure/ai-services/openai",
  },
  {
    id: "bedrock",
    label: "AWS Bedrock",
    description: "Anthropic / Llama / Mistral via AWS",
    defaultModel: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    availableModels: ["anthropic.claude-3-5-sonnet-20241022-v2:0", "anthropic.claude-3-opus-20240229-v1:0", "meta.llama3-1-405b-instruct-v1:0", "mistral.mistral-large-2407-v1:0"],
    apiStyle: "custom",
    envVar: "AWS_ACCESS_KEY_ID",
    docsURL: "https://aws.amazon.com/bedrock",
  },
  {
    id: "custom_openai",
    label: "Custom OpenAI-compatible",
    description: "Any endpoint that speaks the OpenAI Chat Completions API",
    defaultModel: "",
    availableModels: [],
    apiStyle: "openai",
    envVar: "CUSTOM_OPENAI_API_KEY",
    docsURL: "",
  },
  {
    id: "custom_anthropic",
    label: "Custom Anthropic-compatible",
    description: "Any endpoint that speaks the Anthropic Messages API",
    defaultModel: "",
    availableModels: [],
    apiStyle: "anthropic",
    envVar: "CUSTOM_ANTHROPIC_API_KEY",
    docsURL: "",
  },
];

export const PROVIDER_MAP: Record<ProviderId, ProviderConfig> = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p])
) as Record<ProviderId, ProviderConfig>;

// ============================================================
// OpenAI-compatible chat (used by 12+ providers)
// ============================================================

async function chatOpenAIStyle(
  cfg: ProviderConfig,
  apiKey: string,
  req: ChatRequest,
  customBaseURL?: string
): Promise<ChatResponse> {
  const baseURL = customBaseURL || cfg.baseURL;
  if (!baseURL) throw new Error(`No baseURL for ${cfg.id}`);
  const model = req.model || cfg.defaultModel;
  const messages = req.system
    ? [{ role: "system", content: req.system }, ...req.messages]
    : req.messages;

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(cfg.id === "openrouter" ? { "HTTP-Referer": "https://presidin.app", "X-Title": "PRESIDIN" } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 1024,
      stream: false,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${cfg.id} API ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    tokensIn: data.usage?.prompt_tokens,
    tokensOut: data.usage?.completion_tokens,
    model: data.model || model,
    provider: cfg.id,
    finishReason: data.choices?.[0]?.finish_reason,
  };
}

// ============================================================
// Anthropic-style chat
// ============================================================

async function chatAnthropicStyle(
  cfg: ProviderConfig,
  apiKey: string,
  req: ChatRequest,
  customBaseURL?: string
): Promise<ChatResponse> {
  const baseURL = customBaseURL || cfg.baseURL || "https://api.anthropic.com/v1";
  const model = req.model || cfg.defaultModel;
  // Anthropic separates system from messages
  const userMessages = req.messages.filter((m) => m.role !== "system");
  const systemContent = req.system || req.messages.find((m) => m.role === "system")?.content || "";

  const res = await fetch(`${baseURL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: systemContent,
      messages: userMessages,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${cfg.id} API ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    content: data.content?.map((c: any) => c.text).join("") ?? "",
    tokensIn: data.usage?.input_tokens,
    tokensOut: data.usage?.output_tokens,
    model: data.model || model,
    provider: cfg.id,
    finishReason: data.stop_reason,
  };
}

// ============================================================
// Gemini-style chat
// ============================================================

async function chatGeminiStyle(
  apiKey: string,
  req: ChatRequest
): Promise<ChatResponse> {
  const model = req.model || "gemini-2.0-flash-exp";
  const baseURL = "https://generativelanguage.googleapis.com/v1beta";
  const systemContent = req.system || req.messages.find((m) => m.role === "system")?.content || "";
  const userMessages = req.messages.filter((m) => m.role !== "system");

  // Convert to Gemini format
  const contents = userMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `${baseURL}/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: systemContent ? { parts: [{ text: systemContent }] } : undefined,
        generationConfig: {
          temperature: req.temperature ?? 0.7,
          maxOutputTokens: req.maxTokens ?? 1024,
        },
      }),
    }
  );

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini API ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    content: data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "",
    tokensIn: data.usageMetadata?.promptTokenCount,
    tokensOut: data.usageMetadata?.candidatesTokenCount,
    model,
    provider: "gemini",
    finishReason: data.candidates?.[0]?.finishReason,
  };
}

// ============================================================
// Cohere-style chat
// ============================================================

async function chatCohereStyle(
  apiKey: string,
  req: ChatRequest
): Promise<ChatResponse> {
  const model = req.model || "command-r-plus-08-2024";
  const baseURL = "https://api.cohere.com/v1";
  const messages = req.system
    ? [{ role: "system", content: req.system }, ...req.messages]
    : req.messages;

  const res = await fetch(`${baseURL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      message: messages[messages.length - 1].content,
      chat_history: messages.slice(0, -1).map((m) => ({
        user_name: m.role === "user" ? "User" : "Chatbot",
        message: m.content,
      })),
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 1024,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Cohere API ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    content: data.text ?? "",
    tokensIn: data.meta?.billed_units?.input_tokens,
    tokensOut: data.meta?.billed_units?.output_tokens,
    model,
    provider: "cohere",
    finishReason: data.finish_reason,
  };
}

// ============================================================
// Main router
// ============================================================

export async function routeChat(
  providerId: ProviderId,
  req: ChatRequest,
  env: Record<string, string | undefined> = {}
): Promise<ChatResponse> {
  const cfg = PROVIDER_MAP[providerId];
  if (!cfg) throw new Error(`Unknown provider: ${providerId}`);

  // ZAI: handled by /api/chat route via z-ai-web-dev-sdk
  if (providerId === "zai") {
    throw new Error("ZAI provider must be routed through /api/chat (uses z-ai-web-dev-sdk)");
  }

  // Resolve API key from env
  const apiKey = env[cfg.envVar];
  if (!apiKey && providerId !== "zai") {
    throw new Error(`Missing API key: ${cfg.envVar} not set in environment`);
  }

  switch (cfg.apiStyle) {
    case "openai":
      if (providerId === "azure_openai") {
        const endpoint = env.AZURE_OPENAI_ENDPOINT;
        if (!endpoint) throw new Error("AZURE_OPENAI_ENDPOINT not set");
        return chatOpenAIStyle(
          { ...cfg, baseURL: `${endpoint}/openai/deployments` },
          apiKey!,
          req,
          `${endpoint}/openai/deployments/${req.model || cfg.defaultModel}/chat/completions?api-version=2024-10-21`
        );
      }
      if (providerId === "custom_openai") {
        const endpoint = env.CUSTOM_OPENAI_ENDPOINT;
        if (!endpoint) throw new Error("CUSTOM_OPENAI_ENDPOINT not set");
        const customReq = { ...req, model: req.model || env.CUSTOM_OPENAI_MODEL || "gpt-4o" };
        return chatOpenAIStyle(cfg, env.CUSTOM_OPENAI_API_KEY || "", customReq, endpoint);
      }
      return chatOpenAIStyle(cfg, apiKey!, req);

    case "anthropic":
      if (providerId === "custom_anthropic") {
        const endpoint = env.CUSTOM_ANTHROPIC_ENDPOINT;
        if (!endpoint) throw new Error("CUSTOM_ANTHROPIC_ENDPOINT not set");
        const customReq = { ...req, model: req.model || env.CUSTOM_ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022" };
        return chatAnthropicStyle(cfg, env.CUSTOM_ANTHROPIC_API_KEY || "", customReq, endpoint);
      }
      return chatAnthropicStyle(cfg, apiKey!, req);

    case "gemini":
      return chatGeminiStyle(apiKey!, req);

    case "cohere":
      return chatCohereStyle(apiKey!, req);

    default:
      throw new Error(`Provider ${providerId} not yet implemented in router`);
  }
}

// ============================================================
// Provider status / health check
// ============================================================

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  configured: boolean;
  hasKey: boolean;
  defaultModel: string;
  apiStyle: string;
}

export function getProviderStatus(env: Record<string, string | undefined>): ProviderStatus[] {
  return PROVIDERS.map((p) => {
    const hasKey = p.id === "zai" || Boolean(p.envVar && env[p.envVar]);
    let configured = hasKey;
    if (p.id === "custom_openai") configured = hasKey && Boolean(env.CUSTOM_OPENAI_ENDPOINT);
    if (p.id === "custom_anthropic") configured = hasKey && Boolean(env.CUSTOM_ANTHROPIC_ENDPOINT);
    if (p.id === "azure_openai") configured = hasKey && Boolean(env.AZURE_OPENAI_ENDPOINT);
    return {
      id: p.id,
      label: p.label,
      configured,
      hasKey,
      defaultModel: p.defaultModel,
      apiStyle: p.apiStyle,
    };
  });
}
