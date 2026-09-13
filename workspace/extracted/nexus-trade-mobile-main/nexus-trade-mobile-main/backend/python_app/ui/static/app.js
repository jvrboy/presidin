/* Nexus Trade — Agentic Terminal frontend */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let currentFilter = "all";
let ws = null;
let settingsCache = null;
let equityChart = null;
let lastTickers = [];

// -------------------- Tabs --------------------
$$(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".tab").forEach((t) => t.classList.remove("active"));
    $$(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(`#tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "analytics") loadAnalytics();
    if (btn.dataset.tab === "agents") loadAgentSymbols();
  });
});

// -------------------- WebSocket --------------------
function connectWS() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send("ping"); }, 25000);
  };
  ws.onmessage = (ev) => {
    try {
      if (ev.data === "pong") return;
      renderState(JSON.parse(ev.data));
    } catch (e) { /* ignore */ }
  };
  ws.onclose = () => setTimeout(connectWS, 3000);
  ws.onerror = () => ws.close();
}

// -------------------- Main render --------------------
function renderState(s) {
  // Header pills
  setPill("#mt5-status", s.mt5_connected, s.mt5_connected ? "MT5 Online" : "MT5 Offline");
  const running = s.bot_state === "running";
  setPill("#bot-status", running, (s.bot_state || "stopped").toUpperCase(), running ? "running" : "offline");

  const acc = s.account || {};
  setText("#bal", fmt(acc.balance));
  setText("#eq", fmt(acc.equity));
  setText("#free-margin", fmt(acc.free_margin));
  const chg = (acc.equity || 0) - (acc.balance || 0);
  setText("#eq-chg", (chg >= 0 ? "+" : "") + fmt(chg));
  setText("#margin-lvl", acc.margin_level ? "ML " + Number(acc.margin_level).toFixed(0) + "%" : "");
  const pnl = $("#pnl");
  if (pnl) {
    pnl.textContent = fmt(acc.profit);
    pnl.className = "mc-value " + ((acc.profit || 0) >= 0 ? "positive" : "negative");
  }
  setText("#pnl-pct", acc.balance ? (((acc.profit || 0) / acc.balance) * 100).toFixed(2) + "%" : "");
  setText("#bal-cur", acc.currency || "USD");

  renderPositions(s.positions || []);
  renderLogs(s.logs || []);
  renderSignals(s.signals || []);
  renderEquity(s.equity_history || []);
  setText("#pos-count", (s.positions || []).length);
}

function setPill(sel, ok, text, cls) {
  const el = $(sel);
  if (!el) return;
  el.innerHTML = `<i class="dot"></i>${esc(text)}`;
  el.className = "pill " + (cls || (ok ? "online" : "offline"));
}

// -------------------- Equity chart --------------------
function renderEquity(history) {
  const canvas = $("#equity-chart");
  if (!canvas || !window.Chart) return;
  const labels = history.map((h) => h.t);
  const eq = history.map((h) => h.equity);
  const bal = history.map((h) => h.balance);
  setText("#eq-points", history.length + " pts");

  const data = {
    labels,
    datasets: [
      { label: "Equity", data: eq, borderColor: "#5b8cff", borderWidth: 2, pointRadius: 0, tension: 0.35, fill: true,
        backgroundColor: (c) => {
          const g = c.chart.ctx.createLinearGradient(0, 0, 0, c.chart.height);
          g.addColorStop(0, "rgba(91,140,255,0.25)"); g.addColorStop(1, "rgba(91,140,255,0)");
          return g;
        } },
      { label: "Balance", data: bal, borderColor: "rgba(139,149,168,0.6)", borderWidth: 1, borderDash: [5, 4], pointRadius: 0, tension: 0.3, fill: false },
    ],
  };
  const opts = {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { intersect: false, mode: "index" },
    plugins: { legend: { labels: { color: "#8b95a8", boxWidth: 12, font: { family: "JetBrains Mono", size: 10 } } } },
    scales: {
      x: { ticks: { color: "#5a6478", maxTicksLimit: 8, font: { family: "JetBrains Mono", size: 9 } }, grid: { color: "rgba(255,255,255,0.04)" } },
      y: { ticks: { color: "#5a6478", font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(255,255,255,0.05)" } },
    },
  };
  if (equityChart) { equityChart.data = data; equityChart.options = opts; equityChart.update("none"); }
  else equityChart = new Chart(canvas, { type: "line", data, options: opts });
}

// -------------------- Positions --------------------
function renderPositions(positions) {
  const tbody = $("#positions-body");
  if (!tbody) return;
  if (!positions.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty">No open positions</td></tr>`;
    return;
  }
  tbody.innerHTML = positions.map((p) => `
    <tr>
      <td style="font-weight:600">${esc(p.symbol)}</td>
      <td class="${p.type === "buy" ? "positive" : "negative"}">${p.type.toUpperCase()}</td>
      <td>${p.volume}</td>
      <td>${p.open_price}</td>
      <td>${p.current_price}</td>
      <td>${p.sl || "—"}</td>
      <td>${p.tp || "—"}</td>
      <td class="${p.profit >= 0 ? "positive" : "negative"}" style="font-weight:600">${fmt(p.profit)}</td>
      <td><button class="close-btn" onclick="closePosition(${p.ticket})">✕</button></td>
    </tr>`).join("");
}

