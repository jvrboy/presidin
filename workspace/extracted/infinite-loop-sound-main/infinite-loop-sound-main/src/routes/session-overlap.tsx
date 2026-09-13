import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useMemo } from "react";
import {
  Globe,
  Clock,
  Zap,
  TrendingUp,
  AlertTriangle,
  CircleCheck,
  Activity,
  Target,
  BarChart,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/session-overlap")({
  head: () => ({
    meta: [
      { title: "Session Overlap Detector — DivergenceIQ" },
      {
        name: "description",
        content:
          "Real-time forex session overlap detection with liquidity scoring and trade recommendations.",
      },
    ],
  }),
  component: SessionOverlapPage,
});

interface SessionDef {
  name: string;
  color: string;
  bgColor: string;
  openUTC: number; // hour
  closeUTC: number; // hour (can wrap past 24)
  pairs: string[];
  description: string;
}

const SESSIONS: SessionDef[] = [
  {
    name: "Sydney",
    color: "text-blue-400",
    bgColor: "bg-blue-500",
    openUTC: 21,
    closeUTC: 6,
    pairs: ["AUD/USD", "NZD/USD", "AUD/JPY"],
    description: "Low volatility, thin liquidity. Suitable for range strategies.",
  },
  {
    name: "Tokyo",
    color: "text-amber-400",
    bgColor: "bg-amber-500",
    openUTC: 0,
    closeUTC: 9,
    pairs: ["USD/JPY", "EUR/JPY", "AUD/JPY", "GBP/JPY"],
    description: "Moderate volatility. JPY pairs most active. Range-bound for EUR/USD.",
  },
  {
    name: "London",
    color: "text-violet-400",
    bgColor: "bg-violet-500",
    openUTC: 7,
    closeUTC: 16,
    pairs: ["EUR/USD", "GBP/USD", "EUR/GBP", "USD/CHF"],
    description: "Highest liquidity session. Major moves often begin here.",
  },
  {
    name: "New York",
    color: "text-bull",
    bgColor: "bg-bull",
    openUTC: 12,
    closeUTC: 21,
    pairs: ["EUR/USD", "GBP/USD", "USD/CAD", "USD/JPY"],
    description: "High volatility, especially during US economic releases.",
  },
];

interface OverlapInfo {
  sessions: string[];
  liquidityScore: number; // 0-100
  bestPairs: string[];
  recommendation: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
}

function getSessionProgress(
  session: SessionDef,
  utcHour: number,
  utcMin: number,
): { open: boolean; progress: number; minutesLeft: number } {
  const nowDecimal = utcHour + utcMin / 60;
  const { openUTC: o, closeUTC: c } = session;
  const wraps = o > c;

  let open: boolean;
  if (wraps) {
    open = nowDecimal >= o || nowDecimal < c;
  } else {
    open = nowDecimal >= o && nowDecimal < c;
  }

  const length = wraps ? 24 - o + c : c - o;
  let elapsed: number;
  if (wraps) {
    elapsed = nowDecimal >= o ? nowDecimal - o : 24 - o + nowDecimal;
  } else {
    elapsed = nowDecimal - o;
  }

  const progress = open ? Math.min(100, (elapsed / length) * 100) : 0;
  const remaining = open ? (length - elapsed) * 60 : 0;

  return { open, progress, minutesLeft: Math.max(0, Math.round(remaining)) };
}

