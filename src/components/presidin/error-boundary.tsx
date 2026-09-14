"use client";

import { Component, type ReactNode } from "react";
import { GlassPanel, ShimmerButton } from "./glass";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[PRESIDIN ErrorBoundary]", error, info);
    // In production: send to Sentry / Cloudflare Logpush / Supabase bot_logs
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <GlassPanel className="max-w-md text-center" veil>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/20 text-2xl">
              ⚠️
            </div>
            <h2 className="mb-2 text-lg font-semibold">Something went wrong</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <pre className="mb-4 max-h-32 overflow-auto rounded bg-slate-950 p-2 text-left text-[10px] text-rose-300">
              {this.state.error?.stack?.slice(0, 500)}
            </pre>
            <ShimmerButton
              onClick={() => {
                this.setState({ hasError: false, error: undefined });
                window.location.reload();
              }}
            >
              Reload app
            </ShimmerButton>
          </GlassPanel>
        </div>
      );
    }
    return this.props.children;
  }
}
