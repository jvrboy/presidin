import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { ProCard, SectionHeader, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Crop,
  Sparkles,
  Sliders,
  Wand2,
  Scissors,
  Layers,
  Eraser,
  Image as ImageIcon,
  Palette,
  Blend,
} from "lucide-react";
import {
  cropImage,
  applyFilter,
  applyAdjustment,
  applyEffect,
  removeBackground,
  changeBackground,
  trimMedia,
  manipulateImage,
  mergeMedia,
  blendLayers,
  removeObjects,
  applyTexture,
  MEDIA_EDIT_TOOLS,
} from "@/lib/media/media-edit";

type TabId =
  | "crop"
  | "filters"
  | "adjust"
  | "effects"
  | "background"
  | "trim"
  | "manipulation"
  | "blend"
  | "remove"
  | "texture";

const TABS: { id: TabId; label: string; icon: typeof Crop }[] = [
  { id: "crop", label: "Crop", icon: Crop },
  { id: "filters", label: "Filters", icon: Sparkles },
  { id: "adjust", label: "Adjust", icon: Sliders },
  { id: "effects", label: "Effects", icon: Wand2 },
  { id: "background", label: "Background", icon: ImageIcon },
  { id: "trim", label: "Trim", icon: Scissors },
  { id: "manipulation", label: "Manipulation", icon: Layers },
  { id: "blend", label: "Blend", icon: Blend },
  { id: "remove", label: "Remove Objects", icon: Eraser },
  { id: "texture", label: "Texture", icon: Palette },
];

export const Route = createFileRoute("/media-studio")({
  head: () => ({
    meta: [
      { title: "Media Studio — Infinite Loop Sound" },
      {
        name: "description",
        content:
          "Pro media editing tools: crop, filter, adjust, effects, background, trim, blend, and more.",
      },
    ],
  }),
  component: MediaStudioPage,
});

