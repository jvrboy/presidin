import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Plus,
  Trash,
  Pencil,
  Save,
  X,
  Tag,
  Filter,
  RefreshCw,
  Brain,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { PsychologyTracker } from "@/components/app/PsychologyTracker";
import { SessionsHeatmap } from "@/components/app/SessionsHeatmap";

export const Route = createFileRoute("/journal")({
  head: () => ({ meta: [{ title: "Trading Journal — DivergenceIQ" }] }),
  component: JournalPage,
});

type Outcome = "win" | "loss" | "breakeven" | "missed" | "setup" | "review";
const OUTCOMES: Array<{ id: Outcome; label: string; color: string }> = [
  { id: "win", label: "Win", color: "bg-bull/20 text-bull" },
  { id: "loss", label: "Loss", color: "bg-bear/20 text-bear" },
  { id: "breakeven", label: "Break-even", color: "bg-muted text-muted-foreground" },
  { id: "missed", label: "Missed", color: "bg-amber-500/20 text-amber-300" },
  { id: "setup", label: "Setup", color: "bg-primary/20 text-primary" },
  { id: "review", label: "Review", color: "bg-violet-500/20 text-violet-300" },
];

interface JournalEntry {
  id: string;
  pair: string;
  note: string;
  outcome: Outcome | null;
  rr: number | null;
  tags: string[];
  created_at: string;
  _local?: boolean; // true when persisted to localStorage instead of Supabase
}

const LOCAL_KEY = "diq.journal.entries.v1";

const readLocal = (): JournalEntry[] => {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
};
const writeLocal = (es: JournalEntry[]) => {
  if (typeof window !== "undefined") localStorage.setItem(LOCAL_KEY, JSON.stringify(es));
};

