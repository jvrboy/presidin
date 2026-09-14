"use client";

import { GlassPanel, ShimmerButton } from "@/components/presidin/glass";
import { useSearchParams } from "next/navigation";

export default function AuthErrorPage() {
  const params = useSearchParams();
  const error = params.get("error");

  const messages: Record<string, string> = {
    Configuration: "There is a problem with the server configuration.",
    AccessDenied: "You do not have access to this resource.",
    Verification: "The verification token has expired or has already been used.",
    OAuthSignin: "Error starting OAuth flow.",
    OAuthCallback: "Error completing OAuth flow.",
    OAuthCreateAccount: "Could not create user account from OAuth provider.",
    EmailCreateAccount: "Could not create user account from email.",
    Callback: "Error in the OAuth callback handler.",
    Default: "An unknown authentication error occurred.",
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="aurora-bg" aria-hidden />
      <div className="relative z-10 w-full max-w-md">
        <GlassPanel veil className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/20 text-2xl">
            ⚠️
          </div>
          <h1 className="mb-2 text-xl font-semibold">Authentication Error</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            {messages[error ?? "Default"] ?? messages.Default}
          </p>
          <p className="mb-4 text-xs text-muted-foreground">Error code: {error ?? "unknown"}</p>
          <ShimmerButton onClick={() => (window.location.href = "/auth/signin")}>
            Back to sign in
          </ShimmerButton>
        </GlassPanel>
      </div>
    </div>
  );
}
