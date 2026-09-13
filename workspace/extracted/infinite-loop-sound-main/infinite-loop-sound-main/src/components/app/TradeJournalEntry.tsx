import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  BookOpen,
  Save,
  Star,
  AlertTriangle,
  CircleCheck,
  Brain,
  Heart,
  Frown,
  Meh,
  Smile,
  Zap,
} from "lucide-react";

export type TradeMood = "confident" | "neutral" | "anxious" | "fomo" | "revenge" | "disciplined";
export type TradeSetupQuality = 1 | 2 | 3 | 4 | 5;

export interface JournalEntry {
  id: string;
  pair: string;
  timeframe: string;
  direction: "BUY" | "SELL";
  mood: TradeMood;
  setupQuality: TradeSetupQuality;
  preTradeNotes: string;
  postTradeNotes: string;
  lessonsLearned: string;
  followedPlan: boolean;
  tags: string[];
  screenshots: string[];
  createdAt: number;
  result?: "WIN" | "LOSS" | "BE";
  pnl?: number;
}

interface Props {
  pair?: string;
  timeframe?: string;
  direction?: "BUY" | "SELL";
  onSave?: (entry: Omit<JournalEntry, "id" | "createdAt">) => void;
}

const MOODS: { id: TradeMood; label: string; icon: typeof Smile; color: string }[] = [
  {
    id: "confident",
    label: "Confident",
    icon: Smile,
    color: "text-bull bg-bull/10 border-bull/30",
  },
  {
    id: "disciplined",
    label: "Disciplined",
    icon: CircleCheck,
    color: "text-primary bg-primary/10 border-primary/30",
  },
  {
    id: "neutral",
    label: "Neutral",
    icon: Meh,
    color: "text-muted-foreground bg-muted border-border",
  },
  {
    id: "anxious",
    label: "Anxious",
    icon: Frown,
    color: "text-medium bg-medium/10 border-medium/30",
  },
  { id: "fomo", label: "FOMO", icon: Zap, color: "text-bear bg-bear/10 border-bear/30" },
  {
    id: "revenge",
    label: "Revenge",
    icon: AlertTriangle,
    color: "text-bear bg-bear/10 border-bear/30",
  },
];

const COMMON_TAGS = [
  "trend-following",
  "counter-trend",
  "breakout",
  "range-bound",
  "news-driven",
  "confluence-setup",
  "scalp",
  "swing",
  "overtraded",
  "perfect-execution",
  "early-exit",
  "late-entry",
];

export function TradeJournalEntry({ pair, timeframe, direction, onSave }: Props) {
  const [mood, setMood] = useState<TradeMood>("neutral");
  const [setupQuality, setSetupQuality] = useState<TradeSetupQuality>(3);
  const [preNotes, setPreNotes] = useState("");
  const [postNotes, setPostNotes] = useState("");
  const [lessons, setLessons] = useState("");
  const [followedPlan, setFollowedPlan] = useState(true);
  const [tags, setTags] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleSave = () => {
    if (onSave) {
      onSave({
        pair: pair || "UNKNOWN",
        timeframe: timeframe || "M15",
        direction: direction || "BUY",
        mood,
        setupQuality,
        preTradeNotes: preNotes,
        postTradeNotes: postNotes,
        lessonsLearned: lessons,
        followedPlan,
        tags,
        screenshots: [],
      });
    }
    // Also save to localStorage
    const entries = JSON.parse(localStorage.getItem("diq.journal") || "[]");
    entries.unshift({
      id: crypto.randomUUID(),
      pair: pair || "UNKNOWN",
      timeframe: timeframe || "M15",
      direction: direction || "BUY",
      mood,
      setupQuality,
      preTradeNotes: preNotes,
      postTradeNotes: postNotes,
      lessonsLearned: lessons,
      followedPlan,
      tags,
      screenshots: [],
      createdAt: Date.now(),
    });
    localStorage.setItem("diq.journal", JSON.stringify(entries.slice(0, 500)));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" /> Trade Journal Entry
          {pair && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {pair} {timeframe}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Mood Selector */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">
            Pre-Trade Mood
          </label>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((m) => {
              const Icon = m.icon;
              const active = mood === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMood(m.id)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition-all ${
                    active
                      ? m.color + " ring-1 ring-current"
                      : "bg-card border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Setup Quality */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">
            Setup Quality
          </label>
          <div className="flex gap-1">
            {([1, 2, 3, 4, 5] as TradeSetupQuality[]).map((q) => (
              <button
                key={q}
                onClick={() => setSetupQuality(q)}
                className={`p-1.5 rounded transition-all ${
                  q <= setupQuality ? "text-elite" : "text-muted-foreground/30"
                }`}
              >
                <Star className="w-5 h-5" fill={q <= setupQuality ? "currentColor" : "none"} />
              </button>
            ))}
            <span className="ml-2 text-xs text-muted-foreground self-center">
              {setupQuality === 5
                ? "A+ Setup"
                : setupQuality === 4
                  ? "Good Setup"
                  : setupQuality === 3
                    ? "Average"
                    : setupQuality === 2
                      ? "Below Average"
                      : "Poor Setup"}
            </span>
          </div>
        </div>

        {/* Followed Plan */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setFollowedPlan(!followedPlan)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs transition-all ${
              followedPlan
                ? "bg-bull/10 border-bull/30 text-bull"
                : "bg-bear/10 border-bear/30 text-bear"
            }`}
          >
            {followedPlan ? (
              <CircleCheck className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
            {followedPlan ? "Followed Trading Plan" : "Deviated from Plan"}
          </button>
        </div>

        {/* Notes */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
            Pre-Trade Analysis
          </label>
          <textarea
            value={preNotes}
            onChange={(e) => setPreNotes(e.target.value)}
            placeholder="Why are you taking this trade? What confluences do you see?"
            className="w-full bg-input border border-border rounded-lg px-3 py-2 text-xs min-h-[60px] resize-y focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
            Post-Trade Review
          </label>
          <textarea
            value={postNotes}
            onChange={(e) => setPostNotes(e.target.value)}
            placeholder="How did the trade play out? What happened?"
            className="w-full bg-input border border-border rounded-lg px-3 py-2 text-xs min-h-[60px] resize-y focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block flex items-center gap-1">
            <Brain className="w-3 h-3" /> Lessons Learned
          </label>
          <textarea
            value={lessons}
            onChange={(e) => setLessons(e.target.value)}
            placeholder="What will you do differently next time?"
            className="w-full bg-input border border-border rounded-lg px-3 py-2 text-xs min-h-[50px] resize-y focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">
            Tags
          </label>
          <div className="flex flex-wrap gap-1">
            {COMMON_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2 py-0.5 rounded text-[10px] border transition-all ${
                  tags.includes(tag)
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-card border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <Button onClick={handleSave} className="w-full" variant={saved ? "outline" : "default"}>
          {saved ? (
            <>
              <CircleCheck className="w-4 h-4 mr-2" /> Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" /> Save Journal Entry
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
