import { useState } from "react";
import { Play, Pause } from "lucide-react";
import { SHADER_REGISTRY, getShader, setShader, type ShaderId } from "./ShaderRegistry";

const SHADER_PREVIEWS: Record<ShaderId, string> = {
  three: "radial-gradient(circle at 30% 40%, #0a3d3a, #050810)",
  webgpu: "linear-gradient(135deg, #051a18, #0a2a26, #051512)",
  plasma: "radial-gradient(ellipse at 50% 50%, #0a3d38, #051a18, #03080c)",
  aurora: "linear-gradient(180deg, #021510, #053d30, #021510)",
  hexflow: "linear-gradient(60deg, #052820, #0a4030, #052820)",
  voronoi: "radial-gradient(circle at 40% 60%, #0a3028, #051815)",
  starfield: "radial-gradient(circle at 50% 50%, #0a2030, #030810)",
  fluid: "radial-gradient(ellipse at 60% 40%, #053d35, #021510)",
  tunnel: "radial-gradient(circle at 50% 50%, #053d30, #020a08)",
  galaxy: "radial-gradient(spiral at 50% 50%, #0a3528, #051815, #020a08)",
  kaleidoscope: "conic-gradient(from 45deg, #052820, #0a4030, #051815, #0a4030, #052820)",
  raymarch: "radial-gradient(circle at 50% 45%, #0b3a33, #041b18 45%, #020706)",
  neongrid: "linear-gradient(180deg, #0b1028, #07131c 55%, #04110f)",
  magma: "radial-gradient(ellipse at 50% 60%, #7a2200, #2a0900 45%, #050100)",
  crystal: "linear-gradient(135deg, #07202a, #0a3d38 48%, #03080c)",
  none: "#0a0e1a",
};

export function ShaderPreviewGrid() {
  const [active, setActive] = useState<ShaderId>(() => getShader());

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {SHADER_REGISTRY.map((s) => (
        <button
          key={s.id}
          onClick={() => {
            setShader(s.id);
            setActive(s.id);
          }}
          className={`group relative overflow-hidden rounded-lg border transition-all hover:scale-[1.02] ${
            active === s.id
              ? "border-primary ring-2 ring-primary/30"
              : "border-border hover:border-primary/50"
          }`}
        >
          <div
            className="h-24 w-full transition-transform group-hover:scale-110"
            style={{ background: SHADER_PREVIEWS[s.id] }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-3">
            <span className="text-sm font-semibold text-white">{s.label}</span>
            <span className="text-[10px] text-white/60 truncate">{s.desc}</span>
          </div>
          {active === s.id && (
            <div className="absolute top-2 right-2">
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-bold">
                ACTIVE
              </span>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
