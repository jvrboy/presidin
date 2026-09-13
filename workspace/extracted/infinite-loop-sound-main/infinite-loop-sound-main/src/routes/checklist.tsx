import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useMemo, useEffect } from "react";
import {
  ListChecks,
  CircleCheck,
  XCircle,
  Circle,
  Plus,
  Trash,
  RefreshCw,
  Target,
  Zap,
  Shield,
  Brain,
  TrendingUp,
  AlertTriangle,
  Save,
  RotateCcw,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/checklist")({
  head: () => ({
    meta: [
      { title: "Pre-Trade Checklist — DivergenceIQ" },
      {
        name: "description",
        content: "Structured pre-trade checklist to enforce discipline and improve trade quality.",
      },
    ],
  }),
  component: ChecklistPage,
});

type CheckState = "pass" | "fail" | "skip" | "pending";

interface CheckItem {
  id: string;
  label: string;
  description: string;
  category: "setup" | "risk" | "psychology" | "timing" | "custom";
  required: boolean;
  state: CheckState;
}

interface ChecklistTemplate {
  id: string;
  name: string;
  items: Omit<CheckItem, "state">[];
}

const DEFAULT_ITEMS: Omit<CheckItem, "state">[] = [
  // Setup
  {
    id: "trend-confirmed",
    label: "Trend confirmed on HTF",
    description: "Higher timeframe (H4/D1) trend aligns with trade direction.",
    category: "setup",
    required: true,
  },
  {
    id: "structure-break",
    label: "Structure break / BOS identified",
    description: "A clear break of structure or change of character is visible.",
    category: "setup",
    required: true,
  },
  {
    id: "poi-valid",
    label: "POI / zone is valid",
    description: "Point of Interest (supply/demand, OB, FVG) is fresh and untested.",
    category: "setup",
    required: true,
  },
  {
    id: "entry-model",
    label: "Entry model confirmed",
    description: "Your specific entry trigger (e.g. M5 BOS, pin bar, engulfing) has fired.",
    category: "setup",
    required: true,
  },
  {
    id: "confluence",
    label: "Minimum 2 confluences",
    description: "At least two independent factors support this trade.",
    category: "setup",
    required: false,
  },
  // Risk
  {
    id: "sl-defined",
    label: "Stop-loss level defined",
    description: "SL is placed at a logical invalidation point, not arbitrary.",
    category: "risk",
    required: true,
  },
  {
    id: "rr-minimum",
    label: "R:R ≥ 1.5",
    description: "The potential reward is at least 1.5× the risk.",
    category: "risk",
    required: true,
  },
  {
    id: "position-sized",
    label: "Position size calculated",
    description: "Lot size is calculated based on account risk % and SL distance.",
    category: "risk",
    required: true,
  },
  {
    id: "daily-limit",
    label: "Daily loss limit not hit",
    description: "You have not already hit your maximum daily loss for today.",
    category: "risk",
    required: true,
  },
  {
    id: "max-trades",
    label: "Max concurrent trades OK",
    description: "You are not overexposed with too many open positions.",
    category: "risk",
    required: false,
  },
  // Psychology
  {
    id: "no-revenge",
    label: "Not revenge trading",
    description: "This trade is not motivated by a previous loss.",
    category: "psychology",
    required: true,
  },
  {
    id: "no-fomo",
    label: "Not FOMO entry",
    description: "You are not chasing a move that has already happened.",
    category: "psychology",
    required: true,
  },
  {
    id: "plan-exists",
    label: "Trade plan written",
    description: "You have a clear plan: entry, SL, TP, and invalidation.",
    category: "psychology",
    required: false,
  },
  {
    id: "emotional-state",
    label: "Emotional state is neutral",
    description: "You are calm, focused, and not trading under stress or excitement.",
    category: "psychology",
    required: true,
  },
  // Timing
  {
    id: "session-active",
    label: "Active session open",
    description: "A major session (London/NY) is currently open.",
    category: "timing",
    required: false,
  },
  {
    id: "no-news",
    label: "No major news in 30 min",
    description: "No high-impact news event is scheduled within the next 30 minutes.",
    category: "timing",
    required: true,
  },
  {
    id: "not-end-of-week",
    label: "Not Friday close",
    description: "Not entering a new trade within 2 hours of Friday market close.",
    category: "timing",
    required: false,
  },
];

const LOCAL_KEY = "diq.checklist.state.v1";
const HISTORY_KEY = "diq.checklist.history.v1";

interface HistoryEntry {
  id: string;
  ts: number;
  pair: string;
  score: number;
  passed: boolean;
  took: boolean;
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, val: unknown) {
  if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(val));
}

const CATEGORY_LABELS: Record<CheckItem["category"], string> = {
  setup: "Setup Quality",
  risk: "Risk Management",
  psychology: "Psychology",
  timing: "Timing",
  custom: "Custom",
};

