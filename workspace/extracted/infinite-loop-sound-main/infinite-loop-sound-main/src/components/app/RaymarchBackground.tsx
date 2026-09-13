// Raymarch Background — WebGL raymarching shader rendering 3D signed distance fields.
import { useEffect, useRef } from "react";

export function RaymarchBackground() {
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
      float sdSphere(vec3 p, float r) { return length(p) - r; }
      float sdBox(vec3 p, vec3 b) {
        vec3 q = abs(p) - b;
        return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
      }
      float smin(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
      }
      float map(vec3 p) {
        p.xz *= mat2(0.8, 0.6, -0.6, 0.8);
        float d1 = sdSphere(p, 1.0);
        float d2 = sdBox(p + vec3(sin(u_time) * 0.5, 0.0, 0.0), vec3(0.8));
        float d3 = sdSphere(p + vec3(0.0, cos(u_time * 0.7) * 0.5, 0.0), 0.6);
        return smin(smin(d1, d2, 0.3), d3, 0.3);
      }
      vec3 getNormal(vec3 p) {
        vec2 e = vec2(0.001, 0.0);
        return normalize(vec3(
          map(p + e.xyy) - map(p - e.xyy),
          map(p + e.yxy) - map(p - e.yxy),
          map(p + e.yyx) - map(p - e.yyx)
        ));
      }
      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
        vec3 ro = vec3(0.0, 0.0, -3.0);
        vec3 rd = normalize(vec3(uv, 1.0));
        float t = 0.0;
        for (int i = 0; i < 64; i++) {
          vec3 p = ro + rd * t;
          float d = map(p);
          if (d < 0.001) break;
          t += d;
          if (t > 20.0) break;
        }
        vec3 col = vec3(0.02, 0.03, 0.06);
        if (t < 20.0) {
          vec3 p = ro + rd * t;
          vec3 n = getNormal(p);
          vec3 lightDir = normalize(vec3(0.5, 0.7, -0.5));
          float diff = max(dot(n, lightDir), 0.0);
          vec3 base = vec3(0.2, 0.5, 0.8) + 0.3 * sin(u_time + p.xyz * 2.0);
          col = base * (0.2 + 0.8 * diff);
          col += vec3(0.1, 0.05, 0.2) * pow(1.0 - max(dot(rd, n), 0.0), 2.0);
        }
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