function computeOverlap(utcHour: number, utcMin: number): OverlapInfo {
  const openSessions = SESSIONS.filter((s) => getSessionProgress(s, utcHour, utcMin).open);
  const names = openSessions.map((s) => s.name);

  // Liquidity score based on overlap
  let liquidityScore = 0;
  if (names.includes("London") && names.includes("New York")) liquidityScore = 100;
  else if (names.includes("Tokyo") && names.includes("London")) liquidityScore = 80;
  else if (names.includes("Sydney") && names.includes("Tokyo")) liquidityScore = 55;
  else if (names.includes("New York")) liquidityScore = 70;
  else if (names.includes("London")) liquidityScore = 75;
  else if (names.includes("Tokyo")) liquidityScore = 50;
  else if (names.includes("Sydney")) liquidityScore = 30;
  else liquidityScore = 10;

  // Best pairs from active sessions
  const pairSet = new Set<string>();
  openSessions.forEach((s) => s.pairs.forEach((p) => pairSet.add(p)));
  const bestPairs = Array.from(pairSet).slice(0, 5);

  let recommendation = "";
  let risk: "LOW" | "MEDIUM" | "HIGH" = "LOW";

  if (names.includes("London") && names.includes("New York")) {
    recommendation =
      "PRIME OVERLAP: London-NY overlap (12:00–16:00 UTC). Highest liquidity and volatility of the day. Ideal for breakout and momentum strategies on EUR/USD, GBP/USD.";
    risk = "HIGH";
  } else if (names.includes("Tokyo") && names.includes("London")) {
    recommendation =
      "ACTIVE OVERLAP: Tokyo-London overlap (07:00–09:00 UTC). EUR/JPY and GBP/JPY often see sharp moves. Good for breakout entries.";
    risk = "MEDIUM";
  } else if (names.includes("Sydney") && names.includes("Tokyo")) {
    recommendation =
      "LIGHT OVERLAP: Sydney-Tokyo overlap. AUD/JPY and NZD/USD most active. Suitable for range trading with tight stops.";
    risk = "LOW";
  } else if (openSessions.length === 1) {
    recommendation = `Single session (${names[0]}) open. ${openSessions[0].description}`;
    risk = names[0] === "London" || names[0] === "New York" ? "MEDIUM" : "LOW";
  } else if (openSessions.length === 0) {
    recommendation =
      "No major session open. Very thin liquidity — avoid trading or use wide stops. Watch for gap risk.";
    risk = "LOW";
  } else {
    recommendation = `${names.join(" + ")} sessions active. Monitor for confluence setups.`;
    risk = "MEDIUM";
  }

  return { sessions: names, liquidityScore, bestPairs, recommendation, risk };
}

// 24-hour liquidity profile (approximate scores per hour UTC)
const HOURLY_LIQUIDITY = [
  55, 50, 45, 40, 40, 38, 38, 65, 80, 80, 78, 75, 100, 100, 98, 95, 85, 75, 70, 70, 68, 65, 60, 58,
];

