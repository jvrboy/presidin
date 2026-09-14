"use client";

import { Sidebar, TopBar } from "@/components/presidin/app-shell";
import { useUIStore } from "@/stores/presidin";
import { DashboardSection } from "@/sections/dashboard";
import { SignalsSection } from "@/sections/signals";
import { TradingSection } from "@/sections/trading";
import { JournalSection } from "@/sections/journal";
import { RiskSection } from "@/sections/risk";
import { ChatSection } from "@/sections/chat";
import { AudioSection } from "@/sections/audio";
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
            {section === "trading" && <TradingSection />}
            {section === "journal" && <JournalSection />}
            {section === "risk" && <RiskSection />}
            {section === "chat" && <ChatSection />}
            {section === "audio" && <AudioSection />}
            {section === "notifications" && <NotificationsSection />}
            {section === "settings" && <SettingsSection />}
          </div>
        </main>
      </div>
    </div>
  );
}
