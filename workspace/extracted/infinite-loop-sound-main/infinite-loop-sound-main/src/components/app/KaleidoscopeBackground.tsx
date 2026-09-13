// Kaleidoscope Background — WebGL kaleidoscope shader with rotating symmetry.
import { useEffect, useRef } from "react";

export function KaleidoscopeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const vert = `
      attribute vec2 a_pos;
      void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
    `;
    const frag = `
      precision highp float;
      uniform vec2 u_res;
      uniform float u_time;
      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
        float r = length(uv);
        float a = atan(uv.y, uv.x);
        float segments = 8.0;
        a = mod(a, 2.0 * 3.14159 / segments);
        a = abs(a - 3.14159 / segments);
        vec2 p = vec2(cos(a), sin(a)) * r;
        p += 0.3 * vec2(sin(u_time * 0.3), cos(u_time * 0.2));
        float v = sin(p.x * 10.0 + u_time) * cos(p.y * 10.0 - u_time * 0.7);
        v += 0.5 * sin(r * 20.0 - u_time * 0.5);
        vec3 col = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + v));
        col *= smoothstep(1.5, 0.2, r);
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
