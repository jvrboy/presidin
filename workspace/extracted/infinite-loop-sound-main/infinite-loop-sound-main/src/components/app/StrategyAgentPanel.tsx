import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { ALL_AGENT_CONFIGS } from "../../lib/agents/orchestrator";
import { STRATEGY_CATALOG } from "../../lib/engine/strategies-v2";
import type { OrchestratorState } from "../../lib/agents/orchestrator";
import type { AgentResult } from "../../lib/agents/types";
import type { StrategyRecommendation } from "../../lib/agents/types";

interface Props {
  state: OrchestratorState;
  isRunning: boolean;
}

function AgentStatusBadge({ result }: { result?: AgentResult }) {
  if (!result) return <Badge variant="outline">Idle</Badge>;
  switch (result.status) {
    case "completed":
      return (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Active</Badge>
      );
    case "running":
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Running</Badge>;
    case "error":
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Alert</Badge>;
    default:
      return <Badge variant="outline">Idle</Badge>;
  }
}

function ConfidenceBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function StrategyAgentPanel({ state, isRunning }: Props) {
  const strategyResult = state.results["strategy-agent"];
  const riskResult = state.results["risk-agent"];
  const newsResult = state.results["news-agent"];
  const recommendations = (
    (strategyResult?.output?.recommendations as StrategyRecommendation[]) ?? []
  ).slice(0, 5);
  const insights = [
    ...(strategyResult?.insights ?? []),
    ...(riskResult?.insights ?? []),
    ...(newsResult?.insights ?? []),
  ];

  const assessment = newsResult?.output?.assessment as
    | { impactLevel: string; recommendedAction: string; affectedPairs: string[] }
    | undefined;

  const sOut = (strategyResult?.output ?? {}) as {
    direction?: string;
    buyScore?: number;
    sellScore?: number;
    hitCount?: number;
  };
  const buyScore = sOut.buyScore ?? 0;
  const sellScore = sOut.sellScore ?? 0;
  const hitCount = sOut.hitCount ?? 0;

  return (
    <div className="space-y-4">
      {/* Agent Status Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ALL_AGENT_CONFIGS.map((agent) => (
          <Card key={agent.id} className="bg-card/50 backdrop-blur border-border/50">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium truncate">{agent.name}</span>
                <AgentStatusBadge result={state.results[agent.id]} />
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-2">{agent.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Direction & Confidence */}
      {strategyResult && (
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Strategy Confluence</span>
              {isRunning && (
                <span className="text-xs text-blue-400 animate-pulse">Scanning...</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {strategyResult.output && (
              <>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div
                      className={`text-2xl font-bold ${
                        sOut.direction === "BUY"
                          ? "text-emerald-400"
                          : sOut.direction === "SELL"
                            ? "text-red-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {sOut.direction ?? "FLAT"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Direction</div>
                  </div>
                  <div className="flex-1 space-y-2">
                    <ConfidenceBar
                      value={buyScore / (buyScore + sellScore + 1)}
                      label="BUY Score"
                    />
                    <ConfidenceBar
                      value={sellScore / (buyScore + sellScore + 1)}
                      label="SELL Score"
                    />
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">{strategyResult.signals?.length ?? 0}</div>
                    <div className="text-[10px] text-muted-foreground">Active Hits</div>
                  </div>
                </div>
                {hitCount > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {hitCount} strategies analyzed, {recommendations.length} recommendations
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Top Recommendations */}
      {recommendations.length > 0 && (
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recommendations.map((rec, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30">
                  <Badge
                    variant={rec.direction === "BUY" ? "default" : "destructive"}
                    className="text-[10px]"
                  >
                    {rec.direction}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{rec.strategyName}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{rec.reason}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono">{(rec.confidence * 100).toFixed(0)}%</div>
                    {rec.session !== "any" && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                        {rec.session}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk Dashboard */}
      {riskResult && riskResult.output && (
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Risk Management</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {(riskResult.output.assessment as {
                kellyFraction: number;
                maxPositionSize: number;
                consecutiveLosses: number;
                shouldHalt: boolean;
                currentDailyPnL: number;
              }) && (
                <>
                  <div>
                    <div className="text-lg font-mono">
                      {(
                        (riskResult.output.assessment as { kellyFraction: number }).kellyFraction *
                        100
                      ).toFixed(2)}
                      %
                    </div>
                    <div className="text-[10px] text-muted-foreground">Kelly (Half)</div>
                  </div>
                  <div>
                    <div className="text-lg font-mono">
                      $
                      {(
                        riskResult.output.assessment as { maxPositionSize: number }
                      ).maxPositionSize.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Position Size</div>
                  </div>
                  <div>
                    <div
                      className={`text-lg font-mono ${(riskResult.output.assessment as { currentDailyPnL: number }).currentDailyPnL >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      $
                      {(
                        riskResult.output.assessment as { currentDailyPnL: number }
                      ).currentDailyPnL.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Daily P&L</div>
                  </div>
                  <div>
                    <div className="text-lg font-mono">
                      {
                        (riskResult.output.assessment as { consecutiveLosses: number })
                          .consecutiveLosses
                      }
                    </div>
                    <div className="text-[10px] text-muted-foreground">Consec. Losses</div>
                  </div>
                </>
              )}
            </div>
            {(riskResult.output.assessment as { shouldHalt: boolean }).shouldHalt && (
              <div className="mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center font-medium">
                TRADING HALTED — Risk limit reached
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* News Impact */}
      {assessment && (
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              News Intelligence
              <Badge
                variant={
                  assessment.impactLevel === "high"
                    ? "destructive"
                    : assessment.impactLevel === "medium"
                      ? "default"
                      : "outline"
                }
                className="text-[10px]"
              >
                {assessment.impactLevel.toUpperCase()} IMPACT
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground mb-2">
              Action:{" "}
              <span className="text-foreground font-medium">
                {assessment.recommendedAction.toUpperCase()}
              </span>
              {assessment.affectedPairs.length > 0 && (
                <span> — {assessment.affectedPairs.length} pairs affected</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Strategy Catalog */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Strategy Catalog (8 New + 6 Legacy)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {STRATEGY_CATALOG.map((s) => (
              <div
                key={s.id}
                className="p-2 rounded-lg bg-secondary/20 border border-border/30 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{s.name}</span>
                  <Badge variant="outline" className="text-[9px]">
                    {s.timeframe}
                  </Badge>
                </div>
                <div className="flex gap-2 text-[10px] text-muted-foreground">
                  {s.winRate.night != null && <span>N: {s.winRate.night}%</span>}
                  {s.winRate.day != null && <span>D: {s.winRate.day}%</span>}
                  {s.profitFactor.night != null && <span>PF: {s.profitFactor.night}x</span>}
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-2">{s.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Insights Feed */}
      {insights.length > 0 && (
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Agent Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {insights.map((insight, i) => (
                <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">•</span>
                  <span>{insight}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
