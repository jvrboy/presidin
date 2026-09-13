import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import {
  Brain,
  Heart,
  Shield,
  AlertTriangle,
  TrendingUp,
  Coffee,
  Moon,
  Sun,
  Flame,
  Snowflake,
  Eye,
} from "lucide-react";

export interface PsychState {
  discipline: number; // 0-100
  patience: number; // 0-100
  confidence: number; // 0-100
  focus: number; // 0-100
  emotionalControl: number; // 0-100
  overallScore: number; // 0-100
  streak: number; // positive = wins, negative = losses
  tradesToday: number;
  maxDailyTrades: number;
  lastTradeResult: "WIN" | "LOSS" | "BE" | null;
  tiltRisk: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  recommendations: string[];
}

const STORAGE_KEY = "diq.psychology";

function loadState(): PsychState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return {
    discipline: 75,
    patience: 70,
    confidence: 65,
    focus: 80,
    emotionalControl: 70,
    overallScore: 72,
    streak: 0,
    tradesToday: 0,
    maxDailyTrades: 5,
    lastTradeResult: null,
    tiltRisk: "LOW",
    recommendations: [],
  };
}

function computeTiltRisk(state: PsychState): PsychState["tiltRisk"] {
  let risk = 0;
  if (state.streak <= -3) risk += 40;
  else if (state.streak <= -2) risk += 20;
  if (state.tradesToday >= state.maxDailyTrades) risk += 30;
  if (state.emotionalControl < 40) risk += 25;
  if (state.discipline < 40) risk += 20;
  if (state.confidence < 30 || state.confidence > 90) risk += 15;

  if (risk >= 70) return "CRITICAL";
  if (risk >= 45) return "HIGH";
  if (risk >= 20) return "MODERATE";
  return "LOW";
}

function getRecommendations(state: PsychState): string[] {
  const recs: string[] = [];

  if (state.streak <= -3) {
    recs.push("🛑 Stop trading immediately — you're on a losing streak. Take a break.");
  }
  if (state.tradesToday >= state.maxDailyTrades) {
    recs.push("📊 Daily trade limit reached. Review your trades and stop for today.");
  }
  if (state.emotionalControl < 50) {
    recs.push(
      "🧘 Your emotional control is low. Do a 5-minute breathing exercise before your next trade.",
    );
  }
  if (state.confidence > 85) {
    recs.push("⚠️ Overconfidence detected. Stick to your plan — don't increase position sizes.");
  }
  if (state.confidence < 35) {
    recs.push("💪 Low confidence. Review your winning trades to rebuild conviction in your edge.");
  }
  if (state.patience < 40) {
    recs.push("⏳ Patience is low. Wait for A+ setups only — no forcing trades.");
  }
  if (state.discipline < 50) {
    recs.push("📋 Discipline dropping. Re-read your trading rules before the next trade.");
  }
  if (state.focus < 40) {
    recs.push("☕ Focus is low. Take a break, hydrate, and return with fresh eyes.");
  }
  if (recs.length === 0) {
    recs.push("✅ You're in a good mental state. Trust your process and execute with confidence.");
  }

  return recs;
}

