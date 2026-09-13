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
  Activity,
  Camera,
  GitBranch,
  Cloud,
  Layers,
  Gauge,
  Save,
  Users,
  Film,
  Zap,
} from "lucide-react";
import {
  adjustCurves,
  getScopes,
  matchFrame,
  nodeComposite,
  proxyWorkflow,
  batchProcess,
  savePreset,
  versionSnapshot,
  collaborate,
  cloudRender,
  PRO_MEDIA_TOOLS,
} from "@/lib/media/media-pro";

export const Route = createFileRoute("/pro-media")({
  head: () => ({ meta: [{ title: "Pro Media | Infinite Loop Sound" }] }),
  component: ProMediaRoute,
});

type RunFn = (fn: () => unknown) => void;

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

function ProMediaRoute() {
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
          title="Pro Media Tools"
          subtitle="Curves, scopes, node compositing, proxy workflow, collaboration, and cloud render"
        />
        <KpiGrid>
          <StatTile label="Pro Tools" value={PRO_MEDIA_TOOLS.length} />
          <StatTile label="Curve Channels" value={4} />
          <StatTile label="Scope Types" value={3} />
          <StatTile label="Preset Types" value={3} />
        </KpiGrid>

        <ProCard title="Curves Adjustment">
          <CurvesPanel onRun={runAction} />
        </ProCard>
        <ProCard title="Video Scopes">
          <ScopesPanel onRun={runAction} />
        </ProCard>
        <ProCard title="Match Frame">
          <MatchFramePanel onRun={runAction} />
        </ProCard>
        <ProCard title="Node Compositing">
          <NodeCompositePanel onRun={runAction} />
        </ProCard>
        <ProCard title="Proxy Workflow">
          <ProxyPanel onRun={runAction} />
        </ProCard>
        <ProCard title="Batch Processing">
          <BatchPanel onRun={runAction} />
        </ProCard>
        <ProCard title="Save Preset">
          <PresetPanel onRun={runAction} />
        </ProCard>
        <ProCard title="Version History">
          <VersionPanel onRun={runAction} />
        </ProCard>
        <ProCard title="Collaboration">
          <CollaborationPanel onRun={runAction} />
        </ProCard>
        <ProCard title="Cloud Render">
          <CloudRenderPanel onRun={runAction} />
        </ProCard>
        {output && <DataPanel title="Output" data={output} />}
      </div>
    </AppShell>
  );
}

/* ---------- Panels ---------- */

function CurvesPanel({ onRun }: { onRun: RunFn }) {
  const [channel, setChannel] = useState("RGB");
  const [lift, setLift] = useState(10);
  const [gamma, setGamma] = useState(50);
  const [gain, setGain] = useState(90);
  return (
    <div className="space-y-4">
      <BadgeGroup options={["RGB", "R", "G", "B"]} value={channel} onChange={setChannel} />
      <div className="grid grid-cols-3 gap-4">
        <SliderField label="Lift" value={lift} min={0} max={100} onChange={setLift} />
        <SliderField label="Gamma" value={gamma} min={0} max={100} onChange={setGamma} />
        <SliderField label="Gain" value={gain} min={0} max={100} onChange={setGain} />
      </div>
      <Button
        onClick={() =>
          onRun(() =>
            adjustCurves(channel, [
              [0, lift],
              [50, gamma],
              [100, gain],
            ]),
          )
        }
      >
        <Activity className="h-4 w-4 mr-1" /> Apply Curves
      </Button>
    </div>
  );
}

function ScopesPanel({ onRun }: { onRun: RunFn }) {
  const [scope, setScope] = useState("waveform");
  return (
    <div className="space-y-4">
      <BadgeGroup
        options={["waveform", "vectorscope", "rgb-parade"]}
        value={scope}
        onChange={setScope}
      />
      <Button onClick={() => onRun(() => getScopes(scope))}>
        <Gauge className="h-4 w-4 mr-1" /> Read Scope
      </Button>
    </div>
  );
}

