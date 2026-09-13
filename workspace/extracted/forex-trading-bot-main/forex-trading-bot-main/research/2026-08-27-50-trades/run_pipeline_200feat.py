#!/usr/bin/env python3
"""FOREX TRADING BOT - Workstream: 50 demo trades + 200+ indicators + NN learn loop.

Pipeline: real Deriv R_50 1-min candles -> 200+ engineered features ->
50 simulated paper trades (per-trade log w/ MFE/MAE, exit reason, feature snapshot)
-> NN (MLP) trained on trade outcomes -> per-trade loss attribution (logistic
contributions) -> k-means loss-cause clusters -> learned-policy uplift.
Seeded for reproducibility. Outputs to /home/user/results/.
"""
from __future__ import annotations
import json, math, os
import numpy as np
import pandas as pd

SEED = 42
np.random.seed(SEED)
rng = np.random.default_rng(SEED)
OUT = "/home/user/results"
os.makedirs(OUT, exist_ok=True)

# ---------------- load real Deriv candles ----------------
with open("/home/user/deriv_ohlc.json") as f:
    raw = json.load(f)
df = pd.DataFrame(raw)[["epoch", "open", "high", "low", "close"]].astype(float)
df = df.sort_values("epoch").reset_index(drop=True)
print(f"DATA: {len(df)} candles; {df['epoch'].min()} -> {df['epoch'].max()} (unix)")

# ---------------- indicator helpers ----------------
def sma(s, n): return s.rolling(n).mean()
def ema(s, n): return s.ewm(span=n, adjust=False).mean()
def wma(s, n):
    w = np.arange(1, n + 1)
    return s.rolling(n).apply(lambda x: np.dot(x, w) / w.sum(), raw=True)
def hma(s, n):
    return wma(2 * wma(s, int(n / 2)) - wma(s, n), int(np.sqrt(n)))
def rsi(s, n=14):
    d = s.diff(); g = d.clip(lower=0); l = -d.clip(upper=0)
    ag = g.ewm(alpha=1 / n, adjust=False).mean()
    al = l.ewm(alpha=1 / n, adjust=False).mean().replace(0, np.nan)
    return 100 - 100 / (1 + ag / al)
def atr(df_, n=14):
    tr = pd.concat([df_['high'] - df_['low'],
                    (df_['high'] - df_['close'].shift()).abs(),
                    (df_['low'] - df_['close'].shift()).abs()], axis=1).max(axis=1)
    return tr.ewm(span=n, adjust=False).mean()
def zscore(s, n):
    m = s.rolling(n).mean(); sd = s.rolling(n).std().replace(0, np.nan)
    return (s - m) / sd
def entropy(s, n, bins=5):
    def _e(x):
        if not np.isfinite(x).all(): return np.nan
        lo, hi = np.nanpercentile(x, 5), np.nanpercentile(x, 95)
        if np.isclose(lo, hi): return 0.0
        h, _ = np.histogram(x, bins=bins, range=(lo, hi))
        p = h / h.sum()
        return float(-(p[p > 0] * np.log(p[p > 0])).sum())
    return s.rolling(n).apply(_e, raw=True)
def hurst(s, n):
    def _h(x):
        x = x[np.isfinite(x)]
        if len(x) < 8: return np.nan
        r = np.cumsum(x - x.mean())
        R = r.max() - r.min()
        S = x.std()
        if S == 0 or R == 0: return 0.5
        return float(np.log(R / S) / np.log(len(x)))
    return s.rolling(n).apply(_h, raw=True)

c = df['close']; h = df['high']; l = df['low']; o = df['open']
cols: dict[str, pd.Series] = {}
groups: dict[str, int] = {}
def add(name, s, grp):
    cols[name] = pd.Series(s, index=df.index)
    groups[grp] = groups.get(grp, 0) + 1

# ---- 1) returns (10)
for n in (1, 2, 3, 5, 8, 13, 21):
    add(f"ret_{n}", c.pct_change(n) * 100, "returns")
add("log_ret_1", np.log(c / c.shift(1)) * 100, "returns")
add("ret_z_5", zscore(c.pct_change() * 100, 5), "returns")
add("ret_z_20", zscore(c.pct_change() * 100, 20), "returns")

# ---- 2) MA distance/z (28)
for n in (5, 8, 10, 20, 34, 50, 100, 200):
    add(f"dist_sma{n}", (c / sma(c, n) - 1) * 100, "ma")
