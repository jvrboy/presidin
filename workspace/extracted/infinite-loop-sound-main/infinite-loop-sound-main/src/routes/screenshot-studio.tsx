import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { ProCard, SectionHeader, KpiGrid, StatTile, DataPanel } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Camera,
  Timer,
  PenTool,
  EyeOff,
  FileText,
  Cloud,
  History,
  GitCompare,
  Layers,
  Eraser,
  FileCode,
  Scan,
} from "lucide-react";
import {
  capture,
  delayedCapture,
  annotate,
  autoBlur,
  ocrExtract,
  uploadToCloud,
  historySearch,
  compare,
  batchCapture,
  redact,
  toMarkdown,
  perspectiveCorrect,
  SCREENSHOT_TOOLS,
} from "@/lib/screenshot/screenshot";

export const Route = createFileRoute("/screenshot-studio")({
  head: () => ({ meta: [{ title: "Screenshot Studio | Infinite Loop Sound" }] }),
  component: ScreenshotStudioPage,
});

const CAPTURE_MODES = ["full-screen", "window", "region", "scrolling"] as const;
const ANNOTATION_TYPES = ["arrow", "box", "blur", "highlight", "numbered-steps"] as const;
const SENSITIVE_TYPES = ["email", "credit-card", "password"] as const;

