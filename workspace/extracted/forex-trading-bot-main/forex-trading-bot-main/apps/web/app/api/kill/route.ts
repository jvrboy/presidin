import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { alertKill } from '../../../lib/telegram';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing Supabase env' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const enabled = body.enabled === true;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { error } = await supabase
    .from('bot_settings')
    .update({ bot_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await alertKill(enabled).catch(() => null);

  return NextResponse.json({
    ok: true,
    bot_enabled: enabled,
    message: enabled ? 'Bot enabled' : 'Bot DISABLED (kill-switch active)',
  });
}

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data } = await supabase.from('bot_settings').select('bot_enabled').eq('id', 1).single();
  return NextResponse.json({ bot_enabled: data?.bot_enabled ?? true });
}
