/**
 * AI Provider Registry — Unlimited keys per provider
 * Supports: Gemini, Groq, NVIDIA NIM, Cerebras, Mistral, OpenRouter, OpenAI + custom
 */

export interface AIProviderKey {
  id: string;
  provider: string;
  label: string;
  key: string;
  model?: string;
  baseUrl?: string;
  enabled: boolean;
  lastUsed?: string;
  requestCount: number;
  errorCount: number;
  avgLatencyMs: number;
}

export interface AIProvider {
  id: string;
  name: string;
  icon: string;
  color: string;
  defaultBaseUrl: string;
  models: string[];
  description: string;
  docsUrl: string;
  headerKey: string; // e.g. "Authorization" or "x-api-key"
  headerPrefix: string; // e.g. "Bearer " or ""
  chatEndpoint: string;
  requestFormat: "openai" | "gemini" | "custom";
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    icon: "✦",
    color: "#4285F4",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: [
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
    ],
    description: "Google's multimodal AI with massive context windows",
    docsUrl: "https://ai.google.dev/docs",
    headerKey: "x-goog-api-key",
    headerPrefix: "",
    chatEndpoint: "/models/{model}:generateContent",
    requestFormat: "gemini",
  },
  {
    id: "groq",
    name: "Groq",
    icon: "⚡",
    color: "#F55036",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "llama-3.2-90b-vision-preview",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
      "deepseek-r1-distill-llama-70b",
    ],
    description: "Ultra-fast inference with custom LPU hardware",
    docsUrl: "https://console.groq.com/docs",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    icon: "🟢",
    color: "#76B900",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    models: [
      "meta/llama-3.3-70b-instruct",
      "nvidia/llama-3.1-nemotron-70b-instruct",
      "deepseek-ai/deepseek-r1",
      "meta/llama-3.1-405b-instruct",
      "mistralai/mixtral-8x22b-instruct-v0.1",
    ],
    description: "Enterprise AI models on NVIDIA accelerated infrastructure",
    docsUrl: "https://build.nvidia.com/explore/discover",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    icon: "🧠",
    color: "#FF6B00",
    defaultBaseUrl: "https://api.cerebras.ai/v1",
    models: [
      "llama-3.3-70b",
      "llama-3.1-8b",
      "llama-4-scout-17b-16e-instruct",
      "deepseek-r1-distill-llama-70b",
      "qwen-3-32b",
    ],
    description: "World's fastest inference — wafer-scale AI chips",
    docsUrl: "https://cloud.cerebras.ai/docs",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "mistral",
    name: "Mistral AI",
    icon: "🌀",
    color: "#FF7000",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    models: [
      "mistral-large-latest",
      "mistral-medium-latest",
      "mistral-small-latest",
      "codestral-latest",
      "open-mixtral-8x22b",
      "open-mistral-nemo",
    ],
    description: "European frontier AI with efficient architectures",
    docsUrl: "https://docs.mistral.ai",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: "🔀",
    color: "#6366F1",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    models: [
      "anthropic/claude-sonnet-4",
      "google/gemini-2.5-pro-preview",
      "openai/gpt-4o",
      "meta-llama/llama-3.3-70b-instruct",
      "deepseek/deepseek-r1",
      "qwen/qwen-2.5-72b-instruct",
    ],
    description: "Unified gateway to 200+ models from every provider",
    docsUrl: "https://openrouter.ai/docs",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: "◎",
    color: "#10A37F",
    defaultBaseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1", "o1-mini", "o3-mini"],
    description: "Industry-leading language & reasoning models",
    docsUrl: "https://platform.openai.com/docs",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: "🐋",
    color: "#0066FF",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
    description: "Advanced reasoning models with R1 architecture",
    docsUrl: "https://platform.deepseek.com/docs",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "together",
    name: "Together AI",
    icon: "🤝",
    color: "#3B82F6",
    defaultBaseUrl: "https://api.together.xyz/v1",
    models: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "Qwen/Qwen2.5-72B-Instruct-Turbo",
      "deepseek-ai/DeepSeek-R1",
      "google/gemma-2-27b-it",
    ],
    description: "Run and fine-tune 100+ open models",
    docsUrl: "https://docs.together.ai",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "sambanova",
    name: "SambaNova",
    icon: "⬡",
    color: "#E85D04",
    defaultBaseUrl: "https://api.sambanova.ai/v1",
    models: ["Meta-Llama-3.3-70B-Instruct", "DeepSeek-R1", "QwQ-32B"],
    description: "RDU-accelerated inference for enterprise AI",
    docsUrl: "https://community.sambanova.ai/docs",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    icon: "🎭",
    color: "#D97757",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    models: ["claude-3.5-sonnet", "claude-3.5-haiku", "claude-3-opus"],
    description: "Claude — helpful, harmless, and honest AI assistant",
    docsUrl: "https://docs.anthropic.com",
    headerKey: "x-api-key",
    headerPrefix: "",
    chatEndpoint: "/messages",
    requestFormat: "custom",
  },
  {
    id: "cohere",
    name: "Cohere",
    icon: "🔗",
    color: "#39594D",
    defaultBaseUrl: "https://api.cohere.ai/v1",
    models: ["command-r-plus", "command-r", "command"],
    description: "Enterprise NLP platform for language understanding",
    docsUrl: "https://docs.cohere.com",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "xai",
    name: "xAI Grok",
    icon: "✖",
    color: "#000000",
    defaultBaseUrl: "https://api.x.ai/v1",
    models: ["grok-2", "grok-2-mini"],
    description: "Grok — AI with real-time knowledge and wit",
    docsUrl: "https://docs.x.ai",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "ai21",
    name: "AI21 Labs",
    icon: "🔢",
    color: "#6C45F5",
    defaultBaseUrl: "https://api.ai21labs.com/v1",
    models: ["jamba-1.5-large", "jamba-1.5-mini"],
    description: "Jamba — SSM-Transformer hybrid architecture models",
    docsUrl: "https://docs.ai21.com",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "deepai",
    name: "DeepAI",
    icon: "🎨",
    color: "#FF4365",
    defaultBaseUrl: "https://api.deepai.org/api",
    models: ["text2img", "text2video"],
    description: "Image and video generation from text prompts",
    docsUrl: "https://deepai.org/docs",
    headerKey: "api-key",
    headerPrefix: "",
    chatEndpoint: "/generate",
    requestFormat: "custom",
  },
  {
    id: "witai",
    name: "Wit.ai",
    icon: "🗣",
    color: "#3B5998",
    defaultBaseUrl: "https://api.wit.ai",
    models: ["speech", "intent"],
    description: "Natural language understanding for voice and text",
    docsUrl: "https://wit.ai/docs",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/message",
    requestFormat: "custom",
  },
  {
    id: "kairos",
    name: "Kairos",
    icon: "😀",
    color: "#1A73E8",
    defaultBaseUrl: "https://api.kairos.com",
    models: ["face-detect", "face-verify"],
    description: "Face recognition and biometric verification",
    docsUrl: "https://docs.kairos.com",
    headerKey: "app_id",
    headerPrefix: "",
    chatEndpoint: "/detect",
    requestFormat: "custom",
  },
  {
    id: "imagga",
    name: "Imagga",
    icon: "🏷",
    color: "#FF6C37",
    defaultBaseUrl: "https://api.imagga.com/v2",
    models: ["tagging", "categorization", "color"],
    description: "Image recognition and auto-tagging platform",
    docsUrl: "https://imagga.com/docs",
    headerKey: "Authorization",
    headerPrefix: "Basic ",
    chatEndpoint: "/tags",
    requestFormat: "custom",
  },
  {
    id: "filestack",
    name: "Filestack",
    icon: "📁",
    color: "#14B8A6",
    defaultBaseUrl: "https://www.filestackapi.com/api",
    models: ["file-process", "file-transform"],
    description: "File processing, transformation, and delivery",
    docsUrl: "https://www.filestack.com/docs",
    headerKey: "apikey",
    headerPrefix: "",
    chatEndpoint: "/process",
    requestFormat: "custom",
  },
  {
    id: "visionai",
    name: "Google Vision AI",
    icon: "👁",
    color: "#34A853",
    defaultBaseUrl: "https://vision.googleapis.com/v1",
    models: ["label-detection", "face-detection", "object-detection"],
    description: "Computer vision for image understanding",
    docsUrl: "https://cloud.google.com/vision/docs",
    headerKey: "x-goog-api-key",
    headerPrefix: "",
    chatEndpoint: "/images:annotate",
    requestFormat: "gemini",
  },
  {
    id: "deepinfra",
    name: "DeepInfra",
    icon: "🧩",
    color: "#8B5CF6",
    defaultBaseUrl: "https://api.deepinfra.com/v1/openai",
    models: ["meta-llama/Llama-3.1-405B-Instruct", "mistralai/Mixtral-8x22B-Instruct-v0.1"],
    description: "Serverless inference for open-source models",
    docsUrl: "https://deepinfra.com/docs",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    icon: "🎆",
    color: "#EF4444",
    defaultBaseUrl: "https://api.fireworks.ai/inference/v1",
    models: [
      "accounts/fireworks/models/llama-v3p1-405b-instruct",
      "accounts/fireworks/models/mixtral-8x22b-instruct",
    ],
    description: "Fast inference for fine-tuned and open models",
    docsUrl: "https://docs.fireworks.ai",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "unify",
    name: "Unify",
    icon: "🔄",
    color: "#06B6D4",
    defaultBaseUrl: "https://api.unify.ai/v0",
    models: ["auto-route"],
    description: "Smart routing across LLM providers for best performance",
    docsUrl: "https://docs.unify.ai",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "baseten",
    name: "Baseten",
    icon: "🏗",
    color: "#F59E0B",
    defaultBaseUrl: "https://api.baseten.co/v1",
    models: ["mistral-7b", "llama-3-8b"],
    description: "Serverless model deployment and inference",
    docsUrl: "https://docs.baseten.co",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "edenai",
    name: "Eden AI",
    icon: "🌿",
    color: "#22C55E",
    defaultBaseUrl: "https://api.edenai.run/v2",
    models: ["text", "image", "audio"],
    description: "Unified API bridging multiple AI providers",
    docsUrl: "https://docs.edenai.run",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/text/chat",
    requestFormat: "custom",
  },
  {
    id: "modal",
    name: "Modal",
    icon: "🎛",
    color: "#7C3AED",
    defaultBaseUrl: "https://modal.com/api",
    models: ["custom-endpoints"],
    description: "Serverless cloud compute for custom models",
    docsUrl: "https://modal.com/docs",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/invoke",
    requestFormat: "custom",
  },
  {
    id: "nlpcloud",
    name: "NLP Cloud",
    icon: "☁",
    color: "#0EA5E9",
    defaultBaseUrl: "https://api.nlpcloud.io/v1",
    models: ["fast-gpt", "finetuned-gpt-neox"],
    description: "High-performance NLP models in production",
    docsUrl: "https://docs.nlpcloud.com",
    headerKey: "Authorization",
    headerPrefix: "Token ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "upstage",
    name: "Upstage",
    icon: "🌅",
    color: "#F97316",
    defaultBaseUrl: "https://api.upstage.ai/v1",
    models: ["solar-10.7b", "solar-mini"],
    description: "SOLAR — depth-upscaled LLM architecture",
    docsUrl: "https://developers.upstage.ai",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    icon: "🤗",
    color: "#FFD21E",
    defaultBaseUrl: "https://api-inference.huggingface.co/models",
    models: ["mistralai/Mistral-7B-Instruct-v0.1", "meta-llama/Meta-Llama-3-8B-Instruct"],
    description: "Inference API for 100k+ open models",
    docsUrl: "https://huggingface.co/docs/api-inference",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/{model}/v1/chat/completions",
    requestFormat: "custom",
  },
  {
    id: "stability",
    name: "Stability AI",
    icon: "🖌",
    color: "#A855F7",
    defaultBaseUrl: "https://api.stability.ai/v1",
    models: ["stable-diffusion-3", "stable-diffusion-xl"],
    description: "State-of-the-art image generation models",
    docsUrl: "https://platform.stability.ai/docs",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/generation",
    requestFormat: "custom",
  },
  {
    id: "google-studio",
    name: "Google AI Studio",
    icon: "🔬",
    color: "#4285F4",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: ["gemini-2.0-flash-exp", "gemini-1.5-pro"],
    description: "Rapid prototyping with Google's latest Gemini models",
    docsUrl: "https://ai.google.dev/aistudio",
    headerKey: "x-goog-api-key",
    headerPrefix: "",
    chatEndpoint: "/models/{model}:generateContent",
    requestFormat: "gemini",
  },
  {
    id: "bedrock",
    name: "Amazon Bedrock",
    icon: "🪨",
    color: "#FF9900",
    defaultBaseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
    models: ["anthropic.claude-3-sonnet", "meta.llama3-8b-instruct"],
    description: "Managed foundation models on AWS",
    docsUrl: "https://docs.aws.amazon.com/bedrock",
    headerKey: "Authorization",
    headerPrefix: "AWS4-HMAC-SHA256 ",
    chatEndpoint: "/model/{model}/invoke",
    requestFormat: "custom",
  },
  {
    id: "meta-llama",
    name: "Meta Llama",
    icon: "🦙",
    color: "#0866FF",
    defaultBaseUrl: "https://api.meta.com/v1",
    models: ["llama-3.3-70b", "llama-3.1-405b"],
    description: "Meta's open-source large language models",
    docsUrl: "https://llama.meta.com/docs",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    icon: "🔮",
    color: "#20B8CD",
    defaultBaseUrl: "https://api.perplexity.ai/v1",
    models: ["sonar", "sonar-pro"],
    description: "Online LLMs with real-time web search and citations",
    docsUrl: "https://docs.perplexity.ai",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    icon: "🔊",
    color: "#9333EA",
    defaultBaseUrl: "https://api.elevenlabs.io/v1",
    models: ["text-to-speech", "voice-clone"],
    description: "Realistic AI voice generation and cloning",
    docsUrl: "https://elevenlabs.io/docs",
    headerKey: "xi-api-key",
    headerPrefix: "",
    chatEndpoint: "/text-to-speech/{model}",
    requestFormat: "custom",
  },
  {
    id: "assemblyai",
    name: "AssemblyAI",
    icon: "🎙",
    color: "#2D6BFF",
    defaultBaseUrl: "https://api.assemblyai.com/v2",
    models: ["transcribe", "summarize"],
    description: "Speech-to-text and audio intelligence API",
    docsUrl: "https://www.assemblyai.com/docs",
    headerKey: "Authorization",
    headerPrefix: "",
    chatEndpoint: "/transcript",
    requestFormat: "custom",
  },
  {
    id: "deepl",
    name: "DeepL",
    icon: "🌍",
    color: "#0F2B46",
    defaultBaseUrl: "https://api-free.deepl.com/v2",
    models: ["translate", "glossary"],
    description: "High-quality machine translation",
    docsUrl: "https://developers.deepl.com",
    headerKey: "Authorization",
    headerPrefix: "DeepL-Auth-Key ",
    chatEndpoint: "/translate",
    requestFormat: "custom",
  },
  {
    id: "octoai",
    name: "OctoAI",
    icon: "🐙",
    color: "#1FB8CD",
    defaultBaseUrl: "https://api.octoai.run/v1",
    models: ["meta-llama/Llama-3.1-405B-Instruct", "NousResearch/Hermes-2-Pro-Llama-3-8B"],
    description: "Efficient compute for open-source model inference",
    docsUrl: "https://docs.octoai.run",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "replicate",
    name: "Replicate",
    icon: "🔁",
    color: "#000000",
    defaultBaseUrl: "https://api.replicate.com/v1",
    models: ["stability-ai/sdxl", "cjwbw/animatediff"],
    description: "Run and deploy open-source models with one line",
    docsUrl: "https://replicate.com/docs",
    headerKey: "Authorization",
    headerPrefix: "Token ",
    chatEndpoint: "/predictions",
    requestFormat: "custom",
  },
  {
    id: "alephalpha",
    name: "Aleph Alpha",
    icon: "α",
    color: "#1E40AF",
    defaultBaseUrl: "https://api.aleph-alpha.com/v1",
    models: ["luminous-base", "luminous-extended"],
    description: "European sovereign AI with data control",
    docsUrl: "https://docs.aleph-alpha.com",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "custom",
  },
  {
    id: "writer",
    name: "Writer",
    icon: "✍",
    color: "#6E45E8",
    defaultBaseUrl: "https://api.writer.com/v1",
    models: ["palmyra-x4", "palmyra-creative"],
    description: "Enterprise-grade generative AI for business",
    docsUrl: "https://dev.writer.com",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "jasper",
    name: "Jasper",
    icon: "📝",
    color: "#FF6D2D",
    defaultBaseUrl: "https://api.jasper.ai/v1",
    models: ["jasper-chat", "jasper-art"],
    description: "AI copilot for marketing and content creation",
    docsUrl: "https://docs.jasper.ai",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat",
    requestFormat: "custom",
  },
  {
    id: "pinecone",
    name: "Pinecone",
    icon: "🌲",
    color: "#000000",
    defaultBaseUrl: "https://api.pinecone.io",
    models: ["vector-search"],
    description: "Managed vector database for semantic search",
    docsUrl: "https://docs.pinecone.io",
    headerKey: "Api-Key",
    headerPrefix: "",
    chatEndpoint: "/vectors/query",
    requestFormat: "custom",
  },
  {
    id: "qdrant",
    name: "Qdrant",
    icon: "🧭",
    color: "#DC382D",
    defaultBaseUrl: "https://api.qdrant.io",
    models: ["vector-search"],
    description: "Open-source vector similarity search engine",
    docsUrl: "https://qdrant.tech/documentation",
    headerKey: "api-key",
    headerPrefix: "",
    chatEndpoint: "/collections/{collection}/points/search",
    requestFormat: "custom",
  },
  {
    id: "milvus",
    name: "Milvus / Zilliz",
    icon: "📊",
    color: "#00A37A",
    defaultBaseUrl: "https://api.zillizcloud.com/v1",
    models: ["vector-search"],
    description: "Cloud-native vector database for GenAI",
    docsUrl: "https://docs.zilliz.com",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/vector/search",
    requestFormat: "custom",
  },
  {
    id: "gooseai",
    name: "GooseAI",
    icon: "🪿",
    color: "#10B981",
    defaultBaseUrl: "https://api.goose.ai/v1",
    models: ["gpt-neo-20b", "gpt-j-6b"],
    description: "Fast and affordable GPT-style inference",
    docsUrl: "https://goose.ai/docs",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "azure-openai",
    name: "Azure OpenAI",
    icon: "☁",
    color: "#0078D4",
    defaultBaseUrl: "https://{resource}.openai.azure.com/openai",
    models: ["gpt-4o", "gpt-4-turbo"],
    description: "OpenAI models on Azure cloud with enterprise security",
    docsUrl: "https://learn.microsoft.com/azure/ai-services/openai",
    headerKey: "api-key",
    headerPrefix: "",
    chatEndpoint: "/deployments/{model}/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "kie",
    name: "Kie AI",
    icon: "🔑",
    color: "#EC4899",
    defaultBaseUrl: "https://api.kie.ai/v1",
    models: ["kie-chat", "kie-vision"],
    description: "Multi-modal AI for chat and vision tasks",
    docsUrl: "https://docs.kie.ai",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "fal",
    name: "Fal",
    icon: "⚡",
    color: "#FCD34D",
    defaultBaseUrl: "https://api.fal.ai/v1",
    models: ["fal-aura", "fal-sdxl"],
    description: "Serverless inference for generative media models",
    docsUrl: "https://docs.fal.ai",
    headerKey: "Authorization",
    headerPrefix: "Key ",
    chatEndpoint: "/queue",
    requestFormat: "custom",
  },
  {
    id: "featherless",
    name: "Featherless",
    icon: "🪶",
    color: "#94A3B8",
    defaultBaseUrl: "https://api.featherless.ai/v1",
    models: ["meta-llama/Llama-3.1-8B-Instruct", "mistralai/Mistral-7B-Instruct-v0.1"],
    description: "Serverless hosting for open-source LLMs",
    docsUrl: "https://docs.featherless.ai",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "hypereal",
    name: "Hypereal",
    icon: "💎",
    color: "#8B5CF6",
    defaultBaseUrl: "https://api.hypereal.com/v1",
    models: ["hyper-real", "hyper-3d"],
    description: "Photorealistic image and 3D generation",
    docsUrl: "https://docs.hypereal.com",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/generate",
    requestFormat: "custom",
  },
  {
    id: "wavespeed",
    name: "WaveSpeed",
    icon: "🌊",
    color: "#0284C7",
    defaultBaseUrl: "https://api.wavespeed.ai/v1",
    models: ["video-gen", "image-gen"],
    description: "Fast video and image generation inference",
    docsUrl: "https://docs.wavespeed.ai",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/predictions",
    requestFormat: "custom",
  },
  {
    id: "hyperbolic",
    name: "Hyperbolic",
    icon: "📈",
    color: "#F43F5E",
    defaultBaseUrl: "https://api.hyperbolic.xyz/v1",
    models: ["meta-llama/Llama-3.1-405B-Instruct", "deepseek-ai/DeepSeek-V3"],
    description: "Affordable GPU access for open-source models",
    docsUrl: "https://docs.hyperbolic.xyz",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "modular",
    name: "Modular",
    icon: "🧱",
    color: "#F97316",
    defaultBaseUrl: "https://api.modular.com/v1",
    models: ["mojo-llm"],
    description: "Mojo-powered AI inference with ultra-low latency",
    docsUrl: "https://docs.modular.com",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/chat/completions",
    requestFormat: "openai",
  },
  {
    id: "ibm-watson",
    name: "IBM Watson",
    icon: "🤖",
    color: "#0530AD",
    defaultBaseUrl: "https://api.us-south.iaas.cloud.ibm.com/v1",
    models: ["watson-chat", "watson-discovery"],
    description: "Enterprise AI for business insights and automation",
    docsUrl: "https://cloud.ibm.com/docs/watson",
    headerKey: "Authorization",
    headerPrefix: "Bearer ",
    chatEndpoint: "/assistants/{id}/message",
    requestFormat: "custom",
  },
  {
    id: "aws-ai",
    name: "AWS AI",
    icon: "☁",
    color: "#FF9900",
    defaultBaseUrl: "https://runtime.sagemaker.us-east-1.amazonaws.com",
    models: ["jumpstart-llama", "jumpstart-mistral"],
    description: "SageMaker JumpStart foundation model deployment",
    docsUrl: "https://docs.aws.amazon.com/sagemaker",
    headerKey: "Authorization",
    headerPrefix: "AWS4-HMAC-SHA256 ",
    chatEndpoint: "/endpoints/{endpoint}/invocations",
    requestFormat: "custom",
  },
  {
    id: "azure-cognitive",
    name: "Azure Cognitive Services",
    icon: "🧠",
    color: "#0078D4",
    defaultBaseUrl: "https://{region}.api.cognitive.microsoft.com",
    models: ["text-analytics", "vision", "speech"],
    description: "Microsoft's suite of cognitive AI services",
    docsUrl: "https://learn.microsoft.com/azure/cognitive-services",
    headerKey: "Ocp-Apim-Subscription-Key",
    headerPrefix: "",
    chatEndpoint: "/text/analytics/v3.2",
    requestFormat: "custom",
  },
];

