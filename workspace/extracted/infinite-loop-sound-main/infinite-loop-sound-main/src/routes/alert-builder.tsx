import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useEffect, useMemo, useRef, useState } from "react";
import { deriv, ALL_ASSETS, displayPair } from "@/lib/engine/deriv";
import { useServerFn } from "@tanstack/react-start";
import { broadcastAlertMessage } from "@/lib/telegram.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/alert-builder")({
  head: () => ({
    meta: [
      { title: "Alert Builder" },
      {
        name: "description",
        content: "Build live price alerts and broadcast to Telegram automatically.",
      },
    ],
  }),
  component: AlertBuilder,
});

type Op = ">" | "<" | "crosses_up" | "crosses_down";

interface Rule {
  id: string;
  symbol: string;
  op: Op;
  value: number;
  note?: string;
  active: boolean;
  triggered?: number; // epoch ms
  telegram: boolean;
  cooldownMin: number;
  lastFireAt?: number;
}

const KEY = "diq.alert-rules.v1";

function loadRules(): Rule[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function saveRules(r: Rule[]) {
  localStorage.setItem(KEY, JSON.stringify(r));
}

function AlertBuilder() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<{
    symbol: string;
    op: Op;
    value: string;
    note: string;
    telegram: boolean;
    cooldownMin: number;
  }>({
    symbol: "frxEURUSD",
    op: ">",
    value: "",
    note: "",
    telegram: false,
    cooldownMin: 15,
  });
  const [log, setLog] = useState<string[]>([]);
  const prevPrice = useRef<Record<string, number>>({});
  const broadcast = useServerFn(broadcastAlertMessage);

  useEffect(() => setRules(loadRules()), []);
  useEffect(() => saveRules(rules), [rules]);

  const activeSymbols = useMemo(
    () => Array.from(new Set(rules.filter((r) => r.active).map((r) => r.symbol))),
    [rules],
  );

  // Live tick subscriptions
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    for (const sym of activeSymbols) {
      unsubs.push(
        deriv.subscribeTicks(sym, (t) => {
          setPrices((p) => ({ ...p, [sym]: t.quote }));
          evaluate(sym, t.quote);
        }),
      );
    }
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbols.join(",")]);

  const evaluate = (sym: string, price: number) => {
    const prev = prevPrice.current[sym];
    prevPrice.current[sym] = price;
    setRules((cur) => {
      let changed = false;
      const now = Date.now();
      const next = cur.map((r) => {
        if (!r.active || r.symbol !== sym) return r;
        if (r.lastFireAt && now - r.lastFireAt < r.cooldownMin * 60_000) return r;
        let hit = false;
        if (r.op === ">") hit = price > r.value;
        else if (r.op === "<") hit = price < r.value;
        else if (r.op === "crosses_up")
          hit = prev !== undefined && prev <= r.value && price > r.value;
        else if (r.op === "crosses_down")
          hit = prev !== undefined && prev >= r.value && price < r.value;
        if (!hit) return r;
        changed = true;
        fireAlert(r, price);
        return { ...r, triggered: now, lastFireAt: now };
      });
      return changed ? next : cur;
    });
  };

  const fireAlert = async (r: Rule, price: number) => {
    const line = `${new Date().toLocaleTimeString()} · ${displayPair(r.symbol)} ${r.op} ${r.value} · now ${price.toFixed(5)}${r.note ? " · " + r.note : ""}`;
    setLog((l) => [line, ...l].slice(0, 40));
    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification(`Alert: ${displayPair(r.symbol)}`, { body: line });
        }
      }
    } catch {}
    if (r.telegram) {
      try {
        const text = [
          "ALERT TRIGGERED",
          `${displayPair(r.symbol)}  ${r.op}  ${r.value}`,
          `Price: ${price.toFixed(5)}`,
          r.note ? `Note: ${r.note}` : "",
          new Date().toISOString(),
        ]
          .filter(Boolean)
          .join("\n");
        await broadcast({ data: { text } });
      } catch (e: any) {
        toast.error("Telegram broadcast failed: " + (e?.message || "error"));
      }
    }
  };

  const addRule = () => {
    const v = parseFloat(draft.value);
    if (!Number.isFinite(v)) {
      toast.error("Enter a numeric price level.");
      return;
    }
    const rule: Rule = {
      id: crypto.randomUUID(),
      symbol: draft.symbol,
      op: draft.op,
      value: v,
      note: draft.note || undefined,
      active: true,
      telegram: draft.telegram,
      cooldownMin: draft.cooldownMin,
    };
    setRules((r) => [rule, ...r]);
    setDraft((d) => ({ ...d, value: "", note: "" }));
  };

  const toggle = (id: string) =>
    setRules((r) => r.map((x) => (x.id === id ? { ...x, active: !x.active } : x)));
  const remove = (id: string) => setRules((r) => r.filter((x) => x.id !== id));

  const requestNotify = () => {
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  };

  return (
    <AppShell>
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold">Alert Builder</h1>
          <Badge variant="outline">{rules.filter((r) => r.active).length} active</Badge>
          <Button size="sm" variant="outline" className="ml-auto" onClick={requestNotify}>
            Enable browser notifications
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">New rule</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              <select
                className="rounded-md bg-background border border-border px-2 py-2 text-sm col-span-2"
                value={draft.symbol}
                onChange={(e) => setDraft((d) => ({ ...d, symbol: e.target.value }))}
              >
                {ALL_ASSETS.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {displayPair(a.symbol)}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md bg-background border border-border px-2 py-2 text-sm"
                value={draft.op}
                onChange={(e) => setDraft((d) => ({ ...d, op: e.target.value as Op }))}
              >
                <option value=">">price {">"}</option>
                <option value="<">price {"<"}</option>
                <option value="crosses_up">crosses up</option>
                <option value="crosses_down">crosses down</option>
              </select>
              <Input
                placeholder="1.0850"
                value={draft.value}
                onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
              />
              <Input
                placeholder="Cooldown min"
                type="number"
                min={1}
                value={draft.cooldownMin}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, cooldownMin: Math.max(1, Number(e.target.value) || 1) }))
                }
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.telegram}
                  onChange={(e) => setDraft((d) => ({ ...d, telegram: e.target.checked }))}
                />
                Telegram
              </label>
              <Input
                className="col-span-2 md:col-span-4"
                placeholder="Note (optional)"
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              />
              <Button onClick={addRule}>Add rule</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rules</CardTitle>
          </CardHeader>
          <CardContent>
            {rules.length === 0 && (
              <div className="text-sm text-muted-foreground">No rules yet.</div>
            )}
            <div className="space-y-2">
              {rules.map((r) => {
                const p = prices[r.symbol];
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2 text-sm"
                  >
                    <Badge variant={r.active ? "default" : "outline"}>
                      {r.active ? "ON" : "OFF"}
                    </Badge>
                    <div className="font-mono min-w-32">{displayPair(r.symbol)}</div>
                    <div>
                      {r.op} {r.value}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      cd {r.cooldownMin}m {r.telegram ? "· Telegram" : ""}
                    </div>
                    {r.note && (
                      <div className="text-xs text-muted-foreground italic">"{r.note}"</div>
                    )}
                    <div className="ml-auto flex items-center gap-3">
                      <span className="font-mono text-xs">{p != null ? p.toFixed(5) : "—"}</span>
                      {r.triggered && (
                        <span className="text-xs text-emerald-400">
                          last {new Date(r.triggered).toLocaleTimeString()}
                        </span>
                      )}
                      <Button size="sm" variant="outline" onClick={() => toggle(r.id)}>
                        {r.active ? "Pause" : "Resume"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent triggers</CardTitle>
          </CardHeader>
          <CardContent>
            {log.length === 0 && (
              <div className="text-sm text-muted-foreground">
                Nothing yet. Rules evaluate live from Deriv ticks.
              </div>
            )}
            <div className="font-mono text-xs space-y-1">
              {log.map((l, i) => (
                <div key={i} className="text-muted-foreground">
                  {l}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
