import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Radio } from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/fourier")({
  head: () => ({ meta: [{ title: "Fourier Spectrum — DivergenceIQ" }] }),
  component: FourierPage,
});

function dft(samples: number[]): { freqs: number[]; mags: number[]; dominant: number } {
  const N = samples.length;
  const freqs: number[] = [];
  const mags: number[] = [];
  const half = Math.floor(N / 2);
  for (let k = 0; k < half; k++) {
    let re = 0,
      im = 0;
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      re += samples[n] * Math.cos(angle);
      im -= samples[n] * Math.sin(angle);
    }
    freqs.push(k);
    mags.push(Math.sqrt(re * re + im * im) / N);
  }
  let dominant = 0;
  let maxMag = 0;
  for (let i = 1; i < mags.length; i++) {
    if (mags[i] > maxMag) {
      maxMag = mags[i];
      dominant = i;
    }
  }
  return { freqs, mags, dominant };
}

function FourierPage() {
  const [input, setInput] = useState(
    "1.085,1.083,1.081,1.080,1.079,1.078,1.077,1.076,1.075,1.076,1.077,1.078,1.080,1.082,1.084,1.086,1.088,1.089,1.090,1.091,1.090,1.089,1.087,1.085,1.083,1.081,1.080,1.079,1.080,1.081,1.083,1.085",
  );

  const { samples, spectrum, detrended } = useMemo(() => {
    const s = input
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n));
    if (s.length < 8) return { samples: s, spectrum: null, detrended: [] };
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    const dt = s.map((v) => v - mean);
    const spec = dft(dt);
    return { samples: s, spectrum: spec, detrended: dt };
  }, [input]);

  const maxMag = spectrum ? Math.max(...spectrum.mags) : 1;
  const cyclePeriod = spectrum && samples.length > 0 ? samples.length / spectrum.dominant : 0;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Radio className="w-6 h-6 text-primary" /> Fourier Spectrum Analyzer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Discrete Fourier Transform of price data to identify dominant cycles and recurring
            patterns for cycle-based forecasting.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border p-4 rounded-lg space-y-3">
            <label className="text-sm font-medium">Price Series (comma-separated)</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={6}
              className="w-full p-3 border border-input rounded bg-background font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {samples.length} data points. Minimum 8 required.
            </p>
          </div>

          <div className="space-y-4">
            {spectrum ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-card border border-border p-4 rounded-lg text-center">
                    <div className="text-[10px] text-muted-foreground uppercase">
                      Dominant Cycle
                    </div>
                    <div className="font-mono font-bold text-2xl mt-1">
                      {cyclePeriod.toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground">bars</div>
                  </div>
                  <div className="bg-card border border-border p-4 rounded-lg text-center">
                    <div className="text-[10px] text-muted-foreground uppercase">Dominant Freq</div>
                    <div className="font-mono font-bold text-2xl mt-1">{spectrum.dominant}</div>
                    <div className="text-xs text-muted-foreground">
                      cycles / {samples.length} bars
                    </div>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="text-sm font-semibold mb-3">Frequency Spectrum</div>
                  <div className="space-y-1">
                    {spectrum.mags.map((mag, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground w-8">{i}</span>
                        <div className="flex-1 bg-muted rounded h-2 relative">
                          <div
                            className={`h-2 rounded transition-all ${i === spectrum.dominant ? "bg-primary" : "bg-bull/50"}`}
                            style={{ width: `${(mag / maxMag) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground w-16 text-right">
                          {mag.toFixed(4)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg p-4 text-sm">
                  <div className="font-semibold mb-2">Interpretation</div>
                  <p className="text-muted-foreground">
                    The dominant cycle repeats every{" "}
                    <span className="font-mono font-bold text-foreground">
                      {cyclePeriod.toFixed(1)}
                    </span>{" "}
                    bars. Use this for timing entries/exits — expect reversals near cycle troughs
                    and crests. Combine with RSI or MACD for confirmation at cycle extremes.
                  </p>
                </div>
              </>
            ) : (
              <div className="bg-card border border-border p-6 rounded-lg text-center text-muted-foreground">
                Need at least 8 data points for Fourier analysis.
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
