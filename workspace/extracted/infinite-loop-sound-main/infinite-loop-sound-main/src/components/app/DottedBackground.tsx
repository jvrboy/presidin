// Subtle dotted-grid background. Pure CSS, no JS animation cost.
// Used by /welcome showcase. Sits behind EntropyBackground.
export function DottedBackground({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`absolute inset-0 -z-20 pointer-events-none ${className}`}
      style={{
        backgroundImage:
          "radial-gradient(circle, hsl(var(--foreground) / 0.08) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
        maskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black 40%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black 40%, transparent 100%)",
      }}
    />
  );
}
