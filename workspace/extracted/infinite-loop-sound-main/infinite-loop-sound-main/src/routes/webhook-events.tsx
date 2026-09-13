import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Shield, ShieldAlert, ShieldCheck, RefreshCw, Trash } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/webhook-events")({
  head: () => ({
    meta: [
      { title: "Webhook Audit Log — DivergenceIQ" },
      {
        name: "description",
        content:
          "Audit log of every incoming signed webhook request and signature verification result.",
      },
    ],
  }),
  component: WebhookEventsPage,
});

interface WebhookEvent {
  id: string;
  created_at: string;
  source: string;
  endpoint: string;
  ip: string | null;
  signature_valid: boolean;
  status_code: number;
  payload: any;
  headers: any;
  error: string | null;
}

function WebhookEventsPage() {
  const [rows, setRows] = useState<WebhookEvent[]>([]);
  const [filter, setFilter] = useState<"all" | "valid" | "invalid">("all");
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("webhook_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setRows((data as WebhookEvent[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("webhook_events_live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "webhook_events" }, (p) =>
        setRows((prev) => [p.new as WebhookEvent, ...prev].slice(0, 200)),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const filtered = rows.filter((r) =>
    filter === "all" ? true : filter === "valid" ? r.signature_valid : !r.signature_valid,
  );

  const total = rows.length;
  const valid = rows.filter((r) => r.signature_valid).length;
  const invalid = total - valid;

  const purge = async () => {
    if (!confirm("Delete all audit events?")) return;
    await supabase
      .from("webhook_events")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    refresh();
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" /> Webhook Audit Log
            </h1>
            <p className="text-sm text-muted-foreground">
              Every signed inbound request — signature checked, body recorded.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" variant="ghost" onClick={purge}>
              <Trash className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-lg border p-3 text-left ${filter === "all" ? "border-primary bg-primary/5" : "border-border bg-card"}`}
          >
            <div className="text-[10px] uppercase text-muted-foreground">Total</div>
            <div className="text-xl font-bold">{total}</div>
          </button>
          <button
            onClick={() => setFilter("valid")}
            className={`rounded-lg border p-3 text-left ${filter === "valid" ? "border-bull bg-bull/5" : "border-border bg-card"}`}
          >
            <div className="text-[10px] uppercase text-bull flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              Valid
            </div>
            <div className="text-xl font-bold text-bull">{valid}</div>
          </button>
          <button
            onClick={() => setFilter("invalid")}
            className={`rounded-lg border p-3 text-left ${filter === "invalid" ? "border-bear bg-bear/5" : "border-border bg-card"}`}
          >
            <div className="text-[10px] uppercase text-bear flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" />
              Invalid
            </div>
            <div className="text-xl font-bold text-bear">{invalid}</div>
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {filtered.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">No events yet.</div>
          ) : (
            filtered.map((r) => (
              <details key={r.id} className="group">
                <summary className="cursor-pointer p-3 flex items-center gap-2 text-sm hover:bg-accent/40">
                  {r.signature_valid ? (
                    <ShieldCheck className="w-4 h-4 text-bull shrink-0" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-bear shrink-0" />
                  )}
                  <span className="font-mono text-xs">
                    {new Date(r.created_at).toLocaleTimeString()}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted">{r.source}</span>
                  <span className="font-mono text-[11px] truncate flex-1">{r.endpoint}</span>
                  <span
                    className={`text-[10px] font-bold ${r.status_code < 300 ? "text-bull" : r.status_code < 500 ? "text-amber-500" : "text-bear"}`}
                  >
                    {r.status_code}
                  </span>
                  {r.ip && (
                    <span className="text-[10px] text-muted-foreground font-mono hidden md:inline">
                      {r.ip}
                    </span>
                  )}
                </summary>
                <div className="p-3 bg-background/40 text-[11px] space-y-2">
                  {r.error && <div className="text-bear">Warning: {r.error}</div>}
                  <div>
                    <div className="text-muted-foreground uppercase mb-1 text-[10px]">Payload</div>
                    <pre className="font-mono whitespace-pre-wrap break-all bg-muted/40 p-2 rounded">
                      {JSON.stringify(r.payload, null, 2).slice(0, 2000)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-muted-foreground uppercase mb-1 text-[10px]">Headers</div>
                    <pre className="font-mono whitespace-pre-wrap break-all bg-muted/40 p-2 rounded">
                      {JSON.stringify(r.headers, null, 2).slice(0, 1000)}
                    </pre>
                  </div>
                </div>
              </details>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
