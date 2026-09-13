/**
 * Netlify Scheduled Function — third-line failover heartbeat
 * Configure in Netlify UI or netlify.toml to run every 5 minutes.
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const target = process.env.VERCEL_TICK_URL || process.env.PRIMARY_TICK_URL;

  if (!target) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'VERCEL_TICK_URL not configured' }),
    };
  }

  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'netlify-failover-heartbeat/1.0',
      },
      body: JSON.stringify({ source: 'netlify-scheduled', ts: Date.now() }),
    });

    const text = await res.text();
    return {
      statusCode: res.ok ? 200 : 502,
      body: JSON.stringify({
        ok: res.ok,
        status: res.status,
        body: text.slice(0, 500),
      }),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};

export { handler };
