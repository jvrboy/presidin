import { ClosedTrade } from "@/lib/bot/runner";

export function exportToCSV(trades: ClosedTrade[], filename?: string): void {
  const headers = ["Timestamp", "Symbol", "Direction", "Lot", "Entry", "Exit", "P&L", "Result"];
  const rows = trades.map((t) => [
    new Date(t.openedAt).toISOString(),
    t.pair,
    t.direction,
    t.lot.toFixed(2),
    t.entry.toFixed(5),
    t.exit.toFixed(5),
    t.pnl.toFixed(2),
    t.result,
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  triggerDownload(blob, filename || `trades-${new Date().toISOString().split("T")[0]}.csv`);
}

export function exportToJSON(trades: ClosedTrade[], filename?: string): void {
  const data = { exportDate: new Date().toISOString(), trades };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename || `trades-${new Date().toISOString().split("T")[0]}.json`);
}

export function generateTradeReport(trades: ClosedTrade[]): string {
  const wins = trades.filter((t) => t.result === "WIN").length;
  const losses = trades.filter((t) => t.result === "LOSS").length;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

  return `TRADING PERFORMANCE REPORT
Generated: ${new Date().toLocaleString()}

SUMMARY
Total Trades: ${trades.length}
Wins: ${wins} | Losses: ${losses}
Win Rate: ${winRate.toFixed(2)}%
Total P&L: ${totalPnl.toFixed(2)}

TRADE DETAILS
${trades.map((t) => `${t.pair} ${t.direction} @ ${t.entry.toFixed(5)} -> ${t.exit.toFixed(5)} | ${t.pnl.toFixed(2)} (${t.result})`).join("\n")}
`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
