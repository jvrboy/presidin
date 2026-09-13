import { useEffect, useRef } from "react";

// Aurora flow shader — WebGL, teal/green aurora bands over a starfield.
// Used as an alternate background to ThreeBackground/WebGPUBackground.
export function AuroraBackground() {
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
      float hash21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p);
        vec2 u=f*f*(3.-2.*f);
        return mix(mix(hash21(i),hash21(i+vec2(1,0)),u.x),
                   mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),u.x),u.y);
      }
      void main(){
        vec2 uv=gl_FragCoord.xy/u_res.xy;
        float t=u_time*0.05;
        // starfield
        vec2 gp=uv*vec2(200.,120.);
        float star=step(0.985,hash21(floor(gp)));
        float tw=0.5+0.5*sin(u_time*2.+hash21(floor(gp))*6.28);
        // aurora bands
        float y=uv.y;
        float band=noise(vec2(uv.x*3.+t, y*4.-t*1.5));
        band+=0.5*noise(vec2(uv.x*6.-t*0.8, y*8.+t));
        float aur=pow(smoothstep(0.2,1.0,band),2.0);
        aur*=smoothstep(0.0,0.4,y)*smoothstep(1.0,0.5,y);
        vec3 col=vec3(0.01,0.02,0.04);
        col+=star*tw*vec3(0.6,0.8,0.9)*0.8;
        // teal/green aurora — no purple
        col+=aur*vec3(0.1,0.7,0.55);
        col+=aur*aur*vec3(0.2,0.9,0.6)*0.5;
        // subtle vignette
        float v=smoothstep(1.2,0.3,length(uv-0.5));
        col*=0.6+0.4*v;
        gl_FragColor=vec4(col,1.0);
      }
    `;
    const mk = (t: number, s: string) => {
      const sh = gl.createShader(t)!;
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
