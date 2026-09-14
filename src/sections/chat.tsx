"use client";

import { useState, useRef, useEffect } from "react";
import { GlassPanel, SectionTitle, ShimmerButton } from "@/components/presidin/glass";
import { MessageSquare, Send, Trash2, Bot, User, Loader2 } from "lucide-react";
import { useProvidersStore } from "@/stores/presidin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider?: string;
  model?: string;
  timestamp: number;
  tokensIn?: number;
  tokensOut?: number;
}

const SYSTEM_PROMPT = `You are PRESIDIN AI, an expert trading intelligence assistant embedded in the PRESIDIN unified trading platform.

You help users with:
- Multi-agent signal analysis (17 voting agents + MasterAgent arbiter)
- Self-improving ML system (model registry, drift, anomaly guard, shadow deployment, explainability)
- Quant Lab (backtest, walk-forward, Monte Carlo, PBO, HRP, Deflated Sharpe)
- Risk management (position size, Kelly, Risk of Ruin, Fibonacci, Pivots, etc.)
- Live trading on Deriv/MT5/paper
- VINNY audio engine (piano roll, mixer, FX, MIDI composer)
- Notifications (Telegram/Discord/push/local)

Be concise, accurate, and pragmatic. Reference specific features of PRESIDIN when relevant.`;

const PROVIDERS = [
  { id: "zai", label: "PRESIDIN AI (default)", model: "glm-4.6" },
  { id: "openai", label: "OpenAI GPT-4o", model: "gpt-4o" },
  { id: "anthropic", label: "Anthropic Claude 3.5 Sonnet", model: "claude-3-5-sonnet" },
  { id: "gemini", label: "Google Gemini 1.5 Pro", model: "gemini-1.5-pro" },
  { id: "groq", label: "Groq Llama 3.1 70B", model: "llama-3.1-70b" },
];

export function ChatSection() {
  const [provider, setProvider] = useState("zai");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Welcome to PRESIDIN AI. I'm your unified trading intelligence assistant. Ask me about multi-agent signals, the self-improving ML system, Quant Lab analytics, risk calculators, or any of the platform's features.",
      provider: "zai",
      model: "glm-4.6",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages.filter((m) => m.role !== "system"), userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          provider,
          system: SYSTEM_PROMPT,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");
      const aiMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: data.content,
        provider: data.provider || provider,
        model: data.model || PROVIDERS.find((p) => p.id === provider)?.model,
        timestamp: Date.now(),
        tokensIn: data.tokensIn,
        tokensOut: data.tokensOut,
      };
      setMessages((m) => [...m, aiMsg]);
    } catch (err: any) {
      toast.error(`Chat failed: ${err.message}. Make sure API keys are configured in Settings → Providers for non-default providers.`);
      const fallback: ChatMessage = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: "I'm having trouble reaching the AI provider. If you're using a non-default provider (OpenAI, Anthropic, Gemini, Groq), please add your API key in Settings → Providers. The default PRESIDIN AI should always work.",
        provider: "fallback",
        timestamp: Date.now(),
      };
      setMessages((m) => [...m, fallback]);
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: "Conversation cleared. How can I help?",
        provider: "zai",
        timestamp: Date.now(),
      },
    ]);
  };

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="AI Assistant"
        subtitle="Multi-provider chat (PRESIDIN AI / OpenAI / Anthropic / Gemini / Groq) with BYOK"
        icon={<MessageSquare className="h-5 w-5" />}
        right={
          <div className="flex items-center gap-2">
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button onClick={clear} className="rounded-md p-2 text-muted-foreground hover:bg-secondary/50 hover:text-rose-400">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        }
      />

      <GlassPanel className="!p-0 overflow-hidden" veil>
        <div ref={scrollRef} className="h-[60vh] overflow-y-auto scroll-fancy p-4 space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-white">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-violet-500/20 text-foreground ring-1 ring-violet-500/30"
                  : "bg-secondary/40 ring-1 ring-border/40"
              }`}>
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.provider && (
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="rounded bg-secondary/60 px-1.5 py-0.5">{m.provider}</span>
                    {m.model && <span>· {m.model}</span>}
                    {m.tokensOut && <span>· {m.tokensOut} tokens</span>}
                  </div>
                )}
              </div>
              {m.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl bg-secondary/40 px-4 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-border/40 p-3">
          <div className="flex items-center gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask about signals, ML, quant, risk, audio…"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-border bg-background/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
            <ShimmerButton onClick={send} disabled={loading || !input.trim()} className="!rounded-xl">
              <Send className="h-4 w-4" />
              Send
            </ShimmerButton>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Press Enter to send · Shift+Enter for newline</span>
            <span>Provider: {PROVIDERS.find((p) => p.id === provider)?.label}</span>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
