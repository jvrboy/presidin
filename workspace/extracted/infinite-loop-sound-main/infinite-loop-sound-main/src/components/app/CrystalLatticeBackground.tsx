// Crystal Lattice Background — WebGL rotating 3D crystal lattice structure.
import { useEffect, useRef } from "react";

export function CrystalLatticeBackground() {
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
      mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
        vec3 col = vec3(0.01, 0.02, 0.04);
        for (float i = 0.0; i < 5.0; i++) {
          vec2 p = uv;
          p = rot(u_time * 0.1 + i * 0.6) * p;
          p *= 1.0 + i * 0.3;
          vec2 g = abs(fract(p * 5.0 + i) - 0.5);
          float line = smoothstep(0.05, 0.0, min(g.x, g.y));
          vec3 c = vec3(0.2, 0.6, 0.9) * line * (0.3 + 0.7 * sin(u_time + i));
          col += c * (0.4 - i * 0.07);
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
