import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { ProCard, SectionHeader, KpiGrid, StatTile, MeterBar, DataPanel } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Video,
  Keyboard,
  Image,
  MousePointer,
  ZoomIn,
  Scissors,
  VolumeX,
  Type,
  BookMarked,
  Captions,
  User,
  Layers,
  PenTool,
  Download,
  GraduationCap,
  EyeOff,
} from "lucide-react";
import {
  startRecording,
  keystrokeVisualizer,
  greenScreen,
  cursorHighlight,
  zoomFollow,
  trimSplitMerge,
  silenceRemove,
  fillerCut,
  chapterMarkers,
  transcription,
  faceTracking,
  multiScene,
  drawAnnotate,
  multiExport,
  captionBurn,
  toTutorial,
  faceBlur,
  SCREEN_RECORD_TOOLS,
} from "@/lib/screen-record/record";

export const Route = createFileRoute("/screen-record")({
  head: () => ({ meta: [{ title: "Screen Record | Infinite Loop Sound" }] }),
  component: ScreenRecordPage,
});

const CURSOR_STYLES = ["circle", "ring", "spotlight"] as const;
const TRIM_ACTIONS = ["trim", "split", "merge"] as const;
const FILLER_WORDS = ["um", "uh", "like", "you-know"] as const;
const EXPORT_RATIOS = ["16:9", "9:16", "1:1"] as const;

