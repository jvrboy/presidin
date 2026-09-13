import { NextResponse } from 'next/server';
import { e2bConfigured, runPythonInSandbox, runResearchSnippet, RESEARCH_SNIPPETS } from '../../../lib/e2b-sandbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: e2bConfigured(),
    snippets: Object.keys(RESEARCH_SNIPPETS),
    usage: {
      GET: 'status + available snippets',
      POST: '{ snippet?: string, code?: string, preamble?: string }',
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const snippet = body.snippet as string | undefined;
  const code = body.code as string | undefined;
  const preamble = (body.preamble as string) || '';

  if (!snippet && !code) {
    return NextResponse.json(
      { ok: false, error: 'Provide snippet name or code' },
      { status: 400 }
    );
  }

  // Hard size limit — avoid abuse
  if (code && code.length > 12_000) {
    return NextResponse.json({ ok: false, error: 'code too large' }, { status: 400 });
  }

  const result = snippet
    ? await runResearchSnippet(snippet, preamble)
    : await runPythonInSandbox(`${preamble}\n${code}`);

  // Log to Supabase if available
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const supabase = createClient(url, key);
      await supabase.from('bot_logs').insert({
        level: result.ok ? 'info' : 'warn',
        message: `e2b sandbox ${snippet || 'custom'} · ok=${result.ok}`,
        meta: {
          sandboxId: result.sandboxId,
          durationMs: result.durationMs,
          error: result.error,
          textPreview: (result.text || '').slice(0, 500),
          skipped: result.skipped,
        },
      });
    }
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({
    ...result,
    configured: e2bConfigured(),
  });
}