function MediaStudioPage() {
  const [activeTab, setActiveTab] = useState<TabId>("crop");
  const [result, setResult] = useState<string>("No operation applied yet.");

  // Crop
  const [aspect, setAspect] = useState("16:9");
  const [cropMode, setCropMode] = useState("precise");

  // Filters
  const [filterName, setFilterName] = useState("cinematic");
  const [filterIntensity, setFilterIntensity] = useState(50);

  // Adjust
  const [exposure, setExposure] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [highlights, setHighlights] = useState(0);
  const [shadows, setShadows] = useState(0);
  const [temperature, setTemperature] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [sharpness, setSharpness] = useState(0);

  // Effects
  const [effectName, setEffectName] = useState("glow");
  const [effectIntensity, setEffectIntensity] = useState(40);

  // Background
  const [bgReplacement, setBgReplacement] = useState("color");

  // Trim
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(30);
  const [trimMode, setTrimMode] = useState("precise");

  // Manipulation
  const [manipTool, setManipTool] = useState("warp");
  const [manipStrength, setManipStrength] = useState(50);

  // Blend
  const [blendMode, setBlendMode] = useState("normal");
  const [blendOpacity, setBlendOpacity] = useState(100);

  // Remove Objects
  const [removeMode, setRemoveMode] = useState("content-aware");

  // Texture
  const [textureName, setTextureName] = useState("grain");
  const [textureBlend, setTextureBlend] = useState("overlay");
  const [textureOpacity, setTextureOpacity] = useState(50);

  const mockImage = { width: 1920, height: 1080, data: new Uint8ClampedArray(4) };

  const runCrop = () => {
    const r = cropImage(mockImage, aspect, cropMode);
    setResult(`Cropped to ${r.width}×${r.height} at (${r.cropX}, ${r.cropY})`);
  };
  const runFilter = () => {
    const r = applyFilter(filterName, filterIntensity);
    setResult(`Filter "${r.filter}" at ${r.intensity}% intensity`);
  };
  const runAdjust = () => {
    const r = applyAdjustment({
      exposure,
      contrast,
      highlights,
      shadows,
      temperature,
      tint: 0,
      vibrance: 0,
      saturation,
      clarity: 0,
      dehaze: 0,
      sharpness,
      noiseReduction: 0,
    });
    setResult(
      `Adjustments: ${Object.entries(r)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    );
  };
  const runEffect = () => {
    const r = applyEffect(effectName, effectIntensity);
    setResult(`Effect "${r.effect}" at ${r.intensity}%`);
  };
  const runBg = () => {
    const r = changeBackground(bgReplacement);
    setResult(`Background → ${r.type} (${r.source})`);
  };
  const runTrim = () => {
    const r = trimMedia(trimStart, trimEnd, trimMode);
    setResult(`Trimmed ${r.start}s–${r.end}s (${r.mode})`);
  };
  const runManip = () => {
    const r = manipulateImage(manipTool, { strength: manipStrength });
    setResult(`${r.tool} applied (strength=${r.params.strength})`);
  };
  const runBlend = () => {
    const r = blendLayers(blendMode, blendOpacity);
    setResult(`Blend: ${r.blendMode} @ ${r.opacity}%`);
  };
  const runRemove = () => {
    const r = removeObjects([1, 0, 1, 1, 0], removeMode);
    setResult(`Removed ${r.pixelsRemoved} px (${r.mode})`);
  };
  const runTexture = () => {
    const r = applyTexture(textureName, textureBlend, textureOpacity);
    setResult(`Texture "${r.texture}" ${r.blendMode} @ ${r.opacity}%`);
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="Media Studio"
          subtitle="Pro editing tools for images and video"
          icon={Crop}
          action={<Badge variant="secondary">{MEDIA_EDIT_TOOLS.length} tools</Badge>}
        />

        <KpiGrid
          tiles={[
            { label: "Edit Tools", value: MEDIA_EDIT_TOOLS.length, icon: Wand2 },
            { label: "Blend Modes", value: 28, icon: Blend },
            { label: "Filter Presets", value: 5, icon: Sparkles },
            { label: "Effects", value: 11, icon: Wand2 },
          ]}
        />

        <ProCard title="Editing Tools" description="Select a tool category" icon={Layers}>
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Button
                key={t.id}
                variant={activeTab === t.id ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab(t.id)}
              >
                <t.icon className="w-4 h-4 mr-1.5" />
                {t.label}
              </Button>
            ))}
          </div>
        </ProCard>

        <ProCard title="Preview" description="Live preview area" icon={ImageIcon}>
          <div className="aspect-video bg-muted/40 rounded-lg border border-dashed flex items-center justify-center">
            <p className="text-sm text-muted-foreground">{result}</p>
          </div>
        </ProCard>

        {activeTab === "crop" && (
          <ProCard title="Crop" description="Reframe your media" icon={Crop}>
            <div className="space-y-4">
              <div>
                <Label>Aspect Ratio</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["9:16", "16:9", "1:1", "4:5", "freeform"].map((a) => (
                    <Button
                      key={a}
                      size="sm"
                      variant={aspect === a ? "default" : "outline"}
                      onClick={() => setAspect(a)}
                    >
                      {a}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Mode</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["precise", "ripple", "slip", "slide"].map((m) => (
                    <Button
                      key={m}
                      size="sm"
                      variant={cropMode === m ? "default" : "outline"}
                      onClick={() => setCropMode(m)}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
              </div>
              <Button onClick={runCrop}>
                <Crop className="w-4 h-4 mr-2" />
                Apply Crop
              </Button>
            </div>
          </ProCard>
        )}

        {activeTab === "filters" && (
          <ProCard title="Filters" description="Cinematic looks" icon={Sparkles}>
            <div className="space-y-4">
              <div>
                <Label>Preset</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["cinematic", "vintage", "film", "moody", "vibrant"].map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={filterName === f ? "default" : "outline"}
                      onClick={() => setFilterName(f)}
                    >
                      {f}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Intensity: {filterIntensity}%</Label>
                <Slider
                  value={[filterIntensity]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => setFilterIntensity(v[0])}
                  className="mt-2"
                />
              </div>
              <Button onClick={runFilter}>
                <Sparkles className="w-4 h-4 mr-2" />
                Apply Filter
              </Button>
            </div>
          </ProCard>
        )}

        {activeTab === "adjust" && (
          <ProCard title="Adjust" description="Tonal adjustments" icon={Sliders}>
            <div className="space-y-4">
              {[
                { label: "Exposure", val: exposure, set: setExposure },
                { label: "Contrast", val: contrast, set: setContrast },
                { label: "Highlights", val: highlights, set: setHighlights },
                { label: "Shadows", val: shadows, set: setShadows },
                { label: "Temperature", val: temperature, set: setTemperature },
                { label: "Saturation", val: saturation, set: setSaturation },
                { label: "Sharpness", val: sharpness, set: setSharpness },
              ].map((a) => (
                <div key={a.label}>
                  <Label>
                    {a.label}: {a.val}
                  </Label>
                  <Slider
                    value={[a.val]}
                    min={-100}
                    max={100}
                    step={1}
                    onValueChange={(v) => a.set(v[0])}
                    className="mt-2"
                  />
                </div>
              ))}
              <Button onClick={runAdjust}>
                <Sliders className="w-4 h-4 mr-2" />
                Apply Adjustments
              </Button>
            </div>
          </ProCard>
        )}

        {activeTab === "effects" && (
          <ProCard title="Effects" description="Creative effects" icon={Wand2}>
            <div className="space-y-4">
              <div>
                <Label>Effect</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {[
                    "glow",
                    "bloom",
                    "chromatic aberration",
                    "film grain",
                    "light leaks",
                    "glitch",
                    "vhs",
                    "prism",
                    "tilt-shift",
                    "motion blur",
                    "radial blur",
                  ].map((e) => (
                    <Button
                      key={e}
                      size="sm"
                      variant={effectName === e ? "default" : "outline"}
                      onClick={() => setEffectName(e)}
                    >
                      {e}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Intensity: {effectIntensity}%</Label>
                <Slider
                  value={[effectIntensity]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => setEffectIntensity(v[0])}
                  className="mt-2"
                />
              </div>
              <Button onClick={runEffect}>
                <Wand2 className="w-4 h-4 mr-2" />
                Apply Effect
              </Button>
            </div>
          </ProCard>
        )}

        {activeTab === "background" && (
          <ProCard title="Background" description="Remove or replace backgrounds" icon={ImageIcon}>
            <div className="space-y-4">
              <Button
                variant="outline"
                onClick={() => {
                  const r = removeBackground(mockImage);
                  setResult(
                    `Background removed — matte: ${r.matte.length}px, edge: ${r.edgeRefinement}`,
                  );
                }}
              >
                <Eraser className="w-4 h-4 mr-2" />
                Remove Background
              </Button>
              <div>
                <Label>Replace With</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["image", "video", "color", "gradient", "blurred", "ai-scene"].map((b) => (
                    <Button
                      key={b}
                      size="sm"
                      variant={bgReplacement === b ? "default" : "outline"}
                      onClick={() => setBgReplacement(b)}
                    >
                      {b}
                    </Button>
                  ))}
                </div>
              </div>
              <Button onClick={runBg}>
                <ImageIcon className="w-4 h-4 mr-2" />
                Replace Background
              </Button>
            </div>
          </ProCard>
        )}

        {activeTab === "trim" && (
          <ProCard title="Trim" description="Cut and trim media" icon={Scissors}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start (s): {trimStart}</Label>
                  <Slider
                    value={[trimStart]}
                    min={0}
                    max={60}
                    step={1}
                    onValueChange={(v) => setTrimStart(v[0])}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>End (s): {trimEnd}</Label>
                  <Slider
                    value={[trimEnd]}
                    min={0}
                    max={60}
                    step={1}
                    onValueChange={(v) => setTrimEnd(v[0])}
                    className="mt-2"
                  />
                </div>
              </div>
              <div>
                <Label>Mode</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["precise", "ripple", "slip", "slide", "silence-cut"].map((m) => (
                    <Button
                      key={m}
                      size="sm"
                      variant={trimMode === m ? "default" : "outline"}
                      onClick={() => setTrimMode(m)}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
              </div>
              <Button onClick={runTrim}>
                <Scissors className="w-4 h-4 mr-2" />
                Apply Trim
              </Button>
            </div>
          </ProCard>
        )}

        {activeTab === "manipulation" && (
          <ProCard title="Manipulation" description="Warp and distort geometry" icon={Layers}>
            <div className="space-y-4">
              <div>
                <Label>Tool</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["warp", "liquify", "perspective", "lens-distortion", "mesh", "puppet-warp"].map(
                    (t) => (
                      <Button
                        key={t}
                        size="sm"
                        variant={manipTool === t ? "default" : "outline"}
                        onClick={() => setManipTool(t)}
                      >
                        {t}
                      </Button>
                    ),
                  )}
                </div>
              </div>
              <div>
                <Label>Strength: {manipStrength}</Label>
                <Slider
                  value={[manipStrength]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => setManipStrength(v[0])}
                  className="mt-2"
                />
              </div>
              <Button onClick={runManip}>
                <Layers className="w-4 h-4 mr-2" />
                Apply Manipulation
              </Button>
            </div>
          </ProCard>
        )}

        {activeTab === "blend" && (
          <ProCard title="Blend Layers" description="28 blend modes" icon={Blend}>
            <div className="space-y-4">
              <div>
                <Label>Blend Mode</Label>
                <select
                  className="w-full mt-2 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={blendMode}
                  onChange={(e) => setBlendMode(e.target.value)}
                >
                  {[
                    "normal",
                    "dissolve",
                    "darken",
                    "multiply",
                    "color burn",
                    "linear burn",
                    "darker color",
                    "lighten",
                    "screen",
                    "color dodge",
                    "linear dodge (add)",
                    "lighter color",
                    "overlay",
                    "soft light",
                    "hard light",
                    "vivid light",
                    "linear light",
                    "pin light",
                    "hard mix",
                    "difference",
                    "exclusion",
                    "subtract",
                    "divide",
                    "hue",
                    "saturation",
                    "color",
                    "luminosity",
                  ].map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Opacity: {blendOpacity}%</Label>
                <Slider
                  value={[blendOpacity]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => setBlendOpacity(v[0])}
                  className="mt-2"
                />
              </div>
              <Button onClick={runBlend}>
                <Blend className="w-4 h-4 mr-2" />
                Apply Blend
              </Button>
            </div>
          </ProCard>
        )}

        {activeTab === "remove" && (
          <ProCard title="Remove Objects" description="Content-aware removal" icon={Eraser}>
            <div className="space-y-4">
              <div>
                <Label>Mode</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["content-aware", "magic-eraser", "temporal-track"].map((m) => (
                    <Button
                      key={m}
                      size="sm"
                      variant={removeMode === m ? "default" : "outline"}
                      onClick={() => setRemoveMode(m)}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
              </div>
              <Button onClick={runRemove}>
                <Eraser className="w-4 h-4 mr-2" />
                Remove Objects
              </Button>
            </div>
          </ProCard>
        )}

        {activeTab === "texture" && (
          <ProCard title="Texture" description="Overlay textures" icon={Palette}>
            <div className="space-y-4">
              <div>
                <Label>Texture</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["grain", "paper", "canvas", "fabric", "dust", "scratches", "bokeh"].map((t) => (
                    <Button
                      key={t}
                      size="sm"
                      variant={textureName === t ? "default" : "outline"}
                      onClick={() => setTextureName(t)}
                    >
                      {t}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Blend Mode</Label>
                <select
                  className="w-full mt-2 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={textureBlend}
                  onChange={(e) => setTextureBlend(e.target.value)}
                >
                  {["overlay", "soft light", "hard light", "multiply", "screen", "normal"].map(
                    (b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div>
                <Label>Opacity: {textureOpacity}%</Label>
                <Slider
                  value={[textureOpacity]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => setTextureOpacity(v[0])}
                  className="mt-2"
                />
              </div>
              <Button onClick={runTexture}>
                <Palette className="w-4 h-4 mr-2" />
                Apply Texture
              </Button>
            </div>
          </ProCard>
        )}
      </div>
    </AppShell>
  );
}
