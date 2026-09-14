"use client";

import { useState, useEffect } from "react";
import { GlassPanel, SectionTitle, ShimmerButton, KpiCard } from "@/components/presidin/glass";
import { Settings, Key, Brain, Palette, Smartphone, Plus, Trash2, Eye, EyeOff, Database, Cloud, CheckCircle2, XCircle, Save, Cpu } from "lucide-react";
import { useProvidersStore, useAccountStore, useThemeStore, useEngineConfigStore, useAgentConfigStore } from "@/stores/presidin";
import { PROVIDERS, type ProviderId } from "@/lib/presidin/ai-providers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

interface ProviderStatus {
  id: ProviderId;
  label: string;
  configured: boolean;
  hasKey: boolean;
  defaultModel: string;
}

export function SettingsSection() {
  const {
    keys, addKey, removeKey, toggleKey,
    derivToken, setDerivToken,
    customOpenaiEndpoint, customOpenaiKey, customOpenaiModel, setCustomOpenai,
    customAnthropicEndpoint, customAnthropicKey, customAnthropicModel, setCustomAnthropic,
    supabaseUrl, supabaseAnonKey, setSupabase,
    activeProvider, activeModel, setActiveProvider,
    providerModels, setProviderModel,
  } = useProvidersStore();
  const { equity, balance, currency, setEquity, setBalance, riskPerTrade, setRisk } = useAccountStore();
  const { density, reducedMotion, setDensity, setReducedMotion, palette, setPalette, glassIntensity, setGlassIntensity, auroraFlow, setAuroraFlow } = useThemeStore();
  const [showKey, setShowKey] = useState<string | null>(null);
  const [newProvider, setNewProvider] = useState("openai");
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [deriv, setDeriv] = useState(derivToken ?? "");
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [activeTab, setActiveTab] = useState("providers");

  // Custom OpenAI form state
  const [coEndpoint, setCoEndpoint] = useState(customOpenaiEndpoint ?? "");
  const [coKey, setCoKey] = useState(customOpenaiKey ?? "");
  const [coModel, setCoModel] = useState(customOpenaiModel ?? "");
  // Custom Anthropic form state
  const [caEndpoint, setCaEndpoint] = useState(customAnthropicEndpoint ?? "");
  const [caKey, setCaKey] = useState(customAnthropicKey ?? "");
  const [caModel, setCaModel] = useState(customAnthropicModel ?? "");
  // Supabase form state
  const [sbUrl, setSbUrl] = useState(supabaseUrl ?? "");
  const [sbAnon, setSbAnon] = useState(supabaseAnonKey ?? "");

  useEffect(() => {
    fetch("/api/providers")
      .then(r => r.json())
      .then(d => setStatuses(d.statuses ?? []))
      .catch(() => {});
  }, []);

  const addNewKey = () => {
    if (!newKey.trim() || !newLabel.trim()) {
      toast.error("Provider, label, and API key are required");
      return;
    }
    addKey(newProvider, newLabel, newKey);
    setNewLabel("");
    setNewKey("");
    toast.success("API key added");
  };

  const saveCustomOpenai = () => {
    setCustomOpenai(coEndpoint, coKey, coModel);
    toast.success("Custom OpenAI-compatible endpoint saved");
  };
  const saveCustomAnthropic = () => {
    setCustomAnthropic(caEndpoint, caKey, caModel);
    toast.success("Custom Anthropic-compatible endpoint saved");
  };
  const saveSupabase = () => {
    setSupabase(sbUrl, sbAnon);
    toast.success("Supabase browser credentials saved");
  };

  const statusOf = (id: ProviderId) => statuses.find(s => s.id === id);

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="Settings"
        subtitle="Account · 19 AI providers · Custom endpoints · Brokers · Supabase · Cloudflare · Theme"
        icon={<Settings className="h-5 w-5" />}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-7 max-w-3xl overflow-x-auto">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="engine">Engine</TabsTrigger>
          <TabsTrigger value="providers">AI Providers</TabsTrigger>
          <TabsTrigger value="custom">Custom EP</TabsTrigger>
          <TabsTrigger value="brokers">Brokers</TabsTrigger>
          <TabsTrigger value="cloud">Cloud</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
        </TabsList>

        {/* Account */}
        <TabsContent value="account" className="space-y-3">
          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">Account Configuration</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Account equity ($)</label>
                <input type="number" value={equity} onChange={(e) => setEquity(parseFloat(e.target.value) || 0)} className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm tnum" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Account balance ($)</label>
                <input type="number" value={balance} onChange={(e) => setBalance(parseFloat(e.target.value) || 0)} className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm tnum" />
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
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
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

        {/* Engine */}
        <TabsContent value="engine" className="space-y-3">
          <EngineTab />
        </TabsContent>

        {/* AI Providers */}
        <TabsContent value="providers" className="space-y-3">
          <GlassPanel veil>
            <h3 className="mb-1 text-sm font-semibold">Active AI Provider</h3>
            <p className="mb-3 text-xs text-muted-foreground">Select which provider + model to use as default for AI Assistant.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Provider</label>
                <Select value={activeProvider} onValueChange={(v) => setActiveProvider(v)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => {
                      const s = statusOf(p.id);
                      return (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label} {s?.configured ? "✓" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Model</label>
                <Select value={activeModel || providerModels[activeProvider] || ""} onValueChange={(v) => setProviderModel(activeProvider, v)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="(default)" /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.find(p => p.id === activeProvider)?.availableModels.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    )) ?? <SelectItem value="">(no models)</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">All AI Providers ({PROVIDERS.length})</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PROVIDERS.map((p) => {
                const s = statusOf(p.id);
                const isCustom = p.id === "custom_openai" || p.id === "custom_anthropic";
                return (
                  <div
                    key={p.id}
                    className={`rounded-lg p-3 ring-1 ${
                      s?.configured ? "bg-emerald-500/10 ring-emerald-500/20" : "bg-secondary/30 ring-border/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">{p.label}</div>
                        <div className="text-[10px] text-muted-foreground">{p.description}</div>
                      </div>
                      {s?.configured ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-slate-500" />
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="font-mono">{p.defaultModel || "custom"}</span>
                      <span className="capitalize rounded bg-secondary/60 px-1.5 py-0.5">{p.apiStyle}</span>
                    </div>
                    {!s?.configured && !isCustom && p.envVar && (
                      <div className="mt-1 text-[10px] text-amber-400">Set {p.envVar} in .env</div>
                    )}
                    {isCustom && (
                      <div className="mt-1 text-[10px] text-amber-400">Configure in Custom EP tab</div>
                    )}
                  </div>
                );
              })}
            </div>
          </GlassPanel>

          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">Add API Key (BYOK)</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <Select value={newProvider} onValueChange={setNewProvider}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.filter(p => p.id !== "zai" && p.id !== "custom_openai" && p.id !== "custom_anthropic").map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label (e.g. Personal OpenAI)" className="h-9 rounded-md border border-border bg-background/60 px-3 text-sm" />
              <input type="password" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="API key" className="h-9 rounded-md border border-border bg-background/60 px-3 text-sm" />
              <ShimmerButton onClick={addNewKey} className="!h-9 !text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Key
              </ShimmerButton>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Keys are stored locally in your browser (localStorage). Only first-4 and last-4 characters are retained. For server-side use, set the env var (e.g. <code className="rounded bg-secondary/60 px-1">OPENAI_API_KEY</code>) in your <code className="rounded bg-secondary/60 px-1">.env</code> file.
            </p>
          </GlassPanel>

          {keys.length > 0 && (
            <GlassPanel veil>
              <h3 className="mb-3 text-sm font-semibold">Configured Keys ({keys.length})</h3>
              <div className="space-y-2">
                {keys.map((k) => (
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
            </GlassPanel>
          )}
        </TabsContent>

        {/* Custom endpoints */}
        <TabsContent value="custom" className="space-y-3">
          <GlassPanel veil>
            <div className="mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-violet-400" />
              <h3 className="text-sm font-semibold">Custom OpenAI-compatible Endpoint</h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Any endpoint that speaks the OpenAI Chat Completions API (e.g. LM Studio, vLLM, Ollama with OpenAI compat, Together, Anyscale, Baseten, Anyscale, your own Llama deployment).</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Endpoint URL (without /chat/completions)</label>
                <input value={coEndpoint} onChange={(e) => setCoEndpoint(e.target.value)} placeholder="http://localhost:1234/v1" className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">API Key (optional — leave blank for local)</label>
                <input type="password" value={coKey} onChange={(e) => setCoKey(e.target.value)} placeholder="sk-..." className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Model name</label>
                <input value={coModel} onChange={(e) => setCoModel(e.target.value)} placeholder="llama-3.1-70b-instruct" className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm font-mono" />
              </div>
              <ShimmerButton onClick={saveCustomOpenai} className="!text-xs">
                <Save className="h-3.5 w-3.5" /> Save Custom OpenAI endpoint
              </ShimmerButton>
            </div>
          </GlassPanel>

          <GlassPanel veil>
            <div className="mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold">Custom Anthropic-compatible Endpoint</h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Any endpoint that speaks the Anthropic Messages API (e.g. Claude on Vertex AI, AWS Bedrock proxy, your own Claude deployment).</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Endpoint URL (without /messages)</label>
                <input value={caEndpoint} onChange={(e) => setCaEndpoint(e.target.value)} placeholder="https://your-proxy.com/v1" className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">API Key</label>
                <input type="password" value={caKey} onChange={(e) => setCaKey(e.target.value)} placeholder="sk-ant-..." className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Model name</label>
                <input value={caModel} onChange={(e) => setCaModel(e.target.value)} placeholder="claude-3-5-sonnet-20241022" className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm font-mono" />
              </div>
              <ShimmerButton onClick={saveCustomAnthropic} className="!text-xs">
                <Save className="h-3.5 w-3.5" /> Save Custom Anthropic endpoint
              </ShimmerButton>
            </div>
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
                  <input type="password" value={deriv} onChange={(e) => setDeriv(e.target.value)} placeholder="Paste your Deriv API token" className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-xs" />
                  <ShimmerButton onClick={() => { setDerivToken(deriv); toast.success("Deriv token saved"); }} className="mt-2 !text-xs">
                    Save Deriv token
                  </ShimmerButton>
                  <DerivStatusChecker />
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
              </div>
              <div className="rounded-lg bg-violet-500/10 p-3 ring-1 ring-violet-500/20">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Paper Trading (built-in)</div>
                    <div className="text-xs text-muted-foreground">Simulated broker — always available</div>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] uppercase text-emerald-300">Active</span>
                </div>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3 ring-1 ring-border/30">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Other brokers (OANDA / Finnhub / Twelve Data / Alpha Vantage / Polygon)</div>
                    <div className="text-xs text-muted-foreground">Add API keys in the "AI Providers" tab to enable</div>
                  </div>
                  <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-[10px] uppercase text-slate-300">Configure</span>
                </div>
              </div>
            </div>
          </GlassPanel>
        </TabsContent>

        {/* Cloud */}
        <TabsContent value="cloud" className="space-y-3">
          <GlassPanel veil>
            <div className="mb-3 flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold">Supabase (browser-side)</h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Used for client-side Realtime subscriptions + Auth. Server-side uses <code className="rounded bg-secondary/60 px-1">SUPABASE_SERVICE_ROLE_KEY</code> from .env.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Project URL</label>
                <input value={sbUrl} onChange={(e) => setSbUrl(e.target.value)} placeholder="https://your-project.supabase.co" className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Anon key (safe for browser)</label>
                <input type="password" value={sbAnon} onChange={(e) => setSbAnon(e.target.value)} placeholder="eyJ..." className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm font-mono" />
              </div>
              <ShimmerButton onClick={saveSupabase} className="!text-xs">
                <Save className="h-3.5 w-3.5" /> Save Supabase browser credentials
              </ShimmerButton>
              <div className="rounded-md bg-amber-500/10 p-2 text-[10px] text-amber-300">
                ⚠ Service role key is configured server-side only via <code>SUPABASE_SERVICE_ROLE_KEY</code> in .env (never expose in browser).
              </div>
            </div>
          </GlassPanel>

          <GlassPanel veil>
            <div className="mb-3 flex items-center gap-2">
              <Cloud className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold">Cloudflare (server-side)</h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Configured via environment variables. Set these in your .env file:</p>
            <div className="space-y-2 text-xs font-mono">
              {[
                { k: "CLOUDFLARE_ACCOUNT_ID", v: "9b97b661b9..." },
                { k: "CLOUDFLARE_API_TOKEN", v: "cfat_EHxlejqhKIS..." },
                { k: "CLOUDFLARE_R2_BUCKET", v: "presidin (optional)" },
                { k: "CLOUDFLARE_KV_NAMESPACE_ID", v: "(optional)" },
              ].map((e) => (
                <div key={e.k} className="flex items-center justify-between rounded-md bg-secondary/40 p-2">
                  <span className="text-violet-300">{e.k}</span>
                  <span className="text-muted-foreground">{e.v}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-secondary/30 p-3 text-[11px]">
              <div className="font-semibold">Available Cloudflare services:</div>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>• <strong>R2</strong> — S3-compatible object storage (backtest artifacts, exports, screenshots)</li>
                <li>• <strong>KV</strong> — Key-value store (cache signals, provider status)</li>
                <li>• <strong>Workers</strong> — Serverless heartbeat / cron for 24/7 signal generation</li>
              </ul>
            </div>
          </GlassPanel>
        </TabsContent>

        {/* Appearance */}
        <TabsContent value="appearance" className="space-y-3">
          <GlassPanel veil>
            <h3 className="mb-1 text-sm font-semibold">Color Palette</h3>
            <p className="mb-3 text-xs text-muted-foreground">6 palettes — switch instantly. Applies across the entire app.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <PaletteButton id="aurora" label="Aurora" colors={["#818cf8", "#a78bfa", "#22d3ee"]} />
              <PaletteButton id="emerald" label="Emerald Gold" colors={["#10b981", "#059669", "#84cc16"]} />
              <PaletteButton id="sunset" label="Sunset" colors={["#f97316", "#ec4899", "#d946ef"]} />
              <PaletteButton id="carbon" label="Carbon Electric" colors={["#3b82f6", "#6366f1", "#a3e635"]} />
              <PaletteButton id="rosegold" label="Rose Gold" colors={["#f472b6", "#be185d", "#fb923c"]} />
              <PaletteButton id="ocean" label="Ocean" colors={["#0ea5e9", "#38bdf8", "#2dd4bf"]} />
            </div>
          </GlassPanel>

          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">Glass Intensity</h3>
            <p className="mb-3 text-xs text-muted-foreground">Controls backdrop-blur strength on glass panels.</p>
            <div className="grid grid-cols-3 gap-2">
              {(["low", "medium", "high"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGlassIntensity(g)}
                  className={`rounded-lg p-3 text-xs capitalize transition ${
                    glassIntensity === g
                      ? "bg-violet-500/20 ring-1 ring-violet-500/40 font-semibold"
                      : "bg-secondary/40 hover:bg-secondary"
                  }`}
                >
                  <div className="font-semibold">{g}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {g === "low" ? "12px blur" : g === "medium" ? "20px blur" : "36px blur"}
                  </div>
                </button>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">Animations</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 p-3">
                <div>
                  <div className="text-sm font-medium">Aurora flow background</div>
                  <div className="text-xs text-muted-foreground">Animated mesh gradient behind everything</div>
                </div>
                <Switch checked={auroraFlow} onCheckedChange={setAuroraFlow} />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 p-3">
                <div>
                  <div className="text-sm font-medium">Reduce motion</div>
                  <div className="text-xs text-muted-foreground">Disable all animations (accessibility)</div>
                </div>
                <Switch checked={reducedMotion} onCheckedChange={setReducedMotion} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Layout density</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button onClick={() => setDensity("comfortable")} className={`rounded-lg p-3 text-xs ${density === "comfortable" ? "bg-violet-500/20 ring-1 ring-violet-500/40" : "bg-secondary/40"}`}>
                    <div className="font-semibold">Comfortable</div>
                    <div className="text-muted-foreground">More padding, easier on eyes</div>
                  </button>
                  <button onClick={() => setDensity("compact")} className={`rounded-lg p-3 text-xs ${density === "compact" ? "bg-violet-500/20 ring-1 ring-violet-500/40" : "bg-secondary/40"}`}>
                    <div className="font-semibold">Compact</div>
                    <div className="text-muted-foreground">Tighter spacing, more content</div>
                  </button>
                </div>
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
          </GlassPanel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EngineTab() {
  const {
    enabled, intervalMs, symbols, timeframes, minConfidence,
    autoExecute, autoExecuteThreshold, learningEnabled, retrainIntervalHours,
    setConfig, toggle,
  } = useEngineConfigStore();
  const config = {
    enabled, intervalMs, symbols, timeframes, minConfidence,
    autoExecute, autoExecuteThreshold, learningEnabled, retrainIntervalHours,
  };
  return (
    <>
      <GlassPanel veil>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-semibold">Signal Engine</h3>
          </div>
          <Switch checked={config.enabled} onCheckedChange={() => toggle()} />
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          When enabled, the engine automatically scans all configured symbols + timeframes on a timer,
          generates signals using the 17-agent MasterAgent, persists them to Supabase, and broadcasts via WebSocket.
        </p>
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Scan interval</span>
              <span className="tnum font-semibold">{(config.intervalMs / 1000).toFixed(0)}s</span>
            </div>
            <Slider
              value={[config.intervalMs / 1000]}
              onValueChange={(v) => setConfig({ intervalMs: v[0] * 1000 })}
              min={15} max={600} step={15}
              disabled={!config.enabled}
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>15s</span><span>10min</span>
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Min confidence to persist</span>
              <span className="tnum font-semibold">{config.minConfidence}%</span>
            </div>
            <Slider
              value={[config.minConfidence]}
              onValueChange={(v) => setConfig({ minConfidence: v[0] })}
              min={20} max={95} step={5}
              disabled={!config.enabled}
            />
          </div>
        </div>
      </GlassPanel>

      <GlassPanel veil>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold">Self-Learning</h3>
          </div>
          <Switch checked={config.learningEnabled} onCheckedChange={(v) => setConfig({ learningEnabled: v })} />
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Evaluates past signals against live prices every 5 min, then retrains ML models on a schedule
          using the calibration data. Agents with higher accuracy get more weight.
        </p>
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Retrain interval</span>
              <span className="tnum font-semibold">{config.retrainIntervalHours}h</span>
            </div>
            <Slider
              value={[config.retrainIntervalHours]}
              onValueChange={(v) => setConfig({ retrainIntervalHours: v[0] })}
              min={1} max={48} step={1}
              disabled={!config.learningEnabled}
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>1h</span><span>48h</span>
            </div>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Scanned Symbols ({config.symbols.length})</h3>
        <div className="flex flex-wrap gap-2">
          {config.symbols.map((s) => (
            <span key={s} className="rounded-md bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-200 ring-1 ring-violet-500/30">
              {s}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">Symbols are fixed to the default watchlist. Future versions will allow custom selection.</p>
      </GlassPanel>

      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Scanned Timeframes ({config.timeframes.length})</h3>
        <div className="flex flex-wrap gap-2">
          {config.timeframes.map((t) => (
            <span key={t} className="rounded-md bg-cyan-500/15 px-2.5 py-1 text-xs font-medium text-cyan-200 ring-1 ring-cyan-500/30">
              {t}
            </span>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel veil>
        <h3 className="mb-3 text-sm font-semibold">Auto-Execution (paper)</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-secondary/40 p-3">
            <div>
              <div className="text-sm font-medium">Auto-execute high-confidence signals</div>
              <div className="text-xs text-muted-foreground">Paper trading only — places orders on signals above threshold</div>
            </div>
            <Switch checked={config.autoExecute} onCheckedChange={(v) => setConfig({ autoExecute: v })} />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Auto-execute threshold</span>
              <span className="tnum font-semibold">{config.autoExecuteThreshold}%</span>
            </div>
            <Slider
              value={[config.autoExecuteThreshold]}
              onValueChange={(v) => setConfig({ autoExecuteThreshold: v[0] })}
              min={70} max={99} step={1}
              disabled={!config.autoExecute}
            />
          </div>
        </div>
      </GlassPanel>
    </>
  );
}

function PaletteButton({ id, label, colors }: { id: string; label: string; colors: string[] }) {
  const { palette, setPalette } = useThemeStore();
  const isActive = palette === id;
  return (
    <button
      onClick={() => setPalette(id as any)}
      className={`group relative overflow-hidden rounded-xl p-3 text-left transition-all hover:scale-[1.02] ${
        isActive ? "ring-2 ring-violet-500/60" : "ring-1 ring-border/40"
      }`}
      style={{
        background: `linear-gradient(135deg, ${colors[0]}33, ${colors[1]}22, ${colors[2]}33)`,
      }}
    >
      <div className="flex items-center gap-2">
        <div className="flex -space-x-1">
          {colors.map((c, i) => (
            <div
              key={i}
              className="h-5 w-5 rounded-full border-2 border-background"
              style={{ background: c }}
            />
          ))}
        </div>
        <span className="text-xs font-semibold">{label}</span>
      </div>
      {isActive && (
        <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-violet-400 glow-pulse" />
      )}
    </button>
  );
}

function DerivStatusChecker() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const check = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/deriv/execute");
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setStatus({ connected: false, error: "Failed to check" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2">
      <button
        onClick={check}
        disabled={loading}
        className="rounded-md bg-secondary/60 px-3 py-1.5 text-xs font-medium hover:bg-secondary"
      >
        {loading ? "Checking…" : "Test Deriv connection"}
      </button>
      {status && (
        <div className={`mt-2 rounded-md p-2 text-xs ${
          status.connected ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"
        }`}>
          {status.connected ? (
            <>
              <div className="font-semibold">✓ Connected to Deriv</div>
              {status.balance !== null && status.balance !== undefined && (
                <div className="mt-0.5">Balance: ${status.balance?.toFixed(2)}</div>
              )}
              {status.openPositions !== undefined && (
                <div className="text-[10px]">Open positions: {status.openPositions}</div>
              )}
              <div className="text-[10px] opacity-70">Token: {status.tokenMasked}</div>
            </>
          ) : (
            <>
              <div className="font-semibold">⚠ Not connected</div>
              <div className="text-[10px]">{status.reason ?? status.error ?? "Unknown"}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
