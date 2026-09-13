import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Activity, Zap, CircleCheck, AlertCircle, Clock } from "lucide-react";

export interface AgentCardProps {
  name: string;
  description: string;
  status: "active" | "idle" | "training" | "error" | "disabled";
  accuracy?: number;
  lastRun?: number;
  version?: string;
  icon?: ReactNode;
  onClick?: () => void;
  className?: string;
}

const statusConfig = {
  active: {
    icon: <CircleCheck className="w-3 h-3" />,
    color: "text-bull",
    bg: "bg-bull/10",
    border: "border-bull/30",
    label: "Active",
  },
  idle: {
    icon: <Clock className="w-3 h-3" />,
    color: "text-muted-foreground",
    bg: "bg-muted/20",
    border: "border-border",
    label: "Idle",
  },
  training: {
    icon: <Activity className="w-3 h-3 animate-pulse" />,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/30",
    label: "Training",
  },
  error: {
    icon: <AlertCircle className="w-3 h-3" />,
    color: "text-bear",
    bg: "bg-bear/10",
    border: "border-bear/30",
    label: "Error",
  },
  disabled: {
    icon: <Clock className="w-3 h-3" />,
    color: "text-muted-foreground",
    bg: "bg-muted/10",
    border: "border-border/50",
    label: "Disabled",
  },
};

export function AgentCard({
  name,
  description,
  status,
  accuracy,
  lastRun,
  version,
  icon,
  onClick,
  className,
}: AgentCardProps) {
  const cfg = statusConfig[status];

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all hover:shadow-lg hover:border-primary/40 cursor-pointer",
        status === "training" && "ring-1 ring-amber-400/20",
        className,
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {icon || <Brain className="w-4 h-4 text-primary" />}
            <CardTitle className="text-sm">{name}</CardTitle>
          </div>
          <Badge
            variant="outline"
            className={cn("text-[9px] gap-1", cfg.color, cfg.bg, cfg.border)}
          >
            {cfg.icon}
            {cfg.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{description}</p>
        <div className="flex items-center justify-between text-[10px] font-mono">
          {accuracy !== undefined && (
            <span
              className={cn(
                "flex items-center gap-1",
                accuracy >= 70 ? "text-bull" : accuracy >= 50 ? "text-amber-400" : "text-bear",
              )}
            >
              <Zap className="w-2.5 h-2.5" />
              {accuracy.toFixed(1)}%
            </span>
          )}
          {version && <span className="text-muted-foreground">v{version}</span>}
          {lastRun && (
            <span className="text-muted-foreground">
              {Date.now() - lastRun < 60000 ? "just now" : new Date(lastRun).toLocaleTimeString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
