import { Component, type ReactNode, type ErrorInfo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Optional label shown in the error UI to help users identify the source. */
  label?: string;
  /** Optional callback fired on caught errors (for telemetry / health-monitor). */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Optional override for the fallback UI. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * ErrorBoundary — catches render errors in any subtree so a single broken
 * widget (e.g. malformed Deriv response, divide-by-zero, missing candles)
 * doesn't take down the whole page. Pair with React's `key=` prop to force
 * a reset, or use the `Try again` button in the fallback UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Avoid noisy logs in test runs but always log in dev/prod for triage.

    console.error("[ErrorBoundary]", this.props.label ?? "unknown", error, info);
    this.props.onError?.(error, info);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <Card className="border-red-500/40 bg-red-500/5">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base text-red-300">
            {this.props.label ?? "Widget"} crashed
          </CardTitle>
          <Badge variant="destructive">runtime error</Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="font-mono text-xs text-red-300/90 break-all">
            {error.message || String(error)}
          </div>
          <Button size="sm" variant="outline" onClick={this.reset}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }
}

export default ErrorBoundary;
