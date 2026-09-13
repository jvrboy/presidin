import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { DottedBackground } from "@/components/app/DottedBackground";
import { EntropyBackground } from "@/components/app/EntropyBackground";
import { FileTree, type FileNode } from "@/components/app/FileTree";
import { Cpu, ArrowRight, Sparkles, Activity, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome — DivergenceIQ" },
      {
        name: "description",
        content:
          "An on-device AI + real-time signal engine for traders. Browse the project, then load a model locally.",
      },
    ],
  }),
  component: WelcomePage,
});

const TREE: FileNode = {
  name: "divergenceiq/",
  type: "dir",
  children: [
    {
      name: "src/",
      type: "dir",
      children: [
        {
          name: "routes/",
          type: "dir",
          children: [
            { name: "welcome.tsx", type: "file", hint: "you are here" },
            { name: "local-ai.tsx", type: "file", hint: "GGUF in-browser" },
            { name: "chat.tsx", type: "file" },
            { name: "signals.tsx", type: "file" },
            { name: "neural.tsx", type: "file", hint: "confluence engine" },
            { name: "sentiment.tsx", type: "file" },
            { name: "dark-pool.tsx", type: "file" },
            { name: "options-flow.tsx", type: "file" },
            { name: "calendar.tsx", type: "file" },
          ],
        },
        {
          name: "lib/",
          type: "dir",
          children: [
            { name: "engine/deriv.ts", type: "file", hint: "live ticks" },
            { name: "engine/signal.ts", type: "file" },
            { name: "engine/indicators.ts", type: "file" },
            { name: "ai/client.ts", type: "file" },
            {
              name: "executor/",
              type: "dir",
              children: [
                { name: "runtimes.ts", type: "file" },
                { name: "auto-correct.ts", type: "file" },
              ],
            },
            { name: "skills/list.ts", type: "file", hint: "50+ skills" },
          ],
        },
        {
          name: "components/",
          type: "dir",
          children: [
            { name: "app/EntropyBackground.tsx", type: "file" },
            { name: "app/DottedBackground.tsx", type: "file" },
            { name: "app/FileTree.tsx", type: "file" },
          ],
        },
      ],
    },
    {
      name: "supabase/",
      type: "dir",
      children: [
        {
          name: "functions/hf-proxy/",
          type: "dir",
          children: [{ name: "index.ts", type: "file", hint: "Range-aware HF proxy" }],
        },
        { name: "migrations/", type: "dir" },
      ],
    },
    { name: "ROADMAP.md", type: "file" },
  ],
};

function WelcomePage() {
  return (
    <AppShell>
      <div className="relative min-h-[calc(100dvh-4rem)] overflow-hidden">
        <DottedBackground />
        <EntropyBackground />

        <div className="relative px-4 md:px-8 py-12 md:py-20 max-w-6xl mx-auto">
          {/* Hero */}
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card/60 backdrop-blur text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <Sparkles className="w-3 h-3 text-amber-400" />
              new · on-device inference
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
              Run AI <span className="text-primary">on your device</span>.
              <br />
              Trade on <span className="text-bull">live signals</span>.
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
              DivergenceIQ pairs a private, in-browser GGUF model runtime with a real-time
              confluence engine powered by the public Deriv tick stream. Your prompts stay local.
              Your signals stay live.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link to="/local-ai">
                <Button size="lg" className="gap-2 group">
                  <Cpu className="w-4 h-4" />
                  Try Local AI
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link to="/signals">
                <Button size="lg" variant="outline" className="gap-2">
                  <Activity className="w-4 h-4" />
                  See live signals
                </Button>
              </Link>
            </div>
          </div>

          {/* Feature grid */}
          <div className="mt-16 grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[
              {
                icon: <Cpu className="w-4 h-4 text-primary" />,
                title: "On-device GGUF",
                body: "Load any .gguf model up to 2 GB. WASM inference. Zero data leaves your browser.",
              },
              {
                icon: <Activity className="w-4 h-4 text-bull" />,
                title: "Live Deriv feed",
                body: "Tick-level WebSocket stream across 30+ instruments. Public API, no key required.",
              },
              {
                icon: <Zap className="w-4 h-4 text-amber-400" />,
                title: "Auto-correct executor",
                body: "Generate, run, observe, fix. Multi-language code with a self-healing loop.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-border bg-card/60 backdrop-blur p-4 hover:border-primary/40 transition"
              >
                <div className="flex items-center gap-2 mb-2">
                  {f.icon}
                  <span className="text-sm font-semibold">{f.title}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>

          {/* File tree showcase */}
          <div className="mt-16 grid md:grid-cols-[1fr_minmax(280px,400px)] gap-6 items-start">
            <div className="space-y-4">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Built in the open.</h2>
              <p className="text-sm md:text-base text-muted-foreground">
                Everything you see is a single TanStack-Start app with a Supabase backend, a Deriv
                WebSocket engine, and a wllama runtime. Browse the source structure on the right.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Link to="/local-ai">
                  <Button className="gap-2 w-full sm:w-auto">
                    Load a model now
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
            <FileTree root={TREE} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
