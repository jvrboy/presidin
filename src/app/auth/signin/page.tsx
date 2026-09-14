"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { GlassPanel, ShimmerButton } from "@/components/presidin/glass";
import { Github, Mail, Chrome, Lock } from "lucide-react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn("credentials", { email, password, callbackUrl: "/" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="aurora-bg" aria-hidden />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-500" />
          <h1 className="text-2xl font-bold tracking-tight">PRESIDIN</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your trading intelligence platform</p>
        </div>

        <GlassPanel veil className="space-y-4">
          <ShimmerButton
            onClick={() => signIn("github", { callbackUrl: "/" })}
            className="w-full !rounded-xl !bg-gray-800"
            disabled={loading}
          >
            <Github className="h-4 w-4" />
            Continue with GitHub
          </ShimmerButton>

          <ShimmerButton
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="w-full !rounded-xl !bg-white !text-gray-900"
            disabled={loading}
          >
            <Chrome className="h-4 w-4" />
            Continue with Google
          </ShimmerButton>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <form onSubmit={handleCredentials} className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm"
              />
            </div>
            <ShimmerButton type="submit" disabled={loading} className="w-full !rounded-xl">
              <Lock className="h-4 w-4" />
              {loading ? "Signing in…" : "Sign in with credentials"}
            </ShimmerButton>
          </form>

          <p className="text-center text-[10px] text-muted-foreground">
            Demo mode: any email + password "presidin" works.<br />
            Configure AUTH_GITHUB_ID / AUTH_GOOGLE_ID in .env for OAuth providers.
          </p>
        </GlassPanel>
      </div>
    </div>
  );
}
