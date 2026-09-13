import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface EntropyProps {
  className?: string;
  size?: number;
}

/**
 * Entropy — animated order-vs-chaos particle field.
 * Left half = ordered grid; right half = chaotic motion that bleeds into the ordered side.
 */
export function Entropy({ className, size = 400 }: EntropyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const particleColor = "#ffffff";

    class Particle {
      x: number;
      y: number;
      size = 2;
      order: boolean;
      velocity = { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 };
      originalX: number;
      originalY: number;
      influence = 0;
      neighbors: Particle[] = [];
      constructor(x: number, y: number, order: boolean) {
        this.x = x;
        this.y = y;
        this.originalX = x;
        this.originalY = y;
        this.order = order;
      }
      update() {
        if (this.order) {
          const dx = this.originalX - this.x;
          const dy = this.originalY - this.y;
          const chaos = { x: 0, y: 0 };
          this.neighbors.forEach((n) => {
            if (!n.order) {
              const d = Math.hypot(this.x - n.x, this.y - n.y);
              const s = Math.max(0, 1 - d / 100);
              chaos.x += n.velocity.x * s;
              chaos.y += n.velocity.y * s;
              this.influence = Math.max(this.influence, s);
            }
          });
          this.x += dx * 0.05 * (1 - this.influence) + chaos.x * this.influence;
          this.y += dy * 0.05 * (1 - this.influence) + chaos.y * this.influence;
          this.influence *= 0.99;
        } else {
          this.velocity.x += (Math.random() - 0.5) * 0.5;
          this.velocity.y += (Math.random() - 0.5) * 0.5;
          this.velocity.x *= 0.95;
          this.velocity.y *= 0.95;
          this.x += this.velocity.x;
          this.y += this.velocity.y;
          if (this.x < size / 2 || this.x > size) this.velocity.x *= -1;
          if (this.y < 0 || this.y > size) this.velocity.y *= -1;
          this.x = Math.max(size / 2, Math.min(size, this.x));
          this.y = Math.max(0, Math.min(size, this.y));
        }
      }
      draw(c: CanvasRenderingContext2D) {
        const alpha = this.order ? 0.8 - this.influence * 0.5 : 0.8;
        c.fillStyle = `${particleColor}${Math.round(alpha * 255)
          .toString(16)
          .padStart(2, "0")}`;
        c.beginPath();
        c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        c.fill();
      }
    }

    const particles: Particle[] = [];
    const gridSize = 25;
    const spacing = size / gridSize;
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const x = spacing * i + spacing / 2;
        const y = spacing * j + spacing / 2;
        particles.push(new Particle(x, y, x < size / 2));
      }
    }

    const updateNeighbors = () => {
      particles.forEach((p) => {
        p.neighbors = particles.filter((o) => o !== p && Math.hypot(p.x - o.x, p.y - o.y) < 100);
      });
    };

    let t = 0;
    let raf = 0;
    const loop = () => {
      ctx.clearRect(0, 0, size, size);
      if (t % 30 === 0) updateNeighbors();
      particles.forEach((p) => {
        p.update();
        p.draw(ctx);
        p.neighbors.forEach((n) => {
          const d = Math.hypot(p.x - n.x, p.y - n.y);
          if (d < 50) {
            const a = 0.2 * (1 - d / 50);
            ctx.strokeStyle = `${particleColor}${Math.round(a * 255)
              .toString(16)
              .padStart(2, "0")}`;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(n.x, n.y);
            ctx.stroke();
          }
        });
      });
      ctx.strokeStyle = `${particleColor}4D`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(size / 2, 0);
      ctx.lineTo(size / 2, size);
      ctx.stroke();
      t++;
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <div
      className={cn("relative bg-black rounded-lg overflow-hidden", className)}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      />
    </div>
  );
}