// ── Storage helpers ──
const STORAGE_KEY = "diq_ai_provider_keys";

export function loadProviderKeys(): AIProviderKey[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveProviderKeys(keys: AIProviderKey[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function addProviderKey(
  provider: string,
  label: string,
  key: string,
  model?: string,
  baseUrl?: string,
): AIProviderKey {
  const keys = loadProviderKeys();
  const entry: AIProviderKey = {
    id: crypto.randomUUID(),
    provider,
    label: label || `${provider}-${keys.filter((k) => k.provider === provider).length + 1}`,
    key,
    model,
    baseUrl,
    enabled: true,
    requestCount: 0,
    errorCount: 0,
    avgLatencyMs: 0,
  };
  keys.push(entry);
  saveProviderKeys(keys);
  return entry;
}

export function removeProviderKey(id: string) {
  saveProviderKeys(loadProviderKeys().filter((k) => k.id !== id));
}

export function toggleProviderKey(id: string, enabled: boolean) {
  const keys = loadProviderKeys();
  const k = keys.find((x) => x.id === id);
  if (k) {
    k.enabled = enabled;
    saveProviderKeys(keys);
  }
}

// ── Round-robin key selection with failover ──
const rotationIndex = new Map<string, number>();

export function getNextKey(provider: string): AIProviderKey | null {
  const keys = loadProviderKeys().filter((k) => k.provider === provider && k.enabled);
  if (!keys.length) return null;
  const idx = (rotationIndex.get(provider) || 0) % keys.length;
  rotationIndex.set(provider, idx + 1);
  return keys[idx];
}

export function recordKeyUsage(id: string, latencyMs: number, isError: boolean) {
  const keys = loadProviderKeys();
  const k = keys.find((x) => x.id === id);
  if (!k) return;
  k.requestCount++;
  k.lastUsed = new Date().toISOString();
  if (isError) {
    k.errorCount++;
  }
  k.avgLatencyMs = Math.round((k.avgLatencyMs * (k.requestCount - 1) + latencyMs) / k.requestCount);
  saveProviderKeys(keys);
}

// ── Unified chat call across any provider ──
export async function chatWithProvider(
  provider: string,
  messages: Array<{ role: string; content: string }>,
  opts?: { model?: string; temperature?: number; maxTokens?: number },
): Promise<{ text: string; provider: string; model: string; latencyMs: number }> {
  const providerDef = AI_PROVIDERS.find((p) => p.id === provider);
  if (!providerDef) throw new Error(`Unknown provider: ${provider}`);

  const key = getNextKey(provider);
  if (!key)
    throw new Error(
      `No enabled API keys for ${providerDef.name}. Add one in Settings → AI Providers.`,
    );

  const model = opts?.model || key.model || providerDef.models[0];
  const baseUrl = key.baseUrl || providerDef.defaultBaseUrl;
  const start = performance.now();

  try {
    let text: string;

    if (providerDef.requestFormat === "gemini") {
      const url = `${baseUrl}/models/${model}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", [providerDef.headerKey]: key.key },
        body: JSON.stringify({
          contents: messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            temperature: opts?.temperature ?? 0.7,
            maxOutputTokens: opts?.maxTokens ?? 2048,
          },
        }),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
      const data = await res.json();
      text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else {
      const url = `${baseUrl}${providerDef.chatEndpoint}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [providerDef.headerKey]: `${providerDef.headerPrefix}${key.key}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts?.temperature ?? 0.7,
          max_tokens: opts?.maxTokens ?? 2048,
        }),
      });
      if (!res.ok) throw new Error(`${providerDef.name} ${res.status}: ${await res.text()}`);
      const data = await res.json();
      text = data.choices?.[0]?.message?.content || "";
    }

    const latency = Math.round(performance.now() - start);
    recordKeyUsage(key.id, latency, false);
    return { text, provider, model, latencyMs: latency };
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    recordKeyUsage(key.id, latency, true);
    throw err;
  }
}
