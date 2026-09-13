// Sidebar panel: Usage — token counters, per-provider breakdown.
import { useUsage } from "@/hooks/use-chat-store";
import { Cpu, Calendar, BarChart } from "lucide-react";

const DEFAULT_QUOTA = 1_000_000; // visual reference cap; non-billing

export function UsagePanel() {
  const { events, totalTokens, tokens24h, byProvider } = useUsage();

  const remaining = Math.max(0, DEFAULT_QUOTA - totalTokens);
  const pct = Math.min(100, (totalTokens / DEFAULT_QUOTA) * 100);

  return (
    <div className="space-y-3 px-2">
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center gap-2 mb-2">
          <Cpu className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Combined tokens</span>
        </div>
        <div className="text-2xl font-mono font-bold">{totalTokens.toLocaleString()}</div>
        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>
            {pct.toFixed(1)}% of {DEFAULT_QUOTA.toLocaleString()} reference
          </span>
          <span>{remaining.toLocaleString()} left</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">24h</span>
          </div>
          <div className="text-lg font-mono font-bold">{tokens24h.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <BarChart className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Calls
            </span>
          </div>
          <div className="text-lg font-mono font-bold">{events.length.toLocaleString()}</div>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          By provider
        </div>
        {Object.keys(byProvider).length === 0 && (
          <p className="text-[11px] text-muted-foreground italic">No calls tracked yet.</p>
        )}
        <div className="space-y-2">
          {Object.entries(byProvider)
            .sort((a, b) => b[1] - a[1])
            .map(([p, n]) => {
              const w = totalTokens > 0 ? (n / totalTokens) * 100 : 0;
              return (
                <div key={p}>
                  <div className="flex justify-between text-[11px]">
                    <span className="font-mono">{p}</span>
                    <span className="font-mono text-muted-foreground">{n.toLocaleString()}</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden mt-1">
                    <div className="h-full bg-primary/70" style={{ width: `${w}%` }} />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground italic">
        Counters are local-only. Mirror to Supabase `usage_events` to share across devices.
      </p>
    </div>
  );
}