// -------------------- Logs --------------------
function renderLogs(logs) {
  const el = $("#logs");
  if (!el) return;
  el.innerHTML = logs.map((l) => `<div class="log-line">${esc(l)}</div>`).join("");
  el.scrollTop = el.scrollHeight;
  setText("#log-count", logs.length);
}

// -------------------- Signals --------------------
function renderSignals(signals) {
  const grid = $("#signals-grid");
  if (!grid) return;
  const filtered = currentFilter === "all" ? signals : signals.filter((s) => s.asset_class === currentFilter);
  setText("#signal-count", `${filtered.length} signal${filtered.length === 1 ? "" : "s"}`);
  if (!filtered.length) {
    grid.innerHTML = `<div class="card" style="grid-column:1/-1;text-align:center;color:var(--text-faint)">No signals — start the bot to scan</div>`;
    return;
  }
  grid.innerHTML = filtered.slice(0, 40).map((s) => `
    <div class="signal-card ${s.direction}">
      <div class="sig-head">
        <span class="sig-symbol">${esc(s.symbol)}</span>
        <span class="sig-dir ${s.direction}">${s.direction.toUpperCase()}</span>
      </div>
      <div class="sig-strength">
        <div class="sig-strength-bar"><div class="sig-strength-fill" style="width:${s.strength}%"></div></div>
        <div class="sig-strength-val">Strength ${Number(s.strength).toFixed(0)} · ${esc(s.timeframe)}</div>
      </div>
      <div class="sig-levels">
        <div class="sig-level"><span class="l">ENTRY</span>${s.entry}</div>
        <div class="sig-level"><span class="l">SL</span>${s.sl || "—"}</div>
        <div class="sig-level"><span class="l">TP</span>${s.tp || "—"}</div>
      </div>
      <div class="sig-reason">${esc(s.reason)}</div>
      <div class="sig-foot">
        <span class="sig-class">${esc(s.asset_class)}</span>
        <button class="btn btn-sm ${s.direction === "buy" ? "btn-primary" : "btn-danger"}"
          onclick="takeSignal('${s.id}','${s.symbol}','${s.direction}',${s.entry},${s.sl || 0},${s.tp || 0})">Take Trade</button>
      </div>
    </div>`).join("");
}

$$(".filter").forEach((b) => b.addEventListener("click", () => {
  $$(".filter").forEach((x) => x.classList.remove("active"));
  b.classList.add("active");
  currentFilter = b.dataset.f;
}));

// -------------------- Ticker tape --------------------
async function loadTickers() {
  try {
    const res = await fetch("/api/tickers");
    lastTickers = await res.json();
    const tape = $("#ticker-tape");
    if (!tape) return;
    tape.innerHTML = lastTickers.map((t) => `
      <span class="tape-item">
        <span class="tape-sym">${esc(t.symbol)}</span>
        <span class="tape-price">${t.price < 50 ? t.price.toFixed(5) : t.price.toFixed(2)}</span>
        <span class="tape-chg ${t.change_pct >= 0 ? "up" : "down"}">${t.change_pct >= 0 ? "▲" : "▼"} ${Math.abs(t.change_pct).toFixed(2)}%</span>
      </span>`).join("");
  } catch (e) { /* offline */ }
}

