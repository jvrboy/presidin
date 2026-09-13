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
  Layers,
  Brush,
  Square,
  Type,
  Film,
  Columns2,
  Palette,
  CircleDot,
  Sparkles,
  Plus,
} from "lucide-react";
import {
  createLayer,
  createMask,
  blendIf,
  drawShape,
  createText,
  applyTransition,
  splitScreen,
  chromaKey,
  applyDuotone,
  applyVignette,
  applyGrain,
  CREATIVE_TOOLS,
} from "@/lib/media/media-creative";

export const Route = createFileRoute("/creative-studio")({
  head: () => ({ meta: [{ title: "Creative Studio | Infinite Loop Sound" }] }),
  component: CreativeStudioRoute,
});

type TabId =
  | "layers"
  | "masks"
  | "shapes"
  | "text"
  | "transitions"
  | "split"
  | "chroma"
  | "duotone"
  | "vignette"
  | "grain";

const TABS: { id: TabId; label: string; icon: typeof Layers }[] = [
  { id: "layers", label: "Layers", icon: Layers },
  { id: "masks", label: "Masks", icon: Brush },
  { id: "shapes", label: "Shapes", icon: Square },
  { id: "text", label: "Text", icon: Type },
  { id: "transitions", label: "Transitions", icon: Film },
  { id: "split", label: "Split Screen", icon: Columns2 },
  { id: "chroma", label: "Chroma Key", icon: Palette },
  { id: "duotone", label: "Duotone", icon: Sparkles },
  { id: "vignette", label: "Vignette", icon: CircleDot },
  { id: "grain", label: "Grain", icon: Sparkles },
];

type RunFn = (fn: () => unknown) => void;

/** Reusable badge selector group */
function BadgeGroup({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <Badge
          key={opt}
          variant={value === opt ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => onChange(opt)}
        >
          {opt}
        </Badge>
      ))}
    </div>
  );
}

/** Reusable labeled slider */
function SliderField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}: {value}
      </Label>
      <Slider value={[value]} min={min} max={max} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

/** Reusable checkbox */
function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function CreativeStudioRoute() {
  const [activeTab, setActiveTab] = useState<TabId>("layers");
  const [output, setOutput] = useState<string>("");

  const runAction: RunFn = (fn) => {
    try {
      setOutput(JSON.stringify(fn(), null, 2));
    } catch (e) {
      setOutput(`Error: ${(e as Error).message}`);
    }
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="Creative Studio"
          subtitle="Layers, masks, shapes, text, transitions, and creative effects"
        />
        <KpiGrid>
          <StatTile label="Creative Tools" value={CREATIVE_TOOLS.length} />
          <StatTile label="Active Tab" value={TABS.find((t) => t.id === activeTab)?.label ?? "—"} />
          <StatTile label="Layer Types" value={6} />
          <StatTile label="Transitions" value={7} />
        </KpiGrid>
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="h-4 w-4 mr-1" />
                {tab.label}
              </Button>
            );
          })}
        </div>
        <ProCard title="Creative Controls">
          {activeTab === "layers" && <LayersPanel onRun={runAction} />}
          {activeTab === "masks" && <MasksPanel onRun={runAction} />}
          {activeTab === "shapes" && <ShapesPanel onRun={runAction} />}
          {activeTab === "text" && <TextPanel onRun={runAction} />}
          {activeTab === "transitions" && <TransitionsPanel onRun={runAction} />}
          {activeTab === "split" && <SplitPanel onRun={runAction} />}
          {activeTab === "chroma" && <ChromaPanel onRun={runAction} />}
          {activeTab === "duotone" && <DuotonePanel onRun={runAction} />}
          {activeTab === "vignette" && <VignettePanel onRun={runAction} />}
          {activeTab === "grain" && <GrainPanel onRun={runAction} />}
        </ProCard>
        {output && <DataPanel title="Output" data={output} />}
      </div>
    </AppShell>
  );
}

