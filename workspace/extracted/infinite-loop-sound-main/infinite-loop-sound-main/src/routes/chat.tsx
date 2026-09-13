import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Send,
  Loader as Loader,
  Plus,
  MessageSquare,
  Sparkles,
  Cpu,
  Files,
  Settings,
  Activity,
  CircleCheck as CircleCheck,
} from "lucide-react";
import { aiChat, loadKeys, PROVIDER_LABELS } from "@/lib/ai/client";
import { toast } from "sonner";
import { useFolders, useThreads, useUsage, type Msg } from "@/hooks/use-chat-store";
import { ChatList } from "@/components/chat/ChatList";
import { ArtifactsPanel } from "@/components/chat/ArtifactsPanel";
import { CustomizePanel } from "@/components/chat/CustomizePanel";
import { UsagePanel } from "@/components/chat/UsagePanel";
import { runSwarm, type SwarmAgentOutput } from "@/lib/agents/swarm";
import { Users, ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "AI Chat — DivergenceIQ" },
      {
        name: "description",
        content:
          "Multi-pane AI chat: history, artifacts, customize, and usage — with a 12-stage deep-reasoning pipeline.",
      },
    ],
  }),
  component: ChatPage,
});

const SYSTEM_PROMPT = `You are DivergenceIQ Agent, an expert trading assistant focused on divergence-based confluence analysis across forex, indices, crypto, metals, synthetics, and stocks.

For EVERY single message, you MUST internally execute this precise 12-stage reasoning pipeline before writing your final response. Do not print the intermediate stages.
1. REASONING / 2. THINKING / 3. SUPERPROMPT / 4. THINKING AGAIN /
5. REASONS AGAIN / 6. LOOKS FOR POSSIBLE MISTAKES /
7. REASONS AND FIXES / 8. THINKS AGAIN (risk) / 9. TO-DO LIST /
10. THINKS ABOUT TO-DO / 11. REASONS IT / 12. STARTS RESPONSE.

Be concise, direct, exceptionally professional.`;

const PIPELINE_STEPS = [
  { name: "REASONING", desc: "Analyzing trading context…" },
  { name: "THINKING", desc: "Evaluating divergence rules…" },
  { name: "SUPERPROMPT", desc: "Formulating guardrails…" },
  { name: "THINKING AGAIN", desc: "Challenging assumptions…" },
  { name: "REASONS AGAIN", desc: "Analyzing confluence…" },
  { name: "FINDING MISTAKES", desc: "Auditing for false signals…" },
  { name: "FIXING", desc: "Resolving conflicts…" },
  { name: "RISK PASS", desc: "Integrating risk model…" },
  { name: "TO-DO", desc: "Compiling response outline…" },
  { name: "REFINING", desc: "Maximising clarity…" },
  { name: "SYNTHESISING", desc: "Institutional bias…" },
  { name: "DRAFTING", desc: "Final output…" },
];

type SidebarTab = "chats" | "artifacts" | "customize" | "usage";

// rough token estimator: chars/4 (English avg)
const estimateTokens = (s: string) => Math.ceil(s.length / 4);