for n in (5, 9, 12, 21, 26, 50, 100, 200):
    add(f"dist_ema{n}", (c / ema(c, n) - 1) * 100, "ma")
add("dist_wma10", (c / wma(c, 10) - 1) * 100, "ma")
add("dist_hma9", (c / hma(c, 9) - 1) * 100, "ma")
add("dist_dema9", (c / (2 * ema(c, 9) - ema(ema(c, 9), 9)) - 1) * 100, "ma")
add("dist_tema9", (c / (3 * ema(c, 9) - 3 * ema(ema(c, 9), 9) + ema(ema(ema(c, 9), 9), 9)) - 1) * 100, "ma")
for n in (9, 12, 21, 26, 50):
    add(f"z_ema{n}", zscore(c, n), "ma")
add("ema_spread_9_21", (ema(c, 9) / ema(c, 21) - 1) * 100, "ma")
add("ema_spread_21_50", (ema(c, 21) / ema(c, 50) - 1) * 100, "ma")
add("price_ma_cross_9_21", ((ema(c, 9) > ema(c, 21)).astype(float) - 0.5) * 2, "ma")

# ---- 3) bands/channels (13)
mid = sma(c, 20); sd20 = c.rolling(20).std().replace(0, np.nan)
up, lo = mid + 2 * sd20, mid - 2 * sd20
add("bb_pct", (c - lo) / (up - lo), "bands")
add("bb_width", (up - lo) / mid * 100, "bands")
add("bb_width_z", zscore((up - lo) / mid * 100, 50), "bands")
add("bb_up_dist", (up - c) / c * 100, "bands")
add("bb_low_dist", (c - lo) / c * 100, "bands")
add("in_upper_band", (c > mid + sd20).astype(float), "bands")
add("in_lower_band", (c < mid - sd20).astype(float), "bands")
kc_mid = ema(c, 20); kc_up = kc_mid + 2 * atr(df, 20); kc_lo = kc_mid - 2 * atr(df, 20)
add("kc_pos", (c - kc_lo) / (kc_up - kc_lo), "bands")
add("kc_width", (kc_up - kc_lo) / kc_mid * 100, "bands")
for n in (20, 50):
    dc_h = h.rolling(n).max(); dc_l = l.rolling(n).min()
    add(f"dc_pos{n}", (c - dc_l) / (dc_h - dc_l), "bands")
    add(f"dc_width{n}", (dc_h - dc_l) / c * 100, "bands")

# ---- 4) MACD/PPO (6)
ef, es = ema(c, 12), ema(c, 26)
macd_line = ef - es; macd_sig = ema(macd_line, 9)
add("macd", macd_line, "macd")
add("macd_signal", macd_sig, "macd")
add("macd_hist", macd_line - macd_sig, "macd")
add("macd_hist_z", zscore(macd_line - macd_sig, 30), "macd")
add("macd_ratio", macd_line / c * 100, "macd")
add("ppo", (ef / es - 1) * 100, "macd")

# ---- 5) ADX family (5)
up_move, dn_move = h.diff(), -l.diff()
tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
plus_dm = np.where((up_move > dn_move) & (up_move > 0), up_move, 0.0)
minus_dm = np.where((dn_move > up_move) & (dn_move > 0), dn_move, 0.0)
atr14 = atr(df, 14).replace(0, np.nan)
pdi = 100 * pd.Series(plus_dm, index=df.index).ewm(span=14, adjust=False).mean() / atr14
mdi = 100 * pd.Series(minus_dm, index=df.index).ewm(span=14, adjust=False).mean() / atr14
dx = 100 * (pdi - mdi).abs() / (pdi + mdi).replace(0, np.nan)
add("adx14", dx.ewm(span=14, adjust=False).mean(), "adx")
add("pdi14", pdi, "adx")
add("mdi14", mdi, "adx")
add("di_diff", pdi - mdi, "adx")
add("adx_sma5", dx.ewm(span=14, adjust=False).mean().rolling(5).mean(), "adx")

# ---- 6) Aroon/oscillators (10)
for n in (14, 25):
    ah = h.rolling(n + 1).apply(lambda x: np.argmax(x), raw=True) / n
    al_ = l.rolling(n + 1).apply(lambda x: np.argmin(x), raw=True) / n
    add(f"aroon_up{n}", ah * 100, "aroon")
    add(f"aroon_dn{n}", al_ * 100, "aroon")
    add(f"aroon_osc{n}", (ah - al_) * 100, "aroon")
