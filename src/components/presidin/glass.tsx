"use client";

import { cn } from "@/lib/utils";
import { forwardRef, type HTMLAttributes } from "react";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "strong";
  veil?: boolean;
}

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, variant = "default", veil = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        variant === "strong" ? "glass-panel-strong" : "glass-panel",
        veil && "aurora-veil",
        "p-4 md:p-6",
        className
      )}
      {...props}
    />
  )
);
GlassPanel.displayName = "GlassPanel";

interface LiquidProgressProps {
  value: number; // 0..100
  className?: string;
}

export function LiquidProgress({ value, className }: LiquidProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("liquid-progress h-2 w-full", className)}>
      <div
        className="liquid-progress-fill"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButton> {
  children: React.ReactNode;
}

export const ShimmerButton = forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  ({ className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "shimmer-btn inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);
ShimmerButton.displayName = "ShimmerButton";

interface PulseDotProps {
  variant?: "bull" | "bear" | "neutral";
  className?: string;
}

export function PulseDot({ variant = "bull", className }: PulseDotProps) {
  return (
    <span
      className={cn(
        "pulse-dot",
        variant === "bear" && "bear",
        variant === "neutral" && "neutral",
        className
      )}
    />
  );
}

interface LiquidOrbProps {
  size?: number;
  className?: string;
}

export function LiquidOrb({ size = 80, className }: LiquidOrbProps) {
  return (
    <div
      className={cn("liquid-orb", className)}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}

interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: string;
  deltaType?: "up" | "down" | "neutral";
  icon?: React.ReactNode;
  className?: string;
}

export function KpiCard({ label, value, delta, deltaType = "neutral", icon, className }: KpiCardProps) {
  const deltaColor =
    deltaType === "up" ? "text-emerald-400"
    : deltaType === "down" ? "text-rose-400"
    : "text-slate-400";
  return (
    <GlassPanel className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wide">{label}</span>
        {icon && <span className="opacity-70">{icon}</span>}
      </div>
      <div className="tnum text-2xl font-semibold tracking-tight">{value}</div>
      {delta && (
        <div className={cn("tnum text-xs font-medium", deltaColor)}>{delta}</div>
      )}
    </GlassPanel>
  );
}

interface DirectionBadgeProps {
  direction: "BUY" | "SELL" | "NEUTRAL";
  className?: string;
}

export function DirectionBadge({ direction, className }: DirectionBadgeProps) {
  const styles =
    direction === "BUY"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : direction === "SELL"
      ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
      : "bg-slate-500/15 text-slate-300 border-slate-500/30";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold tracking-wider",
        styles,
        className
      )}
    >
      <PulseDot
        variant={direction === "BUY" ? "bull" : direction === "SELL" ? "bear" : "neutral"}
        className="!h-1.5 !w-1.5"
      />
      {direction}
    </span>
  );
}

interface ConfidenceMeterProps {
  value: number; // 0..100
  label?: string;
  showValue?: boolean;
  className?: string;
}

export function ConfidenceMeter({ value, label, showValue = true, className }: ConfidenceMeterProps) {
  const v = Math.max(0, Math.min(100, value));
  const hue = v > 70 ? 152 : v > 50 ? 200 : v > 30 ? 280 : 0;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          {showValue && <span className="tnum font-semibold">{v.toFixed(0)}%</span>}
        </div>
      )}
      <div className="liquid-progress h-1.5 w-full">
        <div
          className="liquid-progress-fill"
          style={{
            width: `${v}%`,
            background: `linear-gradient(90deg, hsl(${hue} 80% 55%), hsl(${hue + 40} 80% 60%))`,
          }}
        />
      </div>
    </div>
  );
}

interface SectionTitleProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
}

export function SectionTitle({ title, subtitle, icon, right }: SectionTitleProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 via-violet-500/15 to-cyan-500/20 text-violet-300 ring-1 ring-violet-500/30">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
          {subtitle && (
            <p className="text-xs text-muted-foreground md:text-sm">{subtitle}</p>
          )}
        </div>
      </div>
      {right}
    </div>
  );
}

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function Sparkline({ data, width = 120, height = 32, color = "#a78bfa", className }: SparklineProps) {
  if (data.length < 2) return <svg width={width} height={height} className={className} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`)
    .join(" ");
  const last = data[data.length - 1];
  const lastX = width;
  const lastY = height - ((last - min) / range) * height;
  return (
    <svg width={width} height={height} className={className}>
      <defs>
        <linearGradient id={`spark-${color}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <polygon
        points={`0,${height} ${pts} ${width},${height}`}
        fill={`url(#spark-${color})`}
      />
      <circle cx={lastX} cy={lastY} r="2" fill={color} />
    </svg>
  );
}

interface AgentVoteBarProps {
  direction: "BUY" | "SELL" | "NEUTRAL";
  confidence: number;
  weight: number;
  label: string;
  reasoning?: string;
}

export function AgentVoteBar({ direction, confidence, weight, label, reasoning }: AgentVoteBarProps) {
  const isBuy = direction === "BUY";
  const isSell = direction === "SELL";
  const color = isBuy ? "bg-emerald-500" : isSell ? "bg-rose-500" : "bg-slate-500";
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-32 shrink-0 text-xs font-medium text-foreground/80 truncate">{label}</div>
      <div className="relative flex-1 h-2 rounded-full bg-secondary/60 overflow-hidden">
        <div
          className={`absolute top-0 left-1/2 h-full ${color}`}
          style={{
            width: `${(confidence / 100) * 50}%`,
            transform: isBuy ? "translateX(0)" : isSell ? "translateX(-100%)" : "translateX(-50%)",
          }}
        />
        <div className="absolute top-0 left-1/2 h-full w-px bg-foreground/30" />
      </div>
      <div className="w-10 shrink-0 text-right tnum text-xs text-muted-foreground">{weight.toFixed(1)}x</div>
      <div className="w-12 shrink-0 text-right tnum text-xs font-semibold">{confidence.toFixed(0)}%</div>
    </div>
  );
}