const CATEGORY_ICONS: Record<CheckItem["category"], any> = {
  setup: TrendingUp,
  risk: Shield,
  psychology: Brain,
  timing: Target,
  custom: Star,
};

function ChecklistPage() {
  const [items, setItems] = useState<CheckItem[]>([]);
  const [pair, setPair] = useState("EUR/USD");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [customLabel, setCustomLabel] = useState("");
  const [customDesc, setCustomDesc] = useState("");

  useEffect(() => {
    const saved = readLocal<Record<string, CheckState>>(LOCAL_KEY, {});
    const initialized = DEFAULT_ITEMS.map((item) => ({
      ...item,
      state: (saved[item.id] as CheckState) || "pending",
    }));
    setItems(initialized);
    setHistory(readLocal(HISTORY_KEY, []));
  }, []);

  function setItemState(id: string, state: CheckState) {
    setItems((prev) => {
      const updated = prev.map((i) => (i.id === id ? { ...i, state } : i));
      const stateMap = Object.fromEntries(updated.map((i) => [i.id, i.state]));
      writeLocal(LOCAL_KEY, stateMap);
      return updated;
    });
  }

  function cycleState(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const next: Record<CheckState, CheckState> = {
      pending: "pass",
      pass: "fail",
      fail: "skip",
      skip: "pending",
    };
    setItemState(id, next[item.state]);
  }

  function resetAll() {
    setItems((prev) => prev.map((i) => ({ ...i, state: "pending" })));
    writeLocal(LOCAL_KEY, {});
    toast.info("Checklist reset");
  }

  function addCustomItem() {
    if (!customLabel.trim()) {
      toast.error("Enter a label");
      return;
    }
    const newItem: CheckItem = {
      id: `custom-${Date.now()}`,
      label: customLabel.trim(),
      description: customDesc.trim(),
      category: "custom",
      required: false,
      state: "pending",
    };
    setItems((prev) => [...prev, newItem]);
    setCustomLabel("");
    setCustomDesc("");
    toast.success("Custom check added");
  }

  function removeCustomItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function recordDecision(took: boolean) {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      pair,
      score: metrics.score,
      passed: metrics.requiredPassed,
      took,
    };
    const updated = [entry, ...history].slice(0, 50);
    setHistory(updated);
    writeLocal(HISTORY_KEY, updated);
    toast.success(took ? "Trade taken — good luck!" : "Trade skipped — discipline wins.");
    resetAll();
  }

  const metrics = useMemo(() => {
    const required = items.filter((i) => i.required);
    const requiredPassed = required.every((i) => i.state === "pass" || i.state === "skip");
    const passed = items.filter((i) => i.state === "pass").length;
    const failed = items.filter((i) => i.state === "fail").length;
    const pending = items.filter((i) => i.state === "pending").length;
    const total = items.filter((i) => i.state !== "skip").length;
    const score = total > 0 ? Math.round((passed / total) * 100) : 0;

    const byCategory = Object.keys(CATEGORY_LABELS).reduce(
      (acc, cat) => {
        const catItems = items.filter((i) => i.category === cat);
        const catPassed = catItems.filter((i) => i.state === "pass").length;
        acc[cat] = { total: catItems.length, passed: catPassed };
        return acc;
      },
      {} as Record<string, { total: number; passed: number }>,
    );

    return { requiredPassed, passed, failed, pending, score, byCategory };
  }, [items]);

  const scoreColor =
    metrics.score >= 80 ? "text-bull" : metrics.score >= 60 ? "text-amber-400" : "text-bear";
  const categories = Object.keys(CATEGORY_LABELS) as Array<CheckItem["category"]>;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <ListChecks className="w-6 h-6 text-primary" /> Pre-Trade Checklist
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Run through every check before entering a trade. Enforce discipline and improve trade
              quality.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={resetAll}>
            <RotateCcw className="w-4 h-4 mr-1" /> Reset
          </Button>
        </div>

        {/* Score + Pair */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-2">
            <CardContent className="pt-4">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className={`text-5xl font-bold font-mono ${scoreColor}`}>
                    {metrics.score}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                    Score
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="w-full bg-muted rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${
                        metrics.score >= 80
                          ? "bg-bull"
                          : metrics.score >= 60
                            ? "bg-amber-500"
                            : "bg-bear"
                      }`}
                      style={{ width: `${metrics.score}%` }}
                    />
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="text-bull">{metrics.passed} passed</span>
                    <span className="text-bear">{metrics.failed} failed</span>
                    <span>{metrics.pending} pending</span>
                  </div>
                  <div
                    className={`text-xs font-medium ${metrics.requiredPassed ? "text-bull" : "text-bear"}`}
                  >
                    {metrics.requiredPassed
                      ? "✓ All required checks passed"
                      : "✗ Some required checks not yet passed"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Pair
                </label>
                <select
                  value={pair}
                  onChange={(e) => setPair(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {[
                    "EUR/USD",
                    "GBP/USD",
                    "USD/JPY",
                    "AUD/USD",
                    "USD/CAD",
                    "XAU/USD",
                    "GBP/JPY",
                    "EUR/JPY",
                    "USD/CHF",
                    "NZD/USD",
                  ].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="bg-bull hover:bg-bull/80 text-white text-xs"
                  disabled={!metrics.requiredPassed}
                  onClick={() => recordDecision(true)}
                >
                  <Zap className="w-3.5 h-3.5 mr-1" /> Take Trade
                </Button>
                <Button variant="outline" className="text-xs" onClick={() => recordDecision(false)}>
                  <XCircle className="w-3.5 h-3.5 mr-1" /> Skip Trade
                </Button>
              </div>
              {!metrics.requiredPassed && (
                <p className="text-[10px] text-bear">Complete all required (★) checks first.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Checklist by Category */}
        {categories.map((cat) => {
          const catItems = items.filter((i) => i.category === cat);
          if (catItems.length === 0) return null;
          const CatIcon = CATEGORY_ICONS[cat];
          const catStats = metrics.byCategory[cat];
          return (
            <Card key={cat}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CatIcon className="w-4 h-4 text-primary" />
                    {CATEGORY_LABELS[cat]}
                  </div>
                  <span className="text-sm font-normal text-muted-foreground">
                    {catStats?.passed ?? 0}/{catStats?.total ?? 0}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {catItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      item.state === "pass"
                        ? "border-bull/30 bg-bull/5"
                        : item.state === "fail"
                          ? "border-bear/30 bg-bear/5"
                          : item.state === "skip"
                            ? "border-border/30 bg-muted/20 opacity-60"
                            : "border-border bg-card hover:bg-white/3"
                    }`}
                    onClick={() => cycleState(item.id)}
                  >
                    <div className="mt-0.5 shrink-0">
                      {item.state === "pass" ? (
                        <CircleCheck className="w-4 h-4 text-bull" />
                      ) : item.state === "fail" ? (
                        <XCircle className="w-4 h-4 text-bear" />
                      ) : item.state === "skip" ? (
                        <Circle className="w-4 h-4 text-muted-foreground/40" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{item.label}</span>
                        {item.required && (
                          <span className="text-[9px] text-amber-400 font-bold">★ REQUIRED</span>
                        )}
                        {item.category === "custom" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeCustomItem(item.id);
                            }}
                            className="ml-auto text-muted-foreground hover:text-bear"
                          >
                            <Trash className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[9px] shrink-0 ${
                        item.state === "pass"
                          ? "bg-bull/10 text-bull border-bull/30"
                          : item.state === "fail"
                            ? "bg-bear/10 text-bear border-bear/30"
                            : item.state === "skip"
                              ? "text-muted-foreground"
                              : "text-muted-foreground"
                      }`}
                    >
                      {item.state.toUpperCase()}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}

        {/* Add Custom Check */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" /> Add Custom Check
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Label
                </label>
                <input
                  type="text"
                  placeholder="e.g. ICT kill zone active"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Description (optional)
                </label>
                <input
                  type="text"
                  placeholder="Explain what to check..."
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <Button variant="outline" onClick={addCustomItem}>
              <Plus className="w-4 h-4 mr-1" /> Add Check
            </Button>
          </CardContent>
        </Card>

        {/* History */}
        {history.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Save className="w-4 h-4 text-primary" /> Decision History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="text-left py-2 pr-4">Time</th>
                      <th className="text-left py-2 pr-4">Pair</th>
                      <th className="text-left py-2 pr-4">Score</th>
                      <th className="text-left py-2 pr-4">Required</th>
                      <th className="text-left py-2">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 15).map((h) => (
                      <tr key={h.id} className="border-b border-border/50">
                        <td className="py-2 pr-4 text-muted-foreground font-mono text-xs">
                          {new Date(h.ts).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-2 pr-4 font-medium">{h.pair}</td>
                        <td
                          className={`py-2 pr-4 font-mono font-semibold ${h.score >= 80 ? "text-bull" : h.score >= 60 ? "text-amber-400" : "text-bear"}`}
                        >
                          {h.score}%
                        </td>
                        <td className="py-2 pr-4">
                          {h.passed ? (
                            <CircleCheck className="w-4 h-4 text-bull" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                          )}
                        </td>
                        <td className="py-2">
                          <Badge
                            variant="outline"
                            className={
                              h.took
                                ? "bg-bull/10 text-bull border-bull/30"
                                : "bg-muted text-muted-foreground"
                            }
                          >
                            {h.took ? "TAKEN" : "SKIPPED"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
