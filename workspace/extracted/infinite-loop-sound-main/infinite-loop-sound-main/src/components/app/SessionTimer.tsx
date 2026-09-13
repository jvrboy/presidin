import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import type { SessionInfo } from "../../hooks/use-session-timer";

interface Props {
  info: SessionInfo | null;
}

export function SessionTimer({ info }: Props) {
  if (!info) return null;

  const sessionColor =
    info.session === "night"
      ? "from-indigo-500/20 to-purple-500/20 border-indigo-500/30"
      : "from-amber-500/20 to-orange-500/20 border-amber-500/30";

  const sessionBadge =
    info.session === "night"
      ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30"
      : "bg-amber-500/20 text-amber-400 border-amber-500/30";

  return (
    <Card className={`bg-gradient-to-r ${sessionColor} border`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge className={sessionBadge}>
              {info.session === "night" ? "🌙 NIGHT" : "☀️ DAY"} SESSION
            </Badge>
            {info.isTransition && (
              <Badge
                variant="outline"
                className="text-[10px] animate-pulse text-yellow-400 border-yellow-500/30"
              >
                TRANSITIONING → {info.nextSession.toUpperCase()}
              </Badge>
            )}
          </div>
          <div className="text-right">
            <div className="text-sm font-mono">{info.sastTime}</div>
            <div className="text-[10px] text-muted-foreground">{info.utcTime}</div>
          </div>
        </div>

        <Progress value={info.sessionProgress} className="h-1 mb-2" />

        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="p-1.5 rounded bg-background/20">
            <div className="text-muted-foreground">Night Avg TP/SL Hit</div>
            <div className="font-mono text-indigo-400">{info.nightStats.avgTPSLHitRate}%</div>
            <div className="text-muted-foreground">
              Best: {info.nightStats.bestPair} (+{info.nightStats.netPips} pips)
            </div>
          </div>
          <div className="p-1.5 rounded bg-background/20">
            <div className="text-muted-foreground">Day Avg TP/SL Hit</div>
            <div className="font-mono text-amber-400">{info.dayStats.avgTPSLHitRate}%</div>
            <div className="text-muted-foreground">
              Best: {info.dayStats.bestPair} (+{info.dayStats.netPips} pips)
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
