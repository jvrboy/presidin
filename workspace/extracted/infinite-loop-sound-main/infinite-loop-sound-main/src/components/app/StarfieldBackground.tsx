import { useEffect, useRef } from "react";

// 3D starfield warp shader — WebGL, perspective starfield with depth.
// Gives a "deep market data" hyperspace feel.
export function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: true, premultipliedAlpha: false });
    if (!gl) return;

    let raf = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const vs = `
      attribute vec2 a_pos;
      void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
    `;
    const fs = `
      precision highp float;
      uniform float u_time;
      uniform vec2 u_res;

      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
      }

      vec3 starfield(vec3 dir, float t) {
        vec3 col = vec3(0.0);
        for (int layer = 0; layer < 4; layer++) {
          float scale = 8.0 + float(layer) * 6.0;
          vec3 p = dir * scale + vec3(0.0, 0.0, t * (2.0 + float(layer)));
          vec3 ip = floor(p);
          vec3 fp = fract(p);
          for (int z = 0; z < 2; z++) {
            for (int y = 0; y < 2; y++) {
              for (int x = 0; x < 2; x++) {
                vec3 offset = vec3(float(x), float(y), float(z));
                vec3 cell = ip + offset;
                float h = hash(cell);
                if (h > 0.96) {
                  vec3 starPos = offset + vec3(hash(cell + 1.0), hash(cell + 2.0), hash(cell + 3.0)) - fp;
                  float d = length(starPos);
                  float bright = smoothstep(0.15, 0.0, d);
                  vec3 starCol = mix(vec3(0.4, 0.7, 0.6), vec3(0.6, 0.9, 0.8), hash(cell + 5.0));
                  col += starCol * bright * (0.3 + 0.7 * h);
                }
              }
            }
          }
        }
        return col;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_res.xy;
        vec2 p = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
        float t = u_time * 0.5;
        vec3 dir = normalize(vec3(p * 1.5, 1.0));
        vec3 col = starfield(dir, t);
        col += vec3(0.01, 0.03, 0.04);
        col *= 0.8;
        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes = gl.getUniformLocation(prog, "u_res");
    const start = performance.now();
    const render = () => {
      const t = (performance.now() - start) / 1000;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
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

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 pointer-events-none"
      aria-hidden="true"
    />
  );
}
