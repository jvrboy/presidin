import { useEffect, useRef } from "react";

export function WebGPUBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationId: number;
    let useWebGPU = false;

    const initWebGPU = async () => {
      try {
        const gpu = (navigator as Navigator & { gpu?: any }).gpu;
        if (!gpu) throw new Error("WebGPU not supported");

        const adapter = await gpu.requestAdapter({
          powerPreference: "high-performance",
        });
        if (!adapter) throw new Error("No adapter");

        const device = await adapter.requestDevice();
        const context = canvas.getContext("webgpu") as any;
        if (!context) throw new Error("No context");

        useWebGPU = true;

        const resize = () => {
          canvas.width = window.innerWidth * window.devicePixelRatio;
          canvas.height = window.innerHeight * window.devicePixelRatio;
          canvas.style.width = window.innerWidth + "px";
          canvas.style.height = window.innerHeight + "px";
        };
        resize();
        window.addEventListener("resize", resize);

        const format = gpu.getPreferredCanvasFormat();
        context.configure({ device, format, alphaMode: "premultiplied" });

        // WebGPU shader for neural network visualization
        const shaderCode = `
          struct Uniforms {
            time: f32,
            width: f32,
            height: f32,
            mouseX: f32,
            mouseY: f32,
          }
          
          @group(0) @binding(0) var<uniform> uniforms: Uniforms;
          
          @vertex
          fn vs_main(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
            let pos = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
            return vec4f(pos[vi], 0, 1);
          }
          
          fn neural(x: f32, y: f32, t: f32) -> f32 {
            var v = 0.0;
            // Multi-layer neural activation
            for (var i = 0.0; i < 4.0; i += 1.0) {
              let freq = pow(2.0, i);
              let amp = pow(0.5, i);
              v += sin((x * freq + t * 0.3) * 3.14159) * 
                   cos((y * freq - t * 0.2) * 3.14159) * amp;
            }
            return v;
          }
          
          fn hash(p: vec2f) -> f32 {
            return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
          }
          
          @fragment
          fn fs_main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
            let uv = fragCoord.xy / vec2f(uniforms.width, uniforms.height);
            let aspect = uniforms.width / uniforms.height;
            let p = (uv - 0.5) * vec2f(aspect, 1.0) * 2.0;
            let t = uniforms.time * 0.5;
            
            // Neural network grid
            var color = vec3f(0.043, 0.063, 0.125); // #0b1020
            
            // Layer 1: Base neural field
            let n1 = neural(p.x * 0.8, p.y * 0.8, t);
            let n2 = neural(p.x * 1.2 + 1.3, p.y * 1.2 - 0.7, t * 1.1);
            let field = n1 * 0.6 + n2 * 0.4;
            
            // Layer 2: Synaptic connections
            let grid = fract(p * 8.0 + t * 0.1);
            let dist = length(grid - 0.5);
            let synapse = smoothstep(0.4, 0.35, dist) * (0.5 + 0.5 * sin(t * 2.0 + length(p) * 5.0));
            
            // Layer 3: Data flow particles
            var particles = 0.0;
            for (var i = 0.0; i < 5.0; i += 1.0) {
              let offset = vec2f(sin(t * 0.5 + i * 1.3), cos(t * 0.3 + i * 0.9)) * 0.8;
              let pp = p + offset;
              let d = length(pp);
              particles += 0.015 / (d * d + 0.01) * (0.5 + 0.5 * sin(t * 3.0 + i));
            }
            
            // Layer 4: Confluence zones (trading signals)
            let confluence = 0.0;
            for (var j = 0.0; j < 3.0; j += 1.0) {
              let angle = t * 0.2 + j * 2.094;
              let pos = vec2f(cos(angle), sin(angle)) * 0.6;
              let d = length(p - pos);
              let pulse = 0.5 + 0.5 * sin(t * 4.0 + j * 2.0);
              confluence += exp(-d * 8.0) * pulse * 0.3;
            }
            
            // Combine layers with trading colors
            let bull = vec3f(0.063, 0.725, 0.506); // #10b981
            let elite = vec3f(0.22, 0.741, 0.973); // #38bdf8
            let bear = vec3f(0.937, 0.267, 0.267); // #ef4444
            
            color += field * 0.15 * elite;
            color += synapse * 0.4 * elite;
            color += particles * bull;
            color += confluence * vec3f(1.0, 0.8, 0.2);
            
            // Mouse interaction
            let mouse = vec2f(uniforms.mouseX, uniforms.mouseY) * 2.0 - 1.0;
            mouse.x *= aspect;
            let mdist = length(p - mouse);
            color += exp(-mdist * 3.0) * 0.2 * elite;
            
            // Vignette
            let vig = 1.0 - length(uv - 0.5) * 0.8;
            color *= vig;
            
            // Tone mapping
            color = color / (color + vec3f(1.0));
            color = pow(color, vec3f(0.8));
            
            return vec4f(color, 0.85);
          }
        `;

        const module = device.createShaderModule({ code: shaderCode });
        const pipeline = device.createRenderPipeline({
          layout: "auto",
          vertex: { module, entryPoint: "vs_main" },
          fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
          primitive: { topology: "triangle-list" },
        });

        const uniformBuffer = device.createBuffer({
          size: 20,
          usage: 0x0040 | 0x0008,
        });

        const bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
        });

        let mouseX = 0.5,
          mouseY = 0.5;
        canvas.addEventListener("mousemove", (e) => {
          mouseX = e.clientX / window.innerWidth;
          mouseY = 1 - e.clientY / window.innerHeight;
        });

        const startTime = performance.now();

        const render = () => {
          const time = (performance.now() - startTime) / 1000;

          device.queue.writeBuffer(
            uniformBuffer,
            0,
            new Float32Array([time, canvas.width, canvas.height, mouseX, mouseY]),
          );

          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: context.getCurrentTexture().createView(),
                clearValue: { r: 0.043, g: 0.063, b: 0.125, a: 1 },
                loadOp: "clear",
                storeOp: "store",
              },
            ],
          });

          pass.setPipeline(pipeline);
          pass.setBindGroup(0, bindGroup);
          pass.draw(3);
          pass.end();

          device.queue.submit([encoder.finish()]);
          animationId = requestAnimationFrame(render);
        };

        render();

        return () => {
          window.removeEventListener("resize", resize);
          cancelAnimationFrame(animationId);
        };
      } catch (e) {
        console.log("WebGPU fallback to Canvas2D:", e);
        useWebGPU = false;
        return initCanvas2D();
      }
    };

    const initCanvas2D = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      };
      resize();
      window.addEventListener("resize", resize);

      let time = 0;
      const render = () => {
        time += 0.01;
        const w = canvas.width,
          h = canvas.height;

        // Fade
        ctx.fillStyle = "rgba(11, 16, 32, 0.05)";
        ctx.fillRect(0, 0, w, h);

        // Neural grid with WebGPU-like effect
        const centerX = w * 0.5,
          centerY = h * 0.4;
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + time * 0.2;
          const radius = 150 + Math.sin(time + i) * 30;
          const x = centerX + Math.cos(angle) * radius;
          const y = centerY + Math.sin(angle) * radius;

          const gradient = ctx.createRadialGradient(x, y, 0, x, y, 80);
          gradient.addColorStop(0, `hsla(${195 + i * 10}, 100%, 65%, 0.3)`);
          gradient.addColorStop(1, "hsla(220, 100%, 50%, 0)");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, 80, 0, Math.PI * 2);
          ctx.fill();

          // Connections
          ctx.strokeStyle = `hsla(195, 100%, 65%, ${0.1 + Math.sin(time + i) * 0.05})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }

        animationId = requestAnimationFrame(render);
      };
      render();

      return () => {
        window.removeEventListener("resize", resize);
        cancelAnimationFrame(animationId);
      };
    };

    let cleanup: (() => void) | undefined;
    initWebGPU().then((c) => {
      cleanup = c;
    });

    return () => cleanup?.();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
