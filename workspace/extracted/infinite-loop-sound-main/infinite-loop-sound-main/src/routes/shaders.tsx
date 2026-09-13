import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Palette, Eye, Cpu } from "lucide-react";
import { ProCard, SectionHeader } from "@/components/pro";
import { ShaderPicker, SHADER_REGISTRY, getShader } from "@/components/app/ShaderRegistry";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/shaders")({
  head: () => ({ meta: [{ title: "Shaders — DivergenceIQ" }] }),
  component: ShadersPage,
});

function ShadersPage() {
  const [active, setActive] = useState(getShader());
  useEffect(() => {
    const h = (e: Event) => setActive((e as CustomEvent).detail);
    window.addEventListener("diq:shader-change", h);
    return () => window.removeEventListener("diq:shader-change", h);
  }, []);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <SectionHeader
          title="Shader Gallery"
          subtitle="Switch the background renderer. New WebGL/WebGPU shaders added: plasma fractal, aurora flow, hex matrix."
          icon={<Palette className="w-5 h-5" />}
          action={
            <Badge variant="outline">
              <Eye className="w-3 h-3 mr-1" />
              {SHADER_REGISTRY.find((s) => s.id === active)?.label}
            </Badge>
          }
        />
        <ProCard
          title="Available Shaders"
          description="Pick a background — applies instantly and persists across sessions."
          icon={<Cpu className="w-4 h-4" />}
        >
          <ShaderPicker />
        </ProCard>
      </div>
    </AppShell>
  );
}