/* ---------- Panels ---------- */

function LayersPanel({ onRun }: { onRun: RunFn }) {
  const [name, setName] = useState("Background");
  const [type, setType] = useState("raster");
  return (
    <div className="space-y-4">
      <BadgeGroup
        options={["raster", "vector", "adjustment", "smart-object", "clipping-mask", "group"]}
        value={type}
        onChange={setType}
      />
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-1">
          <Label>Layer Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button onClick={() => onRun(() => createLayer(name, type))}>
          <Plus className="h-4 w-4 mr-1" /> Add Layer
        </Button>
      </div>
      <Button
        variant="outline"
        onClick={() =>
          onRun(() => blendIf("gray", "gray", { thisLayer: [10, 50], underlyingLayer: [200, 240] }))
        }
      >
        Apply Blend If
      </Button>
    </div>
  );
}

function MasksPanel({ onRun }: { onRun: RunFn }) {
  const [type, setType] = useState("brush");
  const [feather, setFeather] = useState(20);
  return (
    <div className="space-y-4">
      <BadgeGroup
        options={["brush", "gradient", "radial", "luminosity", "ai-subject"]}
        value={type}
        onChange={setType}
      />
      <SliderField label="Feather (px)" value={feather} min={0} max={100} onChange={setFeather} />
      <Button onClick={() => onRun(() => createMask(type, { feather, opacity: 100 }))}>
        Create Mask
      </Button>
    </div>
  );
}

function ShapesPanel({ onRun }: { onRun: RunFn }) {
  const [shape, setShape] = useState("rectangle");
  const [width, setWidth] = useState(200);
  const [height, setHeight] = useState(150);
  return (
    <div className="space-y-4">
      <BadgeGroup
        options={["rectangle", "ellipse", "polygon", "custom-path", "pen-tool"]}
        value={shape}
        onChange={setShape}
      />
      <div className="grid grid-cols-2 gap-4">
        <SliderField label="Width" value={width} min={10} max={500} onChange={setWidth} />
        <SliderField label="Height" value={height} min={10} max={500} onChange={setHeight} />
      </div>
      <Button onClick={() => onRun(() => drawShape(shape, { width, height }))}>Draw Shape</Button>
    </div>
  );
}

function TextPanel({ onRun }: { onRun: RunFn }) {
  const [content, setContent] = useState("Title Text");
  const [font, setFont] = useState("Inter");
  const [size, setSize] = useState(48);
  const [animation, setAnimation] = useState("kinetic");
  const [curvePath, setCurvePath] = useState(false);
  const [threeD, setThreeD] = useState(false);
  const [behindSubject, setBehindSubject] = useState(false);
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Content</Label>
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Font</Label>
          <Input value={font} onChange={(e) => setFont(e.target.value)} />
        </div>
        <SliderField label="Size (px)" value={size} min={8} max={200} onChange={setSize} />
      </div>
      <BadgeGroup
        options={["kinetic", "variable", "static"]}
        value={animation}
        onChange={setAnimation}
      />
      <div className="flex flex-wrap gap-4">
        <CheckField label="Curve Path" checked={curvePath} onChange={setCurvePath} />
        <CheckField label="3D" checked={threeD} onChange={setThreeD} />
        <CheckField label="Behind Subject" checked={behindSubject} onChange={setBehindSubject} />
      </div>
      <Button
        onClick={() =>
          onRun(() =>
            createText({ content, font, size, animation, curvePath, threeD, behindSubject }),
          )
        }
      >
        Create Text
      </Button>
    </div>
  );
}

function TransitionsPanel({ onRun }: { onRun: RunFn }) {
  const [type, setType] = useState("cross-dissolve");
  const [duration, setDuration] = useState(30);
  return (
    <div className="space-y-4">
      <BadgeGroup
        options={[
          "cross-dissolve",
          "whip-pan",
          "zoom-blur",
          "morph-cut",
          "luma-fade",
          "glitch",
          "3d-flip",
        ]}
        value={type}
        onChange={setType}
      />
      <SliderField
        label="Duration (frames)"
        value={duration}
        min={1}
        max={120}
        onChange={setDuration}
      />
      <Button onClick={() => onRun(() => applyTransition(type, duration))}>Apply Transition</Button>
    </div>
  );
}