export default function ScreenRecordPage() {
  const [webcam, setWebcam] = useState(true);
  const [micAudio, setMicAudio] = useState(true);
  const [systemAudio, setSystemAudio] = useState(true);
  const [keystrokeEnabled, setKeystrokeEnabled] = useState(true);
  const [gsEnabled, setGsEnabled] = useState(false);
  const [gsBg, setGsBg] = useState("background.png");
  const [cursorStyle, setCursorStyle] = useState("circle");
  const [ripple, setRipple] = useState(true);
  const [zoomEnabled, setZoomEnabled] = useState(false);
  const [zoomLevel, setZoomLevel] = useState("2");
  const [trimAction, setTrimAction] = useState("trim");
  const [trimParams, setTrimParams] = useState('{"start":0,"end":60}');
  const [silenceThreshold, setSilenceThreshold] = useState("-40");
  const [selectedFillers, setSelectedFillers] = useState<string[]>(["um", "uh"]);
  const [chapters, setChapters] = useState([
    { time: 0, label: "Intro" },
    { time: 60, label: "Demo" },
  ]);
  const [speakerLabels, setSpeakerLabels] = useState(true);
  const [cropMode, setCropMode] = useState("follow");
  const [scenes] = useState(["Intro", "Demo", "Outro"]);
  const [drawEnabled, setDrawEnabled] = useState(false);
  const [drawColor, setDrawColor] = useState("#ff0000");
  const [selectedRatios, setSelectedRatios] = useState<string[]>(["16:9"]);
  const [captionStyle, setCaptionStyle] = useState("bold");
  const [tutorialSteps, setTutorialSteps] = useState("5");
  const [faceBlurEnabled, setFaceBlurEnabled] = useState(false);

  const recording = startRecording({ webcam, micAudio, systemAudio });
  const keystroke = keystrokeVisualizer(keystrokeEnabled);
  const gs = greenScreen(gsEnabled, gsBg);
  const cursor = cursorHighlight(cursorStyle, ripple);
  const zoom = zoomFollow(zoomEnabled, Number(zoomLevel) || 1);
  let trimResult = null;
  try {
    trimResult = trimSplitMerge(trimAction, JSON.parse(trimParams));
  } catch {
    /* invalid */
  }
  const silence = silenceRemove(Number(silenceThreshold) || -40);
  const filler = fillerCut(selectedFillers);
  const chapterResult = chapterMarkers(chapters);
  const transcript = transcription(speakerLabels);
  const faceTrack = faceTracking(cropMode);
  const sceneResult = multiScene(scenes);
  const draw = drawAnnotate(drawEnabled, drawColor);
  const exportResult = multiExport(selectedRatios);
  const caption = captionBurn(captionStyle);
  const tutorial = toTutorial(Number(tutorialSteps) || 0);
  const faceBlurResult = faceBlur(faceBlurEnabled);

  const toggle = (list: string[], item: string, setter: (v: string[]) => void) =>
    setter(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="Screen Record"
          subtitle="Record, edit, and export screen recordings"
          icon={<Video className="h-5 w-5" />}
        />
        <KpiGrid>
          <StatTile label="Status" value={recording.status} />
          <StatTile label="Recording ID" value={recording.recordingId} />
          <StatTile label="Chapters" value={String(chapterResult.count)} />
          <StatTile label="Export Outputs" value={String(exportResult.outputs)} />
        </KpiGrid>

        <ProCard
          title="Recording Controls"
          description="Webcam PIP and audio config"
          icon={<Video className="h-4 w-4" />}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={webcam}
                  onChange={(e) => setWebcam(e.target.checked)}
                />{" "}
                Webcam PIP
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={micAudio}
                  onChange={(e) => setMicAudio(e.target.checked)}
                />{" "}
                Mic Audio
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={systemAudio}
                  onChange={(e) => setSystemAudio(e.target.checked)}
                />{" "}
                System Audio
              </label>
            </div>
            <div className="flex gap-2">
              <Button>
                <Video className="h-4 w-4 mr-1" /> Start
              </Button>
              <Button variant="outline">Stop</Button>
            </div>
            <DataPanel>
              <pre className="text-xs">{JSON.stringify(recording.config, null, 2)}</pre>
            </DataPanel>
          </div>
        </ProCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="Keystroke Visualizer"
            description="Show keystrokes on screen"
            icon={<Keyboard className="h-4 w-4" />}
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={keystrokeEnabled}
                onChange={(e) => setKeystrokeEnabled(e.target.checked)}
              />{" "}
              Enabled
            </label>
            <DataPanel className="mt-3">
              <p className="text-sm">Keys tracked: {keystroke.keys.length}</p>
            </DataPanel>
          </ProCard>
          <ProCard
            title="Green Screen"
            description="Chroma-key background"
            icon={<Image className="h-4 w-4" />}
          >
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={gsEnabled}
                  onChange={(e) => setGsEnabled(e.target.checked)}
                />{" "}
                Enabled
              </label>
              {gsEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="gs-bg">Background Image</Label>
                  <Input id="gs-bg" value={gsBg} onChange={(e) => setGsBg(e.target.value)} />
                </div>
              )}
              <DataPanel>
                <p className="text-sm">Matte: {gs.matte}</p>
              </DataPanel>
            </div>
          </ProCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="Cursor Highlight"
            description="Highlight the cursor"
            icon={<MousePointer className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {CURSOR_STYLES.map((s) => (
                  <Button
                    key={s}
                    variant={cursorStyle === s ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCursorStyle(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ripple}
                  onChange={(e) => setRipple(e.target.checked)}
                />{" "}
                Ripple on click
              </label>
              <DataPanel>
                <p className="text-sm">
                  Style: {cursor.style} | Ripple: {cursor.rippleOnClick ? "Yes" : "No"}
                </p>
              </DataPanel>
            </div>
          </ProCard>
          <ProCard
            title="Zoom Follow"
            description="Zoom and follow the cursor"
            icon={<ZoomIn className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={zoomEnabled}
                  onChange={(e) => setZoomEnabled(e.target.checked)}
                />{" "}
                Enabled
              </label>
              <div className="space-y-2">
                <Label htmlFor="zoom-level">Zoom Level (1–4)</Label>
                <Input
                  id="zoom-level"
                  type="number"
                  min="1"
                  max="4"
                  value={zoomLevel}
                  onChange={(e) => setZoomLevel(e.target.value)}
                />
              </div>
              <MeterBar label="Zoom" value={zoom.zoomLevel} max={4} format={(v) => `${v}x`} />
            </div>
          </ProCard>
        </div>

        <ProCard
          title="Trim / Split / Merge"
          description="Edit recording segments"
          icon={<Scissors className="h-4 w-4" />}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="trim-action">Action</Label>
              <select
                id="trim-action"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={trimAction}
                onChange={(e) => setTrimAction(e.target.value)}
              >
                {TRIM_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="trim-params">Params (JSON)</Label>
              <Input
                id="trim-params"
                value={trimParams}
                onChange={(e) => setTrimParams(e.target.value)}
              />
            </div>
          </div>
          {trimResult && (
            <DataPanel className="mt-4">
              <pre className="text-xs">{JSON.stringify(trimResult, null, 2)}</pre>
            </DataPanel>
          )}
        </ProCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="Silence Remove"
            description="Remove silent segments"
            icon={<VolumeX className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="silence-thr">Threshold (dBFS, -60 to 0)</Label>
                <Input
                  id="silence-thr"
                  type="number"
                  value={silenceThreshold}
                  onChange={(e) => setSilenceThreshold(e.target.value)}
                />
              </div>
              <DataPanel>
                <p className="text-sm">Removed: {silence.removed} segment(s)</p>
              </DataPanel>
            </div>
          </ProCard>
          <ProCard
            title="Filler Cut"
            description="Cut filler words"
            icon={<Type className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {FILLER_WORDS.map((w) => (
                  <Button
                    key={w}
                    variant={selectedFillers.includes(w) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggle(selectedFillers, w, setSelectedFillers)}
                  >
                    {w}
                  </Button>
                ))}
              </div>
              <DataPanel>
                <p className="text-sm">Removed: {filler.removed} filler word(s)</p>
              </DataPanel>
            </div>
          </ProCard>
        </div>

        <ProCard
          title="Chapter Markers"
          description="Add chapters with timestamps"
          icon={<BookMarked className="h-4 w-4" />}
        >
          <div className="space-y-2">
            {chapterResult.markers.map((m, i) => (
              <div key={i} className="flex items-center gap-3 rounded-md border border-border p-2">
                <Badge variant="outline">{m.time}s</Badge>
                <Input
                  value={m.label}
                  onChange={(e) => {
                    const next = [...chapters];
                    next[i] = { ...next[i], label: e.target.value };
                    setChapters(next);
                  }}
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setChapters([...chapters, { time: 0, label: `Chapter ${chapters.length + 1}` }])
              }
            >
              Add Chapter
            </Button>
          </div>
        </ProCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="Transcription"
            description="Transcribe audio with speaker labels"
            icon={<Captions className="h-4 w-4" />}
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={speakerLabels}
                onChange={(e) => setSpeakerLabels(e.target.checked)}
              />{" "}
              Speaker labels
            </label>
            <DataPanel className="mt-3">
              <p className="text-sm">
                Segments: {transcript.segments} | Words: {transcript.words}
              </p>
            </DataPanel>
          </ProCard>
          <ProCard
            title="Face Tracking"
            description="Auto-crop to follow face"
            icon={<User className="h-4 w-4" />}
          >
            <div className="space-y-2">
              <Label htmlFor="crop-mode">Crop Mode</Label>
              <Input
                id="crop-mode"
                value={cropMode}
                onChange={(e) => setCropMode(e.target.value)}
              />
            </div>
            <DataPanel className="mt-3">
              <p className="text-sm">Tracked: {faceTrack.tracked ? "Yes" : "No"}</p>
            </DataPanel>
          </ProCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="Multi-Scene"
            description="Switch between scenes with hotkeys"
            icon={<Layers className="h-4 w-4" />}
          >
            <div className="space-y-2">
              {sceneResult.scenes.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md border border-border p-2 text-sm"
                >
                  <span>{s}</span>
                  <Badge variant="outline">{sceneResult.hotkeys[i]}</Badge>
                </div>
              ))}
            </div>
          </ProCard>
          <ProCard
            title="Draw / Annotate"
            description="Draw on the recording"
            icon={<PenTool className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={drawEnabled}
                  onChange={(e) => setDrawEnabled(e.target.checked)}
                />{" "}
                Enabled
              </label>
              {drawEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="draw-color">Color</Label>
                  <Input
                    id="draw-color"
                    value={drawColor}
                    onChange={(e) => setDrawColor(e.target.value)}
                  />
                </div>
              )}
              <DataPanel>
                <p className="text-sm">Color: {draw.color}</p>
              </DataPanel>
            </div>
          </ProCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="Multi-Export"
            description="Export in multiple aspect ratios"
            icon={<Download className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {EXPORT_RATIOS.map((r) => (
                  <Button
                    key={r}
                    variant={selectedRatios.includes(r) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggle(selectedRatios, r, setSelectedRatios)}
                  >
                    {r}
                  </Button>
                ))}
              </div>
              <DataPanel>
                <p className="text-sm">
                  {exportResult.outputs} output(s): {exportResult.ratios.join(", ")}
                </p>
              </DataPanel>
            </div>
          </ProCard>
          <ProCard
            title="Caption Burn"
            description="Burn captions into the video"
            icon={<Type className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="caption-style">Style</Label>
                <Input
                  id="caption-style"
                  value={captionStyle}
                  onChange={(e) => setCaptionStyle(e.target.value)}
                />
              </div>
              <DataPanel>
                <p className="text-sm">Burned: {caption.burned ? "Yes" : "No"}</p>
              </DataPanel>
            </div>
          </ProCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="Tutorial Converter"
            description="Convert recording to a tutorial"
            icon={<GraduationCap className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tutorial-steps">Steps</Label>
                <Input
                  id="tutorial-steps"
                  type="number"
                  value={tutorialSteps}
                  onChange={(e) => setTutorialSteps(e.target.value)}
                />
              </div>
              <DataPanel>
                <p className="text-sm">
                  Format: {tutorial.documentFormat} | Steps: {tutorial.steps}
                </p>
              </DataPanel>
            </div>
          </ProCard>
          <ProCard
            title="Face Blur"
            description="Blur faces in the recording"
            icon={<EyeOff className="h-4 w-4" />}
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={faceBlurEnabled}
                onChange={(e) => setFaceBlurEnabled(e.target.checked)}
              />{" "}
              Enabled
            </label>
            <DataPanel className="mt-3">
              <p className="text-sm">Blur type: {faceBlurResult.blurType}</p>
            </DataPanel>
          </ProCard>
        </div>

        <ProCard
          title="Available Tools"
          description={`${SCREEN_RECORD_TOOLS.length} screen recording tools`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SCREEN_RECORD_TOOLS.map((t) => (
              <div key={t.name} className="rounded-md border border-border p-3 space-y-1">
                <Badge variant="outline">{t.name}</Badge>
                <p className="text-xs text-muted-foreground">{t.description}</p>
                <p className="text-xs font-mono text-muted-foreground">
                  params: {t.parameters.join(", ")}
                </p>
              </div>
            ))}
          </div>
        </ProCard>
      </div>
    </AppShell>
  );
}