function SessionOverlapPage() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);

  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const utcSec = now.getUTCSeconds();

  const overlap = useMemo(() => computeOverlap(utcHour, utcMin), [utcHour, utcMin]);

  const sessionStates = useMemo(
    () => SESSIONS.map((s) => ({ ...s, ...getSessionProgress(s, utcHour, utcMin) })),
    [utcHour, utcMin],
  );

  const riskColors: Record<string, string> = {
    LOW: "bg-muted text-muted-foreground border-border",
    MEDIUM: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    HIGH: "bg-bull/10 border-bull/30 text-bull",
  };

  const liquidityColor =
    overlap.liquidityScore >= 80
      ? "text-bull"
      : overlap.liquidityScore >= 55
        ? "text-amber-400"
        : "text-muted-foreground";

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="w-6 h-6 text-primary" /> Session Overlap Detector
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time detection of high-liquidity session overlaps with trade recommendations.
          </p>
        </div>

        {/* Live Clock */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span className="font-mono text-foreground font-semibold">
            {String(utcHour).padStart(2, "0")}:{String(utcMin).padStart(2, "0")}:
            {String(utcSec).padStart(2, "0")} UTC
          </span>
          <span>·</span>
          <span>
            {now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </span>
        </div>

        {/* Overlap Status Banner */}
        <div className={`p-4 rounded-lg border flex items-start gap-3 ${riskColors[overlap.risk]}`}>
          {overlap.risk === "HIGH" ? (
            <Zap className="w-5 h-5 mt-0.5 shrink-0 text-bull" />
          ) : overlap.risk === "MEDIUM" ? (
            <Activity className="w-5 h-5 mt-0.5 shrink-0 text-amber-400" />
          ) : (
            <Info className="w-5 h-5 mt-0.5 shrink-0" />
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold">
                {overlap.sessions.length >= 2
                  ? `${overlap.sessions.join(" + ")} Overlap`
                  : overlap.sessions.length === 1
                    ? `${overlap.sessions[0]} Session`
                    : "Off-Hours"}
              </span>
              <Badge variant="outline" className={riskColors[overlap.risk]}>
                {overlap.risk} VOLATILITY
              </Badge>
            </div>
            <p className="text-xs leading-relaxed opacity-90">{overlap.recommendation}</p>
          </div>
        </div>

        {/* Liquidity Score + Best Pairs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart className="w-4 h-4 text-primary" /> Liquidity Score
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end gap-3">
                <span className={`text-5xl font-bold font-mono ${liquidityColor}`}>
                  {overlap.liquidityScore}
                </span>
                <span className="text-muted-foreground text-sm mb-1">/ 100</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    overlap.liquidityScore >= 80
                      ? "bg-bull"
                      : overlap.liquidityScore >= 55
                        ? "bg-amber-500"
                        : "bg-muted-foreground"
                  }`}
                  style={{ width: `${overlap.liquidityScore}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {overlap.liquidityScore >= 80
                  ? "Excellent liquidity. Tight spreads, fast execution expected."
                  : overlap.liquidityScore >= 55
                    ? "Moderate liquidity. Normal spreads. Suitable for most strategies."
                    : "Low liquidity. Expect wider spreads and slower fills."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" /> Best Pairs Right Now
              </CardTitle>
            </CardHeader>
            <CardContent>
              {overlap.bestPairs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active sessions — avoid trading.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {overlap.bestPairs.map((p) => (
                    <Badge
                      key={p}
                      variant="outline"
                      className="text-sm font-mono px-3 py-1.5 bg-primary/5 border-primary/30 text-primary"
                    >
                      {p}
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                These pairs have the highest expected liquidity based on currently open sessions.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Session Progress Bars */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Session Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {sessionStates.map((s) => (
              <div key={s.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${s.open ? s.bgColor : "bg-muted"}`} />
                    <span
                      className={`text-sm font-medium ${s.open ? s.color : "text-muted-foreground"}`}
                    >
                      {s.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {String(s.openUTC).padStart(2, "0")}:00 –{" "}
                      {String(s.closeUTC).padStart(2, "0")}:00 UTC
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.open ? (
                      <>
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-bull/10 text-bull border-bull/30"
                        >
                          OPEN
                        </Badge>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {Math.floor(s.minutesLeft / 60)}h {s.minutesLeft % 60}m left
                        </span>
                      </>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        CLOSED
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-1000 ${s.bgColor}`}
                    style={{ width: `${s.progress}%`, opacity: s.open ? 0.8 : 0.2 }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{s.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 24-Hour Liquidity Heatmap */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> 24-Hour Liquidity Profile (UTC)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-0.5 items-end h-16">
              {HOURLY_LIQUIDITY.map((score, hour) => {
                const isCurrent = hour === utcHour;
                const height = Math.max(8, (score / 100) * 100);
                const color =
                  score >= 80 ? "bg-bull" : score >= 55 ? "bg-amber-500" : "bg-muted-foreground/40";
                return (
                  <div
                    key={hour}
                    className="flex-1 flex flex-col items-center gap-0.5"
                    title={`${String(hour).padStart(2, "0")}:00 UTC — Liquidity: ${score}`}
                  >
                    <div
                      className={`w-full rounded-t transition-all ${color} ${isCurrent ? "ring-1 ring-white/50" : ""}`}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground font-mono mt-1">
              <span>00</span>
              <span>03</span>
              <span>06</span>
              <span>09</span>
              <span>12</span>
              <span>15</span>
              <span>18</span>
              <span>21</span>
              <span>23</span>
            </div>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-bull inline-block" /> High (≥80)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-amber-500 inline-block" /> Medium (55–79)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-muted-foreground/40 inline-block" /> Low
                (&lt;55)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-white/50 inline-block" /> Current hour
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Overlap Schedule */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CircleCheck className="w-4 h-4 text-primary" /> Key Overlap Windows (UTC)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  name: "Sydney + Tokyo",
                  time: "00:00 – 06:00",
                  score: 55,
                  pairs: "AUD/JPY, NZD/USD",
                  desc: "Light overlap. Range-bound conditions.",
                },
                {
                  name: "Tokyo + London",
                  time: "07:00 – 09:00",
                  score: 80,
                  pairs: "EUR/JPY, GBP/JPY",
                  desc: "Sharp moves possible. Watch for breakouts.",
                },
                {
                  name: "London + New York",
                  time: "12:00 – 16:00",
                  score: 100,
                  pairs: "EUR/USD, GBP/USD",
                  desc: "PRIME window. Highest daily volume and volatility.",
                },
              ].map((w) => {
                const isActive =
                  overlap.sessions.length >= 2 &&
                  w.name.split(" + ").every((n) => overlap.sessions.includes(n));
                return (
                  <div
                    key={w.name}
                    className={`p-3 rounded-lg border ${isActive ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-semibold ${isActive ? "text-primary" : ""}`}>
                        {w.name}
                      </span>
                      {isActive && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-primary/10 text-primary border-primary/30"
                        >
                          ACTIVE NOW
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground mb-1">{w.time}</div>
                    <div className="flex items-center gap-1 mb-1">
                      <div className="w-full bg-muted rounded-full h-1">
                        <div
                          className={`h-1 rounded-full ${w.score >= 80 ? "bg-bull" : "bg-amber-500"}`}
                          style={{ width: `${w.score}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono w-8">
                        {w.score}
                      </span>
                    </div>
                    <div className="text-[10px] text-primary/80 font-mono mb-1">{w.pairs}</div>
                    <p className="text-[10px] text-muted-foreground">{w.desc}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
