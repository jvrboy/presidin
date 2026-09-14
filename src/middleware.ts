import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * PRESIDIN middleware — security headers (production-grade)
 * Rate limiting is handled per-route via Upstash/Redis in production.
 */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Security headers
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://z-cdn.chatglm.cn",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://ws.derivws.com wss://ws.derivws.com https://api.supabase.co wss://*.supabase.co https://api.cloudflare.com https://api.rss2json.com https://nfs.faireconomy.media https://api.telegram.org https://discord.com ws://localhost:3003 wss://localhost:3003",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
    ].join("; ")
  );

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.json|robots.txt|models/|sounds/|app-icons/|auth/).*)"],
};