// -------------------- Performance --------------------
async function loadPerformance() {
  try {
    const res = await fetch("/api/performance");
    const p = await res.json();
    setText("#winrate", p.win_rate != null ? (p.win_rate * 100).toFixed(0) + "%" : "—");
    setText("#trades-n", `${p.closed_trades} closed · streak ${p.best_streak}W/${p.worst_streak}L`);
    setText("#expectancy", p.expectancy_atr != null ? (p.expectancy_atr >= 0 ? "+" : "") + p.expectancy_atr.toFixed(2) : "—");
  } catch (e) { /* ignore */ }
}

// -------------------- Bot controls --------------------
async function botAction(action) {
  await fetch("/api/bot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
}
async function rescan() {
  await fetch("/api/signals/rescan", { method: "POST" });
}
async function closePosition(ticket) {
  await fetch("/api/close", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket }) });
}
async function killSwitch() {
  if (!confirm("⚠ EMERGENCY: close ALL positions and stop the bot?")) return;
  const res = await fetch("/api/kill?reason=manual_ui", { method: "POST" });
  const r = await res.json();
  alert(`Kill switch fired — ${r.closed} position(s) closed, bot stopped.`);
}
async function takeSignal(id, symbol, direction, entry, sl, tp) {
  const res = await fetch("/api/trade", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signal_id: id, symbol, direction, sl: sl || null, tp: tp || null }),
  });
  const r = await res.json();
  if (!res.ok) alert(r.detail || "Trade rejected (enable live trading in Settings)");
}

// -------------------- Agents tab --------------------
function loadAgentSymbols() {
  const sel = $("#agent-symbol");
  if (!sel) return;
  const syms = (settingsCache?.active_symbols) || ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"];
  sel.innerHTML = syms.map((s) => `<option>${esc(s)}</option>`).join("");
}

async function loadAgentDecision() {
  const sym = $("#agent-symbol")?.value || "EURUSD";
  const cards = $("#agent-cards");
  cards.innerHTML = `<div class="card" style="grid-column:1/-1;color:var(--text-dim)">Running ${esc(sym)} through all agents…</div>`;
  try {
    const res = await fetch(`/api/agents/decision?symbol=${encodeURIComponent(sym)}`);
    const d = await res.json();
    const verdict = $("#agent-verdict");
    verdict.textContent = `${d.final_signal} · conf ${(d.confidence * 100).toFixed(0)}% · score ${d.weighted_score >= 0 ? "+" : ""}${d.weighted_score.toFixed(2)} · ${d.data_source}`;
    cards.innerHTML = (d.opinions || []).map((o) => `
      <div class="agent-card">
        <div class="agent-name">${esc(o.agent)}</div>
        <div class="agent-signal ${o.signal.toLowerCase()}">${esc(o.signal)}</div>
        <div style="font-size:11px;color:var(--text-faint)">confidence ${(o.confidence * 100).toFixed(0)}%</div>
        <div class="agent-conf-bar"><div class="agent-conf-fill" style="width:${o.confidence * 100}%"></div></div>
      </div>`).join("");
    const lines = (d.opinions || []).flatMap((o) =>
      [`${o.agent} → ${o.signal} (${(o.confidence * 100).toFixed(0)}%)`, ...o.reasons.map((r) => `   • ${r}`), ""]);
    if (d.ensemble) lines.push(`Ensemble: ${d.ensemble.regime} regime, position ${d.ensemble.position}`, "");
    if (d.rl) lines.push(`RL policy: ${d.rl.trained ? `trained on ${d.rl.samples} outcomes, winP ${(d.rl.win_probability * 100).toFixed(0)}%` : d.rl.note}`, "");
    $("#agent-reasoning").textContent = lines.join("\n");
  } catch (e) {
    cards.innerHTML = `<div class="card" style="grid-column:1/-1;color:var(--red)">Agent analysis failed: ${esc(e.message)}</div>`;
  }
}

