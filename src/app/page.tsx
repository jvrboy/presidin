"use client";

import { Sidebar, TopBar } from "@/components/presidin/app-shell";
import { useUIStore } from "@/stores/presidin";
import { DashboardSection } from "@/sections/dashboard";
import { SignalsSection } from "@/sections/signals";
import { AgentsSection } from "@/sections/agents";
import { MlSection } from "@/sections/ml";
import { QuantLabSection } from "@/sections/quant-lab";
import { TradingSection } from "@/sections/trading";
import { RiskSection } from "@/sections/risk";
import { NewsSection } from "@/sections/news";
import { ToolsSection } from "@/sections/tools";
import { ChatSection } from "@/sections/chat";
import { AudioSection } from "@/sections/audio";
import { BackendSection } from "@/sections/backend";
import { NotificationsSection } from "@/sections/notifications";
import { SettingsSection } from "@/sections/settings";

export default function Home() {
  const section = useUIStore((s) => s.section);
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto scroll-fancy p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {section === "dashboard" && <DashboardSection />}
            {section === "signals" && <SignalsSection />}
            {section === "agents" && <AgentsSection />}
            {section === "ml" && <MlSection />}
            {section === "quant-lab" && <QuantLabSection />}
            {section === "trading" && <TradingSection />}
            {section === "risk" && <RiskSection />}
            {section === "news" && <NewsSection />}
            {section === "tools" && <ToolsSection />}
            {section === "chat" && <ChatSection />}
            {section === "audio" && <AudioSection />}
            {section === "backend" && <BackendSection />}
            {section === "notifications" && <NotificationsSection />}
            {section === "settings" && <SettingsSection />}
          </div>
        </main>
      </div>
    </div>
  );
}
