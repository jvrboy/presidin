import { useEffect, useRef } from "react";

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color1: string;
  color2: string;
  noiseOffset: number;
  pulseSpeed: number;
}

export function ThreeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let time = 0;
    let scrollY = 0;
    let scrollVelocity = 0;
    let lastScrollY = window.scrollY;
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0, active: false };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Track scroll events for liquid deformation on finger scroll
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const diff = currentScrollY - lastScrollY;
      scrollY = currentScrollY;
      lastScrollY = currentScrollY;

      // Push high-viscosity momentum into the liquid
      scrollVelocity += diff * 0.05;
      if (Math.abs(scrollVelocity) > 15) {
        scrollVelocity = Math.sign(scrollVelocity) * 15;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    // Track mouse / finger moves
    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
      mouse.active = true;
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouse.targetX = e.touches[0].clientX;
        mouse.targetY = e.touches[0].clientY;
        mouse.active = true;
      }
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });

    // Generate liquid glass blobs with rich, frosted colors (Teal, Cyan, Purple, Emerald)
    const blobs: Blob[] = [
      {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: 180 + Math.random() * 80,
        color1: "rgba(20, 184, 166, 0.12)", // Teal
        color2: "rgba(13, 148, 136, 0.0)",
        noiseOffset: Math.random() * 100,
        pulseSpeed: 0.002 + Math.random() * 0.003,
      },
      {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        radius: 220 + Math.random() * 100,
        color1: "rgba(56, 189, 248, 0.1)", // Cyan / Sky Blue
        color2: "rgba(14, 165, 233, 0.0)",
        noiseOffset: Math.random() * 100,
        pulseSpeed: 0.001 + Math.random() * 0.002,
      },
      {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        radius: 260 + Math.random() * 120,
        color1: "rgba(139, 92, 246, 0.08)", // Purple
        color2: "rgba(109, 40, 217, 0.0)",
        noiseOffset: Math.random() * 100,
        pulseSpeed: 0.001 + Math.random() * 0.0015,
      },
      {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: 140 + Math.random() * 60,
        color1: "rgba(16, 185, 129, 0.1)", // Bull Emerald Green
        color2: "rgba(4, 120, 87, 0.0)",
        noiseOffset: Math.random() * 100,
        pulseSpeed: 0.003 + Math.random() * 0.004,
      },
      {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: 130 + Math.random() * 50,
        color1: "rgba(239, 68, 68, 0.07)", // Bear Crimson Red
        color2: "rgba(185, 28, 28, 0.0)",
        noiseOffset: Math.random() * 100,
        pulseSpeed: 0.003 + Math.random() * 0.003,
      },
    ];

    const animate = () => {
      time += 0.003;
      const w = canvas.width;
      const h = canvas.height;

      // Decelerate scroll velocity (viscous friction)
      scrollVelocity *= 0.94;
      if (Math.abs(scrollVelocity) < 0.01) scrollVelocity = 0;

      // Ease mouse coordinates for smooth lag effect (simulates high viscosity fluid)
      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;

      ctx.clearRect(0, 0, w, h);

      // Deep dark futuristic trade room background
      const bgGrad = ctx.createRadialGradient(
        w * 0.5,
        h * 0.5,
        0,
        w * 0.5,
        h * 0.5,
        Math.max(w, h),
      );
      bgGrad.addColorStop(0, "#080b16");
      bgGrad.addColorStop(0.5, "#05070e");
      bgGrad.addColorStop(1, "#020306");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Render organic liquid glass blobs
      ctx.globalCompositeOperation = "screen";
      blobs.forEach((blob) => {
        // Move blobs organically
        blob.x += blob.vx;
        blob.y += blob.vy;

        // Apply scroll force: drag blobs upwards or downwards
        blob.y -= scrollVelocity * 0.5;

        // Keep inside screen with soft bouncing
        if (blob.x < -blob.radius) blob.x = w + blob.radius;
        if (blob.x > w + blob.radius) blob.x = -blob.radius;
        if (blob.y < -blob.radius) blob.y = h + blob.radius;
        if (blob.y > h + blob.radius) blob.y = -blob.radius;

        // Interactive mouse force: push blobs slightly away from mouse
        if (mouse.active) {
          const dx = blob.x - mouse.x;
          const dy = blob.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 400 && dist > 1) {
            const force = (400 - dist) * 0.02;
            blob.x += (dx / dist) * force;
            blob.y += (dy / dist) * force;
          }
        }

        // Pulse the size organically
        const pulse = Math.sin(time * 3 + blob.noiseOffset) * 15;
        const currentRadius = blob.radius + pulse;

        // Draw radial glass glow blob
        const g = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, currentRadius);
        g.addColorStop(0, blob.color1);
        g.addColorStop(0.4, blob.color1.replace(/\d\.?\d*\)/, "0.04)"));
        g.addColorStop(1, blob.color2);

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(blob.x, blob.y, currentRadius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Render interactive Liquid Refraction Grid (deforms on mouse / scroll)
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(20, 184, 166, 0.018)"; // Super subtle cyan grid
      ctx.lineWidth = 0.5;

      const gridSpacing = 50;
      const cols = Math.ceil(w / gridSpacing) + 1;
      const rows = Math.ceil(h / gridSpacing) + 1;

      for (let r = 0; r < rows; r++) {
        ctx.beginPath();
        for (let c = 0; c < cols; c++) {
          const baseX = c * gridSpacing;
          const baseY = r * gridSpacing;

          let displayX = baseX;
          let displayY = baseY;

          // Mouse warp distortion (Liquid refraction lens)
          if (mouse.active) {
            const dx = baseX - mouse.x;
            const dy = baseY - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 300) {
              const refract = Math.sin((dist / 300) * Math.PI - Math.PI / 2); // glass refraction formula
              const factor = refract * 15;
              displayX += (dx / (dist || 1)) * factor;
              displayY += (dy / (dist || 1)) * factor;
            }
          }

          // Scroll wave ripple
          const wave = Math.sin(baseX * 0.004 + time * 1.5) * scrollVelocity * 3;
          displayY += wave;

          if (c === 0) ctx.moveTo(displayX, displayY);
          else ctx.lineTo(displayX, displayY);
        }
        ctx.stroke();
      }

      for (let c = 0; c < cols; c++) {
        ctx.beginPath();
        for (let r = 0; r < rows; r++) {
          const baseX = c * gridSpacing;
          const baseY = r * gridSpacing;

          let displayX = baseX;
          let displayY = baseY;

          if (mouse.active) {
            const dx = baseX - mouse.x;
            const dy = baseY - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 300) {
              const refract = Math.sin((dist / 300) * Math.PI - Math.PI / 2);
              const factor = refract * 15;
              displayX += (dx / (dist || 1)) * factor;
              displayY += (dy / (dist || 1)) * factor;
            }
          }

          const wave = Math.sin(baseX * 0.004 + time * 1.5) * scrollVelocity * 3;
          displayY += wave;

          if (r === 0) ctx.moveTo(displayX, displayY);
          else ctx.lineTo(displayX, displayY);
        }
        ctx.stroke();
      }

      // Draw elegant digital overlay lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.015)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w * 0.25, 0);
      ctx.lineTo(w * 0.25, h);
      ctx.moveTo(w * 0.75, 0);
      ctx.lineTo(w * 0.75, h);
      ctx.stroke();

      // Subtle frosted vignettes
      const vig = ctx.createRadialGradient(
        w * 0.5,
        h * 0.5,
        Math.min(w, h) * 0.4,
        w * 0.5,
        h * 0.5,
        Math.max(w, h),
      );
      vig.addColorStop(0, "rgba(0, 0, 0, 0)");
      vig.addColorStop(1, "rgba(2, 4, 10, 0.55)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0, opacity: 0.85 }}
    />
  );
}