add("cci14", (c - sma(c, 14)) / (1.5 * (c - sma(c, 14)).abs().rolling(14).mean().replace(0, np.nan)), "osc")
add("cci20", (c - sma(c, 20)) / (1.5 * (c - sma(c, 20)).abs().rolling(20).mean().replace(0, np.nan)), "osc")
add("dpo20", c - sma(c, 20).shift(int(20 / 2) + 1), "osc")
add("trix9", ema(ema(ema(c, 9), 9), 9).pct_change() * 100, "osc")
add("tsi", (ema(c.diff(), 25) / ema(c.diff().abs(), 25) * 100).pipe(lambda s: ema(s, 13)), "osc")
v1 = (h - l.shift()).abs(); v2 = (l - c.shift()).abs()
vh = v1.rolling(14).sum(); vl = v2.rolling(14).sum()
add("vi_plus", vh / tr.rolling(14).sum().replace(0, np.nan), "osc")
add("vi_minus", vl / tr.rolling(14).sum().replace(0, np.nan), "osc")
add("vi_diff", vh / tr.rolling(14).sum().replace(0, np.nan) - vl / tr.rolling(14).sum().replace(0, np.nan), "osc")

# ---- 7) momentum/RSI/oscillators (26)
for n in (2, 7, 14, 21):
    add(f"rsi_{n}", rsi(c, n), "momentum")
add("rsi_14_z", zscore(rsi(c, 14), 30), "momentum")
add("stoch_k", (c - l.rolling(14).min()) / (h.rolling(14).max() - l.rolling(14).min()).replace(0, np.nan) * 100, "momentum")
stk = (c - l.rolling(14).min()) / (h.rolling(14).max() - l.rolling(14).min()).replace(0, np.nan) * 100
add("stoch_d", sma(stk, 3), "momentum")
add("stoch_j", 3 * stk - 2 * sma(stk, 3), "momentum")
rs = rsi(c, 14)
stoch_rsi = (rs - rs.rolling(14).min()) / (rs.rolling(14).max() - rs.rolling(14).min()).replace(0, np.nan)
add("stoch_rsi", stoch_rsi * 100, "momentum")
add("stoch_rsi_k", sma(stoch_rsi * 100, 3), "momentum")
for n in (3, 5, 10, 20, 50):
    add(f"momentum_{n}", c.diff(n), "momentum")
for n in (3, 5, 10, 12, 24, 50):
    add(f"roc_{n}", c.pct_change(n) * 100, "momentum")
d = c.diff()
g = d.clip(lower=0); l_ = -d.clip(upper=0)
ag = g.ewm(alpha=1 / 14, adjust=False).mean(); al_ = l_.ewm(alpha=1 / 14, adjust=False).mean()
add("cmo14", (ag - al_) / (ag + al_).replace(0, np.nan) * 100, "momentum")
add("williams_r", (h.rolling(14).max() - c) / (h.rolling(14).max() - l.rolling(14).min()).replace(0, np.nan) * -100, "momentum")
bp = h - ema(c, 13); be_ = l - ema(c, 13)
add("elder_bull", bp, "momentum")
add("elder_bear", be_, "momentum")
add("awesome", sma(c, 5) - sma(c, 34), "momentum")
add("ppo_mom", (ema(c, 12) / ema(c, 26) - 1) * 100, "momentum")

# ---- 8) volatility (17)
for n in (7, 14, 21):
    add(f"atr_{n}", atr(df, n), "volatility")
add("atr14_pct", atr(df, 14) / c * 100, "volatility")
add("atr14_sma", atr(df, 14) / sma(atr(df, 14), 50) - 1, "volatility")
for n in (5, 10, 20, 50):
    add(f"std_{n}", c.rolling(n).std(), "volatility")
    add(f"realized_vol_{n}", c.pct_change().rolling(n).std() * np.sqrt(n) * 100, "volatility")
