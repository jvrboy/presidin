import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState } from "react";
import {
  Activity,
  CircleCheck,
  Database,
  Github,
  Globe,
  LineChart,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash,
  Webhook,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/mcp-servers")({
  head: () => ({
    meta: [
      { title: "MCP Servers — Divergence IQ" },
      {
        name: "description",
        content:
          "Browse, connect, and manage Model Context Protocol (MCP) servers for market data, on-chain analytics, news, and trading execution.",
      },
    ],
  }),
  component: McpServersPage,
});

type McpStatus = "connected" | "available" | "error";

interface McpServer {
  id: string;
  name: string;
  description: string;
  category: "Market Data" | "On-Chain" | "News & Sentiment" | "Execution" | "DevOps";
  endpoint: string;
  tools: string[];
  status: McpStatus;
  icon: LucideIcon;
  latencyMs?: number;
  lastSync?: string;
}

const CATALOG: McpServer[] = [
  {
    id: "coingecko",
    name: "CoinGecko MCP",
    description: "Live crypto prices, market caps, trending coins, and historical OHLCV.",
    category: "Market Data",
    endpoint: "https://mcp.coingecko.io/sse",
    tools: ["get_price", "get_markets", "get_trending", "get_ohlcv"],
    status: "connected",
    icon: Globe,
    latencyMs: 142,
    lastSync: "just now",
  },
  {
    id: "deribit",
    name: "Deribit MCP",
    description: "Options book, funding rates, and liquidations for BTC/ETH perpetuals.",
    category: "Market Data",
    endpoint: "https://mcp.deribit.io/sse",
    tools: ["order_book", "funding_rate", "liquidations", "ticker"],
    status: "connected",
    icon: Activity,
    latencyMs: 88,
    lastSync: "2s ago",
  },
  {
    id: "glassnode",
    name: "Glassnode MCP",
    description: "On-chain BTC/ETH metrics: SOPR, NUPL, exchange flows, miner reserves.",
    category: "On-Chain",
    endpoint: "https://mcp.glassnode.io/sse",
    tools: ["sopr", "nupl", "exchange_flows", "miner_reserves"],
    status: "available",
    icon: Database,
  },
  {
    id: "newsapi",
    name: "NewsAPI MCP",
    description: "Real-time forex & crypto headlines with sentiment scoring per asset.",
    category: "News & Sentiment",
    endpoint: "https://mcp.newsapi.org/sse",
    tools: ["headlines", "sentiment", "trending_topics"],
    status: "available",
    icon: Webhook,
  },
  {
    id: "github",
    name: "GitHub MCP",
    description: "Read repos, issues, and PRs — used to inspect strategy source code.",
    category: "DevOps",
    endpoint: "https://api.githubcopilot.com/mcp/",
    tools: ["search_repos", "get_file", "list_issues"],
    status: "connected",
    icon: Github,
    latencyMs: 210,
    lastSync: "12s ago",
  },
  {
    id: "supabase",
    name: "Supabase MCP",
    description: "Query the Divergence IQ Postgres tables, run RPC, and manage migrations.",
    category: "DevOps",
    endpoint: "https://mcp.supabase.io/sse",
    tools: ["execute_sql", "list_tables", "apply_migration"],
    status: "connected",
    icon: Database,
    latencyMs: 64,
    lastSync: "1s ago",
  },
  {
    id: "hyperliquid",
    name: "Hyperliquid MCP",
    description: "Perp DEX order placement, positions, and account equity via MCP.",
    category: "Execution",
    endpoint: "https://mcp.hyperliquid.xyz/sse",
    tools: ["place_order", "cancel_order", "positions", "account_state"],
    status: "available",
    icon: Zap,
  },
  {
    id: "tavily",
    name: "Tavily Search MCP",
    description: "Web search & extraction for live macro research and breaking events.",
    category: "News & Sentiment",
    endpoint: "https://mcp.tavily.com/sse",
    tools: ["web_search", "web_extract"],
    status: "connected",
    icon: Search,
    latencyMs: 180,
    lastSync: "5s ago",
  },
  {
    id: "mt5",
    name: "MetaTrader 5 MCP",
    description:
      "Connect to MT5 terminals for account info, open positions, pending orders, and live symbol ticks.",
    category: "Execution",
    endpoint: "ws://localhost:8000/mcp/mt5",
    tools: [
      "account_info",
      "positions",
      "pending_orders",
      "market_watch",
      "place_order",
      "modify_order",
      "close_position",
    ],
    status: "available",
    icon: Server,
  },
  {
    id: "tradingview",
    name: "TradingView MCP",
    description:
      "Fetch TradingView ideas, screener results, indicators, and chart snapshots for any symbol.",
    category: "Market Data",
    endpoint: "https://mcp.tradingview.com/sse",
    tools: ["get_ideas", "screener", "indicators", "chart_snapshot", "watchlist"],
    status: "available",
    icon: LineChart,
  },
];

