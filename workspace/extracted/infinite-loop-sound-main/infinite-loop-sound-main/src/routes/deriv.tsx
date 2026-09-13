import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deriv, DERIV_APP_ID, ASSETS_BY_CLASS, type AssetClass } from "@/lib/engine/deriv";
import {
  Wallet,
  Loader,
  Sparkles,
  Plus,
  Trash,
  CircleCheck,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  loadKeys,
  addKey,
  removeKey,
  toggleKey,
  PROVIDER_LABELS,
  PROVIDER_DEFAULT_MODEL,
  type AIProvider,
  type AIKey,
} from "@/lib/ai/client";
import {
  loadAccounts,
  addAccount,
  removeAccount,
  setActiveAccount,
  getActiveAccount,
  type DerivAccount,
} from "@/lib/deriv/accounts";

export const Route = createFileRoute("/deriv")({
  head: () => ({
    meta: [
      { title: "Deriv API & AI — DivergenceIQ" },
      {
        name: "description",
        content: "Connect your Deriv API token and optionally bring your own AI key.",
      },
    ],
  }),
  component: DerivPage,
});

function DerivPage() {
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [accounts, setAccounts] = useState<DerivAccount[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAccounts(loadAccounts());
    setActiveId(getActiveAccount()?.id ?? null);
    const h = () => {
      setAccounts(loadAccounts());
      setActiveId(getActiveAccount()?.id ?? null);
    };
    window.addEventListener("diq:deriv-accounts", h);
    window.addEventListener("diq:deriv-active", h);
    return () => {
      window.removeEventListener("diq:deriv-accounts", h);
      window.removeEventListener("diq:deriv-active", h);
    };
  }, []);

  const connectAccount = async () => {
    if (!token.trim()) {
      toast.error("Paste your Deriv API token (needs Trade scope for the bot)");
      return;
    }
    setLoading(true);
    try {
      const [list, scopes] = await Promise.all([
        deriv.accountList(token.trim()),
        deriv.tokenScopes(token.trim()).catch(() => [] as string[]),
      ]);
      const primary = list[0] || {};
      const canTrade = scopes.includes("trade") || scopes.includes("admin");
      if (!canTrade) {
        toast.warning(
          "Connected, but token lacks Trade scope — auto-bot orders will be blocked. Generate a token with Read + Trade enabled.",
        );
      }
      addAccount({
        label:
          label.trim() ||
          (primary.loginid
            ? `${primary.loginid} (${primary.is_virtual ? "Demo" : "Real"})`
            : "Deriv account"),
        token: token.trim(),
        loginid: primary.loginid,
        currency: primary.currency,
        isVirtual: primary.is_virtual,
        scopes,
        canTrade,
      });
      setToken("");
      setLabel("");
      if (canTrade) toast.success(`Connected ${list.length} account(s) · Trade scope ✓`);
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  // AI keys (multi)
  const [keys, setKeys] = useState<AIKey[]>([]);
  useEffect(() => {
    setKeys(loadKeys());
    const h = () => setKeys(loadKeys());
    window.addEventListener("diq:ai-keys", h);
    return () => window.removeEventListener("diq:ai-keys", h);
  }, []);
  const [aiProvider, setAiProvider] = useState<AIProvider>("openai");
  const [aiKey, setAiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiLabel, setAiLabel] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const onAddKey = () => {
    if (aiProvider !== "lovable" && aiProvider !== "gguf" && !aiKey) {
      toast.error("Enter the API key");
      return;
    }
    if (aiProvider === "gguf" && !aiBaseUrl) {
      toast.error("Enter the llama.cpp server URL (e.g. http://localhost:8080)");
      return;
    }
    addKey({
      provider: aiProvider,
      apiKey: aiKey,
      model: aiModel || PROVIDER_DEFAULT_MODEL[aiProvider],
      label: aiLabel || PROVIDER_LABELS[aiProvider],
      baseUrl: aiBaseUrl || undefined,
    });
    setAiKey("");
    setAiModel("");
    setAiLabel("");
    setAiBaseUrl("");
    toast.success("API key added");
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" /> Deriv Accounts & AI Keys
          </h1>
          <p className="text-sm text-muted-foreground">
            Add multiple Deriv accounts and switch between them. For the auto-trader, your token
            needs Trade scope (not just Read). The app keeps working without any keys — Deriv ticks
            stream via the public app_id <code className="text-[10px]">{String(DERIV_APP_ID)}</code>
            .
          </p>
        </div>

        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider">Connected Deriv Accounts</h2>
          {accounts.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No accounts yet. Add a Deriv API token below to enable trading & balance lookups.
            </p>
          )}
          {accounts.map((a) => (
            <div
              key={a.id}
              className={`flex items-center justify-between p-2 rounded border ${activeId === a.id ? "border-primary bg-primary/5" : "border-border bg-background"} text-sm`}
            >
              <div>
                <div className="font-medium flex items-center gap-2">
                  {a.label}{" "}
                  {activeId === a.id && <CircleCheck className="w-3.5 h-3.5 text-primary" />}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {a.loginid || "—"} · {a.isVirtual ? "Demo" : "Real"} · {a.currency || ""}
                </div>
                <div className="text-[10px] mt-0.5 flex items-center gap-1">
                  {a.canTrade ? (
                    <span className="text-bull flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Trade scope
                    </span>
                  ) : (
                    <span className="text-bear flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" />
                      Read-only — bot blocked
                    </span>
                  )}
                  {a.scopes && a.scopes.length > 0 && (
                    <span className="text-muted-foreground">· {a.scopes.join(", ")}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5">
                {activeId !== a.id && (
                  <Button size="sm" variant="outline" onClick={() => setActiveAccount(a.id)}>
                    Use
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    removeAccount(a.id);
                    toast.success("Removed");
                  }}
                >
                  <Trash className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <div className="grid md:grid-cols-2 gap-3 pt-2 border-t border-border">
            <div>
              <label className="text-xs text-muted-foreground">Label (optional)</label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Demo CR123 / Real Live"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                API Token (Trade scope for auto-bot)
              </label>
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="paste Deriv API token"
              />
            </div>
          </div>
          <Button size="sm" onClick={connectAccount} disabled={loading}>
            {loading ? (
              <Loader className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5 mr-1.5" />
            )}{" "}
            Add account
          </Button>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-elite" /> AI Provider Keys (unlimited)
          </h2>
          <p className="text-xs text-muted-foreground">
            Add as many keys as you want — including multiple keys for the same provider. Calls go
            through our server proxy (fixes CORS) and auto-rotate when a key hits a rate limit.
            Lovable AI works built-in with no key needed.
          </p>

          {keys.length > 0 && (
            <div className="space-y-1.5">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className={`flex items-center justify-between p-2 rounded border border-border bg-background text-sm ${k.disabled ? "opacity-50" : ""}`}
                >
                  <div>
                    <div className="font-medium">
                      {k.label || PROVIDER_LABELS[k.provider]}{" "}
                      <span className="text-[10px] text-muted-foreground">
                        · {PROVIDER_LABELS[k.provider]} · {k.model}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      used {k.used} · failed {k.failed}
                      {k.lastError ? ` · last: ${k.lastError.slice(0, 60)}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => toggleKey(k.id)}>
                      {k.disabled ? "Enable" : "Disable"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeKey(k.id)}>
                      <Trash className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-3 pt-2 border-t border-border">
            <div>
              <label className="text-xs text-muted-foreground">Provider</label>
              <select
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value as AIProvider)}
                className="w-full bg-input border border-border rounded px-2 py-2 text-sm"
              >
                {(Object.keys(PROVIDER_LABELS) as AIProvider[]).map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">
                API key {aiProvider === "lovable" && "(not needed — built-in)"}
              </label>
              <Input
                type="password"
                value={aiKey}
                onChange={(e) => setAiKey(e.target.value)}
                placeholder={aiProvider === "lovable" ? "(leave blank)" : "sk-..."}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Label</label>
              <Input
                value={aiLabel}
                onChange={(e) => setAiLabel(e.target.value)}
                placeholder={`${PROVIDER_LABELS[aiProvider]} #1`}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Model</label>
              <Input
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder={PROVIDER_DEFAULT_MODEL[aiProvider]}
              />
            </div>
            {aiProvider === "gguf" && (
              <div>
                <label className="text-xs text-muted-foreground">llama.cpp server URL</label>
                <Input
                  value={aiBaseUrl}
                  onChange={(e) => setAiBaseUrl(e.target.value)}
                  placeholder="http://localhost:8080"
                />
              </div>
            )}
          </div>
          <Button size="sm" onClick={onAddKey}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add key
          </Button>
          {aiProvider === "gguf" && (
            <p className="text-[11px] text-muted-foreground">
              Tip: run any .gguf model with{" "}
              <code>llama-server -m model.gguf --host 0.0.0.0 --port 8080</code> and point this
              here.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-4 space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider">Available Markets</h2>
          <p className="text-xs text-muted-foreground">
            All scannable via the Deriv public stream — no token required.
          </p>
          <div className="grid md:grid-cols-2 gap-3 text-xs">
            {(Object.keys(ASSETS_BY_CLASS) as AssetClass[]).map((cls) => (
              <div key={cls} className="rounded border border-border bg-background p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {cls} ({ASSETS_BY_CLASS[cls].length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {ASSETS_BY_CLASS[cls].slice(0, 12).map((a) => (
                    <span
                      key={a.symbol}
                      className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]"
                    >
                      {a.display}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
