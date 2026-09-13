import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Clock, Globe, Activity } from "lucide-react";

export interface SessionActivity {
  hour: number; // 0-23 UTC
  session: "sydney" | "tokyo" | "london" | "new_york" | "overlap";
  avgVolatility: number; // normalized 0-100
  avgVolume: number; // normalized 0-100
  tradeCount: number;
  winRate: number;
}

interface Props {
  data?: SessionActivity[];
  currentHourUTC?: number;
  timezone?: string;
}

const SESSIONS = [
  {
    id: "sydney",
    label: "Sydney",
    start: 22,
    end: 7,
    color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  },
  {
    id: "tokyo",
    label: "Tokyo",
    start: 0,
    end: 9,
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  {
    id: "london",
    label: "London",
    start: 7,
    end: 16,
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  {
    id: "new_york",
    label: "New York",
    start: 13,
    end: 22,
    color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
];

const OVERLAPS = [
  { label: "Tokyo/London", start: 7, end: 9, intensity: 70 },
  { label: "London/NY", start: 13, end: 16, intensity: 100 },
];

// Generate default session activity data
function generateDefaultData(): SessionActivity[] {
  const data: SessionActivity[] = [];
  for (let h = 0; h < 24; h++) {
    let session: SessionActivity["session"] = "sydney";
    let vol = 20;
    let volume = 15;

    // London/NY overlap — highest volatility
    if (h >= 13 && h < 16) {
      session = "overlap";
      vol = 85 + Math.random() * 15;
      volume = 90 + Math.random() * 10;
    }
    // London session
    else if (h >= 7 && h < 13) {
      session = "london";
      vol = 55 + Math.random() * 25;
      volume = 60 + Math.random() * 20;
    }
    // NY session
    else if (h >= 16 && h < 22) {
      session = "new_york";
      vol = 45 + Math.random() * 20;
      volume = 50 + Math.random() * 15;
    }
    // Tokyo session
    else if (h >= 0 && h < 7) {
      session = "tokyo";
      vol = 30 + Math.random() * 15;
      volume = 25 + Math.random() * 15;
    }
    // Sydney
    else {
      session = "sydney";
      vol = 15 + Math.random() * 10;
      volume = 10 + Math.random() * 10;
    }

    data.push({
      hour: h,
      session,
      avgVolatility: Math.round(vol),
      avgVolume: Math.round(volume),
      tradeCount: Math.round(vol / 10),
      winRate: 45 + Math.random() * 25,
    });
  }
  return data;
}

export function SessionsHeatmap({ data, currentHourUTC, timezone = "UTC" }: Props) {
  const activityData = data ?? generateDefaultData();
  const nowHour = currentHourUTC ?? new Date().getUTCHours();

  const activeSession = useMemo(() => {
    for (const overlap of OVERLAPS) {
      if (nowHour >= overlap.start && nowHour < overlap.end) {
        return { label: overlap.label + " Overlap", isOverlap: true };
      }
    }
    for (const s of SESSIONS) {
      if (s.start < s.end) {
        if (nowHour >= s.start && nowHour < s.end) return { label: s.label, isOverlap: false };
      } else {
        if (nowHour >= s.start || nowHour < s.end) return { label: s.label, isOverlap: false };
      }
    }
    return { label: "Off-Hours", isOverlap: false };
  }, [nowHour]);

  const getHeatColor = (value: number) => {
    if (value >= 80) return "bg-bull/70";
    if (value >= 60) return "bg-bull/45";
    if (value >= 40) return "bg-primary/35";
    if (value >= 20) return "bg-muted-foreground/20";
    return "bg-muted/30";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" /> Market Sessions
          </span>
          <Badge
            className={
              activeSession.isOverlap
                ? "bg-bull/20 text-bull border-bull/30 text-[10px]"
                : "bg-primary/20 text-primary border-primary/30 text-[10px]"
            }
          >
            <Activity className="w-3 h-3 mr-1" />
            {activeSession.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Session bars */}
        <div className="space-y-1">
          {SESSIONS.map((s) => {
            const isActive = (() => {
              if (s.start < s.end) return nowHour >= s.start && nowHour < s.end;
              return nowHour >= s.start || nowHour < s.end;
            })();
            return (
              <div key={s.id} className="flex items-center gap-2">
                <span
                  className={`text-[10px] w-16 font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {s.label}
                </span>
                <div className="flex-1 h-3 bg-muted/30 rounded-full overflow-hidden relative">
                  {/* Session range bar */}
                  <div
                    className={`absolute h-full rounded-full transition-all ${
                      isActive ? "opacity-100" : "opacity-40"
                    } ${s.color.split(" ")[0]}`}
                    style={{
                      left: `${(s.start / 24) * 100}%`,
                      width: `${((s.end > s.start ? s.end - s.start : 24 - s.start + s.end) / 24) * 100}%`,
                    }}
                  />
                  {/* Current time marker */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-foreground/80 z-10"
                    style={{ left: `${(nowHour / 24) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground w-12 text-right">
                  {String(s.start).padStart(2, "0")}–{String(s.end).padStart(2, "0")}
                </span>
              </div>
            );
          })}
        </div>

        {/* Hourly heatmap */}
        <div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Hourly Volatility Heatmap (UTC)
          </div>
          <div className="grid grid-cols-12 gap-0.5">
            {activityData.slice(0, 12).map((d, i) => (
              <div
                key={i}
                className={`h-6 rounded-sm flex items-center justify-center relative ${getHeatColor(d.avgVolatility)} ${
                  i === nowHour ? "ring-1 ring-foreground" : ""
                }`}
                title={`${String(i).padStart(2, "0")}:00 — Vol: ${d.avgVolatility}%`}
              >
                <span className="text-[8px] font-mono opacity-70">{i}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-12 gap-0.5 mt-0.5">
            {activityData.slice(12, 24).map((d, i) => (
              <div
                key={i + 12}
                className={`h-6 rounded-sm flex items-center justify-center relative ${getHeatColor(d.avgVolatility)} ${
                  i + 12 === nowHour ? "ring-1 ring-foreground" : ""
                }`}
                title={`${String(i + 12).padStart(2, "0")}:00 — Vol: ${d.avgVolatility}%`}
              >
                <span className="text-[8px] font-mono opacity-70">{i + 12}</span>
              </div>
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[8px] text-muted-foreground">Low</span>
            <div className="flex gap-0.5">
              <div className="w-3 h-2 rounded-sm bg-muted/30" />
              <div className="w-3 h-2 rounded-sm bg-muted-foreground/20" />
              <div className="w-3 h-2 rounded-sm bg-primary/35" />
              <div className="w-3 h-2 rounded-sm bg-bull/45" />
              <div className="w-3 h-2 rounded-sm bg-bull/70" />
            </div>
            <span className="text-[8px] text-muted-foreground">High</span>
          </div>
        </div>

        {/* Best trading hours */}
        <div className="p-2 rounded bg-bull/5 border border-bull/20">
          <div className="text-[9px] text-bull uppercase tracking-wider font-semibold mb-1">
            Optimal Trading Windows
          </div>
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            <div>
              🟢 <strong>13:00–16:00 UTC</strong> — London/NY overlap (highest liquidity)
            </div>
            <div>
              🟡 <strong>07:00–09:00 UTC</strong> — Tokyo/London overlap
            </div>
            <div>
              🔵 <strong>08:00–12:00 UTC</strong> — London session peak
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
