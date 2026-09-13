// Lightweight animated entropy background — particle field with brownian motion
// + decaying connections. Runs on canvas2d so it stays cheap (no WebGL).
// Used by /welcome showcase.
import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export function EntropyBackground({
  density = 0.00012,
  color = "56,189,248",
  className = "",
}: {
  density?: number;
  color?: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let particles: Particle[] = [];
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(40, Math.min(180, Math.floor(w * h * density)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        life: Math.random(),
      }));
    };

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      // edges
      ctx.lineWidth = 1;
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 120 * 120) {
            const alpha = (1 - d2 / (120 * 120)) * 0.35;
            ctx.strokeStyle = `rgba(${color}, ${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      // nodes
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life += 0.005;
        if (p.life > 1) p.life = 0;
        // brownian jitter
        p.vx += (Math.random() - 0.5) * 0.04;
        p.vy += (Math.random() - 0.5) * 0.04;
        // soft cap
        p.vx = Math.max(-0.8, Math.min(0.8, p.vx));
        p.vy = Math.max(-0.8, Math.min(0.8, p.vy));
        // wrap
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        ctx.fillStyle = `rgba(${color}, ${0.5 + 0.5 * Math.sin(p.life * Math.PI)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    tick();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [density, color]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`absolute inset-0 -z-10 pointer-events-none ${className}`}
    />
  );
}