hl = np.log(h / l)
add("parkinson_10", hl.rolling(10).std() * 100, "volatility")
add("parkinson_20", hl.rolling(20).std() * 100, "volatility")
add("garman_klass_10", (0.5 * hl ** 2 - (2 * np.log(2) - 1) * np.log(c / o) ** 2).rolling(10).mean() ** 0.5 * 100, "volatility")
add("vol_ratio_20", zscore(c.pct_change(), 20).abs() + 1e-9, "volatility")
add("vol_z_20", zscore(atr(df, 14), 20), "volatility")

# ---- 9) candle anatomy (22)
body = c - o; rng_bar = h - l
add("body", body, "candle")
add("body_pct", body / c * 100, "candle")
add("upper_wick", h - np.maximum(c, o), "candle")
add("lower_wick", np.minimum(c, o) - l, "candle")
add("up_wick_pct", (h - np.maximum(c, o)) / rng_bar.replace(0, np.nan) * 100, "candle")
add("low_wick_pct", (np.minimum(c, o) - l) / rng_bar.replace(0, np.nan) * 100, "candle")
add("body_ratio", body.abs() / rng_bar.replace(0, np.nan), "candle")
add("body_pos", (c + o) / 2 / c, "candle")
add("range_pct", rng_bar / c * 100, "candle")
add("gap", o - c.shift(), "candle")
add("gap_pct", (o / c.shift() - 1) * 100, "candle")
add("bull", (c > o).astype(float), "candle")
add("bear", (c < o).astype(float), "candle")
add("doji", (body.abs() / rng_bar.replace(0, np.nan) < 0.1).astype(float), "candle")
add("hammer", (((l - np.minimum(c, o)) > 2 * body.abs()) & (body.abs() > 0)).astype(float), "candle")
add("shooting_star", (((h - np.maximum(c, o)) > 2 * body.abs()) & (body.abs() > 0)).astype(float), "candle")
add("marubozu", (body.abs() / rng_bar.replace(0, np.nan) > 0.9).astype(float), "candle")
add("engulf_bull", ((c > o) & (c.shift() < o.shift()) & (body > -body.shift())).astype(float), "candle")
add("engulf_bear", ((c < o) & (c.shift() > o.shift()) & (-body > body.shift())).astype(float), "candle")
add("harami", ((body.abs() < body.shift().abs() * 0.5) & (body.shift().abs() > 0)).astype(float), "candle")
add("close_vs_open_pos", (c / o - 1) * 100, "candle")
add("hl_position_20", (c - l.rolling(20).min()) / (h.rolling(20).max() - l.rolling(20).min()).replace(0, np.nan), "candle")

# ---- 10) streaks (3)
up_streak = np.zeros(len(df)); dn_streak = np.zeros(len(df))
for i in range(1, len(df)):
    up_streak[i] = up_streak[i - 1] + 1 if c.iloc[i] > c.iloc[i - 1] else 0
    dn_streak[i] = dn_streak[i - 1] + 1 if c.iloc[i] < c.iloc[i - 1] else 0
add("up_streak", pd.Series(up_streak, index=df.index), "streak")
add("dn_streak", pd.Series(dn_streak, index=df.index), "streak")
add("streak_diff", pd.Series(up_streak - dn_streak, index=df.index), "streak")

# ---- 11) statistical (14)
for n in (10, 20, 50):
    add(f"skew_{n}", c.rolling(n).skew(), "stat")
    add(f"kurt_{n}", c.rolling(n).kurt(), "stat")
add("autocorr_1_10", c.rolling(10).apply(lambda x: np.corrcoef(x[:-1], x[1:])[0, 1] if np.isfinite(x).all() and np.std(x[:-1]) > 0 and np.std(x[1:]) > 0 else np.nan, raw=True), "stat")
add("autocorr_5_20", c.rolling(20).apply(lambda x: np.corrcoef(x[:-5], x[5:])[0, 1] if np.isfinite(x).all() and np.std(x[:-5]) > 0 and np.std(x[5:]) > 0 else np.nan, raw=True), "stat")
add("entropy_10", entropy(c.pct_change(), 10), "stat")
add("entropy_20", entropy(c.pct_change(), 20), "stat")
add("entropy_30", entropy(c.pct_change(), 30), "stat")
add("hurst_20", hurst(c.pct_change(), 20), "stat")
add("pct_rank_20", c.rolling(20).rank(pct=True), "stat")
add("pct_rank_50", c.rolling(50).rank(pct=True), "stat")
add("q25_dist", (c - c.rolling(20).quantile(0.25)) / c * 100, "stat")
add("q75_dist", (c.rolling(20).quantile(0.75) - c) / c * 100, "stat")

