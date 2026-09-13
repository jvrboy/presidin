// Global pointer/scroll glass effects — mounted once at the app root.
//
//   1. Tap / click ripples: a soft circular wave expands from each touch or
//      mouse-down point, fading in ~700ms.
//   2. Scroll velocity sheen: a thin gradient bar at the top of the viewport
//      tints + glows in proportion to scroll speed, then decays.
//   3. Cursor "lens" (desktop only): a subtle backdrop-blur disc that follows
//      the pointer, giving the screen a glass-under-finger feel.
//
// All effects render to a single fixed canvas (z-index above page content but
// below modal layers) and respect prefers-reduced-motion.

import { useEffect, useRef } from "react";

interface Ripple {
  x: number;
  y: number;
  born: number;
  hue: number;
}

const RIPPLE_LIFE_MS = 700;
const MAX_RIPPLES = 20;

export function LiquidGlassFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const canvas = canvasRef.current;
    const lens = lensRef.current;
    const sheen = sheenRef.current;
    if (!canvas || !lens || !sheen) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = window.innerWidth;
    let h = window.innerHeight;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const ripples: Ripple[] = [];
    let lastScrollY = window.scrollY;
    let scrollVel = 0;
    let scrollDecay = 0;
    let lensX = -1000;
    let lensY = -1000;
    let lensVisible = false;
    let hueCursor = 200;

    const addRipple = (x: number, y: number) => {
      ripples.push({ x, y, born: performance.now(), hue: hueCursor });
      while (ripples.length > MAX_RIPPLES) ripples.shift();
      hueCursor = (hueCursor + 17) % 360;
    };

    const onPointerDown = (e: PointerEvent) => {
      addRipple(e.clientX, e.clientY);
    };
    const onTouchStart = (e: TouchEvent) => {
      for (const t of Array.from(e.touches)) addRipple(t.clientX, t.clientY);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        lensX = e.clientX;
        lensY = e.clientY;
        lensVisible = true;
      } else {
        lensVisible = false;
      }
    };
    const onPointerLeave = () => {
      lensVisible = false;
    };
    const onScroll = () => {
      const dy = window.scrollY - lastScrollY;
      lastScrollY = window.scrollY;
      scrollVel = Math.max(scrollVel, Math.min(120, Math.abs(dy)));
      scrollDecay = 1;
    };

    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("blur", onPointerLeave);
    window.addEventListener("scroll", onScroll, { passive: true });

    let raf = 0;
    const tick = () => {
      const t = performance.now();
      ctx.clearRect(0, 0, w, h);

      // ----- Ripples -----
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const age = t - r.born;
        if (age >= RIPPLE_LIFE_MS) {
          ripples.splice(i, 1);
          continue;
        }
        const p = age / RIPPLE_LIFE_MS;
        const radius = 8 + p * 140;
        const alpha = (1 - p) * 0.35;
        // outer ring
        ctx.strokeStyle = `hsla(${r.hue}, 90%, 70%, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        // soft fill
        const grad = ctx.createRadialGradient(r.x, r.y, radius * 0.4, r.x, r.y, radius);
        grad.addColorStop(0, `hsla(${r.hue}, 90%, 75%, ${alpha * 0.5})`);
        grad.addColorStop(1, `hsla(${r.hue}, 90%, 75%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // ----- Scroll sheen (DOM-driven, so blur works) -----
      scrollVel *= 0.85;
      scrollDecay *= 0.92;
      const sheenIntensity = Math.min(1, scrollVel / 60);
      sheen.style.opacity = String(sheenIntensity * scrollDecay);
      sheen.style.transform = `translateY(${(1 - scrollDecay) * -8}px)`;

      // ----- Cursor lens -----
      if (lensVisible) {
        lens.style.opacity = "1";
        lens.style.transform = `translate(${lensX - 40}px, ${lensY - 40}px)`;
      } else {
        lens.style.opacity = "0";
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onPointerLeave);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <>
      {/* Ripple/scroll canvas — fixed full-viewport overlay */}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="fixed inset-0 pointer-events-none z-[60]"
        style={{ mixBlendMode: "screen" }}
      />
      {/* Cursor lens — backdrop-blur "magnifying glass" */}
      <div
        ref={lensRef}
        aria-hidden
        className="fixed top-0 left-0 w-20 h-20 rounded-full pointer-events-none z-[55] transition-opacity duration-200 hidden md:block"
        style={{
          backdropFilter: "blur(8px) saturate(160%)",
          WebkitBackdropFilter: "blur(8px) saturate(160%)",
          background:
            "radial-gradient(circle at center, rgba(255,255,255,0.06), rgba(255,255,255,0) 70%)",
          border: "1px solid rgba(255,255,255,0.08)",
          opacity: 0,
        }}
      />
      {/* Scroll sheen — top-of-viewport prism */}
      <div
        ref={sheenRef}
        aria-hidden
        className="fixed top-0 left-0 right-0 h-1 pointer-events-none z-[58]"
        style={{
          background:
            "linear-gradient(90deg, rgba(56,189,248,0) 0%, rgba(56,189,248,0.8) 30%, rgba(217,70,239,0.8) 70%, rgba(56,189,248,0) 100%)",
          boxShadow: "0 0 24px rgba(56,189,248,0.5)",
          opacity: 0,
          transition: "transform 120ms ease-out",
        }}
      />
    </>
  );
}
