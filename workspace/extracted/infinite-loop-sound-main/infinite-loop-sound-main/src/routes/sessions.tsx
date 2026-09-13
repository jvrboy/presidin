import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Clock, Globe } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/sessions")({
  head: () => ({ meta: [{ title: "Market Sessions — DivergenceIQ" }] }),
  component: SessionsPage,
});

const SESSIONS = [
  {
    name: "Sydney",
    start: 22,
    end: 7,
    color: "bg-blue-500",
    border: "border-blue-500",
    text: "text-blue-500",
  },
  {
    name: "Tokyo",
    start: 23,
    end: 8,
    color: "bg-purple-500",
    border: "border-purple-500",
    text: "text-purple-500",
  },
  {
    name: "London",
    start: 8,
    end: 17,
    color: "bg-green-500",
    border: "border-green-500",
    text: "text-green-500",
  },
  {
    name: "New York",
    start: 13,
    end: 22,
    color: "bg-orange-500",
    border: "border-orange-500",
    text: "text-orange-500",
  },
];

function SessionsPage() {
  const getSASTHour = (d: Date) => (d.getUTCHours() + 2) % 24;

  const [utcHour, setUtcHour] = useState(new Date().getUTCHours());
  const [utcMin, setUtcMin] = useState(new Date().getUTCMinutes());
  const [sastHour, setSastHour] = useState(getSASTHour(new Date()));

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setUtcHour(d.getUTCHours());
      setUtcMin(d.getUTCMinutes());
      setSastHour(getSASTHour(d));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const isActive = (start: number, end: number) => {
    if (start < end) return utcHour >= start && utcHour < end;
    return utcHour >= start || utcHour < end; // Crosses midnight
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="w-6 h-6 text-primary" /> Global Market Sessions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track active trading hours and session overlaps worldwide.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-card border border-border p-4 rounded-lg">
          <Clock className="w-5 h-5 text-muted-foreground" />
          <div className="font-mono text-xl font-bold">
            {sastHour.toString().padStart(2, "0")}:{utcMin.toString().padStart(2, "0")}{" "}
            <span className="text-sm text-muted-foreground">SAST</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {SESSIONS.map((s) => {
            const active = isActive(s.start, s.end);
            return (
              <div
                key={s.name}
                className={`p-5 rounded-lg border ${active ? s.border + " shadow-[0_0_15px_rgba(0,0,0,0.1)] shadow-" + s.color.replace("bg-", "") : "border-border bg-card/50 opacity-60"}`}
              >
                <div className="flex justify-between items-center mb-3">
                  <h3 className={`font-bold text-lg ${active ? s.text : "text-muted-foreground"}`}>
                    {s.name}
                  </h3>
                  {active && <span className="pulse-dot">ACTIVE</span>}
                </div>
                <div className="font-mono text-sm text-muted-foreground">
                  {((s.start + 2) % 24).toString().padStart(2, "0")}:00 -{" "}
                  {((s.end + 2) % 24).toString().padStart(2, "0")}:00 SAST
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-card border border-border rounded-lg p-6 overflow-hidden hidden md:block">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-6">
            24-Hour Timeline (SAST)
          </h3>
          <div className="relative pt-4 pb-8">
            <div className="flex justify-between text-xs text-muted-foreground font-mono mb-2">
              {Array.from({ length: 25 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center relative">
                  <span>{((i + 2) % 24).toString().padStart(2, "0")}</span>
                  <div className="h-2 w-px bg-border mt-1"></div>
                </div>
              ))}
            </div>

            <div className="relative h-32 w-[calc(100%-2rem)] mx-auto mt-4 border-l border-r border-border">
              {/* Current Time Indicator */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 transition-all duration-1000"
                style={{ left: `${((utcHour + utcMin / 60) / 24) * 100}%` }}
              >
                <div className="absolute -top-3 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-mono px-1 rounded">
                  NOW
                </div>
              </div>

              {SESSIONS.map((s, idx) => {
                const segments = [];
                if (s.start < s.end) {
                  segments.push({ start: s.start, end: s.end });
                } else {
                  segments.push({ start: s.start, end: 24 });
                  segments.push({ start: 0, end: s.end });
                }

                return segments.map((seg, i) => (
                  <div
                    key={`${s.name}-${i}`}
                    className={`absolute h-6 rounded ${s.color} opacity-80`}
                    style={{
                      top: `${idx * 32}px`,
                      left: `${(seg.start / 24) * 100}%`,
                      width: `${((seg.end - seg.start) / 24) * 100}%`,
                    }}
                  >
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white shadow-sm mix-blend-overlay">
                      {s.name}
                    </span>
                  </div>
                ));
              })}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