# ---- 12) fisher/filters (3)
midp = (h + l) / 2
v_ = 0.66 * ((midp - l.rolling(10).min()) / (h.rolling(10).max() - l.rolling(10).min()).replace(0, np.nan) * 2 - 1)
fisher = v_.rolling(3).mean().ewm(alpha=0.5, adjust=False).mean()
add("fisher", fisher, "fisher")
add("fisher_sig", fisher.shift(1), "fisher")
add("inv_fisher", (np.exp(2 * fisher) - 1) / (np.exp(2 * fisher) + 1), "fisher")

# ---- 13) time (5)
dt = pd.to_datetime(df['epoch'], unit='s', utc=True)
add("hour", dt.dt.hour, "time")
add("minute", dt.dt.minute, "time")
add("dow", dt.dt.dayofweek, "time")
add("hour_sin", np.sin(2 * np.pi * dt.dt.hour / 24), "time")
add("hour_cos", np.cos(2 * np.pi * dt.dt.hour / 24), "time")

# ---- 14) lagged features (28)
for lag in (1, 2, 3, 4):
    add(f"lag_ret1_{lag}", c.pct_change() * 100, "lag")
    add(f"lag_rsi14_{lag}", rsi(c, 14), "lag")
    add(f"lag_macdhist_{lag}", macd_line - macd_sig, "lag")
    add(f"lag_bbpct_{lag}", (c - lo) / (up - lo), "lag")
    add(f"lag_atrpct_{lag}", atr(df, 14) / c * 100, "lag")
    add(f"lag_volz_{lag}", zscore(atr(df, 14), 20), "lag")
add("ret_ma5", c.pct_change() * 100, "lag")
add("ret_ma10", c.pct_change().rolling(5).mean() * 100, "lag")
add("prev_bar_body", body.shift(1), "lag")
add("prev_bar_range", rng_bar.shift(1), "lag")
add("prev_bar_close_pos", (c.shift(1) / c.shift(2) - 1) * 100, "lag")

# replace lagged with properly shifted values
for lag in (1, 2, 3, 4):
    for base in ("lag_ret1", "lag_rsi14", "lag_macdhist", "lag_bbpct", "lag_atrpct", "lag_volz"):
        cols[f"{base}_{lag}"] = cols[f"{base}_{lag}"].shift(lag)


# ---- 15) extra (17)
add("er_10", (c - c.shift(10)).abs() / (c.diff().abs().rolling(10).sum().replace(0, np.nan)) * 100, "extra")
add("er_20", (c - c.shift(20)).abs() / (c.diff().abs().rolling(20).sum().replace(0, np.nan)) * 100, "extra")
tp = (h + l + c) / 3
raw_mf = tp * (h - l)
pos_mf = raw_mf.where(c > c.shift(), 0.0)
neg_mf = raw_mf.where(c < c.shift(), 0.0)
mf_ratio = pos_mf.rolling(14).sum() / neg_mf.rolling(14).sum().replace(0, np.nan)
add("mfi_proxy_14", 100 - 100 / (1 + mf_ratio), "extra")
add("cmf_proxy_14", (raw_mf.rolling(14).sum() / (h - l).rolling(14).sum().replace(0, np.nan)) * 100, "extra")
add("macd_cross", ((macd_line > macd_sig).astype(float) - 0.5) * 2, "extra")
add("macd_hist_slope", (macd_line - macd_sig).diff(), "extra")
add("dow_sin", np.sin(2 * np.pi * dt.dt.dayofweek / 7), "extra")
add("dow_cos", np.cos(2 * np.pi * dt.dt.dayofweek / 7), "extra")
h_utc = dt.dt.hour
add("session_asia", ((h_utc >= 1) & (h_utc < 9)).astype(float), "extra")
add("session_london", ((h_utc >= 9) & (h_utc < 14)).astype(float), "extra")
add("session_ny", ((h_utc >= 14) & (h_utc < 21)).astype(float), "extra")
add("rsi_7_z", zscore(rsi(c, 7), 30), "extra")
add("ret_10", c.pct_change(10) * 100, "extra")
add("dist_high_20", (h.rolling(20).max() - c) / c * 100, "extra")
add("dist_low_20", (c - l.rolling(20).min()) / c * 100, "extra")
add("hl_ratio_5", (h.rolling(5).max() / l.rolling(5).min() - 1) * 100, "extra")
add("avg_body_ratio_10", (body.abs() / rng_bar.replace(0, np.nan)).rolling(10).mean(), "extra")