// -------------------- Analytics tab --------------------
async function loadAnalytics() { loadCorrelations(); loadRL(); loadExec(); loadSMC(); }

async function loadCorrelations() {
  try {
    const res = await fetch("/api/correlations");
    const d = await res.json();
    const wrap = $("#corr-matrix");
    if (!d.matrix) { wrap.innerHTML = `<span style="color:var(--text-faint)">Correlation matrix builds after the first agentic cycle.</span>`; return; }
    const syms = d.matrix.symbols, vals = d.matrix.values;
    let html = `<div>`;
    html += `<div><span class="corr-label"></span>${syms.map((s) => `<span class="corr-label">${esc(s.slice(0, 6))}</span>`).join("")}</div>`;
    syms.forEach((s, i) => {
      html += `<div><span class="corr-label">${esc(s.slice(0, 6))}</span>`;
      vals[i].forEach((v) => {
        const a = Math.min(Math.abs(v), 1);
        const col = v >= 0 ? `rgba(52,211,153,${0.12 + a * 0.6})` : `rgba(248,113,113,${0.12 + a * 0.6})`;
        html += `<span class="corr-cell" style="background:${col}">${v.toFixed(2)}</span>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
    if (d.divergences?.length) {
      html += `<div style="margin-top:12px;font-size:11.5px;color:var(--yellow)">⚠ ${d.divergences.length} divergence(s): ` +
        d.divergences.slice(0, 3).map((x) => `${x.pair1}/${x.pair2}`).join(", ") + `</div>`;
    }
    wrap.innerHTML = html;
  } catch (e) { /* ignore */ }
}

async function loadRL() {
  try {
    const [rlRes, ppoRes] = await Promise.all([fetch("/api/rl/status"), fetch("/api/rl/ppo/status")]);
    const rl = await rlRes.json(); const ppo = await ppoRes.json();
    $("#rl-status").innerHTML = `
      <div class="row"><span class="k">Tabular RL</span><span class="v">${rl.trained ? "trained" : "learning"} (${rl.samples} samples)</span></div>
      <div class="row"><span class="k">Pending labels</span><span class="v">${rl.pending_labels}</span></div>
      <div class="row"><span class="k">Avg reward</span><span class="v">${rl.avg_reward_atr} ATR</span></div>
      <div class="row"><span class="k">PPO engine</span><span class="v">${ppo.available ? "available" : "not installed"}</span></div>
      <div class="row"><span class="k">PPO champion</span><span class="v">${ppo.champion_version ? "v" + ppo.champion_version : "none yet"}</span></div>
      <div class="row"><span class="k">Versions</span><span class="v">${(ppo.versions || []).length}</span></div>`;
  } catch (e) { /* ignore */ }
}

async function rlTrain() {
  const res = await fetch("/api/rl/train", { method: "POST" });
  const r = await res.json();
  alert(r.trained ? `Trained on ${r.samples} outcomes (accuracy ${(r.accuracy * 100).toFixed(0)}%)` : `Not ready: ${r.reason}`);
  loadRL();
}

async function loadExec() {
  try {
    const res = await fetch("/api/execution/audit");
    const a = await res.json();
    $("#exec-audit").innerHTML = `
      <div class="row"><span class="k">Direct MT5 API</span><span class="v">${a.direct_api_available ? "connected" : "bridge mode"}</span></div>
      <div class="row"><span class="k">Executions</span><span class="v">${a.executions}</span></div>
      <div class="row"><span class="k">Avg slippage</span><span class="v">${a.avg_slippage_points ?? "—"} pts</span></div>
      <div class="row"><span class="k">Max slippage</span><span class="v">${a.max_slippage_points ?? "—"} pts</span></div>
      <div class="row"><span class="k">Avg latency</span><span class="v">${a.avg_latency_ms ?? "—"} ms</span></div>
      <div class="row"><span class="k">Fill rate</span><span class="v">${a.fill_rate != null ? (a.fill_rate * 100).toFixed(0) + "%" : "—"}</span></div>`;
  } catch (e) { /* ignore */ }
}

async function loadSMC() {
  const sym = $("#agent-symbol")?.value || "EURUSD";
  try {
    const res = await fetch(`/api/smc/${encodeURIComponent(sym)}`);
    const d = await res.json();
    $("#smc-context").innerHTML = `
      <div class="row"><span class="k">Symbol</span><span class="v">${esc(d.symbol)} (${d.data_source})</span></div>
      <div class="row"><span class="k">SMC bias</span><span class="v">${d.bias > 0 ? "bullish" : d.bias < 0 ? "bearish" : "neutral"}</span></div>
      <div class="row"><span class="k">Zone</span><span class="v">${esc(d.zone)}</span></div>
      <div class="row"><span class="k">AMD phase</span><span class="v">${esc(d.amd_phase)} (${(d.amd_confidence * 100).toFixed(0)}%)</span></div>
      <div class="row"><span class="k">Order blocks</span><span class="v">${(d.order_blocks || []).length}</span></div>
      <div class="row"><span class="k">Open FVGs</span><span class="v">${(d.fvgs || []).length}</span></div>
      <div class="row"><span class="k">Liquidity pools</span><span class="v">${(d.liquidity_pools || []).length}</span></div>
      <div class="row"><span class="k">Active sweeps</span><span class="v">${(d.sweeps || []).length}</span></div>`;
  } catch (e) { /* ignore */ }
}

// -------------------- AI key pool --------------------
async function loadAiStatus() {
  try {
    const res = await fetch("/api/ai/status");
    const d = await res.json();
    const pill = $("#ai-status");
    pill.innerHTML = `<i class="dot"></i>AI: ${d.healthy_keys}/${d.total_keys} keys`;
    pill.className = "pill " + (d.enabled && d.healthy_keys > 0 ? "ai-on" : "ghost");
    setText("#ai-pool-status", `${d.healthy_keys}/${d.total_keys} healthy`);
    const list = $("#ai-key-list");
    if (list) {
      list.innerHTML = (d.keys || []).map((k, i) => `
        <div class="key-item">
          <span class="key-masked">${esc(k.masked)}</span>
          <span class="key-stats">${k.requests} req${k.success_rate != null ? ` · ${(k.success_rate * 100).toFixed(0)}% ok` : ""}</span>
          <span class="key-status ${k.status}">${k.status.toUpperCase()}</span>
          <button class="key-remove" onclick="removeAiKey(${i})" title="Remove">✕</button>
        </div>`).join("") || `<div style="color:var(--text-faint);font-size:12px">No keys yet — add your first Gemini API key above.</div>`;
    }
  } catch (e) { /* ignore */ }
}

async function addAiKey() {
  const input = $("#ai-new-key");
  const key = input.value.trim();
  if (key.length < 10) { alert("Paste a full API key"); return; }
  await fetch(`/api/ai/keys/add?key=${encodeURIComponent(key)}`, { method: "POST" });
  input.value = "";
  loadAiStatus();
  loadSettings();
}

async function removeAiKey(index) {
  await fetch(`/api/ai/keys/remove?index=${index}`, { method: "POST" });
  loadAiStatus();
  loadSettings();
}

async function testAi() {
  const el = $("#ai-pool-status");
  el.textContent = "testing…";
  const res = await fetch("/api/ai/test", { method: "POST" });
  const r = await res.json();
  el.textContent = r.ok ? `✓ ${r.key} responded in ${r.latency_ms}ms` : `✗ ${r.error || "key " + (r.key || "") + " failed — failover marked"}`;
  loadAiStatus();
}

// -------------------- Settings --------------------
async function loadSettings() {
  try {
    const res = await fetch("/api/settings");
    const s = await res.json();
    settingsCache = s;
    const set = (id, v) => { const el = $(id); if (el != null && v !== undefined) el.value = v; };
    const chk = (id, v) => { const el = $(id); if (el) el.checked = !!v; };
    set("#set-mt5-host", s.mt5_host); set("#set-mt5-port", s.mt5_port);
    chk("#set-enable-mt5", s.enable_mt5_bridge); chk("#set-agentic", s.enable_agentic_mode);
    chk("#set-auto-trade", s.auto_trade); chk("#set-live", s.allow_live_trading);
    set("#set-risk-mode", s.risk_mode); set("#set-risk-pct", s.max_risk_per_trade_pct);
    set("#set-daily-loss", s.max_daily_loss_pct); set("#set-max-trades", s.max_open_trades);
    set("#set-lot", s.default_lot_size); set("#set-min-conf", s.min_confidence_trade);
    chk("#set-micro", s.micro_account_mode);
    set("#set-tf", s.primary_timeframe); set("#set-symbols", (s.active_symbols || []).join(","));
    chk("#set-smc", s.enable_smc); chk("#set-mtf", s.enable_mtf);
    chk("#set-ensemble", s.enable_ensemble); chk("#set-rl", s.enable_rl); chk("#set-ppo", s.enable_ppo);
    chk("#set-corr-block", s.correlation_block);
    chk("#set-breakeven", s.break_even_enabled); chk("#set-partial", s.partial_close_enabled);
    set("#set-partial-pct", s.partial_close_pct); set("#set-max-spread", s.max_spread_points);
    set("#set-magic", s.magic_number); chk("#set-dynamic-risk", s.dynamic_risk);
    set("#ai-model", s.ai_model); chk("#ai-enabled", s.ai_enabled);
    chk("#set-desktop", s.enable_desktop_notify); chk("#set-sound", s.enable_sound);
    set("#set-webhook", s.webhook_url || "");
  } catch (e) { /* ignore */ }
}

async function saveSettings() {
  const s = settingsCache || {};
  const payload = {
    ...s,
    mt5_host: $("#set-mt5-host").value, mt5_port: parseInt($("#set-mt5-port").value, 10),
    enable_mt5_bridge: $("#set-enable-mt5").checked, enable_agentic_mode: $("#set-agentic").checked,
    auto_trade: $("#set-auto-trade").checked, allow_live_trading: $("#set-live").checked,
    risk_mode: $("#set-risk-mode").value,
    max_risk_per_trade_pct: parseFloat($("#set-risk-pct").value),
    max_daily_loss_pct: parseFloat($("#set-daily-loss").value),
    max_open_trades: parseInt($("#set-max-trades").value, 10),
    default_lot_size: parseFloat($("#set-lot").value),
    min_confidence_trade: parseFloat($("#set-min-conf").value),
    micro_account_mode: $("#set-micro").checked,
    primary_timeframe: $("#set-tf").value,
    active_symbols: $("#set-symbols").value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean),
    enable_smc: $("#set-smc").checked, enable_mtf: $("#set-mtf").checked,
    enable_ensemble: $("#set-ensemble").checked, enable_rl: $("#set-rl").checked, enable_ppo: $("#set-ppo").checked,
    correlation_block: $("#set-corr-block").checked,
    break_even_enabled: $("#set-breakeven").checked, partial_close_enabled: $("#set-partial").checked,
    partial_close_pct: parseFloat($("#set-partial-pct").value),
    max_spread_points: parseFloat($("#set-max-spread").value),
    magic_number: parseInt($("#set-magic").value, 10),
    dynamic_risk: $("#set-dynamic-risk").checked,
    ai_model: $("#ai-model").value, ai_enabled: $("#ai-enabled").checked,
    ai_api_keys: s.ai_api_keys || [],
    enable_desktop_notify: $("#set-desktop").checked, enable_sound: $("#set-sound").checked,
    webhook_url: $("#set-webhook").value || null,
  };
  const res = await fetch("/api/settings", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const msg = $("#save-msg");
  if (res.ok) { msg.textContent = "✓ Saved"; setTimeout(() => (msg.textContent = ""), 2500); loadSettings(); }
  else { const err = await res.json(); msg.textContent = err.detail || "Save failed"; msg.style.color = "var(--red)"; }
}

// -------------------- Helpers --------------------
function setText(sel, val) { const el = $(sel); if (el) el.textContent = val; }
function fmt(n) {
  if (n === undefined || n === null) return "0.00";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; }

// -------------------- Boot --------------------
connectWS();
loadSettings();
loadAiStatus();
loadTickers();
loadPerformance();
setInterval(loadTickers, 15000);
setInterval(loadPerformance, 10000);
setInterval(loadAiStatus, 30000);