export function PsychologyTracker() {
  const [state, setState] = useState<PsychState>(loadState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const tiltRisk = useMemo(() => computeTiltRisk(state), [state]);
  const recommendations = useMemo(() => getRecommendations(state), [state]);

  const updateMetric = (key: keyof PsychState, delta: number) => {
    setState((s) => {
      const val = (s[key] as number) + delta;
      const clamped = Math.max(0, Math.min(100, val));
      const updated = { ...s, [key]: clamped };
      updated.overallScore = Math.round(
        (updated.discipline +
          updated.patience +
          updated.confidence +
          updated.focus +
          updated.emotionalControl) /
          5,
      );
      updated.tiltRisk = computeTiltRisk(updated);
      return updated;
    });
  };

  const recordTrade = (result: "WIN" | "LOSS" | "BE") => {
    setState((s) => {
      const updated = { ...s };
      updated.lastTradeResult = result;
      updated.tradesToday++;

      if (result === "WIN") {
        updated.streak = Math.max(0, s.streak) + 1;
        updated.confidence = Math.min(100, s.confidence + 5);
        updated.discipline = Math.min(100, s.discipline + 3);
      } else if (result === "LOSS") {
        updated.streak = Math.min(0, s.streak) - 1;
        updated.confidence = Math.max(0, s.confidence - 8);
        updated.emotionalControl = Math.max(0, s.emotionalControl - 5);
        updated.patience = Math.max(0, s.patience - 3);
      }

      updated.overallScore = Math.round(
        (updated.discipline +
          updated.patience +
          updated.confidence +
          updated.focus +
          updated.emotionalControl) /
          5,
      );
      updated.tiltRisk = computeTiltRisk(updated);
      return updated;
    });
  };

  const resetDay = () => {
    setState((s) => ({
      ...s,
      tradesToday: 0,
      streak: 0,
      lastTradeResult: null,
      discipline: Math.min(100, s.discipline + 10),
      patience: Math.min(100, s.patience + 10),
      focus: Math.min(100, s.focus + 15),
      emotionalControl: Math.min(100, s.emotionalControl + 10),
    }));
  };

  const tiltColors = {
    LOW: "text-bull bg-bull/10 border-bull/30",
    MODERATE: "text-medium bg-medium/10 border-medium/30",
    HIGH: "text-bear bg-bear/10 border-bear/30",
    CRITICAL: "text-bear bg-bear/20 border-bear/50 animate-pulse",
  };

  const metrics = [
    { key: "discipline" as const, label: "Discipline", icon: Shield, value: state.discipline },
    { key: "patience" as const, label: "Patience", icon: Coffee, value: state.patience },
    { key: "confidence" as const, label: "Confidence", icon: TrendingUp, value: state.confidence },
    { key: "focus" as const, label: "Focus", icon: Eye, value: state.focus },
    {
      key: "emotionalControl" as const,
      label: "Emotional Control",
      icon: Heart,
      value: state.emotionalControl,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" /> Psychology Tracker
          </span>
          <Badge className={`${tiltColors[tiltRisk]} text-[10px]`}>
            {tiltRisk === "CRITICAL" && <AlertTriangle className="w-3 h-3 mr-1" />}
            TILT: {tiltRisk}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Overall score */}
        <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
          <div className="relative w-14 h-14">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-muted/50"
              />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className={
                  state.overallScore >= 70
                    ? "text-bull"
                    : state.overallScore >= 40
                      ? "text-medium"
                      : "text-bear"
                }
                strokeDasharray={`${state.overallScore * 0.97} 100`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold font-mono">{state.overallScore}</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold">Mental State Score</div>
            <div className="text-[10px] text-muted-foreground">
              Trades today: {state.tradesToday}/{state.maxDailyTrades} | Streak:{" "}
              {state.streak > 0 ? `+${state.streak}W` : state.streak < 0 ? `${state.streak}L` : "0"}
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="space-y-2">
          {metrics.map((m) => {
            const Icon = m.icon;
            const color = m.value >= 70 ? "bg-bull" : m.value >= 40 ? "bg-medium" : "bg-bear";
            return (
              <div key={m.key} className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-[10px] w-24 text-muted-foreground">{m.label}</span>
                <div className="flex-1 h-2 bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${color} rounded-full transition-all`}
                    style={{ width: `${m.value}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono w-8 text-right">{m.value}%</span>
                <div className="flex gap-0.5">
                  <button
                    onClick={() => updateMetric(m.key, -5)}
                    className="w-4 h-4 rounded bg-bear/20 text-bear text-[10px] hover:bg-bear/30"
                  >
                    -
                  </button>
                  <button
                    onClick={() => updateMetric(m.key, 5)}
                    className="w-4 h-4 rounded bg-bull/20 text-bull text-[10px] hover:bg-bull/30"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => recordTrade("WIN")}
            className="px-2 py-1 rounded text-[10px] bg-bull/10 border border-bull/30 text-bull hover:bg-bull/20"
          >
            Record Win
          </button>
          <button
            onClick={() => recordTrade("LOSS")}
            className="px-2 py-1 rounded text-[10px] bg-bear/10 border border-bear/30 text-bear hover:bg-bear/20"
          >
            Record Loss
          </button>
          <button
            onClick={() => recordTrade("BE")}
            className="px-2 py-1 rounded text-[10px] bg-muted border border-border text-muted-foreground hover:bg-accent"
          >
            Breakeven
          </button>
          <button
            onClick={resetDay}
            className="px-2 py-1 rounded text-[10px] bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 ml-auto"
          >
            <Sun className="w-3 h-3 inline mr-0.5" /> New Day
          </button>
        </div>

        {/* Recommendations */}
        <div className="space-y-1 pt-1 border-t border-border">
          {recommendations.map((rec, i) => (
            <div key={i} className="text-[10px] text-muted-foreground leading-relaxed">
              {rec}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
