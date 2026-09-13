// Magma Flow Background — WebGL flowing magma/lava shader with heat distortion.
import { useEffect, useRef } from "react";

export function MagmaFlowBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const vert = `attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;
    const frag = `
      precision highp float;
      uniform vec2 u_res;
      uniform float u_time;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p *= 2.0;
          a *= 0.5;
        }
        return v;
      }
      void main() {
        vec2 uv = gl_FragCoord.xy / u_res;
        vec2 p = uv * 3.0;
        p.y += u_time * 0.1;
        float n = fbm(p + fbm(p + u_time * 0.05));
        float heat = pow(n, 1.5);
        vec3 cold = vec3(0.05, 0.0, 0.0);
        vec3 warm = vec3(0.8, 0.2, 0.0);
        vec3 hot = vec3(1.0, 0.8, 0.2);
        vec3 col = mix(cold, warm, smoothstep(0.3, 0.6, heat));
        col = mix(col, hot, smoothstep(0.6, 0.9, heat));
        col *= 0.7;
        gl_FragColor = vec4(col, 1.0);
      }
    `;
    const compile = (src: string, type: number) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(vert, gl.VERTEX_SHADER));
    gl.attachShader(prog, compile(frag, gl.FRAGMENT_SHADER));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    let raf = 0;
    const start = performance.now();
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);
    const render = () => {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(render);
    };
    render();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 -z-10 w-full h-full" />;
}
