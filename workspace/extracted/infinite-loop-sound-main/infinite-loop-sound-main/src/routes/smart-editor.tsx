import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { ProCard, SectionHeader, KpiGrid, StatTile, DataPanel } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Wand2,
  Scissors,
  Star,
  Search,
  Heart,
  ShieldCheck,
  Accessibility,
  Sparkles,
} from "lucide-react";
import {
  promptToEdit,
  autoEdit,
  highlightReel,
  contentSearch,
  emotionTag,
  copyrightCheck,
  accessibilityCheck,
  SMART_TOOLS,
} from "@/lib/media/media-smart";

export const Route = createFileRoute("/smart-editor")({
  head: () => ({
    meta: [{ title: "Smart Editor | Infinite Loop Sound" }],
  }),
  component: SmartEditorRoute,
});

function SmartEditorRoute() {
  const [output, setOutput] = useState<string>("");

  const runAction = (fn: () => unknown) => {
    try {
      const result = fn();
      setOutput(JSON.stringify(result, null, 2));
    } catch (e) {
      setOutput(`Error: ${(e as Error).message}`);
    }
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="Smart Editor"
          subtitle="AI-powered editing workflows: prompt-to-edit, auto-edit, highlights, search, emotion, copyright, accessibility"
        />

        <KpiGrid>
          <StatTile label="Smart Tools" value={SMART_TOOLS.length} />
          <StatTile label="AI Actions" value={8} />
          <StatTile label="Emotion Tags" value={6} />
          <StatTile label="Accessibility Checks" value={3} />
        </KpiGrid>

        <ProCard title="Prompt-to-Edit">
          <PromptToEditPanel onRun={runAction} />
        </ProCard>

        <ProCard title="Auto-Edit">
          <AutoEditPanel onRun={runAction} />
        </ProCard>

        <ProCard title="Highlight Reel">
          <HighlightReelPanel onRun={runAction} />
        </ProCard>

        <ProCard title="Content Search">
          <ContentSearchPanel onRun={runAction} />
        </ProCard>

        <ProCard title="Emotion Tagging">
          <EmotionTagPanel onRun={runAction} />
        </ProCard>

        <ProCard title="Copyright Check">
          <CopyrightPanel onRun={runAction} />
        </ProCard>

        <ProCard title="Accessibility Check">
          <AccessibilityPanel onRun={runAction} />
        </ProCard>

        {output && <DataPanel title="Output" data={output} />}
      </div>
    </AppShell>
  );
}

/* ---------- Panels ---------- */

function PromptToEditPanel({ onRun }: { onRun: (fn: () => unknown) => void }) {
  const [prompt, setPrompt] = useState(
    "Cut the boring parts, add a fade transition, and color grade for warm tones",
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Edit Prompt</Label>
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
      </div>
      <Button onClick={() => onRun(() => promptToEdit(prompt))}>
        <Wand2 className="h-4 w-4 mr-1" /> Parse Prompt
      </Button>
    </div>
  );
}

function AutoEditPanel({ onRun }: { onRun: (fn: () => unknown) => void }) {
  const [brief, setBrief] = useState("Create a 60-second promotional video with upbeat pacing");
  const [footageCount, setFootageCount] = useState(20);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Brief</Label>
        <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} />
      </div>
      <div className="space-y-2">
        <Label>Footage Count: {footageCount}</Label>
        <Slider
          value={[footageCount]}
          min={1}
          max={100}
          onValueChange={(v) => setFootageCount(v[0])}
        />
      </div>
      <Button onClick={() => onRun(() => autoEdit(brief, footageCount))}>
        <Scissors className="h-4 w-4 mr-1" /> Generate First Cut
      </Button>
    </div>
  );
}

function HighlightReelPanel({ onRun }: { onRun: (fn: () => unknown) => void }) {
  const [duration, setDuration] = useState(600);
  const [highlightCount, setHighlightCount] = useState(5);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Video Duration: {duration}s</Label>
        <Slider value={[duration]} min={60} max={3600} onValueChange={(v) => setDuration(v[0])} />
      </div>
      <div className="space-y-2">
        <Label>Highlight Count: {highlightCount}</Label>
        <Slider
          value={[highlightCount]}
          min={1}
          max={20}
          onValueChange={(v) => setHighlightCount(v[0])}
        />
      </div>
      <Button onClick={() => onRun(() => highlightReel(duration, highlightCount))}>
        <Star className="h-4 w-4 mr-1" /> Extract Highlights
      </Button>
    </div>
  );
}

function ContentSearchPanel({ onRun }: { onRun: (fn: () => unknown) => void }) {
  const [query, setQuery] = useState("sunset beach drone");
  const [librarySize, setLibrarySize] = useState(500);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Search Query</Label>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Library Size: {librarySize} clips</Label>
        <Slider
          value={[librarySize]}
          min={10}
          max={5000}
          onValueChange={(v) => setLibrarySize(v[0])}
        />
      </div>
      <Button onClick={() => onRun(() => contentSearch(query, librarySize))}>
        <Search className="h-4 w-4 mr-1" /> Search Library
      </Button>
    </div>
  );
}

function EmotionTagPanel({ onRun }: { onRun: (fn: () => unknown) => void }) {
  const [clipId, setClipId] = useState("clip-001");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Clip ID</Label>
        <Input value={clipId} onChange={(e) => setClipId(e.target.value)} />
      </div>
      <Button onClick={() => onRun(() => emotionTag(clipId))}>
        <Heart className="h-4 w-4 mr-1" /> Tag Emotions
      </Button>
    </div>
  );
}

function CopyrightPanel({ onRun }: { onRun: (fn: () => unknown) => void }) {
  const [mediaType, setMediaType] = useState("music");
  const types = ["music", "footage", "image", "voiceover", "graphic"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {types.map((t) => (
          <Badge
            key={t}
            variant={mediaType === t ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setMediaType(t)}
          >
            {t}
          </Badge>
        ))}
      </div>
      <Button onClick={() => onRun(() => copyrightCheck(mediaType))}>
        <ShieldCheck className="h-4 w-4 mr-1" /> Scan for Issues
      </Button>
    </div>
  );
}

function AccessibilityPanel({ onRun }: { onRun: (fn: () => unknown) => void }) {
  const [altText, setAltText] = useState(true);
  const [colorBlindSafe, setColorBlindSafe] = useState(true);
  const [captions, setCaptions] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={altText} onChange={(e) => setAltText(e.target.checked)} />
          Alt Text
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={colorBlindSafe}
            onChange={(e) => setColorBlindSafe(e.target.checked)}
          />
          Color-Blind Safe
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={captions}
            onChange={(e) => setCaptions(e.target.checked)}
          />
          Closed Captions
        </label>
      </div>
      <Button
        onClick={() =>
          onRun(() => accessibilityCheck({ altText, colorBlindSafe, closedCaptions: captions }))
        }
      >
        <Accessibility className="h-4 w-4 mr-1" /> Run Check
      </Button>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4" />
        <span>All three checks must pass for full accessibility compliance.</span>
      </div>
    </div>
  );
}
