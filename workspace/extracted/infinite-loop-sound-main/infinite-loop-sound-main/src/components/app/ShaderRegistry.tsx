import { useEffect, useState } from "react";
import { ThreeBackground } from "./ThreeBackground";
import { WebGPUBackground } from "./WebGPUBackground";
import { PlasmaBackground } from "./PlasmaBackground";
import { AuroraBackground } from "./AuroraBackground";
import { HexFlowBackground } from "./HexFlowBackground";
import { VoronoiBackground } from "./VoronoiBackground";
import { StarfieldBackground } from "./StarfieldBackground";
import { FluidBackground } from "./FluidBackground";
import { TunnelBackground } from "./TunnelBackground";
import { GalaxyBackground } from "./GalaxyBackground";
import { KaleidoscopeBackground } from "./KaleidoscopeBackground";
import { RaymarchBackground } from "./RaymarchBackground";
import { NeonGridBackground } from "./NeonGridBackground";
import { MagmaFlowBackground } from "./MagmaFlowBackground";
import { CrystalLatticeBackground } from "./CrystalLatticeBackground";

export type ShaderId =
  | "three"
  | "webgpu"
  | "plasma"
  | "aurora"
  | "hexflow"
  | "voronoi"
  | "starfield"
  | "fluid"
  | "tunnel"
  | "galaxy"
  | "kaleidoscope"
  | "raymarch"
  | "neongrid"
  | "magma"
  | "crystal"
  | "none";

const STORAGE_KEY = "diq:shader";
const ORDER: ShaderId[] = [
  "three",
  "webgpu",
  "plasma",
  "aurora",
  "hexflow",
  "voronoi",
  "starfield",
  "fluid",
  "tunnel",
  "galaxy",
  "kaleidoscope",
  "raymarch",
  "neongrid",
  "magma",
  "crystal",
  "none",
];

export const SHADER_REGISTRY: { id: ShaderId; label: string; desc: string }[] = [
  { id: "three", label: "Liquid Blobs", desc: "Canvas2D liquid deformation" },
  { id: "webgpu", label: "Neural WebGPU", desc: "WebGPU neural field (if supported)" },
  { id: "plasma", label: "Plasma Fractal", desc: "WebGL fbm plasma flow" },
  { id: "aurora", label: "Aurora Flow", desc: "WebGL aurora + starfield" },
  { id: "hexflow", label: "Hex Matrix", desc: "WebGL animated honeycomb" },
  { id: "voronoi", label: "Voronoi Cells", desc: "WebGL shifting cellular zones" },
  { id: "starfield", label: "Starfield Warp", desc: "WebGL 3D hyperspace stars" },
  { id: "fluid", label: "Fluid Dynamics", desc: "WebGL curl-noise fluid flow" },
  { id: "tunnel", label: "Tunnel Warp", desc: "WebGL depth tunnel with rings" },
  { id: "galaxy", label: "Galaxy Spiral", desc: "WebGL swirling spiral galaxy" },
  { id: "kaleidoscope", label: "Kaleidoscope", desc: "WebGL 8-fold rotating symmetry" },
  { id: "raymarch", label: "Raymarch 3D", desc: "WebGL signed distance field raymarching" },
  { id: "neongrid", label: "Neon Grid", desc: "WebGL synthwave neon grid + sun" },
  { id: "magma", label: "Magma Flow", desc: "WebGL flowing lava with heat distortion" },
  { id: "crystal", label: "Crystal Lattice", desc: "WebGL rotating 3D crystal lattice" },
  { id: "none", label: "None", desc: "Flat background" },
];

export function getShader(): ShaderId {
  if (typeof window === "undefined") return "three";
  const v = localStorage.getItem(STORAGE_KEY) as ShaderId | null;
  return v && ORDER.includes(v) ? v : "three";
}

export function setShader(id: ShaderId) {
  localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent("diq:shader-change", { detail: id }));
}

export function ShaderBackground() {
  const [id, setId] = useState<ShaderId>(() => getShader());
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<ShaderId>).detail);
    window.addEventListener("diq:shader-change", h);
    return () => window.removeEventListener("diq:shader-change", h);
  }, []);

  switch (id) {
    case "webgpu":
      return <WebGPUBackground />;
    case "plasma":
      return <PlasmaBackground />;
    case "aurora":
      return <AuroraBackground />;
    case "hexflow":
      return <HexFlowBackground />;
    case "voronoi":
      return <VoronoiBackground />;
    case "starfield":
      return <StarfieldBackground />;
    case "fluid":
      return <FluidBackground />;
    case "tunnel":
      return <TunnelBackground />;
    case "galaxy":
      return <GalaxyBackground />;
    case "kaleidoscope":
      return <KaleidoscopeBackground />;
    case "raymarch":
      return <RaymarchBackground />;
    case "neongrid":
      return <NeonGridBackground />;
    case "magma":
      return <MagmaFlowBackground />;
    case "crystal":
      return <CrystalLatticeBackground />;
    case "none":
      return null;
    case "three":
    default:
      return <ThreeBackground />;
  }
}

export function ShaderPicker() {
  const [active, setActive] = useState<ShaderId>(() => getShader());
  useEffect(() => {
    const h = (e: Event) => setActive((e as CustomEvent<ShaderId>).detail);
    window.addEventListener("diq:shader-change", h);
    return () => window.removeEventListener("diq:shader-change", h);
  }, []);
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {SHADER_REGISTRY.map((s) => (
        <button
          key={s.id}
          onClick={() => setShader(s.id)}
          className={`text-left rounded-lg border p-4 transition-all hover:border-primary/60 ${
            active === s.id
              ? "border-primary bg-primary/10"
              : "border-border bg-card hover:bg-card/80"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{s.label}</span>
            {active === s.id && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                ACTIVE
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
        </button>
      ))}
    </div>
  );
}
