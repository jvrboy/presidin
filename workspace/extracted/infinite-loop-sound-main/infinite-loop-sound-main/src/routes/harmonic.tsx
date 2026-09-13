import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Waves, CircleCheck, XCircle } from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/harmonic")({
  head: () => ({ meta: [{ title: "Harmonic Patterns — DivergenceIQ" }] }),
  component: HarmonicPage,
});

const PATTERNS = [
  { name: "Gartley", xa: 1, ab: 0.618, bc: 0.382, cd: 1.13, ad: 0.786, dir: "Bullish/Bearish" },
  { name: "Bat", xa: 1, ab: 0.382, bc: 0.382, cd: 1.618, ad: 0.886, dir: "Bullish/Bearish" },
  { name: "Butterfly", xa: 1, ab: 0.786, bc: 0.382, cd: 1.618, ad: 1.27, dir: "Bullish/Bearish" },
  { name: "Crab", xa: 1, ab: 0.382, bc: 0.382, cd: 2.618, ad: 0.886, dir: "Bullish/Bearish" },
  { name: "Deep Crab", xa: 1, ab: 0.886, bc: 0.886, cd: 3.618, ad: 0.886, dir: "Bullish/Bearish" },
  { name: "Shark", xa: 1, ab: 0.886, bc: 1.13, cd: 1.618, ad: 0.886, dir: "Bullish/Bearish" },
  { name: "Cypher", xa: 1, ab: 0.382, bc: 0.618, cd: 1.272, ad: 0.786, dir: "Bullish/Bearish" },
  {
    name: "Three Drives",
    xa: 1,
    ab: 0.618,
    bc: 0.618,
    cd: 1.618,
    ad: 1.272,
    dir: "Bullish/Bearish",
  },
];

function HarmonicPage() {
  const [x, setX] = useState(1.1);
  const [a, setA] = useState(1.08);
  const [b, setB] = useState(1.09);
  const [c, setC] = useState(1.075);
  const [d, setD] = useState(1.085);

  const analysis = useMemo(() => {
    const xa = Math.abs(a - x);
    const ab = Math.abs(b - a);
    const bc = Math.abs(c - b);
    const cd = Math.abs(d - c);
    const ad = Math.abs(d - a);
    if (xa === 0 || ab === 0 || bc === 0) return null;

    const abRatio = ab / xa;
    const bcRatio = bc / ab;
    const cdRatio = cd / bc;
    const adRatio = ad / xa;

    const tolerance = 0.08;
    const matches = PATTERNS.map((p) => {
      const abOk = Math.abs(abRatio - p.ab) <= tolerance * p.ab;
      const bcOk = Math.abs(bcRatio - p.bc) <= tolerance * p.bc;
      const cdOk = Math.abs(cdRatio - p.cd) <= tolerance * p.cd;
      const adOk = Math.abs(adRatio - p.ad) <= tolerance * p.ad;
      const score = [abOk, bcOk, cdOk, adOk].filter(Boolean).length;
      return { ...p, abOk, bcOk, cdOk, adOk, score, isMatch: score === 4 };
    });

    const best = matches.filter((m) => m.score >= 3).sort((a, b) => b.score - a.score)[0];
    const direction = d > x ? "Bullish" : "Bearish";
    const prz = d;
    const sl = direction === "Bullish" ? Math.min(x, c) - xa * 0.05 : Math.max(x, c) + xa * 0.05;
    const tp1 = direction === "Bullish" ? d + (d - sl) * 0.618 : d - (sl - d) * 0.618;
    const tp2 = direction === "Bullish" ? d + (d - sl) * 1.272 : d - (sl - d) * 1.272;

    return { abRatio, bcRatio, cdRatio, adRatio, matches, best, direction, prz, sl, tp1, tp2 };
  }, [x, a, b, c, d]);

  const fmt = (n: number) => n.toFixed(5);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Waves className="w-6 h-6 text-primary" /> Harmonic Pattern Detector
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Detect Gartley, Bat, Butterfly, Crab, Shark, Cypher and other harmonic patterns using
            Fibonacci ratios.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="bg-card border border-border p-6 rounded-lg space-y-4 h-fit">
            <div className="text-sm font-semibold border-b border-border pb-2">
              Swing Points (XABCD)
            </div>
            {[
              { label: "X", val: x, set: setX },
              { label: "A", val: a, set: setA },
              { label: "B", val: b, set: setB },
              { label: "C", val: c, set: setC },
              { label: "D", val: d, set: setD },
            ].map((pt) => (
              <div key={pt.label}>
                <label className="text-sm font-medium mb-1 block">Point {pt.label}</label>
                <input
                  type="number"
                  step="0.0001"
                  value={pt.val}
                  onChange={(e) => pt.set(Number(e.target.value))}
                  className="w-full p-2 border border-input rounded bg-background font-mono"
                />
              </div>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            {analysis && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "AB/XA", value: analysis.abRatio },
                    { label: "BC/AB", value: analysis.bcRatio },
                    { label: "CD/BC", value: analysis.cdRatio },
                    { label: "AD/XA", value: analysis.adRatio },
                  ].map((r) => (
                    <div
                      key={r.label}
                      className="bg-card border border-border p-3 rounded-lg text-center"
                    >
                      <div className="text-[10px] text-muted-foreground uppercase">{r.label}</div>
                      <div className="font-mono font-bold text-lg mt-1">{r.value.toFixed(3)}</div>
                    </div>
                  ))}
                </div>

                {analysis.best && (
                  <div className="bg-card border border-border rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-lg font-bold">Best Match: {analysis.best.name}</div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold ${analysis.best.isMatch ? "bg-bull/20 text-bull" : "bg-warning/20 text-warning"}`}
                      >
                        {analysis.best.score}/4 ratios match
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      {[
                        { label: "AB", ok: analysis.best.abOk, target: analysis.best.ab },
                        { label: "BC", ok: analysis.best.bcOk, target: analysis.best.bc },
                        { label: "CD", ok: analysis.best.cdOk, target: analysis.best.cd },
                        { label: "AD", ok: analysis.best.adOk, target: analysis.best.ad },
                      ].map((r) => (
                        <div key={r.label} className="flex items-center gap-2">
                          {r.ok ? (
                            <CircleCheck className="w-4 h-4 text-bull" />
                          ) : (
                            <XCircle className="w-4 h-4 text-bear" />
                          )}
                          <span className="font-mono text-xs">
                            {r.label} ≈ {r.target}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Direction:</span>{" "}
                        <span className="font-bold">{analysis.direction}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">PRZ (D):</span>{" "}
                        <span className="font-mono font-bold">{fmt(analysis.prz)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Stop Loss:</span>{" "}
                        <span className="font-mono text-bear">{fmt(analysis.sl)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">TP1:</span>{" "}
                        <span className="font-mono text-bull">{fmt(analysis.tp1)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 p-3 border-b border-border font-semibold">
                    All Pattern Scores
                  </div>
                  <div className="divide-y divide-border">
                    {analysis.matches.map((m) => (
                      <div
                        key={m.name}
                        className="p-3 flex items-center justify-between hover:bg-accent/30"
                      >
                        <span className="font-medium">{m.name}</span>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            {[m.abOk, m.bcOk, m.cdOk, m.adOk].map((ok, i) => (
                              <div
                                key={i}
                                className={`w-2 h-2 rounded-full ${ok ? "bg-bull" : "bg-muted"}`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground font-mono w-8 text-right">
                            {m.score}/4
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
