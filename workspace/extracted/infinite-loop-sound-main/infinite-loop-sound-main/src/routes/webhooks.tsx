import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState } from "react";
import { Copy, Check, Zap, Plus, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/webhooks")({ component: WebhooksPage });

function WebhooksPage() {
  const [copied, setCopied] = useState(false);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [minConfidence, setMinConfidence] = useState(70);
  const [webhookUrl, setWebhookUrl] = useState("");
  const generatedUrl = `https://infinite-loop-sound.vercel.app/api/webhook/tradingview?key=${Math.random().toString(36).slice(2, 11)}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Webhook URL copied");
  };

  const addWebhook = () => {
    if (!webhookUrl) {
      toast.error("Enter webhook URL");
      return;
    }
    setWebhooks([...webhooks, { id: Date.now(), url: webhookUrl, created: new Date() }]);
    setWebhookUrl("");
    toast.success("Webhook added");
  };

  return (
    <AppShell>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Zap className="w-8 h-8 text-primary" /> Webhook Integration
        </h1>

        {/* TradingView Setup */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-lg font-bold">TradingView Setup</h2>
          <p className="text-xs text-muted-foreground">
            Copy this URL into your TradingView alert webhook:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={generatedUrl}
              readOnly
              className="flex-1 px-3 py-2 rounded bg-muted text-xs font-mono"
            />
            <Button onClick={copyToClipboard} variant="outline" size="sm" className="gap-1.5">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
            <p>Message format: {'{"symbol": "EURUSD", "action": "buy", "tp": 1.12, "sl": 1.10}'}</p>
          </div>
        </div>

        {/* Confidence Settings */}
        <div className="rounded-lg border border-border bg-card p-4">
          <label className="text-xs font-medium">Min Signal Confidence: {minConfidence}%</label>
          <input
            type="range"
            min="0"
            max="100"
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="w-full mt-2"
          />
        </div>

        {/* Connected Webhooks */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-lg font-bold">Connected Webhooks ({webhooks.length})</h2>
          <div className="space-y-2 max-h-64 overflow-auto">
            {webhooks.map((wh) => (
              <div
                key={wh.id}
                className="flex items-center justify-between p-2 bg-muted rounded text-xs"
              >
                <div className="flex-1">
                  <p className="font-mono truncate">{wh.url}</p>
                  <p className="text-muted-foreground text-[10px]">{wh.created.toLocaleString()}</p>
                </div>
                <Button
                  onClick={() => setWebhooks(webhooks.filter((w) => w.id !== wh.id))}
                  variant="ghost"
                  size="sm"
                >
                  <Trash className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-2 border-t border-border">
            <Input
              placeholder="Paste external webhook URL"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="text-xs"
            />
            <Button onClick={addWebhook} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