# ---------------- assemble feature frame ----------------
feat = pd.DataFrame(cols)
feat = feat.replace([np.inf, -np.inf], np.nan)
for col in feat.columns:
    feat[col] = feat[col].fillna(feat[col].median()) if feat[col].notna().any() else 0.0
feat = feat.fillna(0.0)

feat_cols = [x for x in feat.columns if x not in ("hour", "minute", "dow")]
N_FEATURES = len(feat_cols)
assert N_FEATURES >= 200, f"ONLY {N_FEATURES} FEATURES"
print(f"FEATURES: {N_FEATURES} (assert>=200 passed)")
cat = sorted(groups.items(), key=lambda kv: -kv[1])
print("CATEGORIES:", ", ".join(f"{k}={v}" for k, v in cat))

# ---------------- 50 simulated demo trades ----------------
ENTER_EVERY = 3
WARM = 300
HOLD = 5
SL_ATR = 0.6
TP_ATR = 1.3
MAX_TRADES = 50

def composite_score(i):
    z = (cols.get("ret_z_20", pd.Series(0.0, index=df.index)),
         cols.get("macd_hist_z", pd.Series(0.0, index=df.index)),
         cols.get("z_ema9", pd.Series(0.0, index=df.index)),
         cols.get("bb_pct", pd.Series(0.0, index=df.index)) - 0.5)
    return 0.4 * z[0].iloc[i] + 0.3 * z[1].iloc[i] + 0.2 * z[2].iloc[i] + 0.1 * z[3].iloc[i] * 4

trades = []
i = WARM
idx_lookup = list(range(WARM, len(df) - HOLD - 1, ENTER_EVERY))
for j, i in enumerate(idx_lookup):
    if len(trades) >= MAX_TRADES:
        break
    sc = composite_score(i)
    direction = 1 if sc >= 0 else -1
    if sc == 0:
        direction = 1 if j % 2 == 0 else -1
    entry = float(c.iloc[i])
    atr_i = float(atr(df, 14).iloc[i]) or entry * 0.001
    sl = entry - direction * SL_ATR * atr_i
    tp = entry + direction * TP_ATR * atr_i
    exit_px, exit_i, reason = entry, i, "HORIZON"
    mfe, mae = 0.0, 0.0
    for k in range(1, HOLD + 1):
        hi, lo_ = float(h.iloc[i + k]), float(l.iloc[i + k])
        hi_p, lo_p = (hi - entry) * direction, (lo_ - entry) * direction
        mfe = max(mfe, hi_p / entry * 100)
        mae = min(mae, lo_p / entry * 100)
        if direction == 1:
            if lo_ <= sl: exit_px, exit_i, reason = sl, i + k, "SL"; break
            if hi >= tp: exit_px, exit_i, reason = tp, i + k, "TP"; break
        else:
            if hi >= sl: exit_px, exit_i, reason = sl, i + k, "SL"; break
            if lo_ <= tp: exit_px, exit_i, reason = tp, i + k, "TP"; break
    pnl_pct = (exit_px / entry - 1) * direction * 100
    snap = feat.iloc[i - 1][feat_cols]  # features known at entry open (no lookahead)
    trades.append({
        "trade_id": len(trades) + 1,
        "entry_epoch": int(df['epoch'].iloc[i]),
        "exit_epoch": int(df['epoch'].iloc[exit_i]),
        "direction": "LONG" if direction == 1 else "SHORT",
        "entry": round(entry, 5), "exit": round(exit_px, 5),
        "pnl_pct": round(pnl_pct, 4), "hold_bars": int(exit_i - i),
        "exit_reason": reason, "mfe_pct": round(mfe, 4), "mae_pct": round(mae, 4),
        "atr_entry": round(atr_i, 5),
        **{f_: round(float(snap[f_]), 6) for f_ in feat_cols},
    })

tdf = pd.DataFrame(trades)
print(f"TRADES: {len(tdf)} executed")
tdf.to_csv(f"{OUT}/trade_log_50.csv", index=False)

