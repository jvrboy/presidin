// Neon Grid Background — WebGL synthwave neon grid with horizon sun.
import { useEffect, useRef } from "react";

export function NeonGridBackground() {
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
      void main() {
        vec2 uv = gl_FragCoord.xy / u_res;
        float horizon = 0.5;
        vec3 col = vec3(0.02, 0.0, 0.05);
        if (uv.y > horizon) {
          float t = (uv.y - horizon) / (1.0 - horizon);
          col = mix(vec3(0.1, 0.0, 0.2), vec3(0.3, 0.05, 0.4), t);
          vec2 sunPos = vec2(0.5, 0.7);
          float sunDist = distance(uv, sunPos);
          float sun = smoothstep(0.15, 0.0, sunDist);
          col += vec3(1.0, 0.3, 0.5) * sun * 0.8;
          float stripes = step(0.5, fract(uv.y * 20.0 - u_time * 0.1));
          col *= 0.5 + 0.5 * stripes * smoothstep(0.55, 0.75, uv.y);
        } else {
          float t = horizon - uv.y;
          float perspective = 1.0 / (t + 0.01);
          vec2 grid = uv;
          grid.x = (grid.x - 0.5) * perspective * 0.5;
          grid.y = perspective * 0.5 + u_time * 0.3;
          vec2 g = abs(fract(grid * 10.0) - 0.5);
          float line = smoothstep(0.0, 0.05, min(g.x, g.y));
          float fade = smoothstep(0.0, horizon, uv.y);
          col = mix(vec3(0.0, 0.8, 1.0) * (1.0 - line), vec3(0.02, 0.0, 0.05), fade * 0.7);
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
