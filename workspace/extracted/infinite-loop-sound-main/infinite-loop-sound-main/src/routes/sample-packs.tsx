import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useRef } from "react";
import { ProCard, SectionHeader, StatTile, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderOpen, Upload, Play, Music, Layers, Search, Trash } from "lucide-react";
import {
  createBuiltinPack,
  importFolder,
  importFiles,
  loadSampleFile,
  guessCategory,
  playOneShot,
  SAMPLE_CATEGORIES,
  type SamplePack,
  type Sample,
} from "@/lib/audio/sample-packs";
import { AudioEngine } from "@/lib/audio/engine";

export const Route = createFileRoute("/sample-packs")({
  head: () => ({
    meta: [
      { title: "Sample Packs — DivergenceIQ" },
      {
        name: "description",
        content:
          "Sample pack manager with local folder import, sample selector, and one-shot playback.",
      },
    ],
  }),
  component: SamplePacksPage,
});

function SamplePacksPage() {
  const [packs, setPacks] = useState<SamplePack[]>([]);
  const [selectedPack, setSelectedPack] = useState<SamplePack | null>(null);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const ctx = AudioEngine.ctx ?? new AudioContext();
    ctxRef.current = ctx;
    const builtin = createBuiltinPack(ctx);
    setPacks([builtin]);
    setSelectedPack(builtin);
  }, []);

  const handleImportFolder = async () => {
    if (!ctxRef.current) return;
    setBusy(true);
    try {
      const pack = await importFolder(ctxRef.current, (loaded, total) =>
        setProgress({ loaded, total }),
      );
      if (pack) {
        setPacks((p) => [...p, pack]);
        setSelectedPack(pack);
      }
    } catch (e) {
      console.error(e);
      alert("Folder import not supported in this browser. Use file import instead.");
    } finally {
      setBusy(false);
    }
  };

  const handleImportFiles = async (files: FileList) => {
    if (!ctxRef.current) return;
    setBusy(true);
    try {
      const pack = await importFiles(ctxRef.current, files, (loaded, total) =>
        setProgress({ loaded, total }),
      );
      setPacks((p) => [...p, pack]);
      setSelectedPack(pack);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handlePlay = (sample: Sample) => {
    if (!ctxRef.current || !sample.buffer) return;
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    playOneShot(ctxRef.current, sample);
  };

  const filtered =
    selectedPack?.samples.filter((s) => {
      if (category !== "all" && s.category !== category) return false;
      if (filter && !s.name.toLowerCase().includes(filter.toLowerCase())) return false;
      return true;
    }) ?? [];

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="Sample Packs"
          subtitle="Import local folders, browse samples by category, and trigger one-shots."
          icon={<Layers className="w-5 h-5" />}
          action={<Badge variant="outline">{packs.length} packs</Badge>}
        />

        <ProCard
          title="Import"
          description="Import a local folder (File System Access API) or individual files."
          icon={<FolderOpen className="w-4 h-4" />}
        >
          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleImportFolder} disabled={busy}>
              <FolderOpen className="w-4 h-4" /> Import Folder
            </Button>
            <Input
              type="file"
              multiple
              accept="audio/*"
              onChange={(e) => e.target.files && handleImportFiles(e.target.files)}
              className="flex-1"
            />
          </div>
          {busy && progress.total > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              Loading… {progress.loaded}/{progress.total}
            </div>
          )}
        </ProCard>

        <ProCard
          title="Packs"
          description="Select a sample pack to browse."
          icon={<Music className="w-4 h-4" />}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {packs.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPack(p)}
                className={`text-left rounded border p-3 transition-all ${
                  selectedPack?.id === p.id
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-card/80"
                }`}
              >
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.samples.length} samples</div>
                <div className="text-[10px] text-muted-foreground">{p.source}</div>
              </button>
            ))}
          </div>
        </ProCard>

        {selectedPack && (
          <ProCard
            title={selectedPack.name}
            description={`${filtered.length} samples`}
            icon={<Search className="w-4 h-4" />}
          >
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Input
                  placeholder="Search samples…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="flex-1"
                />
                <select
                  className="bg-background border border-border rounded px-2 py-2 text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="all">All</option>
                  {SAMPLE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {filtered.map((s) => (
                  <div key={s.id} className="p-2 rounded border border-border bg-card">
                    <div className="text-xs font-mono truncate">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {s.category} · {s.durationSec.toFixed(1)}s
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1 w-full"
                      onClick={() => handlePlay(s)}
                      disabled={!s.buffer}
                    >
                      <Play className="w-3 h-3" /> Play
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </ProCard>
        )}
      </div>
    </AppShell>
  );
}
