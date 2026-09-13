import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Trend = "up" | "down" | "flat";
type IconLike = React.ReactNode | React.ComponentType<{ className?: string }>;

const renderIcon = (icon: IconLike) => {
  if (!icon) return null;
  if (typeof icon === "function") {
    const Icon = icon;
    return <Icon className="h-4 w-4" />;
  }
  return icon;
};

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  trend?: Trend;
  delta?: string;
  icon?: IconLike;
  accent?: "primary" | "bull" | "bear" | "warning" | "neutral";
  className?: string;
}

const accentRing: Record<string, string> = {
  primary: "before:bg-primary/40",
  bull: "before:bg-bull/40",
  bear: "before:bg-bear/40",
  warning: "before:bg-warning/40",
  neutral: "before:bg-muted-foreground/30",
};

const trendColor: Record<Trend, string> = {
  up: "text-bull",
  down: "text-bear",
  flat: "text-muted-foreground",
};

export function StatTile({
  label,
  value,
  sub,
  trend,
  delta,
  icon,
  accent = "primary",
  className,
}: StatTileProps) {
  const iconNode = renderIcon(icon);
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/40",
        "before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l-xl",
        accentRing[accent],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 pl-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground truncate">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums leading-tight">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground truncate">{sub}</p>}
        </div>
        {iconNode && (
          <div className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">{iconNode}</div>
        )}
      </div>
      {delta && (
        <div className="mt-2 pl-2">
          <Badge
            variant="outline"
            className={cn("font-mono text-[10px]", trend && trendColor[trend])}
          >
            {trend === "up" ? "▲" : trend === "down" ? "▼" : "■"} {delta}
          </Badge>
        </div>
      )}
    </div>
  );
}

interface ProCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: IconLike;
  action?: React.ReactNode;
  glow?: boolean;
}

export function ProCard({
  title,
  description,
  icon,
  action,
  glow,
  className,
  children,
  ...props
}: ProCardProps) {
  const iconNode = renderIcon(icon);
  return (
    <div
      className={cn(
        "relative rounded-xl border border-border bg-card/90 backdrop-blur-sm shadow-sm",
        "transition-all hover:border-primary/40 hover:shadow-md",
        glow && "shadow-primary/10",
        className,
      )}
      {...props}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-border/60 p-4">
          <div className="flex items-start gap-3 min-w-0">
            {iconNode && (
              <div className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">{iconNode}</div>
            )}
            <div className="min-w-0">
              {title && <h3 className="font-semibold leading-tight truncate">{title}</h3>}
              {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

interface DataPanelProps {
  headers?: React.ReactNode[];
  rows?: React.ReactNode[][];
  empty?: React.ReactNode;
  dense?: boolean;
  className?: string;
  children?: React.ReactNode;
  title?: React.ReactNode;
  data?: unknown;
}

const renderData = (data: unknown) => {
  if (data == null) return null;
  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    return String(data);
  }
  return JSON.stringify(data, null, 2);
};

export function DataPanel({
  headers,
  rows,
  empty,
  dense,
  className,
  children,
  title,
  data,
}: DataPanelProps) {
  if (children) {
    return (
      <div className={cn("rounded-lg border border-border bg-card/60 p-4", className)}>
        {children}
      </div>
    );
  }

  if (data !== undefined) {
    return (
      <div className={cn("rounded-lg border border-border bg-card/60 p-4", className)}>
        {title && <div className="mb-2 text-sm font-semibold">{title}</div>}
        <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
          {renderData(data)}
        </pre>
      </div>
    );
  }

  const safeRows = rows ?? [];
  const safeHeaders = headers ?? [];
  if (safeRows.length === 0 && empty) {
    return (
      <div className={cn("text-sm text-muted-foreground p-4 text-center", className)}>{empty}</div>
    );
  }
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {safeHeaders.map((h, i) => (
              <th
                key={i}
                className={cn(
                  "font-medium text-muted-foreground whitespace-nowrap",
                  dense ? "px-2 py-1.5 text-[11px]" : "px-3 py-2 text-xs",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.map((r, ri) => (
            <tr key={ri} className="border-b border-border/40 transition-colors hover:bg-primary/5">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={cn(
                    "whitespace-nowrap",
                    dense ? "px-2 py-1.5 text-[11px]" : "px-3 py-2",
                  )}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface MeterBarProps {
  value: number;
  max?: number;
  label?: string;
  color?: "primary" | "bull" | "bear" | "warning";
  showValue?: boolean;
  suffix?: string;
  format?: (value: number) => React.ReactNode;
  className?: string;
}

const meterColor: Record<string, string> = {
  primary: "bg-primary",
  bull: "bg-bull",
  bear: "bg-bear",
  warning: "bg-warning",
};

export function MeterBar({
  value,
  max = 100,
  label,
  color = "primary",
  showValue,
  suffix = "%",
  format,
  className,
}: MeterBarProps) {
  const normalized = max > 0 ? (value / max) * 100 : value;
  const v = Math.max(0, Math.min(100, normalized));
  const display = format ? format(value) : `${value.toFixed(0)}${suffix}`;
  return (
    <div className={cn("w-full", className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-1">
          {label && <span className="text-xs text-muted-foreground">{label}</span>}
          {showValue && (
            <span className="text-xs font-mono font-semibold tabular-nums">{display}</span>
          )}
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", meterColor[color])}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

interface SectionHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: IconLike;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ title, subtitle, icon, action, className }: SectionHeaderProps) {
  const iconNode = renderIcon(icon);
  return (
    <div className={cn("flex items-end justify-between gap-3 flex-wrap", className)}>
      <div className="flex items-center gap-3 min-w-0">
        {iconNode && (
          <div className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">{iconNode}</div>
        )}
        <div className="min-w-0">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight truncate">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

interface KpiGridProps {
  tiles?: Omit<StatTileProps, "className">[];
  className?: string;
  children?: React.ReactNode;
}

export function KpiGrid({ tiles, className, children }: KpiGridProps) {
  return (
    <div className={cn("grid gap-3 grid-cols-2 lg:grid-cols-4", className)}>
      {children ?? tiles?.map((t, i) => <StatTile key={i} {...t} />)}
    </div>
  );
}
