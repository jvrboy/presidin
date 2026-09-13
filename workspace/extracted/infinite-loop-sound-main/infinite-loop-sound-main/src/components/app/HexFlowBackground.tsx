import { useEffect, useRef } from "react";

// Hexagonal grid flow shader — WebGL, animated honeycomb with flowing energy.
// Gives a "market matrix" feel. Teal/emerald palette.
export function HexFlowBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: true });
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

    const vs = `attribute vec2 a_pos; void main(){ gl_Position=vec4(a_pos,0.,1.); }`;
    const fs = `
      precision highp float;
      uniform float u_time;
      uniform vec2 u_res;
      #define PI 3.14159265359
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p);
        vec2 u=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
                   mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
      }
      // distance to hex grid centered on pointy-top hexagons
      float hex(vec2 p, float r){
        p=abs(p);
        float k=sqrt(3.0);
        vec2 q=vec2(p.x*k, p.y + p.x*0.5);
        q=abs(q);
        float a=0.5-q.x;
        float b=0.5-abs(p.y);
        return min(a,b);
      }
      void main(){
        vec2 uv=gl_FragCoord.xy/u_res.xy;
        float t=u_time*0.15;
        vec2 p=(uv-0.5)*vec2(u_res.x/u_res.y,1.0)*18.0;
        // animate the grid
        p+=vec2(noise(p*0.1+t), noise(p*0.1-t))*0.6;
        vec2 hp=mod(p, vec2(1.0, 1.732));
        hp=hp-0.5*vec2(1.0,1.732);
        float d=hex(hp, 0.42);
        float edge=smoothstep(0.0,0.04,0.04-d);
        // energy flow inside each cell
        float cell=floor(p.x)+floor(p.y)*13.0;
        float pulse=0.5+0.5*sin(t*2.0+cell);
        float fill=smoothstep(0.4,0.0,d)*pulse*0.25;
        vec3 bg=vec3(0.01,0.03,0.04);
        vec3 line=vec3(0.05,0.35,0.32);
        vec3 glow=vec3(0.1,0.6,0.5);
        vec3 col=bg+edge*line*0.5+fill*glow;
        col*=0.7+0.3*noise(p*0.3+t*0.5);
        gl_FragColor=vec4(col,1.0);
      }
    `;
    const mk = (ty: number, s: string) => {
      const sh = gl.createShader(ty)!;
      gl.shaderSource(sh, s);
      gl.compileShader(sh);
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const uT = gl.getUniformLocation(prog, "u_time");
    const uR = gl.getUniformLocation(prog, "u_res");
    const t0 = performance.now();
    const loop = () => {
      gl.uniform1f(uT, (performance.now() - t0) / 1000);
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      gl.deleteProgram(prog);
      gl.deleteBuffer(b);
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