export default function ScreenshotStudioPage() {
  const [mode, setMode] = useState("region");
  const [delay, setDelay] = useState("5");
  const [annotType, setAnnotType] = useState("arrow");
  const [annotParams, setAnnotParams] = useState('{"x":100,"y":200}');
  const [blurTypes, setBlurTypes] = useState<string[]>(["email", "password"]);
  const [ocrImage, setOcrImage] = useState("data:image/png;base64,abc123");
  const [uploadName, setUploadName] = useState("screenshot-001.png");
  const [searchQuery, setSearchQuery] = useState("dashboard");
  const [searchTotal, setSearchTotal] = useState("12");
  const [cmpBefore, setCmpBefore] = useState("img-before");
  const [cmpAfter, setCmpAfter] = useState("img-after");
  const [batchInt, setBatchInt] = useState("10");
  const [batchCount, setBatchCount] = useState("5");
  const [redactAreas, setRedactAreas] = useState("1,2,3");
  const [redactReversible, setRedactReversible] = useState(true);
  const [mdImage, setMdImage] = useState("data:image/png;base64,xyz");
  const [corners, setCorners] = useState("[[0,0],[100,0],[100,100],[0,100]]");

  const captureResult = capture(mode);
  const delayResult = delayedCapture(Number(delay) || 0);
  let annotResult = null;
  try {
    annotResult = annotate(annotType, JSON.parse(annotParams));
  } catch {
    /* invalid */
  }
  const blurResult = autoBlur(blurTypes);
  const ocrResult = ocrExtract(ocrImage);
  const uploadResult = uploadToCloud(uploadName);
  const searchResult = historySearch(searchQuery, Number(searchTotal) || 0);
  const compareResult = compare(cmpBefore, cmpAfter);
  const batchResult = batchCapture(Number(batchInt) || 0, Number(batchCount) || 0);
  const redactResult = redact(
    redactAreas.split(",").map((a) => Number(a.trim()) || 0),
    redactReversible,
  );
  const mdResult = toMarkdown(mdImage);
  let perspResult = null;
  try {
    perspResult = perspectiveCorrect(JSON.parse(corners));
  } catch {
    /* invalid */
  }

  const toggle = (list: string[], item: string, setter: (v: string[]) => void) =>
    setter(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="Screenshot Studio"
          subtitle="Capture, annotate, and share screenshots"
          icon={<Camera className="h-5 w-5" />}
        />
        <KpiGrid>
          <StatTile label="Mode" value={captureResult.mode} />
          <StatTile label="Blurred" value={String(blurResult.blurred)} />
          <StatTile label="OCR Words" value={String(ocrResult.words)} />
          <StatTile label="Shareable" value={uploadResult.shareable ? "Yes" : "No"} />
        </KpiGrid>

        <ProCard
          title="Capture Modes"
          description="Choose how to capture the screen"
          icon={<Camera className="h-4 w-4" />}
        >
          <div className="flex flex-wrap gap-2">
            {CAPTURE_MODES.map((m) => (
              <Button
                key={m}
                variant={mode === m ? "default" : "outline"}
                size="sm"
                onClick={() => setMode(m)}
              >
                {m}
              </Button>
            ))}
          </div>
          <DataPanel className="mt-4">
            <p className="text-sm">
              <span className="text-muted-foreground">Timestamp:</span>{" "}
              {new Date(captureResult.timestamp).toLocaleString()}
            </p>
          </DataPanel>
        </ProCard>

        <ProCard
          title="Delayed Capture"
          description="Schedule a capture after a delay"
          icon={<Timer className="h-4 w-4" />}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delay">Delay (seconds)</Label>
              <Input
                id="delay"
                type="number"
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
              />
            </div>
            <DataPanel>
              <p className="text-sm">Countdown: {delayResult.countdown}s</p>
            </DataPanel>
          </div>
        </ProCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="Annotation Tools"
            description="Add annotations to screenshots"
            icon={<PenTool className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="annot-type">Type</Label>
                <select
                  id="annot-type"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={annotType}
                  onChange={(e) => setAnnotType(e.target.value)}
                >
                  {ANNOTATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="annot-params">Params (JSON)</Label>
                <Input
                  id="annot-params"
                  value={annotParams}
                  onChange={(e) => setAnnotParams(e.target.value)}
                />
              </div>
              {annotResult && (
                <DataPanel>
                  <pre className="text-xs">{JSON.stringify(annotResult, null, 2)}</pre>
                </DataPanel>
              )}
            </div>
          </ProCard>
          <ProCard
            title="Auto-Blur"
            description="Blur sensitive content automatically"
            icon={<EyeOff className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {SENSITIVE_TYPES.map((t) => (
                  <Button
                    key={t}
                    variant={blurTypes.includes(t) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggle(blurTypes, t, setBlurTypes)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
              <DataPanel>
                <p className="text-sm">{blurResult.blurred} type(s) blurred</p>
              </DataPanel>
            </div>
          </ProCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="OCR Extract"
            description="Extract text from screenshots"
            icon={<FileText className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ocr-img">Image Data</Label>
                <Input
                  id="ocr-img"
                  value={ocrImage}
                  onChange={(e) => setOcrImage(e.target.value)}
                />
              </div>
              <DataPanel>
                <p className="text-sm">
                  Text: "{ocrResult.text}" | Confidence: {ocrResult.confidence}% | Words:{" "}
                  {ocrResult.words}
                </p>
              </DataPanel>
            </div>
          </ProCard>
          <ProCard
            title="Upload to Cloud"
            description="Upload and get a shareable link"
            icon={<Cloud className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="upload-name">Filename</Label>
                <Input
                  id="upload-name"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                />
              </div>
              <DataPanel>
                <p className="text-sm font-mono break-all">{uploadResult.url}</p>
              </DataPanel>
            </div>
          </ProCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="History Search"
            description="Search past screenshots"
            icon={<History className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="search-q">Query</Label>
                <Input
                  id="search-q"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="search-total">Total</Label>
                <Input
                  id="search-total"
                  type="number"
                  value={searchTotal}
                  onChange={(e) => setSearchTotal(e.target.value)}
                />
              </div>
              <DataPanel>
                <p className="text-sm">
                  {searchResult.results} match(es): {searchResult.matches.join(", ")}
                </p>
              </DataPanel>
            </div>
          </ProCard>
          <ProCard
            title="Compare"
            description="Diff two screenshots"
            icon={<GitCompare className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cmp-before">Before</Label>
                <Input
                  id="cmp-before"
                  value={cmpBefore}
                  onChange={(e) => setCmpBefore(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cmp-after">After</Label>
                <Input
                  id="cmp-after"
                  value={cmpAfter}
                  onChange={(e) => setCmpAfter(e.target.value)}
                />
              </div>
              <DataPanel>
                <p className="text-sm">Diff: {compareResult.diffPercentage}%</p>
              </DataPanel>
            </div>
          </ProCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="Batch Capture"
            description="Capture multiple screenshots"
            icon={<Layers className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="batch-int">Interval (s)</Label>
                  <Input
                    id="batch-int"
                    type="number"
                    value={batchInt}
                    onChange={(e) => setBatchInt(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="batch-count">Count</Label>
                  <Input
                    id="batch-count"
                    type="number"
                    value={batchCount}
                    onChange={(e) => setBatchCount(e.target.value)}
                  />
                </div>
              </div>
              <DataPanel>
                <p className="text-sm">
                  Captured: {batchResult.captured} of {batchResult.count}
                </p>
              </DataPanel>
            </div>
          </ProCard>
          <ProCard
            title="Redact"
            description="Redact sensitive areas"
            icon={<Eraser className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="redact-areas">Areas (comma-separated IDs)</Label>
                <Input
                  id="redact-areas"
                  value={redactAreas}
                  onChange={(e) => setRedactAreas(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={redactReversible}
                  onChange={(e) => setRedactReversible(e.target.checked)}
                />{" "}
                Reversible
              </label>
              <DataPanel>
                <p className="text-sm">{redactResult.log}</p>
              </DataPanel>
            </div>
          </ProCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="To Markdown"
            description="Convert screenshot to Markdown"
            icon={<FileCode className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="md-img">Image Data</Label>
                <Input id="md-img" value={mdImage} onChange={(e) => setMdImage(e.target.value)} />
              </div>
              <DataPanel>
                <p className="text-sm font-mono break-all">{mdResult.markdown}</p>
              </DataPanel>
            </div>
          </ProCard>
          <ProCard
            title="Perspective Correct"
            description="Fix perspective distortion"
            icon={<Scan className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="corners">Corners (JSON array of 4 [x,y] pairs)</Label>
                <Input id="corners" value={corners} onChange={(e) => setCorners(e.target.value)} />
              </div>
              {perspResult && (
                <DataPanel>
                  <p className="text-sm">
                    Corrected: {perspResult.corrected ? "Yes" : "No"} | {perspResult.corners.length}{" "}
                    corners
                  </p>
                </DataPanel>
              )}
            </div>
          </ProCard>
        </div>

        <ProCard
          title="Available Tools"
          description={`${SCREENSHOT_TOOLS.length} screenshot tools`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SCREENSHOT_TOOLS.map((t) => (
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