function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // form state
  const [pair, setPair] = useState("");
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [rr, setRr] = useState("");
  const [tagsBuf, setTagsBuf] = useState("");

  // filters
  const [filterPair, setFilterPair] = useState("");
  const [filterOutcome, setFilterOutcome] = useState<Outcome | "ALL">("ALL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<JournalEntry>>({});

  // ---- auth + fetch ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      const a = !!user;
      setAuthed(a);
      if (a) {
        const { data, error } = await supabase
          .from("trade_journal")
          .select("id,pair,note,outcome,rr,tags,created_at")
          .order("created_at", { ascending: false });
        if (cancelled) return;
        if (error) {
          toast.error(`Journal load failed: ${error.message}`);
          setEntries(readLocal());
        } else {
          setEntries((data as JournalEntry[]) || []);
        }
      } else {
        setEntries(readLocal());
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Supabase realtime sync for the authenticated user
  useEffect(() => {
    if (!authed) return;
    const ch = supabase
      .channel("trade_journal_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trade_journal" },
        async () => {
          const { data } = await supabase
            .from("trade_journal")
            .select("id,pair,note,outcome,rr,tags,created_at")
            .order("created_at", { ascending: false });
          setEntries((data as JournalEntry[]) || []);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [authed]);

  // ---- mutations ----
  const addEntry = async () => {
    if (!note.trim()) {
      toast.error("Add a note first.");
      return;
    }
    const tags = tagsBuf
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const row: Omit<JournalEntry, "id"> = {
      pair: pair.trim() || "General",
      note: note.trim(),
      outcome,
      rr: rr ? Number(rr) : null,
      tags,
      created_at: new Date().toISOString(),
    };
    if (authed) {
      const { error } = await supabase.from("trade_journal").insert({
        pair: row.pair,
        note: row.note,
        outcome: row.outcome,
        rr: row.rr,
        tags: row.tags,
        created_at: row.created_at,
      });
      if (error) toast.error(`Save failed: ${error.message}`);
    } else {
      const local: JournalEntry = { ...row, id: crypto.randomUUID(), _local: true };
      const next = [local, ...entries];
      setEntries(next);
      writeLocal(next);
    }
    setNote("");
    setPair("");
    setOutcome(null);
    setRr("");
    setTagsBuf("");
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    if (authed) {
      const { error } = await supabase.from("trade_journal").delete().eq("id", id);
      if (error) toast.error(`Delete failed: ${error.message}`);
    } else {
      const next = entries.filter((e) => e.id !== id);
      setEntries(next);
      writeLocal(next);
    }
  };

  const startEdit = (e: JournalEntry) => {
    setEditingId(e.id);
    setEditDraft({ pair: e.pair, note: e.note, outcome: e.outcome, rr: e.rr, tags: e.tags });
  };
  const saveEdit = async () => {
    if (!editingId) return;
    const patch = editDraft;
    if (authed) {
      const { error } = await supabase
        .from("trade_journal")
        .update({
          pair: patch.pair,
          note: patch.note,
          outcome: patch.outcome,
          rr: patch.rr,
          tags: patch.tags,
        })
        .eq("id", editingId);
      if (error) toast.error(`Update failed: ${error.message}`);
    } else {
      const next = entries.map((e) => (e.id === editingId ? { ...e, ...patch } : e));
      setEntries(next);
      writeLocal(next);
    }
    setEditingId(null);
    setEditDraft({});
  };

  // ---- filtering & stats ----
  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (filterPair && !e.pair.toLowerCase().includes(filterPair.toLowerCase())) return false;
        if (filterOutcome !== "ALL" && e.outcome !== filterOutcome) return false;
        return true;
      }),
    [entries, filterPair, filterOutcome],
  );

  const stats = useMemo(() => {
    const wins = entries.filter((e) => e.outcome === "win").length;
    const loss = entries.filter((e) => e.outcome === "loss").length;
    const be = entries.filter((e) => e.outcome === "breakeven").length;
    const total = wins + loss + be;
    const rsum = entries.reduce((a, e) => a + (e.rr || 0), 0);
    return {
      total: entries.length,
      winRate: total > 0 ? (wins / total) * 100 : 0,
      wins,
      loss,
      be,
      rTotal: rsum,
    };
  }, [entries]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-primary" /> Trading Journal
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {authed === null
                ? "Loading…"
                : authed
                  ? "Synced to your account · real-time across devices"
                  : "Local-only · sign in to sync across devices"}
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass-card">
            {loading ? (
              <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
            ) : (
              <BookOpen className="w-3.5 h-3.5 text-primary" />
            )}
            <span className="text-xs font-mono text-primary">
              {entries.length} entries
              {authed === false && " · LOCAL"}
            </span>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { l: "Total", v: stats.total.toString(), s: "entries" },
            {
              l: "Win Rate",
              v: `${stats.winRate.toFixed(0)}%`,
              s: `${stats.wins}W ${stats.loss}L ${stats.be}BE`,
            },
            { l: "Net R", v: stats.rTotal.toFixed(2), s: "sum of RR" },
            {
              l: "Outcomes",
              v: `${stats.wins + stats.loss + stats.be}/${stats.total}`,
              s: "graded vs total",
            },
          ].map((s) => (
            <div key={s.l} className="glass-card p-3 rounded-lg diq-press">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {s.l}
              </div>
              <div className="text-xl font-bold font-mono mt-1">{s.v}</div>
              <div className="text-[11px] text-muted-foreground">{s.s}</div>
            </div>
          ))}
        </div>

        {/* New entry */}
        <div className="glass-card rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_120px_120px] gap-2">
            <Input
              placeholder="Pair"
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              className="font-mono text-xs"
            />
            <Input
              placeholder="Note (Cmd/Ctrl-Enter to save)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addEntry();
              }}
              className="text-sm"
            />
            <Input
              placeholder="R (e.g. 2.5)"
              value={rr}
              onChange={(e) => setRr(e.target.value)}
              className="font-mono text-xs"
            />
            <Button onClick={addEntry} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {OUTCOMES.map((o) => (
              <button
                key={o.id}
                onClick={() => setOutcome(outcome === o.id ? null : o.id)}
                className={`text-[10px] px-2 py-1 rounded font-mono uppercase tracking-wider diq-press ${
                  outcome === o.id
                    ? o.color + " ring-1 ring-current"
                    : "bg-muted/40 text-muted-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
            <Input
              placeholder="tags, comma separated"
              value={tagsBuf}
              onChange={(e) => setTagsBuf(e.target.value)}
              className="flex-1 min-w-[160px] text-xs"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card rounded-lg p-3 flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter by pair…"
            value={filterPair}
            onChange={(e) => setFilterPair(e.target.value)}
            className="text-xs flex-1 min-w-[160px]"
          />
          {(["ALL", ...OUTCOMES.map((o) => o.id)] as const).map((o) => (
            <button
              key={o}
              onClick={() => setFilterOutcome(o as Outcome | "ALL")}
              className={`text-[10px] px-2 py-1 rounded font-mono uppercase tracking-wider diq-press ${
                filterOutcome === o
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/40 text-muted-foreground"
              }`}
            >
              {o}
            </button>
          ))}
        </div>

        {/* Entries */}
        <div className="grid gap-3">
          {loading && entries.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8 italic">
              Loading entries…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-sm border border-dashed rounded-lg">
              {entries.length === 0
                ? "No journal entries yet. Add your first observation above."
                : "Nothing matches the current filters."}
            </div>
          )}
          {filtered.map((e) => {
            const isEditing = editingId === e.id;
            const oc = OUTCOMES.find((o) => o.id === e.outcome);
            return (
              <div key={e.id} className="glass-card p-4 rounded-lg group">
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_120px] gap-2">
                      <Input
                        value={(editDraft.pair as string) ?? ""}
                        onChange={(ev) => setEditDraft({ ...editDraft, pair: ev.target.value })}
                        className="font-mono text-xs"
                      />
                      <Input
                        value={(editDraft.note as string) ?? ""}
                        onChange={(ev) => setEditDraft({ ...editDraft, note: ev.target.value })}
                      />
                      <Input
                        value={editDraft.rr?.toString() ?? ""}
                        onChange={(ev) =>
                          setEditDraft({
                            ...editDraft,
                            rr: ev.target.value ? Number(ev.target.value) : null,
                          })
                        }
                        className="font-mono text-xs"
                        placeholder="R"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {OUTCOMES.map((o) => (
                        <button
                          key={o.id}
                          onClick={() =>
                            setEditDraft({
                              ...editDraft,
                              outcome: editDraft.outcome === o.id ? null : o.id,
                            })
                          }
                          className={`text-[10px] px-2 py-1 rounded font-mono uppercase tracking-wider ${
                            editDraft.outcome === o.id
                              ? o.color + " ring-1 ring-current"
                              : "bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                      <Input
                        placeholder="tags, comma separated"
                        value={(editDraft.tags as string[] | undefined)?.join(", ") ?? ""}
                        onChange={(ev) =>
                          setEditDraft({
                            ...editDraft,
                            tags: ev.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        className="flex-1 min-w-[160px] text-xs"
                      />
                      <Button size="sm" onClick={saveEdit} className="gap-1">
                        <Save className="w-3.5 h-3.5" /> Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(null);
                          setEditDraft({});
                        }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono font-bold text-sm bg-muted/60 px-2 py-0.5 rounded">
                          {e.pair}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(e.created_at).toLocaleString("en-ZA", {
                            timeZone: "Africa/Johannesburg",
                            hour12: false,
                          })}
                        </span>
                        {oc && (
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-mono ${oc.color}`}
                          >
                            {oc.label}
                          </span>
                        )}
                        {typeof e.rr === "number" && (
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded ${e.rr >= 0 ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear"}`}
                          >
                            {e.rr >= 0 ? "+" : ""}
                            {e.rr.toFixed(2)}R
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => startEdit(e)}
                          className="text-muted-foreground hover:text-primary p-1"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => remove(e.id)}
                          className="text-muted-foreground hover:text-red-400 p-1"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                      {e.note}
                    </p>
                    {e.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {e.tags.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                          >
                            <Tag className="w-2.5 h-2.5" /> {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          Storage: <code className="px-1 rounded bg-muted/40">public.trade_journal</code> with RLS ·
          falls back to localStorage when signed out.
        </p>

        {/* Psychology & Sessions Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          <PsychologyTracker />
          <SessionsHeatmap />
        </div>
      </div>
    </AppShell>
  );
}