function MatchFramePanel({ onRun }: { onRun: RunFn }) {
  const [source, setSource] = useState("clip-001");
  const [target, setTarget] = useState("clip-002");
  const [matchType, setMatchType] = useState("both");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Source Clip ID</Label>
          <Input value={source} onChange={(e) => setSource(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Target Clip ID</Label>
          <Input value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
      </div>
      <BadgeGroup
        options={["exposure", "color", "both"]}
        value={matchType}
        onChange={setMatchType}
      />
      <Button onClick={() => onRun(() => matchFrame(source, target, matchType))}>
        <Camera className="h-4 w-4 mr-1" /> Match Frame
      </Button>
    </div>
  );
}

function NodeCompositePanel({ onRun }: { onRun: RunFn }) {
  const [nodeCount, setNodeCount] = useState(3);
  return (
    <div className="space-y-4">
      <SliderField label="Node Count" value={nodeCount} min={2} max={10} onChange={setNodeCount} />
      <Button
        onClick={() => {
          const nodes = Array.from({ length: nodeCount }, (_, i) => ({
            id: `node-${i}`,
            type: i === 0 ? "source" : i === nodeCount - 1 ? "output" : "process",
            inputs: i === 0 ? [] : [`node-${i - 1}`],
          }));
          const connections: [string, string][] = nodes
            .slice(1)
            .map((n) => [n.inputs[0] ?? "", n.id] as [string, string]);
          onRun(() => nodeComposite(nodes, connections));
        }}
      >
        <Layers className="h-4 w-4 mr-1" /> Build Node Graph
      </Button>
    </div>
  );
}

function ProxyPanel({ onRun }: { onRun: RunFn }) {
  const [original, setOriginal] = useState("4320p");
  const [proxy, setProxy] = useState("1080p");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Original Resolution</Label>
          <Input value={original} onChange={(e) => setOriginal(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Proxy Resolution</Label>
          <Input value={proxy} onChange={(e) => setProxy(e.target.value)} />
        </div>
      </div>
      <Button onClick={() => onRun(() => proxyWorkflow(original, proxy))}>
        <Film className="h-4 w-4 mr-1" /> Calculate Proxy
      </Button>
    </div>
  );
}

function BatchPanel({ onRun }: { onRun: RunFn }) {
  const [count, setCount] = useState(10);
  const [operation, setOperation] = useState("export");
  return (
    <div className="space-y-4">
      <SliderField label="Batch Count" value={count} min={1} max={100} onChange={setCount} />
      <div className="space-y-1">
        <Label>Operation</Label>
        <Input value={operation} onChange={(e) => setOperation(e.target.value)} />
      </div>
      <Button onClick={() => onRun(() => batchProcess(count, operation))}>
        <Zap className="h-4 w-4 mr-1" /> Queue Batch
      </Button>
    </div>
  );
}

function PresetPanel({ onRun }: { onRun: RunFn }) {
  const [name, setName] = useState("My Edit Recipe");
  const [type, setType] = useState("edit-recipe");
  const [data, setData] = useState('{"exposure":0.5,"contrast":1.2}');
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Preset Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <BadgeGroup
        options={["edit-recipe", "lut", "effect-stack"]}
        value={type}
        onChange={setType}
      />
      <div className="space-y-1">
        <Label>Preset Data (JSON)</Label>
        <Textarea value={data} onChange={(e) => setData(e.target.value)} rows={3} />
      </div>
      <Button
        onClick={() => {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = { raw: data };
          }
          onRun(() => savePreset(name, type, parsed));
        }}
      >
        <Save className="h-4 w-4 mr-1" /> Save Preset
      </Button>
    </div>
  );
}

function VersionPanel({ onRun }: { onRun: RunFn }) {
  const [label, setLabel] = useState("v1.0 — initial grade");
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Version Label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <Button onClick={() => onRun(() => versionSnapshot(label))}>
        <GitBranch className="h-4 w-4 mr-1" /> Create Snapshot
      </Button>
    </div>
  );
}

function CollaborationPanel({ onRun }: { onRun: RunFn }) {
  const [action, setAction] = useState("join");
  const [userId, setUserId] = useState("user-42");
  return (
    <div className="space-y-4">
      <BadgeGroup
        options={["join", "comment", "edit", "leave"]}
        value={action}
        onChange={setAction}
      />
      <div className="space-y-1">
        <Label>User ID</Label>
        <Input value={userId} onChange={(e) => setUserId(e.target.value)} />
      </div>
      <Button onClick={() => onRun(() => collaborate(action, userId))}>
        <Users className="h-4 w-4 mr-1" /> Log Event
      </Button>
    </div>
  );
}

function CloudRenderPanel({ onRun }: { onRun: RunFn }) {
  const [format, setFormat] = useState("h264");
  const [resolution, setResolution] = useState("2160p");
  return (
    <div className="space-y-4">
      <BadgeGroup options={["h264", "h265", "prores", "exr"]} value={format} onChange={setFormat} />
      <div className="space-y-1">
        <Label>Resolution</Label>
        <Input value={resolution} onChange={(e) => setResolution(e.target.value)} />
      </div>
      <Button onClick={() => onRun(() => cloudRender(format, resolution))}>
        <Cloud className="h-4 w-4 mr-1" /> Estimate Render
      </Button>
    </div>
  );
}