function McpServersPage() {
  const [servers, setServers] = useState<McpServer[]>(CATALOG);
  const [filter, setFilter] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [pinging, setPinging] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const id = window.setInterval(() => {
      setServers((prev) =>
        prev.map((s) => {
          if (s.status !== "connected") return s;
          const jitter = Math.round((Math.random() - 0.5) * 30);
          return {
            ...s,
            latencyMs: Math.max(20, (s.latencyMs ?? 100) + jitter),
            lastSync: "just now",
          };
        }),
      );
    }, 4000);
    return () => window.clearInterval(id);
  }, []);

  const categories = ["All", "Market Data", "On-Chain", "News & Sentiment", "Execution", "DevOps"];
  const visible = servers.filter((s) => {
    const matchCat = filter === "All" || s.category === filter;
    const q = query.trim().toLowerCase();
    const matchQ =
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tools.some((t) => t.includes(q));
    return matchCat && matchQ;
  });

  const connectedCount = servers.filter((s) => s.status === "connected").length;
  const avgLatency = Math.round(
    servers
      .filter((s) => s.status === "connected" && s.latencyMs)
      .reduce((a, s) => a + (s.latencyMs ?? 0), 0) / Math.max(1, connectedCount),
  );

  const toggle = (id: string) => {
    setServers((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              status: s.status === "connected" ? "available" : "connected",
              latencyMs: s.status === "connected" ? undefined : 120,
              lastSync: s.status === "connected" ? undefined : "just now",
            }
          : s,
      ),
    );
  };

  const ping = (id: string) => {
    setPinging((p) => ({ ...p, [id]: true }));
    window.setTimeout(() => {
      setPinging((p) => ({ ...p, [id]: false }));
      setServers((prev) =>
        prev.map((s) =>
          s.id === id && s.status === "connected"
            ? { ...s, latencyMs: Math.max(30, Math.round((s.latencyMs ?? 100) * 0.9)) }
            : s,
        ),
      );
    }, 600);
  };

  const remove = (id: string) => setServers((prev) => prev.filter((s) => s.id !== id));

  return (
    <AppShell>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pb-24 pt-4 sm:px-5 md:px-6 md:pb-8 md:pt-6">
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-card/80 p-4 shadow-sm md:flex-row md:items-end md:justify-between md:p-5">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1">
                <Server className="h-3 w-3" /> Model Context Protocol
              </span>
              <span>{connectedCount} connected</span>
              <span>avg {avgLatency}ms</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-normal md:text-3xl">MCP Servers</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Connect external data, execution, and dev tools through the Model Context Protocol.
              Tools are auto-exposed to the AI agents and chat skill layer.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
              <Search className="mr-2 h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search servers or tools"
                className="min-w-0 w-56 bg-transparent text-sm outline-none"
              />
            </div>
            <button
              onClick={() => setServers(CATALOG)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground transition hover:bg-accent"
            >
              <Plus className="h-4 w-4" /> Reset catalog
            </button>
          </div>
        </section>

        <section className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                filter === c
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((s) => {
            const Icon = s.icon;
            const connected = s.status === "connected";
            return (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card/80 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/12 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{s.name}</div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {s.category}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${
                      connected
                        ? "bg-bull/15 text-bull"
                        : s.status === "error"
                          ? "bg-bear/15 text-bear"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {connected ? (
                      <CircleCheck className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {s.status.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{s.description}</p>
                <div className="truncate rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
                  {s.endpoint}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {s.tools.map((t) => (
                    <span
                      key={t}
                      className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[10px] text-foreground/80"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                  <span>
                    {connected
                      ? `${s.latencyMs ?? "--"}ms · ${s.lastSync ?? "--"}`
                      : "Not connected"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => ping(s.id)}
                      disabled={!connected || pinging[s.id]}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition hover:bg-accent disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${pinging[s.id] ? "animate-spin" : ""}`} />
                      Ping
                    </button>
                    <button
                      onClick={() => toggle(s.id)}
                      className={`inline-flex h-8 items-center rounded-md px-2.5 text-xs font-semibold transition ${
                        connected
                          ? "border border-bear/40 bg-bear/10 text-bear hover:bg-bear/20"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                      }`}
                    >
                      {connected ? "Disconnect" : "Connect"}
                    </button>
                    <button
                      onClick={() => remove(s.id)}
                      title="Remove from catalog"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:text-bear"
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {visible.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No MCP servers match "{query}".
          </div>
        )}
      </main>
    </AppShell>
  );
}
