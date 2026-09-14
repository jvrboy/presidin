import {
  LayoutDashboard, Radio, CandlestickChart, BookOpen, Calculator,
  MessageSquare, Music, Bell, Settings,
} from "lucide-react";
import type { Section } from "@/stores/presidin";

export interface NavItem {
  id: Section;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  category: "overview" | "execution" | "research" | "studio" | "system";
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    shortLabel: "Home",
    icon: LayoutDashboard,
    category: "overview",
    description: "Equity, signals, market overview, AI performance",
  },
  {
    id: "signals",
    label: "Signals",
    shortLabel: "Signals",
    icon: Radio,
    category: "overview",
    description: "Live multi-agent signal feed with auto-generation",
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
    id: "journal",
    label: "Trade Journal",
    shortLabel: "Journal",
    icon: BookOpen,
    category: "execution",
    description: "Log, analyze, and learn from historical trades",
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
    description: "AI providers, brokers, auto-signal, learning config",
  },
];

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: NAV_ITEMS.filter((i) => i.category === "overview") },
  { label: "Execution", items: NAV_ITEMS.filter((i) => i.category === "execution") },
  { label: "Research", items: NAV_ITEMS.filter((i) => i.category === "research") },
  { label: "Studio", items: NAV_ITEMS.filter((i) => i.category === "studio") },
  { label: "System", items: NAV_ITEMS.filter((i) => i.category === "system") },
];