function ChatPage() {
  const {
    threads,
    ready: threadsReady,
    create: createThread,
    update: updateThread,
    remove: removeThread,
    hardRemove: hardRemoveThread,
    restore: restoreThread,
    clone: cloneThread,
    move: moveThread,
    togglePin,
    toggleArchive,
  } = useThreads();
  const {
    folders,
    create: createFolder,
    rename: renameFolder,
    remove: removeFolder,
  } = useFolders();
  const { track } = useUsage();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [keysCount, setKeysCount] = useState(0);
  const [tab, setTab] = useState<SidebarTab>("chats");
  const [showArchived, setShowArchived] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [pipelineActive, setPipelineActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [swarmMode, setSwarmMode] = useState(false);
  const [swarmOutputs, setSwarmOutputs] = useState<SwarmAgentOutput[]>([]);
  const [swarmExpanded, setSwarmExpanded] = useState<Record<string, boolean>>({});

  // bootstrap: pick first thread, or create one
  useEffect(() => {
    if (!threadsReady || activeId) return;

    const firstOpenThread =
      threads.find((thread) => !thread.deleted && !thread.archived) ??
      threads.find((thread) => !thread.deleted) ??
      null;

    if (firstOpenThread) {
      setActiveId(firstOpenThread.id);
      return;
    }

    const thread = createThread("New chat");
    setActiveId(thread.id);
  }, [activeId, createThread, threads, threadsReady]);

  useEffect(() => {
    setKeysCount(loadKeys().length);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [threads, activeId, pipelineActive, currentStep]);

  const active = useMemo(() => threads.find((t) => t.id === activeId) ?? null, [threads, activeId]);

  const newChat = () => {
    const t = createThread("New chat");
    setActiveId(t.id);
    setTab("chats");
  };

  const send = async () => {
    if (!input.trim() || busy || !active) return;
    if (keysCount === 0) {
      toast.error("No API keys configured. Open /api-keys.");
      return;
    }
    const user: Msg = { role: "user", content: input.trim(), ts: Date.now() };
    const messagesWithUser = [...active.messages, user];
    updateThread(active.id, {
      messages: messagesWithUser,
      // auto-title from first user message
      title: active.messages.length === 0 ? user.content.slice(0, 40) : active.title,
    });

    setInput("");
    setBusy(true);
    setPipelineActive(true);
    setCurrentStep(0);

    const stepInterval = window.setInterval(() => {
      setCurrentStep((s) => Math.min(s + 1, PIPELINE_STEPS.length - 1));
    }, 750);

    const history = messagesWithUser.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      if (swarmMode) {
        setSwarmOutputs([]);
        const result = await runSwarm(user.content, { parallel: true });
        setSwarmOutputs(result.outputs);
        const reply =
          result.synthesized ??
          result.outputs
            .map((o) => `### ${o.name}\n${o.ok ? o.text : `[failed: ${o.error}]`}`)
            .join("\n\n");
        const assistant: Msg = {
          role: "assistant",
          content: reply,
          ts: Date.now(),
          provider: result.synthProvider,
        };
        updateThread(active.id, {
          messages: [...messagesWithUser, assistant],
        });
        track({
          ts: Date.now(),
          provider: result.synthProvider ?? "unknown",
          inputTokens: history.reduce((a, m) => a + estimateTokens(m.content), 0),
          outputTokens: estimateTokens(reply),
          threadId: active.id,
        });
      } else {
        const messages = [{ role: "system" as const, content: SYSTEM_PROMPT }, ...history];
        const res = await aiChat(messages);
        if (!res)
          throw new Error("AI request failed — no API key available or all providers exhausted.");
        const { text: reply, provider } = res;
        const assistant: Msg = {
          role: "assistant",
          content: reply,
          ts: Date.now(),
          provider,
        };
        updateThread(active.id, {
          messages: [...messagesWithUser, assistant],
        });
        track({
          ts: Date.now(),
          provider,
          inputTokens: history.reduce((a, m) => a + estimateTokens(m.content), 0),
          outputTokens: estimateTokens(reply),
          threadId: active.id,
        });
      }
    } catch (e: any) {
      const err: Msg = {
        role: "assistant",
        content: `⚠ Error: ${e?.message || "Unknown error"}`,
        ts: Date.now(),
      };
      updateThread(active.id, { messages: [...messagesWithUser, err] });
    } finally {
      clearInterval(stepInterval);
      setPipelineActive(false);
      setCurrentStep(0);
      setBusy(false);
    }
  };

  const TABS: Array<{ id: SidebarTab; label: string; icon: any }> = [
    { id: "chats", label: "Chats", icon: MessageSquare },
    { id: "artifacts", label: "Artifacts", icon: Files },
    { id: "customize", label: "Customize", icon: Settings },
    { id: "usage", label: "Usage", icon: Activity },
  ];

  return (
    <AppShell>
      <div className="h-[calc(100dvh-4rem)] grid grid-cols-1 md:grid-cols-[280px_1fr] overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col border-r border-border bg-card/40 backdrop-blur min-h-0">
          <div className="p-3 border-b border-border">
            <Button onClick={newChat} className="w-full justify-center gap-2">
              <Plus className="w-4 h-4" /> New chat
            </Button>
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-4 border-b border-border bg-muted/20">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`py-2 text-[10px] uppercase tracking-wider flex flex-col items-center gap-0.5 transition-colors ${
                  tab === t.id
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Panel */}
          <div className="flex-1 overflow-y-auto py-2">
            {tab === "chats" && (
              <>
                <div className="px-2 mb-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={showArchived}
                      onChange={(e) => {
                        setShowArchived(e.target.checked);
                        if (e.target.checked) setShowTrash(false);
                      }}
                    />
                    Show archived
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={showTrash}
                      onChange={(e) => {
                        setShowTrash(e.target.checked);
                        if (e.target.checked) setShowArchived(false);
                      }}
                    />
                    Trash
                  </label>
                </div>
                <ChatList
                  threads={threads}
                  folders={folders}
                  activeId={activeId}
                  onPick={(id) => setActiveId(id)}
                  onRename={(id, title) => updateThread(id, { title })}
                  onDelete={(id) => {
                    if (showTrash) hardRemoveThread(id);
                    else removeThread(id);
                    if (activeId === id) setActiveId(null);
                  }}
                  onTogglePin={togglePin}
                  onToggleArchive={toggleArchive}
                  onClone={(id) => {
                    const cloned = cloneThread(id);
                    if (cloned) setActiveId(cloned.id);
                  }}
                  onRestore={restoreThread}
                  onMove={moveThread}
                  showArchived={showArchived}
                  showTrash={showTrash}
                  onCreateFolder={(name) => createFolder(name)}
                  onRenameFolder={renameFolder}
                  onDeleteFolder={(folderId) => {
                    threads
                      .filter((thread) => thread.folderId === folderId)
                      .forEach((thread) => moveThread(thread.id, null));
                    removeFolder(folderId);
                  }}
                />
              </>
            )}
            {tab === "artifacts" && <ArtifactsPanel threadId={activeId} />}
            {tab === "customize" && <CustomizePanel />}
            {tab === "usage" && <UsagePanel />}
          </div>

          <div className="p-2 border-t border-border text-[10px] text-muted-foreground flex items-center gap-1.5">
            <Cpu className="w-3 h-3" />
            {keysCount} provider key{keysCount === 1 ? "" : "s"}
          </div>
        </aside>

        {/* Main chat */}
        <section className="flex flex-col min-w-0">
          <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-medium truncate">{active?.title ?? "New chat"}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setSwarmMode((v) => !v);
                  setSwarmOutputs([]);
                }}
                title="Toggle agent swarm pipeline"
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-wider transition ${
                  swarmMode
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Swarm
              </button>
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {active?.messages.length ?? 0} msgs
              </span>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {active && active.messages.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <Sparkles className="w-8 h-8 mx-auto mb-2 text-primary" />
                <p className="text-sm">
                  Start a conversation about a setup, an indicator, or a strategy.
                </p>
              </div>
            )}
            {active?.messages.map((m, i) => (
              <div
                key={i}
                className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border"
                  }`}
                >
                  {m.content}
                  {m.provider && (
                    <div className="mt-1 text-[9px] uppercase tracking-wider opacity-60 font-mono">
                      {PROVIDER_LABELS[m.provider as keyof typeof PROVIDER_LABELS] || m.provider}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {pipelineActive && (
              <div className="space-y-1.5 ml-2">
                {PIPELINE_STEPS.map((step, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 text-xs transition-opacity ${
                      i <= currentStep ? "opacity-100" : "opacity-30"
                    }`}
                  >
                    {i < currentStep ? (
                      <CircleCheck className="w-3.5 h-3.5 text-bull" />
                    ) : i === currentStep ? (
                      <Loader className="w-3.5 h-3.5 animate-spin text-primary" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-muted" />
                    )}
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground w-44 truncate">
                      {step.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground italic truncate">
                      {step.desc}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {swarmMode && swarmOutputs.length > 0 && (
              <div className="space-y-2 ml-2 mt-3 border-t border-border pt-3">
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-primary">
                  <Users className="w-3.5 h-3.5" /> Agent Swarm Outputs
                </div>
                {swarmOutputs.map((o) => {
                  const key = `${o.role}-${o.name}`;
                  const expanded = swarmExpanded[key] ?? false;
                  return (
                    <div key={key} className="rounded-md border border-border bg-card/60">
                      <button
                        onClick={() => setSwarmExpanded((s) => ({ ...s, [key]: !expanded }))}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
                      >
                        {expanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <span className="text-xs font-medium">{o.name}</span>
                        {o.ok ? (
                          <span className="ml-auto text-[9px] font-mono uppercase text-bull">
                            ok
                          </span>
                        ) : (
                          <span className="ml-auto text-[9px] font-mono uppercase text-bear">
                            fail
                          </span>
                        )}
                        {o.provider && (
                          <span className="text-[9px] font-mono uppercase text-muted-foreground">
                            {PROVIDER_LABELS[o.provider] || o.provider}
                          </span>
                        )}
                      </button>
                      {expanded && (
                        <div className="px-3 pb-2 text-xs whitespace-pre-wrap text-muted-foreground">
                          {o.ok ? o.text : `Error: ${o.error}`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask about a setup, an indicator, a strategy…"
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-sans resize-none max-h-40 min-h-[40px] focus:outline-none focus:ring-1 focus:ring-primary"
                rows={1}
              />
              <Button onClick={send} disabled={busy || !input.trim()}>
                {busy ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
              Shift+Enter for newline · Enter to send
              {swarmMode && " · Swarm pipeline active"}
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
