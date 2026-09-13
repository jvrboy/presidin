import {
  LayoutDashboard, Radio, Brain, FlaskConical, CandlestickChart,
  Calculator, MessageSquare, Music, Bell, Settings, Sparkles,
} from "lucide-react";
import type { Section } from "@/stores/presidin";

export interface NavItem {
  id: Section;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  category: "overview" | "intelligence" | "research" | "execution" | "studio" | "system";
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    shortLabel: "Home",
    icon: LayoutDashboard,
    category: "overview",
    description: "Equity, signals, agents, market overview",
  },
  {
    id: "signals",
    label: "Signals",
    shortLabel: "Signals",
    icon: Radio,
    category: "intelligence",
    description: "Multi-agent signal feed with drill-down",
  },
  {
    id: "agents",
    label: "Agents",
    shortLabel: "Agents",
    icon: Sparkles,
    category: "intelligence",
    description: "Configure 17 voting agents + MasterAgent",
  },
  {
    id: "ml",
    label: "Self-Learning ML",
    shortLabel: "ML",
    icon: Brain,
    category: "intelligence",
    description: "Model registry, drift, anomaly, shadow, explainability",
  },
  {
    id: "quant-lab",
    label: "Quant Lab",
    shortLabel: "Quant",
    icon: FlaskConical,
    category: "research",
    description: "Backtest, walk-forward, Monte Carlo, PBO, HRP",
  },
  {
    id: "risk",
    label: "Risk Calculators",
    shortLabel: "Risk",
    icon: Calculator,
    category: "research",
    description: "Position size, Kelly, Risk of Ruin, Fib, Pivots",
  },
  {
    id: "trading",
    label: "Live Trading",
    shortLabel: "Trade",
    icon: CandlestickChart,
    category: "execution",
    description: "Positions, orders, history, broker connect",
  },
  {
    id: "chat",
    label: "AI Assistant",
    shortLabel: "AI",
    icon: MessageSquare,
    category: "studio",
    description: "Multi-provider chat with BYOK",
  },
  {
    id: "audio",
    label: "VINNY Audio",
    shortLabel: "Audio",
    icon: Music,
    category: "studio",
    description: "Piano roll, mixer, FX, MIDI composer",
  },
  {
    id: "notifications",
    label: "Notifications",
    shortLabel: "Alerts",
    icon: Bell,
    category: "system",
    description: "Telegram, Discord, push, local alerts",
  },
  {
    id: "settings",
    label: "Settings",
    shortLabel: "Settings",
    icon: Settings,
    category: "system",
    description: "Theme, providers, API keys, brokers, account",
  },
];

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: NAV_ITEMS.filter((i) => i.category === "overview") },
  { label: "Intelligence", items: NAV_ITEMS.filter((i) => i.category === "intelligence") },
  { label: "Research", items: NAV_ITEMS.filter((i) => i.category === "research") },
  { label: "Execution", items: NAV_ITEMS.filter((i) => i.category === "execution") },
  { label: "Studio", items: NAV_ITEMS.filter((i) => i.category === "studio") },
  { label: "System", items: NAV_ITEMS.filter((i) => i.category === "system") },
];
