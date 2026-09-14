import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, provider = "zai", system } = (await req.json()) as {
      messages: ChatMessage[];
      provider?: string;
      system?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    // For the default PRESIDIN AI (zai) provider, use the bundled z-ai-web-dev-sdk.
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
        temperature: 0.7,
        max_tokens: 1024,
        stream: false,
      });

      const content: string =
        (completion as any)?.choices?.[0]?.message?.content ??
        (completion as any)?.choices?.[0]?.delta?.content ??
        "";

      const tokensIn: number | undefined = (completion as any)?.usage?.prompt_tokens;
      const tokensOut: number | undefined = (completion as any)?.usage?.completion_tokens;

      return NextResponse.json({
        content: content || "I couldn't generate a response. Please try again.",
        provider: "zai",
        model: "glm-4.6",
        tokensIn,
        tokensOut,
      });
    } catch (sdkErr: any) {
      const fallbackContent = `I'm having trouble reaching the AI service right now. ${sdkErr?.message ?? ""}

In the meantime, here's what I can help with when fully online:
- **Multi-agent signals**: 17 voting agents + MasterAgent produce consensus BUY/SELL/NEUTRAL signals
- **Self-improving ML**: model registry, drift monitor, anomaly guard, shadow deployment, explainability
- **Quant Lab**: backtest, walk-forward, Monte Carlo, PBO, HRP, Deflated Sharpe, volatility models
- **Risk calculators**: position size, Kelly, Risk of Ruin, Fibonacci, Pivots, Pip, Drawdown, Sharpe
- **Live trading**: paper / Deriv / MT5 with positions, orders, history
- **VINNY audio**: piano roll + step sequencer (Tone.js)
- **Notifications**: Telegram / Discord / push / local

Please try again in a moment.`;

      return NextResponse.json({
        content: fallbackContent,
        provider: "fallback",
        model: "rule-based",
        tokensIn: 0,
        tokensOut: fallbackContent.length,
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: `Server error: ${err?.message ?? "unknown"}` },
      { status: 500 }
    );
  }
}