function SplitPanel({ onRun }: { onRun: RunFn }) {
  const [layout, setLayout] = useState("grid");
  const [sources, setSources] = useState(4);
  return (
    <div className="space-y-4">
      <BadgeGroup options={["grid", "pip", "multi-cam"]} value={layout} onChange={setLayout} />
      <SliderField label="Sources" value={sources} min={2} max={9} onChange={setSources} />
      <Button onClick={() => onRun(() => splitScreen(layout, sources))}>Create Split Screen</Button>
    </div>
  );
}

function ChromaPanel({ onRun }: { onRun: RunFn }) {
  const [keyColor, setKeyColor] = useState("#00ff00");
  const [spill, setSpill] = useState(30);
  const [edge, setEdge] = useState(5);
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Key Color</Label>
        <Input value={keyColor} onChange={(e) => setKeyColor(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <SliderField
          label="Spill Suppression"
          value={spill}
          min={0}
          max={100}
          onChange={setSpill}
        />
        <SliderField label="Edge Softness" value={edge} min={0} max={50} onChange={setEdge} />
      </div>
      <Button onClick={() => onRun(() => chromaKey(keyColor, spill, edge))}>
        Apply Chroma Key
      </Button>
    </div>
  );
}

function DuotonePanel({ onRun }: { onRun: RunFn }) {
  const [shadow, setShadow] = useState("#1a1a2e");
  const [highlight, setHighlight] = useState("#e94560");
  const [type, setType] = useState("duotone");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Shadow Color</Label>
          <Input value={shadow} onChange={(e) => setShadow(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Highlight Color</Label>
          <Input value={highlight} onChange={(e) => setHighlight(e.target.value)} />
        </div>
      </div>
      <BadgeGroup
        options={["duotone", "tritone", "gradient-map"]}
        value={type}
        onChange={setType}
      />
      <Button onClick={() => onRun(() => applyDuotone(shadow, highlight, type))}>
        Apply Duotone
      </Button>
    </div>
  );
}

function VignettePanel({ onRun }: { onRun: RunFn }) {
  const [amount, setAmount] = useState(50);
  const [feather, setFeather] = useState(30);
  const [centerX, setCenterX] = useState(50);
  const [centerY, setCenterY] = useState(50);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <SliderField label="Amount" value={amount} min={0} max={100} onChange={setAmount} />
        <SliderField label="Feather" value={feather} min={0} max={100} onChange={setFeather} />
        <SliderField label="Center X" value={centerX} min={0} max={100} onChange={setCenterX} />
        <SliderField label="Center Y" value={centerY} min={0} max={100} onChange={setCenterY} />
      </div>
      <Button onClick={() => onRun(() => applyVignette(amount, feather, centerX, centerY))}>
        Apply Vignette
      </Button>
    </div>
  );
}

function GrainPanel({ onRun }: { onRun: RunFn }) {
  const [amount, setAmount] = useState(25);
  const [size, setSize] = useState(2);
  const [roughness, setRoughness] = useState(50);
  const [perChannel, setPerChannel] = useState(false);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <SliderField label="Amount" value={amount} min={0} max={100} onChange={setAmount} />
        <SliderField label="Size" value={size} min={1} max={10} onChange={setSize} />
        <SliderField
          label="Roughness"
          value={roughness}
          min={0}
          max={100}
          onChange={setRoughness}
        />
      </div>
      <CheckField label="Per-Channel Grain" checked={perChannel} onChange={setPerChannel} />
      <Button onClick={() => onRun(() => applyGrain(amount, size, roughness, perChannel))}>
        Apply Grain
      </Button>
    </div>
  );
}
