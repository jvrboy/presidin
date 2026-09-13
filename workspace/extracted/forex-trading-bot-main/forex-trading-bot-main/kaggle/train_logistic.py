"""Train logistic with Deriv candle fallback. Only upload if accuracy is sane.

Extended for Workstream A:
- uploads weights.json AND a model card (README.md) to HuggingFace
- bumps the `latest` tag to the newly trained commit (resolve/latest picks it up)
- honors HF_MODEL_REPO env var (defaults to justinsimpsad/forex-bot-weights)
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

FEATURE_NAMES = [
    "ret_1", "ret_5", "rsi_14", "macd_hist", "bb_pct",
    "ema_spread", "roc_12", "atr_pct", "vol_z",
]
MIN_SAMPLES = 80
MIN_UPLOAD_ACC = 0.48


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / n, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / n, adjust=False).mean().replace(0, np.nan)
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def build_features(ohlc: pd.DataFrame) -> pd.DataFrame:
    c = ohlc["close"]
    h, l = ohlc["high"], ohlc["low"]
    ret_1 = c.pct_change() * 100
    ret_5 = c.pct_change(5) * 100
    r = rsi(c, 14)
    ef, es = ema(c, 12), ema(c, 26)
    macd_line = ef - es
    signal = ema(macd_line, 9)
    hist = macd_line - signal
    mid = c.rolling(20).mean()
    std = c.rolling(20).std().replace(0, np.nan)
    upper, lower = mid + 2 * std, mid - 2 * std
    bb_pct = (c - lower) / (upper - lower)
    e9, e21 = ema(c, 9), ema(c, 21)
    spread = (e9 - e21) / e21.replace(0, np.nan) * 100
    roc12 = c.pct_change(12) * 100
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    atr = tr.ewm(span=14, adjust=False).mean()
    atr_pct = atr / c.replace(0, np.nan) * 100
    vol = ret_1.rolling(20).std().replace(0, np.nan)
    vol_z = (ret_1 - ret_1.rolling(20).mean()) / vol
    return pd.DataFrame({
        "ret_1": ret_1, "ret_5": ret_5, "rsi_14": r, "macd_hist": hist,
        "bb_pct": bb_pct, "ema_spread": spread, "roc_12": roc12,
        "atr_pct": atr_pct, "vol_z": vol_z,
    })


def ticks_to_ohlc(ticks: pd.DataFrame, freq: str = "1min") -> pd.DataFrame:
    ticks = ticks.copy()
    ticks["ts"] = pd.to_datetime(ticks["epoch"], unit="s", utc=True)
    ticks = ticks.set_index("ts").sort_index()
    ohlc = ticks["quote"].resample(freq).ohlc().dropna()
    ohlc.columns = ["open", "high", "low", "close"]
    return ohlc


def fetch_deriv_ohlc(symbols=None, count=400) -> pd.DataFrame:
    import asyncio
    import websockets

    symbols = symbols or ["R_50", "R_25", "R_100", "JD25", "R_10"]

    async def one(sym):
        async with websockets.connect("wss://api.derivws.com/trading/v1/options/ws/public") as ws:
            await ws.send(json.dumps({
                "ticks_history": sym, "adjust_start_time": 1, "count": count,
                "end": "latest", "granularity": 60, "style": "candles", "req_id": 1,
            }))
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=20))
                if msg.get("candles"):
                    df = pd.DataFrame(msg["candles"])
                    df["symbol"] = sym
                    return df
                if msg.get("error"):
                    raise RuntimeError(msg["error"])

    async def all_sym():
        out = []
        for s in symbols:
            try:
                out.append(await one(s))
                print("deriv", s, "ok")
            except Exception as e:
                print("deriv fetch fail", s, e)
        return pd.concat(out, ignore_index=True) if out else pd.DataFrame()

    return asyncio.get_event_loop().run_until_complete(all_sym())


def dataset_from_ohlc(ohlc: pd.DataFrame) -> pd.DataFrame:
    frames = []
    if "symbol" in ohlc.columns:
        groups = ohlc.groupby("symbol")
    else:
        groups = [("all", ohlc)]
    for _, g in groups:
        g = g.sort_values("epoch") if "epoch" in g.columns else g
        part = g[["open", "high", "low", "close"]].astype(float).reset_index(drop=True)
        X = build_features(part)
        y5 = (part["close"].shift(-5) > part["close"]).astype(float)
        y3 = (part["close"].shift(-3) > part["close"]).astype(float)
        y = ((y5 + y3) >= 1).astype(int)
        frames.append(X.join(y.rename("label")).dropna())
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def train(data: pd.DataFrame) -> dict:
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score

    if len(data) < MIN_SAMPLES:
        raise SystemExit(f"Not enough samples: {len(data)}")
    Xv = data[FEATURE_NAMES].values
    yv = data["label"].values
    mask = np.isfinite(Xv).all(axis=1)
    Xv, yv = Xv[mask], yv[mask]
    Xtr, Xte, ytr, yte = train_test_split(Xv, yv, test_size=0.2, shuffle=False)
    clf = LogisticRegression(max_iter=1000, C=0.7, class_weight="balanced")
    clf.fit(Xtr, ytr)
    acc = float(accuracy_score(yte, clf.predict(Xte)))
    return {
        "version": f"lr-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}",
        "bias": float(clf.intercept_[0]),
        "weights": [float(x) for x in clf.coef_[0]],
        "threshold": 0.08,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "samples": int(len(Xv)),
        "accuracy": round(acc, 4),
        "feature_names": FEATURE_NAMES,
        "label": "multi_horizon_3_5",
    }


def write_model_card(weights: dict) -> str:
    return "\n".join([
        "# Forex Signal Logistic Model",
        "",
        f"- version: `{weights['version']}`",
        f"- trained_at: `{weights['trained_at']}`",
        f"- samples: {weights.get('samples')}",
        f"- accuracy: {weights.get('accuracy')}",
        f"- source: {weights.get('source')}",
        f"- label: {weights.get('label')}",
        f"- features: {', '.join(weights.get('feature_names', FEATURE_NAMES))}",
        "",
        "Uploaded automatically by `kaggle/train_logistic.py` via GitHub Actions "
        "(`.github/workflows/export-ticks.yml`). `resolve/latest/weights.json` is "
        "what runtime `apps/web/lib/model.ts` loads.",
    ])


def bump_latest_tag(api, token: str, repo: str, version: str) -> None:
    """Point the `latest` tag at the freshly uploaded commit (non-fatal)."""
    try:
        api.delete_tag(repo_id=repo, tag="latest", repo_type="model", token=token)
    except Exception:
        pass
    try:
        api.create_tag(
            repo_id=repo, tag="latest",
            tag_message=f"trained weights {version}", repo_type="model", token=token,
        )
        print("Tag latest ->", version)
    except Exception as e:
        print("Tag bump failed (non-fatal):", e)


def upload_hf(weights: dict, token: str, repo: str = "justinsimpsad/forex-bot-weights") -> None:
    from huggingface_hub import HfApi
    api = HfApi(token=token)
    path = Path("/tmp/weights.json")
    path.write_text(json.dumps(weights, indent=2))
    api.upload_file(path_or_fileobj=str(path), path_in_repo="weights.json", repo_id=repo, repo_type="model")
    card_path = Path("/tmp/README.md")
    card_path.write_text(write_model_card(weights))
    api.upload_file(path_or_fileobj=str(card_path), path_in_repo="README.md", repo_id=repo, repo_type="model")
    print("Uploaded", repo, weights["version"], "acc", weights.get("accuracy"))
    bump_latest_tag(api, token, repo, weights["version"])


def main():
    data_path = Path(os.environ.get("TICKS_CSV", "/kaggle/input/forex-bot-ticks/ticks.csv"))
    tick_data = pd.DataFrame()
    if data_path.exists():
        ticks = pd.read_csv(data_path)
        if "quote" in ticks.columns and len(ticks) >= 50:
            ohlc = ticks_to_ohlc(ticks)
            tick_data = dataset_from_ohlc(ohlc)
            print("From ticks samples", len(tick_data))

    print("Fetching Deriv public candles (preferred training source)...")
    deriv_data = pd.DataFrame()
    try:
        ohlc = fetch_deriv_ohlc()
        deriv_data = dataset_from_ohlc(ohlc)
        print("From Deriv samples", len(deriv_data))
    except Exception as e:
        print("Deriv fallback failed", e)

    # Prefer larger/cleaner Deriv set; merge if both exist
    if len(deriv_data) >= MIN_SAMPLES and len(tick_data) >= MIN_SAMPLES:
        data = pd.concat([deriv_data, tick_data], ignore_index=True)
        source = "deriv+ticks"
    elif len(deriv_data) >= MIN_SAMPLES:
        data = deriv_data
        source = "deriv_public_candles"
    elif len(tick_data) >= MIN_SAMPLES:
        data = tick_data
        source = f"ticks:{data_path}"
    else:
        raise SystemExit(f"Not enough samples: deriv={len(deriv_data)} ticks={len(tick_data)}")

    weights = train(data)
    weights["source"] = source
    Path("weights.json").write_text(json.dumps(weights, indent=2))
    print("Wrote weights.json", weights)

    token = os.environ.get("HF_TOKEN")
    if not token:
        print("HF_TOKEN not set — skipped upload")
        return
    if weights.get("accuracy", 0) < MIN_UPLOAD_ACC and len(data) < 500:
        print(f"Skip upload: weak model acc={weights.get('accuracy')} samples={weights.get('samples')}")
        return
    upload_hf(weights, token, os.environ.get("HF_MODEL_REPO", "justinsimpsad/forex-bot-weights"))


if __name__ == "__main__":
    main()
