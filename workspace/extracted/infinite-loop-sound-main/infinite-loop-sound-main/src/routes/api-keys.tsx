import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  Key,
  Copy,
  Trash,
  Plus,
  ExternalLink,
  Webhook,
  Brain,
  Zap,
  Shield,
  BarChart,
  Settings,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ToggleLeft,
  ToggleRight,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import {
  AI_PROVIDERS,
  loadProviderKeys,
  addProviderKey,
  removeProviderKey,
  toggleProviderKey,
  type AIProviderKey,
} from "@/lib/ai/providers";

export const Route = createFileRoute("/api-keys")({
  head: () => ({
    meta: [
      { title: "API Keys & AI Providers — DivergenceIQ" },
      { name: "description", content: "Manage API keys, AI providers, and webhook subscriptions." },
    ],
  }),
  component: ApiKeysPage,
});

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function randomKey() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return (
    "sk_live_" +
    Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

function ApiKeysPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [hooks, setHooks] = useState<any[]>([]);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [hookUrl, setHookUrl] = useState("");
  const [hookMin, setHookMin] = useState(70);
  const [expiry, setExpiry] = useState<"24h" | "30d" | "1y" | "never">("never");

  // AI Provider state
  const [providerKeys, setProviderKeys] = useState<AIProviderKey[]>([]);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [newKeyProvider, setNewKeyProvider] = useState("");
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [newKeyModel, setNewKeyModel] = useState("");
  const [showKeyValues, setShowKeyValues] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"providers" | "api" | "webhooks">("providers");

  const refreshProviderKeys = () => setProviderKeys(loadProviderKeys());

  const refresh = async () => {
    const [k, w] = await Promise.all([
      supabase.from("api_keys").select("*").order("created_at", { ascending: false }),
      supabase.from("webhook_subscriptions").select("*").order("created_at", { ascending: false }),
    ]);
    let list = (k.data || []) as any[];
    if (list.length === 0) {
      const key = randomKey();
      const hash = await sha256Hex(key);
      await supabase
        .from("api_keys")
        .insert({ label: "default", key_hash: hash, last4: key.slice(-4) });
      setCreated(key);
      const { data } = await supabase
        .from("api_keys")
        .select("*")
        .order("created_at", { ascending: false });
      list = data || [];
    }
    setKeys(list);
    setHooks(w.data || []);
  };
  useEffect(() => {
    refresh();
    refreshProviderKeys();
  }, []);

  const create = async () => {
    if (!label.trim()) {
      toast.error("Label required");
      return;
    }
    const key = randomKey();
    const hash = await sha256Hex(key);
    const expires_at =
      expiry === "never"
        ? null
        : expiry === "24h"
          ? new Date(Date.now() + 24 * 3600 * 1000).toISOString()
          : expiry === "30d"
            ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
            : new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const { error } = await (supabase.from("api_keys") as any).insert({
      label,
      key_hash: hash,
      last4: key.slice(-4),
      expires_at,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setCreated(key);
    setLabel("");
    refresh();
  };
  const del = async (id: string) => {
    if (!confirm("Delete this key?")) return;
    await supabase.from("api_keys").delete().eq("id", id);
    refresh();
  };
  const addHook = async () => {
    if (!hookUrl.startsWith("http")) {
      toast.error("Need full https URL");
      return;
    }
    const { error } = await supabase
      .from("webhook_subscriptions")
      .insert({ url: hookUrl, min_score: hookMin });
    if (error) {
      toast.error(error.message);
      return;
    }
    setHookUrl("");
    refresh();
  };
  const delHook = async (id: string) => {
    await supabase.from("webhook_subscriptions").delete().eq("id", id);
    refresh();
  };

  const handleAddProviderKey = () => {
    if (!newKeyProvider || !newKeyValue.trim()) {
      toast.error("Select provider and enter API key");
      return;
    }
    addProviderKey(newKeyProvider, newKeyLabel, newKeyValue.trim(), newKeyModel || undefined);
    setNewKeyProvider("");
    setNewKeyLabel("");
    setNewKeyValue("");
    setNewKeyModel("");
    refreshProviderKeys();
    toast.success("API key added");
  };

  const handleRemoveProviderKey = (id: string) => {
    removeProviderKey(id);
    refreshProviderKeys();
    toast.success("Key removed");
  };

  const handleToggleKey = (id: string, enabled: boolean) => {
    toggleProviderKey(id, enabled);
    refreshProviderKeys();
  };

  const toggleShowKey = (id: string) => {
    setShowKeyValues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const providerStats = AI_PROVIDERS.map((p) => ({
    ...p,
    keyCount: providerKeys.filter((k) => k.provider === p.id).length,
    enabledCount: providerKeys.filter((k) => k.provider === p.id && k.enabled).length,
    totalRequests: providerKeys
      .filter((k) => k.provider === p.id)
      .reduce((a, k) => a + k.requestCount, 0),
  }));

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6 animate-page-enter">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Key className="w-6 h-6 text-primary" /> API Keys & AI Providers
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure AI providers with unlimited API keys, manage public API keys and webhooks.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 glass-card rounded-xl p-1">
          {[
            {
              id: "providers" as const,
              label: "AI Providers",
              icon: Brain,
              count: providerKeys.length,
            },
            { id: "api" as const, label: "Public API", icon: Key, count: keys.length },
            { id: "webhooks" as const, label: "Webhooks", icon: Webhook, count: hooks.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "glass-button-active text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${activeTab === tab.id ? "bg-primary/20 text-primary" : "bg-muted"}`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* ═══ AI PROVIDERS TAB ═══ */}
        {activeTab === "providers" && (
          <div className="space-y-4">
            {/* Add New Key */}
            <section className="glass-card rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Plus className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Add API Key</span>
                <span className="text-[10px] text-muted-foreground">
                  — unlimited keys per provider, round-robin load balanced
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={newKeyProvider}
                  onChange={(e) => {
                    setNewKeyProvider(e.target.value);
                    setNewKeyModel("");
                  }}
                  className="glass-input rounded-lg px-3 py-2 text-sm w-full"
                >
                  <option value="">Select Provider</option>
                  {AI_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.icon} {p.name}
                    </option>
                  ))}
                </select>
                {newKeyProvider && (
                  <select
                    value={newKeyModel}
                    onChange={(e) => setNewKeyModel(e.target.value)}
                    className="glass-input rounded-lg px-3 py-2 text-sm w-full"
                  >
                    <option value="">Default Model</option>
                    {AI_PROVIDERS.find((p) => p.id === newKeyProvider)?.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="glass-input flex-[0.3]"
                />
                <Input
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  placeholder="API Key"
                  type="password"
                  className="glass-input flex-[0.7]"
                />
                <Button
                  onClick={handleAddProviderKey}
                  disabled={!newKeyProvider || !newKeyValue.trim()}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add
                </Button>
              </div>
            </section>

            {/* Provider Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {providerStats.map((provider) => (
                <div
                  key={provider.id}
                  className="glass-card glass-card-hover rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedProvider(expandedProvider === provider.id ? null : provider.id)
                    }
                    className="w-full p-4 text-left flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{provider.icon}</span>
                      <div>
                        <div className="font-semibold text-sm">{provider.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {provider.description.slice(0, 45)}...
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-mono px-2 py-0.5 rounded-lg ${provider.enabledCount > 0 ? "bg-bull/15 text-bull" : "bg-muted text-muted-foreground"}`}
                      >
                        {provider.enabledCount}/{provider.keyCount} keys
                      </span>
                      {expandedProvider === provider.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </button>

                  {expandedProvider === provider.id && (
                    <div className="px-4 pb-4 space-y-2 border-t border-border/50 pt-3">
                      {providerKeys.filter((k) => k.provider === provider.id).length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          No keys configured. Add one above.
                        </p>
                      ) : (
                        providerKeys
                          .filter((k) => k.provider === provider.id)
                          .map((pk) => (
                            <div
                              key={pk.id}
                              className="flex items-center gap-2 p-2 rounded-lg bg-background/30 text-xs"
                            >
                              <button
                                onClick={() => handleToggleKey(pk.id, !pk.enabled)}
                                className="shrink-0"
                              >
                                {pk.enabled ? (
                                  <ToggleRight className="w-5 h-5 text-bull" />
                                ) : (
                                  <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                                )}
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{pk.label}</div>
                                <div className="text-muted-foreground flex items-center gap-2">
                                  <button
                                    onClick={() => toggleShowKey(pk.id)}
                                    className="hover:text-foreground"
                                  >
                                    {showKeyValues.has(pk.id) ? (
                                      <EyeOff className="w-3 h-3" />
                                    ) : (
                                      <Eye className="w-3 h-3" />
                                    )}
                                  </button>
                                  <span className="font-mono truncate">
                                    {showKeyValues.has(pk.id)
                                      ? pk.key
                                      : `${"•".repeat(20)}${pk.key.slice(-4)}`}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-mono">{pk.requestCount} reqs</div>
                                <div className="text-muted-foreground">{pk.avgLatencyMs}ms avg</div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveProviderKey(pk.id)}
                                className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ))
                      )}
                      <a
                        href={provider.docsUrl}
                        target="_blank"
                        rel="noopener"
                        className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" /> {provider.name} docs
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ PUBLIC API TAB ═══ */}
        {activeTab === "api" && (
          <div className="space-y-4">
            <section className="glass-card rounded-xl p-4 space-y-3">
              <div className="flex gap-2">
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="key label (e.g. n8n production)"
                  className="glass-input"
                />
                <select
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value as any)}
                  className="glass-input rounded px-2 text-sm"
                >
                  <option value="24h">24h</option>
                  <option value="30d">30 days</option>
                  <option value="1y">1 year</option>
                  <option value="never">No expiry</option>
                </select>
                <Button onClick={create}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Create
                </Button>
              </div>
              {created && (
                <div className="p-3 rounded-lg border border-bull/40 bg-bull/10 space-y-1">
                  <div className="text-[11px] uppercase font-bold text-bull">
                    Save this key now — it won't be shown again
                  </div>
                  <code className="block text-xs font-mono break-all select-all bg-background/50 p-2 rounded">
                    {created}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(created);
                      toast.success("Copied");
                    }}
                  >
                    <Copy className="w-3 h-3 mr-1" /> Copy
                  </Button>
                </div>
              )}
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-background/30"
                >
                  <div>
                    <div className="text-sm font-medium">{k.label}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      sk_live_...{k.last4}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => del(k.id)}
                    className="text-destructive"
                  >
                    <Trash className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </section>
          </div>
        )}

        {/* ═══ WEBHOOKS TAB ═══ */}
        {activeTab === "webhooks" && (
          <div className="space-y-4">
            <section className="glass-card rounded-xl p-4 space-y-3">
              <div className="flex gap-2">
                <Input
                  value={hookUrl}
                  onChange={(e) => setHookUrl(e.target.value)}
                  placeholder="https://your-endpoint.com/webhook"
                  className="glass-input flex-1"
                />
                <Input
                  type="number"
                  value={hookMin}
                  onChange={(e) => setHookMin(+e.target.value)}
                  className="glass-input w-20"
                  min={0}
                  max={100}
                />
                <Button onClick={addHook}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add
                </Button>
              </div>
              {hooks.map((h: any) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-background/30"
                >
                  <div>
                    <div className="text-sm font-mono truncate max-w-xs">{h.url}</div>
                    <div className="text-xs text-muted-foreground">
                      Min score: {h.min_score} | Last:{" "}
                      {h.last_delivery_at ? new Date(h.last_delivery_at).toLocaleString() : "never"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => delHook(h.id)}
                    className="text-destructive"
                  >
                    <Trash className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
