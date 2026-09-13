import { NextResponse } from 'next/server';
import { askAI, adversarialAgree, providerStatus, type ProviderName } from '@/lib/ai-providers';

export async function GET() {
  return NextResponse.json({ ok: true, providers: providerStatus() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prompt = String(body.prompt ?? '').slice(0, 8000);
    if (!prompt) return NextResponse.json({ ok: false, error: 'prompt required' }, { status: 400 });
    const mode = body.mode ?? 'first-success';
    if (mode === 'adversarial') {
      const r = await adversarialAgree(prompt);
      return NextResponse.json({ ok: true, ...r });
    }
    const order: ProviderName[] = Array.isArray(body.order) ? body.order : ['gemini', 'openrouter', 'ollama'];
    const r = await askAI(prompt, order);
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
  }
}
