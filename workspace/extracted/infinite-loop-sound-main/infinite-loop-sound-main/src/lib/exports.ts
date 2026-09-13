export const downloadCSV = (filename: string, rows: Record<string, any>[]) => {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
};

export const downloadEquityChart = (equity: { i: number; equity: number }[], filename: string) => {
  const W = 1200,
    H = 600,
    pad = 40;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, W, H);
  if (equity.length) {
    const min = Math.min(0, ...equity.map((e) => e.equity));
    const max = Math.max(0, ...equity.map((e) => e.equity));
    const xR = equity.length - 1 || 1,
      yR = max - min || 1;
    const x = (i: number) => pad + ((W - 2 * pad) * i) / xR;
    const y = (v: number) => H - pad - ((H - 2 * pad) * (v - min)) / yR;
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const yy = pad + ((H - 2 * pad) * i) / 5;
      ctx.beginPath();
      ctx.moveTo(pad, yy);
      ctx.lineTo(W - pad, yy);
      ctx.stroke();
    }
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2;
    ctx.beginPath();
    equity.forEach((e, i) => {
      if (i === 0) ctx.moveTo(x(i), y(e.equity));
      else ctx.lineTo(x(i), y(e.equity));
    });
    ctx.stroke();
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "14px ui-sans-serif";
    ctx.fillText("Equity Curve (R-multiples)", pad, 24);
    ctx.fillText(`Final R: ${equity[equity.length - 1].equity.toFixed(2)}`, W - 220, 24);
  }
  c.toBlob((b) => {
    if (b) triggerDownload(b, filename);
  }, "image/png");
};

const triggerDownload = (blob: Blob, filename: string) => {
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
};
