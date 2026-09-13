import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState } from "react";
import { Layers, Plus, Trash, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { createStrategy, getAllStrategies, deleteStrategy } from "@/lib/strategies/multi-strategy";

export const Route = createFileRoute("/strategies")({ component: StrategiesPage });

function StrategiesPage() {
  const [strategies, setStrategies] = useState(getAllStrategies());
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", mode: "signal", weight: 1, maxOpen: 5 });

  const handleAddStrategy = () => {
    if (!formData.name) {
      toast.error("Enter strategy name");
      return;
    }
    const strategy = {
      id: `strat_${Date.now()}`,
      name: formData.name,
      enabled: true,
      mode: formData.mode as "signal" | "scalper",
      weight: formData.weight,
      maxRiskPercent: 2,
      instruments: [],
      maxConcurrentTrades: formData.maxOpen,
    };
    createStrategy(strategy);
    setStrategies(getAllStrategies());
    setFormData({ name: "", mode: "signal", weight: 1, maxOpen: 5 });
    setShowForm(false);
    toast.success("Strategy created");
  };

  const handleDelete = (id: string) => {
    deleteStrategy(id);
    setStrategies(getAllStrategies());
    toast.success("Strategy deleted");
  };

  return (
    <AppShell>
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Layers className="w-8 h-8 text-primary" /> Multi-Strategy Manager
        </h1>

        <Button onClick={() => setShowForm(!showForm)} className="gap-1.5">
          <Plus className="w-4 h-4" /> New Strategy
        </Button>

        {showForm && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <Input
              placeholder="Strategy name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            <select
              value={formData.mode}
              onChange={(e) => setFormData({ ...formData, mode: e.target.value })}
              className="w-full px-3 py-2 rounded border border-input bg-background text-sm"
            >
              <option value="signal">Signal Mode</option>
              <option value="scalper">Scalper Mode</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">
                  Weight ({formData.weight.toFixed(2)})
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Max Open Trades</label>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={formData.maxOpen}
                  onChange={(e) => setFormData({ ...formData, maxOpen: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddStrategy} className="flex-1">
                Create
              </Button>
              <Button onClick={() => setShowForm(false)} variant="outline" className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Strategies List */}
        <div className="space-y-2">
          {strategies.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No strategies configured
            </p>
          ) : (
            strategies.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1">
                  <p className="font-bold">{s.name}</p>
                  <div className="flex gap-2 mt-1 text-[10px] text-muted-foreground">
                    <span className="px-2 py-1 bg-muted rounded">{s.mode}</span>
                    <span className="px-2 py-1 bg-muted rounded">
                      Weight: {(s.weight * 100).toFixed(0)}%
                    </span>
                    <span className="px-2 py-1 bg-muted rounded">Max: {s.maxConcurrentTrades}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={() => handleDelete(s.id)}
                    variant="ghost"
                    size="sm"
                    className="text-bear"
                  >
                    <Trash className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
