"use client";

import { useState } from "react";
import { GlassPanel, SectionTitle, ShimmerButton, KpiCard } from "@/components/presidin/glass";
import { Settings, Key, Brain, Palette, Smartphone, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { useProvidersStore, useAccountStore, useThemeStore, type ProviderKey } from "@/stores/presidin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

const AI_PROVIDERS = ["zai", "openai", "anthropic", "gemini", "groq", "openrouter", "agentrouter"];
const MARKET_PROVIDERS = ["deriv", "mt5", "oanda", "finnhub", "twelvedata", "alphavantage", "polygon"];

export function SettingsSection() {
  const { keys, addKey, removeKey, toggleKey, derivToken, setDerivToken } = useProvidersStore();
  const { equity, balance, currency, setEquity, setBalance, riskPerTrade, setRisk } = useAccountStore();
  const { density, reducedMotion, setDensity, setReducedMotion } = useThemeStore();
  const [showKey, setShowKey] = useState<string | null>(null);
  const [newProvider, setNewProvider] = useState("openai");
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [deriv, setDeriv] = useState(derivToken ?? "");

  const addNewKey = () => {
    if (!newKey.trim() || !newLabel.trim()) {
      toast.error("Provider, label, and API key are required");
      return;
    }
    addKey(newProvider, newLabel, newKey);
    setNewLabel("");
    setNewKey("");
    toast.success("API key added (stored locally with first-4/last-4 mask only)");
  };

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="Settings"
        subtitle="Account · API keys · Providers · Theme · Cross-platform build"
        icon={<Settings className="h-5 w-5" />}
      />

      <Tabs defaultValue="account">
        <TabsList className="grid grid-cols-4 max-w-2xl">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="keys">API Keys</TabsTrigger>
          <TabsTrigger value="brokers">Brokers</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
        </TabsList>

        {/* Account */}
        <TabsContent value="account" className="space-y-3">
          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">Account Configuration</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Account equity ($)</label>
                <input
                  type="number"
                  value={equity}
                  onChange={(e) => setEquity(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm tnum"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Account balance ($)</label>
                <input
                  type="number"
                  value={balance}
                  onChange={(e) => setBalance(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm tnum"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Default risk per trade (%)</label>
                <div className="mt-2 flex items-center gap-2">
                  <Slider value={[riskPerTrade * 10]} onValueChange={(v) => setRisk(v[0] / 10)} min={1} max={50} step={1} className="flex-1" />
                  <span className="tnum text-sm font-semibold w-12">{riskPerTrade.toFixed(1)}%</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Currency</label>
                <Select value={currency} onValueChange={() => {}}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="ZAR">ZAR (R)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </GlassPanel>
        </TabsContent>

        {/* API Keys */}
        <TabsContent value="keys" className="space-y-3">
          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">Add New API Key</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <Select value={newProvider} onValueChange={setNewProvider}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <optgroup label="AI Providers">
                    {AI_PROVIDERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </optgroup>
                  <optgroup label="Market Data">
                    {MARKET_PROVIDERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </optgroup>
                </SelectContent>
              </Select>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Label (e.g. Personal OpenAI)"
                className="h-9 rounded-md border border-border bg-background/60 px-3 text-sm"
              />
              <input
                type="password"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="API key"
                className="h-9 rounded-md border border-border bg-background/60 px-3 text-sm"
              />
              <ShimmerButton onClick={addNewKey} className="!h-9 !text-xs">
                <Plus className="h-3.5 w-3.5" />
                Add Key
              </ShimmerButton>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Keys are stored locally in your browser (localStorage). Only first-4 and last-4 characters are retained — the full key is never persisted. Use unlimited keys per provider for failover.
            </p>
          </GlassPanel>

          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">Configured Keys ({keys.length})</h3>
            {keys.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No API keys configured yet. The default PRESIDIN AI provider works without a key.</div>
            ) : (
              <div className="space-y-2">
                {keys.map((k: ProviderKey) => (
                  <div key={k.id} className="grid grid-cols-12 items-center gap-2 rounded-lg bg-secondary/30 p-3 text-xs">
                    <div className="col-span-2">
                      <span className="rounded bg-violet-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-violet-300">{k.provider}</span>
                    </div>
                    <div className="col-span-3 font-medium">{k.label}</div>
                    <div className="col-span-4 tnum text-muted-foreground">
                      {showKey === k.id ? k.apiKeyMasked : "••••••••••••"}
                      <button onClick={() => setShowKey(showKey === k.id ? null : k.id)} className="ml-2 text-muted-foreground hover:text-foreground">
                        {showKey === k.id ? <EyeOff className="h-3 w-3 inline" /> : <Eye className="h-3 w-3 inline" />}
                      </button>
                    </div>
                    <div className="col-span-1 text-muted-foreground">{new Date(k.addedAt).toLocaleDateString()}</div>
                    <div className="col-span-1 flex justify-center">
                      <Switch checked={k.enabled} onCheckedChange={(v) => toggleKey(k.id, v)} />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button onClick={() => removeKey(k.id)} className="rounded p-1.5 text-muted-foreground hover:bg-rose-500/20 hover:text-rose-400">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>
        </TabsContent>

        {/* Brokers */}
        <TabsContent value="brokers" className="space-y-3">
          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">Broker Connections</h3>
            <div className="space-y-3">
              <div className="rounded-lg bg-cyan-500/10 p-3 ring-1 ring-cyan-500/20">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Deriv (default, zero-config)</div>
                    <div className="text-xs text-muted-foreground">Public WebSocket — works without API token</div>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] uppercase text-emerald-300">Connected</span>
                </div>
                <div className="mt-3">
                  <label className="text-xs text-muted-foreground">Deriv API Token (optional — required for live trading)</label>
                  <input
                    type="password"
                    value={deriv}
                    onChange={(e) => setDeriv(e.target.value)}
                    placeholder="Paste your Deriv API token"
                    className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-xs"
                  />
                  <ShimmerButton onClick={() => { setDerivToken(deriv); toast.success("Deriv token saved"); }} className="mt-2 !text-xs">
                    Save Deriv token
                  </ShimmerButton>
                </div>
              </div>

              <div className="rounded-lg bg-amber-500/10 p-3 ring-1 ring-amber-500/20">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">MT5 Bridge (Windows only)</div>
                    <div className="text-xs text-muted-foreground">Requires NexusBridge.mq5 EA attached to MT5 chart</div>
                  </div>
                  <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-[10px] uppercase text-slate-300">Not connected</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  MT5 integration uses 3 paths: direct MetaTrader5 Python API (Windows), socket-bridge EA (127.0.0.1:5555), or Deriv public fallback.
                </div>
              </div>

              <div className="rounded-lg bg-violet-500/10 p-3 ring-1 ring-violet-500/20">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Paper Trading (built-in)</div>
                    <div className="text-xs text-muted-foreground">Simulated broker for testing — always available</div>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] uppercase text-emerald-300">Active</span>
                </div>
              </div>

              <div className="rounded-lg bg-secondary/30 p-3 ring-1 ring-border/30">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Other brokers (OANDA / Finnhub / Twelve Data / Alpha Vantage / Polygon)</div>
                    <div className="text-xs text-muted-foreground">Add API keys in the "API Keys" tab to enable</div>
                  </div>
                  <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-[10px] uppercase text-slate-300">Configure</span>
                </div>
              </div>
            </div>
          </GlassPanel>
        </TabsContent>

        {/* Appearance */}
        <TabsContent value="appearance" className="space-y-3">
          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">Theme & Density</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Color palette</label>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-12 items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 p-3 text-xs font-bold text-white">
                    Aurora (active)
                  </div>
                  <div className="text-xs text-muted-foreground">Indigo → Violet → Cyan</div>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Layout density</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDensity("comfortable")}
                    className={`rounded-lg p-3 text-xs ${density === "comfortable" ? "bg-violet-500/20 ring-1 ring-violet-500/40" : "bg-secondary/40"}`}
                  >
                    <div className="font-semibold">Comfortable</div>
                    <div className="text-muted-foreground">More padding, easier on eyes</div>
                  </button>
                  <button
                    onClick={() => setDensity("compact")}
                    className={`rounded-lg p-3 text-xs ${density === "compact" ? "bg-violet-500/20 ring-1 ring-violet-500/40" : "bg-secondary/40"}`}
                  >
                    <div className="font-semibold">Compact</div>
                    <div className="text-muted-foreground">Tighter spacing, more content</div>
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 p-3">
                <div>
                  <div className="text-sm font-medium">Reduce motion</div>
                  <div className="text-xs text-muted-foreground">Disable aurora background animation + shimmer effects</div>
                </div>
                <Switch checked={reducedMotion} onCheckedChange={setReducedMotion} />
              </div>
            </div>
          </GlassPanel>

          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">Cross-Platform Build</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg bg-secondary/30 p-3 text-center">
                <Smartphone className="mx-auto h-6 w-6 text-violet-400" />
                <div className="mt-2 text-sm font-semibold">iOS</div>
                <div className="text-[10px] text-muted-foreground">Capacitor → Xcode</div>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3 text-center">
                <Smartphone className="mx-auto h-6 w-6 text-cyan-400" />
                <div className="mt-2 text-sm font-semibold">Android</div>
                <div className="text-[10px] text-muted-foreground">Capacitor → Android Studio</div>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3 text-center">
                <Brain className="mx-auto h-6 w-6 text-emerald-400" />
                <div className="mt-2 text-sm font-semibold">Desktop</div>
                <div className="text-[10px] text-muted-foreground">Electron → Mac/Win/Linux</div>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3 text-center">
                <Palette className="mx-auto h-6 w-6 text-amber-400" />
                <div className="mt-2 text-sm font-semibold">PWA</div>
                <div className="text-[10px] text-muted-foreground">Installable from browser</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              PRESIDIN ships from one Next.js codebase to all 4 platform targets. Configs are in <code className="rounded bg-secondary/60 px-1">capacitor.config.json</code> and <code className="rounded bg-secondary/60 px-1">electron/</code>. Build commands: <code className="rounded bg-secondary/60 px-1">npm run build:ios</code> · <code className="rounded bg-secondary/60 px-1">npm run build:android</code> · <code className="rounded bg-secondary/60 px-1">npm run build:desktop</code>.
            </p>
          </GlassPanel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
