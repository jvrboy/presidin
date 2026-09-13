// Shared loading / error / empty state helper. Standardises the trio of
// "no data yet" UIs that were diverging across routes during the Phase 3 audit.
import { Loader, AlertTriangle, Inbox } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  loadingMessage?: string;
  children?: ReactNode;
}

export function LoadState({
  loading,
  error,
  empty,
  emptyMessage = "Nothing here yet.",
  emptyIcon,
  loadingMessage = "Loading…",
  children,
}: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader className="w-6 h-6 animate-spin text-primary" />
        <span className="text-xs font-mono uppercase tracking-wider">{loadingMessage}</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-red-400">
        <AlertTriangle className="w-6 h-6" />
        <span className="text-xs font-mono max-w-md text-center">{error}</span>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        {emptyIcon ?? <Inbox className="w-6 h-6" />}
        <span className="text-xs italic">{emptyMessage}</span>
      </div>
    );
  }
  return <>{children}</>;
}
