import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { ProCard, SectionHeader, KpiGrid, StatTile, MeterBar, DataPanel } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  textToMesh,
  imageToMesh,
  retopology,
  uvUnwrap,
  pbrTexture,
  rigSkeleton,
  lodGenerate,
  decimate,
  photogrammetry,
  materialGraph,
  physicsSim,
  hairGroom,
  terrainGen,
  exportMesh,
} from "@/lib/three-d/three-d-tools";
import {
  Box,
  Camera,
  Layers,
  ScanLine,
  Palette,
  Bone,
  Gauge,
  Eraser,
  Mountain,
  Sparkles,
  Wind,
  Package,
} from "lucide-react";

function Component() {
  const [prompt, setPrompt] = useState("ancient stone temple");
  const [topology, setTopology] = useState("quad");
  const [views, setViews] = useState(6);
  const [targetQuads, setTargetQuads] = useState(5000);
  const [seamStrategy, setSeamStrategy] = useState("auto");
  const [texRes, setTexRes] = useState(2048);
  const [channels, setChannels] = useState<string[]>(["albedo", "normal", "roughness"]);
  const [bodyType, setBodyType] = useState("humanoid");
  const [lodLevels, setLodLevels] = useState<number[]>([1, 2, 3]);
  const [decRatio, setDecRatio] = useState(0.3);
  const [preserveSil, setPreserveSil] = useState(true);
  const [photoCount, setPhotoCount] = useState(80);
  const [matNodes, setMatNodes] = useState(12);
  const [physType, setPhysType] = useState("cloth");
  const [physDur, setPhysDur] = useState(5);
  const [hairGuides, setHairGuides] = useState(200);
  const [hairLen, setHairLen] = useState(15);
  const [terrainSrc, setTerrainSrc] = useState("heightmap");
  const [exportFormats, setExportFormats] = useState<string[]>(["glTF", "USDZ"]);

  const mesh = textToMesh(prompt, topology);
  const imgMesh = imageToMesh(views, "high");
  const retopo = retopology("quad-flow", targetQuads);
  const uv = uvUnwrap(seamStrategy);
  const pbr = pbrTexture(prompt, texRes, channels);
  const rig = rigSkeleton(bodyType);
  const lods = lodGenerate(lodLevels, 100000);
  const decim = decimate(decRatio, preserveSil);
  const photo = photogrammetry(photoCount, "high");
  const matGraph = materialGraph(matNodes, matNodes * 2);
  const phys = physicsSim(physType, physDur);
  const hair = hairGroom(hairGuides, hairLen);
  const terrain = terrainGen(terrainSrc, { resolution: 1024, amplitude: 256 });
  const exp = exportMesh(exportFormats);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="3D Studio"
          subtitle="AI-assisted 3D modeling, texturing, rigging, and rendering tools"
        />

        <KpiGrid>
          <StatTile
            label="Mesh Vertices"
            value={mesh.vertices.toLocaleString()}
            icon={<Box className="h-4 w-4" />}
          />
          <StatTile
            label="UV Coverage"
            value={`${uv.coverage}%`}
            icon={<Layers className="h-4 w-4" />}
          />
          <StatTile
            label="PBR Channels"
            value={pbr.channels.length}
            icon={<Palette className="h-4 w-4" />}
          />
          <StatTile label="Rig Bones" value={rig.bones} icon={<Bone className="h-4 w-4" />} />
        </KpiGrid>

        <ProCard title="Text-to-Mesh" icon={<Box className="h-4 w-4" />}>
          <div className="space-y-3">
            <div>
              <Label>Prompt</Label>
              <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </div>
            <div className="flex gap-2">
              {["quad", "triangle", "n-gon"].map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={topology === t ? "default" : "outline"}
                  onClick={() => setTopology(t)}
                >
                  {t}
                </Button>
              ))}
            </div>
            <DataPanel data={mesh} />
          </div>
        </ProCard>

        <ProCard title="Image-to-Mesh" icon={<Camera className="h-4 w-4" />}>
          <div className="space-y-3">
            <Label>Views: {views}</Label>
            <Slider
              min={3}
              max={12}
              step={1}
              value={[views]}
              onValueChange={(v) => setViews(v[0] ?? views)}
            />
            <DataPanel data={imgMesh} />
          </div>
        </ProCard>

        <ProCard title="Retopology" icon={<Layers className="h-4 w-4" />}>
          <div className="space-y-3">
            <Label>Target Quads: {targetQuads.toLocaleString()}</Label>
            <Slider
              min={1000}
              max={20000}
              step={500}
              value={[targetQuads]}
              onValueChange={(v) => setTargetQuads(v[0] ?? targetQuads)}
            />
            <MeterBar label="Quad Percentage" value={retopo.quadPercentage} max={100} suffix="%" />
            <DataPanel data={retopo} />
          </div>
        </ProCard>

        <ProCard title="UV Unwrap" icon={<ScanLine className="h-4 w-4" />}>
          <div className="space-y-3">
            <div className="flex gap-2">
              {["auto", "manual", "island"].map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={seamStrategy === s ? "default" : "outline"}
                  onClick={() => setSeamStrategy(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
            <MeterBar label="UV Coverage" value={uv.coverage} max={100} suffix="%" />
            <DataPanel data={uv} />
          </div>
        </ProCard>

        <ProCard title="PBR Texture" icon={<Palette className="h-4 w-4" />}>
          <div className="space-y-3">
            <Label>Resolution: {texRes}px</Label>
            <Slider
              min={512}
              max={4096}
              step={512}
              value={[texRes]}
              onValueChange={(v) => setTexRes(v[0] ?? texRes)}
            />
            <div className="flex flex-wrap gap-2">
              {["albedo", "normal", "roughness", "metallic", "AO", "height"].map((c) => {
                const active = channels.includes(c);
                return (
                  <Badge
                    key={c}
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() =>
                      setChannels((prev) => (active ? prev.filter((x) => x !== c) : [...prev, c]))
                    }
                  >
                    {c}
                  </Badge>
                );
              })}
            </div>
            <DataPanel data={pbr} />
          </div>
        </ProCard>

        <ProCard title="Rig Skeleton" icon={<Bone className="h-4 w-4" />}>
          <div className="space-y-3">
            <div className="flex gap-2">
              {["humanoid", "quadruped", "custom"].map((b) => (
                <Button
                  key={b}
                  size="sm"
                  variant={bodyType === b ? "default" : "outline"}
                  onClick={() => setBodyType(b)}
                >
                  {b}
                </Button>
              ))}
            </div>
            <DataPanel data={rig} />
          </div>
        </ProCard>

        <ProCard title="LOD Generation" icon={<Gauge className="h-4 w-4" />}>
          <div className="space-y-3">
            <Label>Levels: {lodLevels.join(", ")}</Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((l) => (
                <Button
                  key={l}
                  size="sm"
                  variant={lodLevels.includes(l) ? "default" : "outline"}
                  onClick={() =>
                    setLodLevels((prev) =>
                      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l].sort(),
                    )
                  }
                >
                  {l}
                </Button>
              ))}
            </div>
            <div className="space-y-1">
              {lods.lods.map((lod) => (
                <MeterBar
                  key={lod.level}
                  label={`LOD ${lod.level}`}
                  value={lod.polys}
                  max={100000}
                />
              ))}
            </div>
          </div>
        </ProCard>

        <ProCard title="Decimate" icon={<Eraser className="h-4 w-4" />}>
          <div className="space-y-3">
            <Label>Target Ratio: {decRatio}</Label>
            <Slider
              min={0.05}
              max={1}
              step={0.05}
              value={[decRatio]}
              onValueChange={(v) => setDecRatio(v[0] ?? decRatio)}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={preserveSil ? "default" : "outline"}
                onClick={() => setPreserveSil(!preserveSil)}
              >
                Preserve Silhouette
              </Button>
            </div>
            <DataPanel data={decim} />
          </div>
        </ProCard>

        <ProCard title="Photogrammetry" icon={<Camera className="h-4 w-4" />}>
          <div className="space-y-3">
            <Label>Images: {photoCount}</Label>
            <Slider
              min={20}
              max={300}
              step={10}
              value={[photoCount]}
              onValueChange={(v) => setPhotoCount(v[0] ?? photoCount)}
            />
            <DataPanel data={photo} />
          </div>
        </ProCard>

        <ProCard title="Material Graph" icon={<Sparkles className="h-4 w-4" />}>
          <div className="space-y-3">
            <Label>Nodes: {matNodes}</Label>
            <Slider
              min={2}
              max={30}
              step={1}
              value={[matNodes]}
              onValueChange={(v) => setMatNodes(v[0] ?? matNodes)}
            />
            <DataPanel data={matGraph} />
          </div>
        </ProCard>

        <ProCard title="Physics Simulation" icon={<Wind className="h-4 w-4" />}>
          <div className="space-y-3">
            <div className="flex gap-2">
              {["cloth", "soft-body", "rigid-body"].map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={physType === p ? "default" : "outline"}
                  onClick={() => setPhysType(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
            <Label>Duration: {physDur}s</Label>
            <Slider
              min={1}
              max={30}
              step={1}
              value={[physDur]}
              onValueChange={(v) => setPhysDur(v[0] ?? physDur)}
            />
            <DataPanel data={phys} />
          </div>
        </ProCard>

        <ProCard title="Hair Groom" icon={<Wind className="h-4 w-4" />}>
          <div className="space-y-3">
            <Label>Guide Curves: {hairGuides}</Label>
            <Slider
              min={50}
              max={500}
              step={10}
              value={[hairGuides]}
              onValueChange={(v) => setHairGuides(v[0] ?? hairGuides)}
            />
            <Label>Length: {hairLen}cm</Label>
            <Slider
              min={1}
              max={50}
              step={1}
              value={[hairLen]}
              onValueChange={(v) => setHairLen(v[0] ?? hairLen)}
            />
            <DataPanel data={hair} />
          </div>
        </ProCard>

        <ProCard title="Terrain Generation" icon={<Mountain className="h-4 w-4" />}>
          <div className="space-y-3">
            <div className="flex gap-2">
              {["heightmap", "prompt"].map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={terrainSrc === s ? "default" : "outline"}
                  onClick={() => setTerrainSrc(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
            <DataPanel data={terrain} />
          </div>
        </ProCard>

        <ProCard title="Export Mesh" icon={<Package className="h-4 w-4" />}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {["glTF", "USDZ", "FBX", "OBJ", "STL"].map((f) => {
                const active = exportFormats.includes(f);
                return (
                  <Badge
                    key={f}
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() =>
                      setExportFormats((prev) =>
                        active ? prev.filter((x) => x !== f) : [...prev, f],
                      )
                    }
                  >
                    {f}
                  </Badge>
                );
              })}
            </div>
            <DataPanel data={exp} />
          </div>
        </ProCard>
      </div>
    </AppShell>
  );
}

export const Route = createFileRoute("/three-d-studio")({
  head: () => ({
    meta: [
      { title: "3D Studio | Infinite Loop Sound" },
      { name: "description", content: "AI-assisted 3D modeling and asset generation tools" },
    ],
  }),
  component: Component,
});
