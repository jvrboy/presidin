"use client";

import { useState } from "react";
import { useUIStore, useAccountStore, useEngineConfigStore } from "@/stores/presidin";
import { NAV_GROUPS } from "./nav-items";
import { cn } from "@/lib/utils";
import { Menu, X, ChevronRight, Activity } from "lucide-react";
import { LiquidOrb } from "./glass";
import { formatCurrency } from "@/lib/presidin/symbols";

export function Sidebar() {
  const { section, setSection, sidebarOpen, setSidebar } = useUIStore();
  const equity = useAccountStore((s) => s.equity);
  const openPnl = useAccountStore((s) => s.openPnl);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside
        className={cn(
          "fixed z-40 inset-y-0 left-0 flex flex-col transition-all duration-300 md:relative md:translate-x-0",
          collapsed ? "md:w-16" : "md:w-64",
          "w-64",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          background: "linear-gradient(180deg, hsl(var(--sidebar) / 0.95), hsl(var(--sidebar) / 0.85))",
          backdropFilter: "blur(24px) saturate(160%)",
          borderRight: "1px solid hsl(var(--sidebar-border))",
        }}
      >
        {/* Brand */}
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-3">
          <div className="flex items-center gap-2">
            <LiquidOrb size={28} />
            {!collapsed && (
              <div className="flex flex-col leading-none">
                <span className="text-base font-bold tracking-[0.18em] bg-gradient-to-r from-indigo-300 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
                  PRESIDIN
                </span>
                <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                  Unified Trading Intel
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setSidebar(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent md:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent md:inline-flex"
            aria-label="Collapse sidebar"
          >
            <ChevronRight className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto scroll-fancy py-3 no-scrollbar">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-3">
              {!collapsed && (
                <div className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5 px-2">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = section === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSection(item.id)}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all",
                        active
                          ? "nav-item-active"
                          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                      )}
                    >
                      <Icon className={cn("nav-icon h-4 w-4 shrink-0 transition-colors", active && "text-violet-300")} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Equity summary */}
        {!collapsed && (
          <div className="border-t border-sidebar-border p-3">
            <div className="rounded-xl bg-gradient-to-br from-violet-500/10 via-indigo-500/5 to-cyan-500/10 p-3 ring-1 ring-violet-500/20">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Equity</span>
                <Activity className="h-3 w-3 text-emerald-400" />
              </div>
              <div className="tnum mt-1 text-lg font-bold tracking-tight">
                {formatCurrency(equity)}
              </div>
              <div className={cn(
                "tnum text-xs font-medium",
                openPnl >= 0 ? "text-emerald-400" : "text-rose-400"
              )}>
                {openPnl >= 0 ? "+" : ""}{formatCurrency(openPnl)} open P&L
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

export function TopBar() {
  const { toggleSidebar, section } = useUIStore();
  const equity = useAccountStore((s) => s.equity);
  const engineEnabled = useEngineConfigStore((s) => s.enabled);
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/60 bg-background/60 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent md:hidden"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden items-center gap-2 md:flex">
          <span className="text-sm font-semibold capitalize">{section.replace("-", " ")}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className={`hidden items-center gap-2 rounded-full px-3 py-1 text-xs ring-1 sm:flex ${
          engineEnabled ? "bg-emerald-500/10 ring-emerald-500/20" : "bg-slate-500/10 ring-slate-500/20"
        }`}>
          <span className={`pulse-dot ${engineEnabled ? "" : "neutral"}`} />
          <span className={`font-medium ${engineEnabled ? "text-emerald-300" : "text-slate-400"}`}>
            {engineEnabled ? "Engine On" : "Engine Off"}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="tnum text-muted-foreground">{formatCurrency(equity)}</span>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-xs font-bold text-white shadow-lg shadow-violet-500/30">
          P
        </div>
      </div>
    </header>
  );
}
