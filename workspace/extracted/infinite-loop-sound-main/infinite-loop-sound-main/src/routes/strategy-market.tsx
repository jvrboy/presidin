import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Store, Download, Star, Upload } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
import { toast } from "sonner";

type Strategy = {
  id: string;
  name: string;
  description: string;
  author: string;
  rules: any;
  rating: number;
  downloads: number;
  tags: string[];
  created_at: string;
};

export const Route = createFileRoute("/strategy-market")({
  head: () => ({ meta: [{ title: "Strategy Market — DivergenceIQ" }] }),
  component: StrategyMarketPage,
});

const BUILTIN_STRATEGIES: Omit<Strategy, "id" | "created_at">[] = [
  {
    name: "RSI Divergence Pro",
    description:
      "Detect bullish/bearish divergence between price and RSI. Enter on confirmation candle.",
    author: "DivergenceIQ",
    rules: { indicator: "RSI", period: 14, divergence: true, entry: "divergence_confirm" },
    rating: 4.7,
    downloads: 1240,
    tags: ["RSI", "Divergence", "Reversal"],
  },
  {
    name: "SMC Breakout",
    description: "Smart Money Concepts: trade break of structure with order block retest entry.",
    author: "DivergenceIQ",
    rules: { style: "SMC", bos: true, ob_retest: true, entry: "ob_retest" },
    rating: 4.5,
    downloads: 980,
    tags: ["SMC", "Breakout", "ICT"],
  },
  {
    name: "Fibonacci Golden Zone",
    description: "Enter on 61.8% retracement with confluence of 200 EMA and trend direction.",
    author: "DivergenceIQ",
    rules: { fib: 0.618, ema: 200, confluence: true, entry: "fib_618" },
    rating: 4.3,
    downloads: 750,
    tags: ["Fibonacci", "EMA", "Trend"],
  },
  {
    name: "Volatility Breakout",
    description: "Trade breakouts from Bollinger Band squeeze with volume confirmation.",
    author: "DivergenceIQ",
    rules: { bb: 20, squeeze: true, vol_confirm: 1.5, entry: "bb_break" },
    rating: 4.1,
    downloads: 620,
    tags: ["Bollinger", "Volatility", "Breakout"],
  },
  {
    name: "Multi-Timeframe Confluence",
    description: "Align M15, H1, and H4 trends before entering. High-probability trend-following.",
    author: "DivergenceIQ",
    rules: { tfs: ["M15", "H1", "H4"], align: true, entry: "mtf_align" },
    rating: 4.8,
    downloads: 1520,
    tags: ["MTF", "Trend", "Confluence"],
  },
  {
    name: "Ichimoku Cloud Bounce",
    description: "Trade bounces off the Kumo cloud with Tenkan/Kijun cross confirmation.",
    author: "DivergenceIQ",
    rules: { ichimoku: true, cloud_bounce: true, tk_cross: true, entry: "cloud_bounce" },
    rating: 4.4,
    downloads: 430,
    tags: ["Ichimoku", "Cloud", "Trend"],
  },
];

function StrategyMarketPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [newStrategy, setNewStrategy] = useState({
    name: "",
    description: "",
    rules: "{}",
    tags: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await db
        .from("strategies_market")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const merged = [
        ...BUILTIN_STRATEGIES.map((s, i) => ({
          ...s,
          id: `builtin-${i}`,
          created_at: new Date().toISOString(),
        })),
        ...(data || []),
      ];
      setStrategies(merged as Strategy[]);
    } catch (e) {
      setStrategies(
        BUILTIN_STRATEGIES.map(
          (s, i) =>
            ({ ...s, id: `builtin-${i}`, created_at: new Date().toISOString() }) as Strategy,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const upload = async () => {
    if (!newStrategy.name || !newStrategy.description) {
      toast.error("Name and description required");
      return;
    }
    try {
      const { error } = await db.from("strategies_market").insert({
        name: newStrategy.name,
        description: newStrategy.description,
        author: "You",
        rules: JSON.parse(newStrategy.rules || "{}"),
        rating: 0,
        downloads: 0,
        tags: newStrategy.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      if (error) throw error;
      toast.success("Strategy uploaded");
      setNewStrategy({ name: "", description: "", rules: "{}", tags: "" });
      setShowUpload(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to upload");
    }
  };

  const download = async (s: Strategy) => {
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${s.name.replace(/\s/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (!s.id.startsWith("builtin")) {
      try {
        await db
          .from("strategies_market")
          .update({ downloads: (s.downloads || 0) + 1 })
          .eq("id", s.id);
      } catch (e) {}
    }
    toast.success("Strategy downloaded");
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Store className="w-6 h-6 text-primary" /> Strategy Market
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browse, download, and share trading strategy templates.
            </p>
          </div>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition"
          >
            <Upload className="w-4 h-4" /> Share Strategy
          </button>
        </div>

        {showUpload && (
          <div className="bg-card border border-border p-6 rounded-lg space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Strategy Name</label>
              <input
                value={newStrategy.name}
                onChange={(e) => setNewStrategy({ ...newStrategy, name: e.target.value })}
                className="w-full p-2 border border-input rounded bg-background text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Description</label>
              <textarea
                value={newStrategy.description}
                onChange={(e) => setNewStrategy({ ...newStrategy, description: e.target.value })}
                rows={3}
                className="w-full p-2 border border-input rounded bg-background text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Rules (JSON)</label>
              <textarea
                value={newStrategy.rules}
                onChange={(e) => setNewStrategy({ ...newStrategy, rules: e.target.value })}
                rows={4}
                className="w-full p-2 border border-input rounded bg-background font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Tags (comma-separated)</label>
              <input
                value={newStrategy.tags}
                onChange={(e) => setNewStrategy({ ...newStrategy, tags: e.target.value })}
                className="w-full p-2 border border-input rounded bg-background text-sm"
              />
            </div>
            <button
              onClick={upload}
              className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium"
            >
              Publish
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center text-muted-foreground py-8">Loading strategies...</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {strategies.map((s) => (
              <div
                key={s.id}
                className="bg-card border border-border rounded-lg p-5 space-y-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-bold text-sm">{s.name}</h3>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="w-3 h-3 text-warning" /> {s.rating?.toFixed(1) || "—"}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>
                <div className="flex flex-wrap gap-1">
                  {(s.tags || []).map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 bg-muted rounded text-[10px] font-mono text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-[10px] text-muted-foreground">
                    by {s.author} · {s.downloads || 0} downloads
                  </span>
                  <button
                    onClick={() => download(s)}
                    className="flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded text-xs font-medium hover:bg-primary/20 transition"
                  >
                    <Download className="w-3 h-3" /> Get
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
