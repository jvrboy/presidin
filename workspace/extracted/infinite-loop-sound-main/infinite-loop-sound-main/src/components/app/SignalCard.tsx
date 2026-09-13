import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Send,
  BarChart,
  Copy,
  CheckCheck,
  ThumbsUp,
  ThumbsDown,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Clock,
  Zap,
} from "lucide-react";
import { displayPair } from "@/lib/engine/deriv";
import { useState } from "react";
import { motion } from "framer-motion";

export interface SignalCardData {
  id?: string;
  pair: string;
  timeframe: string;
  direction: "BUY" | "SELL";
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  score: number;
  rating: string;
  confluence: { label: string; passed: boolean; pts: number }[];
  created_at?: string;
  sent_telegram?: boolean;
  status?: string;
  result?: string | null;
}

const fmt = (n: number) => Number(n).toFixed(5);
const pips = (a: number, b: number, pair: string) => {
  const factor = pair.includes("JPY") ? 100 : 10000;
  return Math.abs(a - b) * factor;
};
const getTimeAgo = (date: Date) => {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
};

const getStatusColor = (status?: string, result?: string | null) => {
  if (!result || result === "") {
    if (!status || status === "active" || status === "pending")
      return "text-bull bg-bull/10 border-bull/30";
    return "text-muted-foreground bg-muted border-border";
  }
  const r = result.toUpperCase();
  if (r.startsWith("TP") || r === "WIN") return "text-bull bg-bull/10 border-bull/30";
  if (r === "SL" || r === "LOSS") return "text-bear bg-bear/10 border-bear/30";
  return "text-muted-foreground bg-muted border-border";
};

