import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { ListChecks, Plus, Trash } from "lucide-react";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/plan")({
  head: () => ({ meta: [{ title: "Trading Plan — DivergenceIQ" }] }),
  component: PlanPage,
});

const DEFAULT_PLAN = [
  { id: 1, text: "Is there High Impact News in the next 30 mins?", checked: false, critical: true },
  { id: 2, text: "Is the setup aligning with the H4/D1 Trend?", checked: false, critical: true },
  {
    id: 3,
    text: "Are there at least 3 indicators showing confluence?",
    checked: false,
    critical: false,
  },
  { id: 4, text: "Is the Risk to Reward ratio at least 1:2?", checked: false, critical: true },
  { id: 5, text: "Am I risking 1% or less of my account?", checked: false, critical: true },
];

function PlanPage() {
  const [items, setItems] = useState(DEFAULT_PLAN);
  const [newItem, setNewItem] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("trading_plan");
    if (saved) {
      try {
        setItems(JSON.parse(saved));
      } catch {}
    }
  }, []);

  const save = (newItems: typeof items) => {
    setItems(newItems);
    localStorage.setItem("trading_plan", JSON.stringify(newItems));
  };

  const toggle = (id: number) => {
    save(items.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)));
  };

  const remove = (id: number) => {
    save(items.filter((item) => item.id !== id));
  };

  const add = () => {
    if (!newItem.trim()) return;
    save([...items, { id: Date.now(), text: newItem.trim(), checked: false, critical: false }]);
    setNewItem("");
  };

  const resetChecks = () => {
    save(items.map((item) => ({ ...item, checked: false })));
  };

  const progress = items.length
    ? Math.round((items.filter((i) => i.checked).length / items.length) * 100)
    : 0;
  const criticalPassed = items.filter((i) => i.critical && !i.checked).length === 0;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <ListChecks className="w-6 h-6 text-primary" /> Pre-Trade Checklist
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Run through your custom rules before entering any position.
          </p>
        </div>

        <div className="bg-card border border-border p-6 rounded-lg space-y-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="w-16 h-16 rounded-full border-4 border-muted flex items-center justify-center relative">
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle
                    cx="30"
                    cy="30"
                    r="28"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="text-muted opacity-20"
                  />
                  <circle
                    cx="30"
                    cy="30"
                    r="28"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeDasharray={175}
                    strokeDashoffset={175 - (175 * progress) / 100}
                    className={
                      progress === 100
                        ? "text-bull transition-all duration-500"
                        : "text-primary transition-all duration-500"
                    }
                  />
                </svg>
                <span className="font-mono font-bold text-sm">{progress}%</span>
              </div>
              <div>
                <h3 className="font-semibold text-lg">Readiness Score</h3>
                <p className="text-xs text-muted-foreground">
                  {progress === 100
                    ? "All systems go. You are cleared to trade."
                    : "Complete your checklist before trading."}
                </p>
                {!criticalPassed && progress < 100 && (
                  <p className="text-xs text-bear mt-1 font-medium">Critical rules pending!</p>
                )}
              </div>
            </div>
            <button
              onClick={resetChecks}
              className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent transition"
            >
              Reset Checks
            </button>
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition ${item.checked ? "bg-primary/5 border-primary/20" : "bg-background border-border hover:border-primary/50"}`}
              >
                <button
                  onClick={() => toggle(item.id)}
                  className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border ${item.checked ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground"}`}
                >
                  {item.checked && (
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>
                <span
                  className={`flex-1 text-sm ${item.checked ? "text-muted-foreground line-through" : ""}`}
                >
                  {item.text}
                </span>
                {item.critical && (
                  <span className="text-[9px] uppercase tracking-wider bg-bear/10 text-bear px-1.5 py-0.5 rounded">
                    Critical
                  </span>
                )}
                <button
                  onClick={() => remove(item.id)}
                  className="text-muted-foreground hover:text-bear opacity-50 hover:opacity-100 transition p-1"
                >
                  <Trash className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-2 border-t border-border">
            <input
              className="flex-1 p-2 border border-input rounded bg-background text-sm"
              placeholder="Add a new rule..."
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded flex items-center justify-center gap-2 text-sm font-medium hover:opacity-90 transition"
              onClick={add}
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
