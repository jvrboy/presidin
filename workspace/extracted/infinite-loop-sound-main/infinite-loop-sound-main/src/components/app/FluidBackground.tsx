import { useEffect, useRef } from "react";

// Fluid dynamics shader — WebGL, simulated fluid with curl noise.
// Gives a "market flow" feel with swirling currents.
export function FluidBackground() {
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
      uniform vec2 u_mouse;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.0;
          a *= 0.5;
        }
        return v;
      }

      vec2 curl(vec2 p, float t) {
        float e = 0.01;
        float n1 = fbm(p + vec2(e, 0.0) + t);
        float n2 = fbm(p - vec2(e, 0.0) + t);
        float n3 = fbm(p + vec2(0.0, e) + t);
        float n4 = fbm(p - vec2(0.0, e) + t);
        return vec2(n3 - n4, n2 - n1) / (2.0 * e);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_res.xy;
        vec2 p = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
        float t = u_time * 0.1;

        vec2 flow = curl(p * 2.0, t);
        float stream = fbm(p * 3.0 + flow * 0.5 + t);

        vec2 mouseInfluence = u_mouse / u_res - uv;
        float mDist = length(mouseInfluence);
        float mEffect = smoothstep(0.3, 0.0, mDist) * 0.3;
        stream += mEffect;

        vec3 c1 = vec3(0.01, 0.04, 0.07);
        vec3 c2 = vec3(0.02, 0.15, 0.20);
        vec3 c3 = vec3(0.06, 0.38, 0.35);
        vec3 col = mix(c1, c2, clamp(stream * 1.5, 0.0, 1.0));
        col = mix(col, c3, clamp(stream * 2.0 - 0.5, 0.0, 0.5));
        col *= 0.6;
        col += vec3(0.0, 0.04, 0.03) * mEffect;
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
    const uMouse = gl.getUniformLocation(prog, "u_mouse");
    const mouse = { x: 0, y: 0 };
    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX * (window.devicePixelRatio || 1);
      mouse.y = (window.innerHeight - e.clientY) * (window.devicePixelRatio || 1);
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    const start = performance.now();
    const render = () => {
      const t = (performance.now() - start) / 1000;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
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
