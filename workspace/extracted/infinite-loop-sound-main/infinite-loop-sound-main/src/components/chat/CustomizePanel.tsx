// Sidebar panel: Customize — skills toggles, connectors, scripts.
// Skills list is sourced from the skills registry (Phase 6).
import { useEffect, useState } from "react";
import { Plug, Sparkles, FileCode, ChevronRight, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

interface SkillRow {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
}

const STORE_KEY = "diq.chat.skills.enabled.v1";

export function CustomizePanel() {
  const [skills, setSkills] = useState<SkillRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Lazy-load the registry so the chat tab doesn't pay the parse cost upfront.
    import("@/lib/skills/list")
      .then((mod) => {
        if (cancelled) return;
        const enabledMap: Record<string, boolean> =
          typeof window !== "undefined" ? JSON.parse(localStorage.getItem(STORE_KEY) || "{}") : {};
        setSkills(
          mod.SKILLS.map((s: any) => ({
            id: s.id,
            name: s.name,
            category: s.category,
            enabled: enabledMap[s.id] ?? s.defaultEnabled !== false,
          })),
        );
      })
      .catch(() => setSkills([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (id: string) => {
    const next = skills.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
    setSkills(next);
    if (typeof window !== "undefined") {
      const map = Object.fromEntries(next.map((s) => [s.id, s.enabled]));
      localStorage.setItem(STORE_KEY, JSON.stringify(map));
    }
  };

  const grouped = skills.reduce<Record<string, SkillRow[]>>((acc, s) => {
    (acc[s.category] ||= []).push(s);
    return acc;
  }, {});

  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <div className="space-y-4">
      <div className="px-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Quick links
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link to="/api-keys">
            <Button size="sm" variant="outline" className="w-full justify-start gap-2">
              <Plug className="w-3.5 h-3.5" /> Keys
            </Button>
          </Link>
          <Link to="/local-ai">
            <Button size="sm" variant="outline" className="w-full justify-start gap-2">
              <Settings className="w-3.5 h-3.5" /> Local AI
            </Button>
          </Link>
        </div>
      </div>

      <div className="px-2">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Skills ({enabledCount}/{skills.length})
          </div>
          <Sparkles className="w-3 h-3 text-amber-400" />
        </div>

        {Object.keys(grouped).length === 0 && (
          <p className="text-xs text-muted-foreground italic">Loading skill registry…</p>
        )}

        <div className="space-y-3 max-h-[55dvh] overflow-y-auto pr-1">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 sticky top-0 bg-card/95 backdrop-blur py-1">
                {cat}
              </div>
              <div className="space-y-1">
                {items.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/40 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      onChange={() => toggle(s.id)}
                      className="accent-primary"
                    />
                    <span className="text-xs flex-1 truncate">{s.name}</span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Code executor
        </div>
        <Link to="/local-ai">
          <Button size="sm" variant="outline" className="w-full justify-start gap-2">
            <FileCode className="w-3.5 h-3.5" /> Open executor scripts
          </Button>
        </Link>
        <p className="text-[10px] text-muted-foreground mt-2">
          Generate, run, auto-correct: TS, JS, Python, HTML, CSS, JSON, CSV. C#/C++/Java/Swift need
          a backend runtime.
        </p>
      </div>
    </div>
  );
}
