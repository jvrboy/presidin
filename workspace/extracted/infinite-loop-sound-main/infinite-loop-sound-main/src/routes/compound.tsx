import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { TrendingUp, Percent } from "lucide-react";
import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export const Route = createFileRoute("/compound")({
  head: () => ({ meta: [{ title: "Compound Calculator — DivergenceIQ" }] }),
  component: CompoundPage,
});

function CompoundPage() {
  const [startingBalance, setStartingBalance] = useState(1000);
  const [monthlyReturn, setMonthlyReturn] = useState(5);
  const [months, setMonths] = useState(12);

  const data = useMemo(() => {
    let bal = startingBalance;
    const res = [];
    for (let i = 0; i <= months; i++) {
      res.push({
        month: `Month ${i}`,
        balance: Math.round(bal),
      });
      bal += bal * (monthlyReturn / 100);
    }
    return res;
  }, [startingBalance, monthlyReturn, months]);

  const finalBalance = data[data.length - 1]?.balance || 0;
  const totalProfit = finalBalance - startingBalance;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" /> Compound Growth Calculator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Project your long-term account growth through the power of compounding.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-card border border-border p-5 rounded-lg space-y-4 h-fit">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Starting Balance ($)</label>
              <input
                type="number"
                value={startingBalance}
                onChange={(e) => setStartingBalance(Number(e.target.value))}
                className="w-full p-2 border border-input rounded bg-background font-mono text-lg"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Target Monthly Return (%)</label>
              <input
                type="number"
                step="0.5"
                value={monthlyReturn}
                onChange={(e) => setMonthlyReturn(Number(e.target.value))}
                className="w-full p-2 border border-input rounded bg-background font-mono text-lg"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Duration (Months)</label>
              <input
                type="number"
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                className="w-full p-2 border border-input rounded bg-background font-mono text-lg"
              />
            </div>

            <div className="pt-4 mt-4 border-t border-border">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Total Profit:</span>
                <span className="font-mono text-bull">+${totalProfit.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Final Balance:</span>
                <span className="font-mono font-bold text-lg">
                  ${finalBalance.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 bg-card border border-border p-5 rounded-lg">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Growth Projection
            </h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickFormatter={(v) => `$${v}`}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                    }}
                    itemStyle={{ color: "var(--foreground)", fontFamily: "monospace" }}
                    formatter={(value: number) => [`$${value.toLocaleString()}`, "Balance"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="var(--primary)"
                    fillOpacity={1}
                    fill="url(#colorBal)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