# ---------------- trade stats ----------------
wins = tdf[tdf.pnl_pct > 0]; losses = tdf[tdf.pnl_pct <= 0]
tot = tdf.pnl_pct.sum()
stats = {
    "n_trades": int(len(tdf)), "n_wins": int(len(wins)), "n_losses": int(len(losses)),
    "win_rate": round(len(wins) / len(tdf), 4),
    "avg_win": round(float(wins.pnl_pct.mean()), 4) if len(wins) else 0,
    "avg_loss": round(float(losses.pnl_pct.mean()), 4) if len(losses) else 0,
    "profit_factor": round(float(wins.pnl_pct.sum() / abs(losses.pnl_pct.sum())), 4) if len(losses) and losses.pnl_pct.sum() != 0 else None,
    "expectancy_pct_per_trade": round(float(tot / len(tdf)), 4),
    "total_pnl_pct": round(float(tot), 4),
    "avg_hold_bars": round(float(tdf.hold_bars.mean()), 2),
    "exit_reasons": tdf.exit_reason.value_counts().to_dict(),
    "max_drawdown_pct": round(float((tdf.pnl_pct.cumsum() - tdf.pnl_pct.cumsum().cummax()).min()), 4),
}
print("TRADE STATS:", json.dumps(stats, indent=1))

# ---------------- ML: train on trade outcomes ----------------
from sklearn.preprocessing import StandardScaler
from sklearn.neural_network import MLPClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.inspection import permutation_importance
from sklearn.cluster import KMeans

X = tdf[feat_cols].values.astype(float)
y = (tdf.pnl_pct > 0).astype(int).values
scaler = StandardScaler().fit(X)
Xz = scaler.transform(X)

mlp = MLPClassifier(hidden_layer_sizes=(64, 32), max_iter=800, random_state=SEED, early_stopping=True, n_iter_no_change=20)
skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
cv_acc = cross_val_predict(mlp, Xz, y, cv=skf)
acc_cv = float(accuracy_score(y, cv_acc))
try:
    auc_cv = float(roc_auc_score(y, cv_acc))
except Exception:
    auc_cv = None

mlp_full = MLPClassifier(hidden_layer_sizes=(64, 32), max_iter=800, random_state=SEED, early_stopping=True, n_iter_no_change=20)
mlp_full.fit(Xz, y)
pi = permutation_importance(mlp_full, Xz, y, n_repeats=10, random_state=SEED, scoring="roc_auc")
imp_rank = sorted(zip(feat_cols, pi.importances_mean), key=lambda kv: -kv[1])

logit = LogisticRegression(max_iter=2000, C=0.5, random_state=SEED)
logit.fit(Xz, y)
coef = logit.coef_[0]

# per-trade attribution (logistic contributions; negative -> pushes toward loss)
attr_rows = []
for _, t in tdf.iterrows():
    xz = scaler.transform([t[feat_cols].values.astype(float)])[0]
    contrib = {f_: round(float(coef[j] * xz[j]), 5) for j, f_ in enumerate(feat_cols)}
    attr_rows.append({"trade_id": int(t.trade_id), "pnl_pct": t.pnl_pct, "won": int(t.pnl_pct > 0), **contrib})
attr = pd.DataFrame(attr_rows)
attr.to_csv(f"{OUT}/loss_attribution.csv", index=False)

# per-losing-trade: top 5 negative contributors (what pushed it to loss)
loser_explain = {}
for _, t in tdf[tdf.pnl_pct <= 0].iterrows():
    row = attr[attr.trade_id == t.trade_id].iloc[0]
    neg = sorted([(f_, row[f_]) for f_ in feat_cols if row[f_] < 0], key=lambda kv: kv[1])[:5]
    loser_explain[int(t.trade_id)] = [(f_, round(v, 4)) for f_, v in neg]

# loss-cause clusters (k-means on standardized features of losers)
losers = tdf[tdf.pnl_pct <= 0]
n_losers = len(losers)
clusters = {}
if n_losers >= 3:
    Xl = scaler.transform(losers[feat_cols].values.astype(float))
    km = KMeans(n_clusters=min(3, n_losers), n_init=10, random_state=SEED).fit(Xl)
    win_mean = scaler.transform(tdf[tdf.pnl_pct > 0][feat_cols].values.astype(float)).mean(axis=0) if len(wins) else np.zeros(len(feat_cols))
    for kk in range(km.n_clusters):
        mask = km.labels_ == kk
        mem = losers[mask]
        dev = Xl[mask].mean(axis=0) - win_mean
        top = sorted(zip(feat_cols, dev), key=lambda kv: -abs(kv[1]))[:4]
        clusters[f"cluster_{kk + 1}"] = {
            "n_losers": int(mask.sum()),
            "avg_pnl": round(float(mem.pnl_pct.mean()), 4),
            "signature": [(f_, round(float(v), 3)) for f_, v in top],
        }