export function SignalCard({
  signal,
  onSendTelegram,
  onView,
}: {
  signal: SignalCardData;
  onSendTelegram?: () => void;
  onView?: () => void;
}) {
  const { direction, rating, pair, timeframe, entry, sl, tp1, tp2, tp3, score } = signal;
  const isBuy = direction === "BUY";
  const dirCls = isBuy
    ? "text-bull bg-bull/10 border-bull/30"
    : "text-bear bg-bear/10 border-bear/30";
  const ratingCls =
    rating === "ELITE"
      ? "bg-gradient-to-r from-elite/20 to-primary/10 text-elite border-elite/40 shadow-[0_0_10px_rgba(56,189,248,0.1)]"
      : rating === "STRONG"
        ? "bg-bull/15 text-bull border-bull/40"
        : rating === "MEDIUM"
          ? "bg-medium/15 text-medium border-medium/40"
          : "bg-muted text-muted-foreground border-border";

  const rrPips = pips(entry, tp3, pair) / Math.max(1, pips(entry, sl, pair));
  const timeAgo = signal.created_at ? getTimeAgo(new Date(signal.created_at)) : "";
  const statusColor = getStatusColor(signal.status, signal.result);

  const [copied, setCopied] = useState(false);
  const [sentiment, setSentiment] = useState<"up" | "down" | null>(null);

  const handleCopy = () => {
    const text = `${isBuy ? "BUY" : "SELL"} ${displayPair(pair)} @ ${fmt(entry)}
Timeframe: ${timeframe} | Score: ${score}/100 (${rating})
SL: ${fmt(sl)}
TP1: ${fmt(tp1)}
TP2: ${fmt(tp2)}
TP3: ${fmt(tp3)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const passedCount = signal.confluence.filter((c) => c.passed).length;
  const totalCount = signal.confluence.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative rounded-lg border border-border bg-card/80 backdrop-blur-sm p-4 md:p-5 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:-translate-y-0.5 hover:border-primary/30"
    >
      {/* Status badge top-right */}
      <div className="absolute top-3 right-3">
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusColor}`}>
          {signal.result || signal.status || "ACTIVE"}
        </span>
      </div>

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`${ratingCls} font-mono uppercase tracking-wider text-[10px]`}>
            {rating}
          </Badge>
          <span className="text-xs font-mono text-muted-foreground">{timeframe}</span>
          {signal.created_at && (
            <span
              className="text-[10px] font-mono text-muted-foreground/80"
              title={new Date(signal.created_at).toString()}
            >
              {new Date(signal.created_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {timeAgo ? ` · ${timeAgo}` : ""}
            </span>
          )}
          {signal.sent_telegram && (
            <Badge variant="outline" className="text-[10px] border-bull/50 text-bull">
              SENT
            </Badge>
          )}
        </div>
        <div className="flex gap-1 items-center">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition"
            title="Copy Signal"
          >
            {copied ? <CheckCheck className="w-4 h-4 text-bull" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h3 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            {displayPair(pair)}
            {isBuy ? (
              <ArrowUpRight className="w-5 h-5 text-bull" />
            ) : (
              <ArrowDownRight className="w-5 h-5 text-bear" />
            )}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <div className={`px-2.5 py-1 rounded border font-mono text-xs font-bold ${dirCls}`}>
              {isBuy ? (
                <TrendingUp className="w-3.5 h-3.5 inline mr-1" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 inline mr-1" />
              )}
              {direction}
            </div>
            <div className="text-xs font-mono text-muted-foreground">
              Score: <span className="font-bold text-foreground">{score}/100</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-1.5 items-center">
            <button
              onClick={() => setSentiment(sentiment === "up" ? null : "up")}
              className={`p-1.5 rounded transition ${sentiment === "up" ? "bg-bull/20 text-bull" : "text-muted-foreground hover:bg-accent"}`}
              title="Agree"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setSentiment(sentiment === "down" ? null : "down")}
              className={`p-1.5 rounded transition ${sentiment === "down" ? "bg-bear/20 text-bear" : "text-muted-foreground hover:bg-accent"}`}
              title="Disagree"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {passedCount}/{totalCount} checks passed
          </div>
        </div>
      </div>

      {/* Price Levels Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono mb-4">
        <div className="bg-muted/50 rounded p-2 text-center">
          <div className="text-[10px] text-muted-foreground uppercase">Entry</div>
          <div className="font-bold mt-0.5">{fmt(entry)}</div>
        </div>
        <div className="bg-bear/5 rounded p-2 text-center border border-bear/10">
          <div className="text-[10px] text-bear uppercase">SL</div>
          <div className="font-bold mt-0.5 text-bear">{fmt(sl)}</div>
          <div className="text-[10px] text-muted-foreground">
            -{pips(entry, sl, pair).toFixed(0)}p
          </div>
        </div>
        <div className="bg-bull/5 rounded p-2 text-center border border-bull/10">
          <div className="text-[10px] text-bull uppercase">TP1</div>
          <div className="font-bold mt-0.5 text-bull">{fmt(tp1)}</div>
          <div className="text-[10px] text-muted-foreground">
            +{pips(entry, tp1, pair).toFixed(0)}p
          </div>
        </div>
        <div className="bg-bull/5 rounded p-2 text-center border border-bull/10">
          <div className="text-[10px] text-bull uppercase">TP3</div>
          <div className="font-bold mt-0.5 text-bull">{fmt(tp3)}</div>
          <div className="text-[10px] text-muted-foreground">R:R 1:{rrPips.toFixed(1)}</div>
        </div>
      </div>

      {/* Confluence Tags */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {signal.confluence.slice(0, 6).map((c, i) => (
          <span
            key={i}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${c.passed ? "bg-bull/5 text-bull border-bull/20" : "bg-muted/50 text-muted-foreground/60 border-border/50 line-through"}`}
          >
            {c.passed ? (
              <Zap className="w-2.5 h-2.5 inline mr-0.5" />
            ) : (
              <Clock className="w-2.5 h-2.5 inline mr-0.5" />
            )}
            {c.label}
          </span>
        ))}
        {signal.confluence.length > 6 && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-muted-foreground">
            +{signal.confluence.length - 6} more
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {onView && (
          <Button
            size="sm"
            variant="outline"
            onClick={onView}
            className="flex-1 hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            <BarChart className="w-3.5 h-3.5 mr-1.5" /> Chart
          </Button>
        )}
        {onSendTelegram && (
          <Button size="sm" onClick={onSendTelegram} className="flex-1">
            <Send className="w-3.5 h-3.5 mr-1.5" /> Telegram
          </Button>
        )}
      </div>
    </motion.div>
  );
}

function Row({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "bull" | "bear";
}) {
  const c = accent === "bull" ? "text-bull" : accent === "bear" ? "text-bear" : "text-foreground";
  return (
    <div className="flex items-center justify-between bg-muted/30 rounded px-2 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className={c}>{value}</span>
        {sub && <span className="text-[10px] text-muted-foreground ml-1">{sub}</span>}
      </span>
    </div>
  );
}