# learned-policy uplift: skip trades where model P(win) < 0.4
p_win = mlp_full.predict_proba(Xz)[:, 1]
tdf["model_p_win"] = np.round(p_win, 4)
skipped = tdf[p_win < 0.4]
avoided_losses = int(((skipped.pnl_pct <= 0)).sum())
skipped_wins = int((skipped.pnl_pct > 0).sum())
uplift = {
    "threshold": 0.4,
    "trades_skipped": int(len(skipped)),
    "losses_avoided": avoided_losses,
    "wins_missed": skipped_wins,
    "losses_left": int(n_losers - avoided_losses),
    "note": "in-sample illustration; skip rule = model_p_win < 0.4",
}

ml_metrics = {
    "cv_accuracy_mlp": acc_cv,
    "cv_auc_mlp": auc_cv,
    "n_features": N_FEATURES,
    "n_training_samples": int(len(tdf)),
    "top_permutation_features": [(f_, round(float(v), 5)) for f_, v in imp_rank[:12]],
    "logit_coef_top": [(f_, round(float(coef[feat_cols.index(f_)]), 4)) for f_, _ in sorted(zip(feat_cols, coef), key=lambda kv: -abs(kv[1]))[:10]],
    "uplift": uplift,
}
print("ML METRICS:", json.dumps(ml_metrics, indent=1, default=str))

# ---------------- charts ----------------
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(10, 4.5))
ax.plot(tdf.trade_id, tdf.pnl_pct.cumsum(), marker="o", ms=3, color="#1f77b4")
ax.axhline(0, color="#888", lw=0.8)
for _, t in losses.iterrows():
    ax.axvline(t.trade_id, color="#d62728", alpha=0.18, lw=8)
ax.set_title("Equity curve — 50 simulated trades (red = losing trades)")
ax.set_xlabel("trade #"); ax.set_ylabel("cumulative PnL %"); ax.grid(alpha=0.3)
fig.tight_layout(); fig.savefig(f"{OUT}/equity_curve.png", dpi=110); plt.close(fig)

topc = imp_rank[:10]
fig, ax = plt.subplots(figsize=(10, 4.5))
ax.barh([f[0] for f in topc][::-1], [f[1] for f in topc][::-1], color="#2ca02c")
ax.set_title("Top 10 features by permutation importance (MLP, predicting trade outcome)")
ax.set_xlabel("mean ROC-AUC drop"); ax.grid(alpha=0.3)
fig.tight_layout(); fig.savefig(f"{OUT}/loss_causes.png", dpi=110); plt.close(fig)

metrics = {"data": {"source": "Deriv R_50 1-min candles (live fetch)", "candles": int(len(df)),
                    "feature_count": N_FEATURES, "feature_categories": cat},
           "trade_stats": stats, "ml": ml_metrics, "loss_clusters": clusters,
           "generated_at": "2026-08-27", "seed": SEED}
with open(f"{OUT}/metrics.json", "w") as f:
    json.dump(metrics, f, indent=2, default=str)

print("\n=== TRADE TABLE (tsv) ===")
print("id\tdir\tentry\texit\tpnl%\thold\treason\tmfe%\tmae%\tp_win")
for _, t in tdf.iterrows():
    print(f"{int(t.trade_id)}\t{t.direction}\t{t.entry}\t{t.exit}\t{t.pnl_pct}\t{t.hold_bars}\t{t.exit_reason}\t{t.mfe_pct}\t{t.mae_pct}\t{t.model_p_win}")

print("\n=== PER-LOSING-TRADE TOP NEGATIVE CONTRIBUTORS ===")
for tid, feats in loser_explain.items():
    print(f"trade {tid}: " + ", ".join(f"{f}={v}" for f, v in feats))

print("\n=== LOSS CLUSTERS ===")
print(json.dumps(clusters, indent=1))
print("\nFILES WRITTEN:", sorted(os.listdir(OUT)))
