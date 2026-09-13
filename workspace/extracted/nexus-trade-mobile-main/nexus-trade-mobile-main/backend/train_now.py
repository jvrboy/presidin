"""Bootstrap training on REAL historical data.

Fetches real history for the watchlist, trains a PPO candidate per symbol on
the entry timeframe (with HTF context), runs walk-forward validation with
stress, and promotes survivors to champion. Saves everything into
python_app/data so the trained model ships with the repo.
"""
import sys, os, json, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python_app"))
os.environ["NEXUS_DATA_DIR"] = os.path.join(os.path.dirname(__file__), "python_app", "data")
import warnings; warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd

from backend.real_data import fetch_history
from analytics.trading_env import ForexTradingEnv
from analytics.ppo_agent import PPOAgent
from analytics.walk_forward import WalkForwardValidator, StressProfile
from analytics.reward import RewardConfig

SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY"]
TF = "H1"
RESULTS = {}

def train_symbol(sym, df, h4, d1, timesteps=25000):
    agent = PPOAgent()
    print(f"\n=== {sym}: {len(df)} bars, training regularized PPO ({timesteps} steps) ===", flush=True)
    def make_env():
        return ForexTradingEnv(df.copy(), htf_frames={"H4": h4, "D1": d1},
                               symbol=sym, seed=7)
    # Regularized to fight the overfitting the validator caught:
    # lower LR, smaller net, higher entropy (exploration), tighter clip.
    res = agent.train(make_env, total_timesteps=timesteps,
                      learning_rate=1e-4, ent_coef=0.02, clip_range=0.15,
                      n_steps=1024, batch_size=128, n_epochs=4,
                      policy_kwargs={"net_arch": [64, 64]})
    if not res.get("trained"):
        print(f"  train failed: {res}")
        return None
    ver = res["version"]
    print(f"  candidate v{ver} trained in {res['train_seconds']}s", flush=True)

    # Walk-forward validation on this symbol's own history (lean folds)
    validator = WalkForwardValidator(train_bars=3000, test_bars=500,
                                     timesteps_per_fold=4000)
    report = validator.run(df, sym, n_folds=2)
    print(f"  walk-forward: OOS sortino {report.mean_oos_sortino:.2f} | "
          f"stressed {report.mean_stressed_sortino:.2f} | "
          f"drop {report.max_oos_drop_pct:.0f}% | overfitted={report.overfitted}", flush=True)
    print(f"  verdict: {report.verdict}", flush=True)

    # Promote only if robust
    promoted = False
    if not report.overfitted and report.mean_stressed_sortino > 0:
        ok = agent.promote(ver)
        promoted = ok
        print(f"  PROMOTED v{ver} to champion: {ok}", flush=True)
    else:
        print(f"  NOT promoted (failed validation)", flush=True)

    return {"version": ver, "promoted": promoted,
            "oos_sortino": report.mean_oos_sortino,
            "stressed_sortino": report.mean_stressed_sortino,
            "overfitted": report.overfitted}

def main():
    for sym in SYMBOLS:
        try:
            df = fetch_history(sym, TF, "400d")
            h4 = fetch_history(sym, "H4", "400d")
            d1 = fetch_history(sym, "D1", "max")
            if df is None or len(df) < 1200:
                print(f"{sym}: insufficient data ({len(df) if df is not None else 0} bars), skipping")
                continue
            r = train_symbol(sym, df, h4, d1)
            if r:
                RESULTS[sym] = r
        except Exception as e:
            print(f"{sym} ERROR: {e}", flush=True)
            import traceback; traceback.print_exc()

    out = os.path.join(os.environ["NEXUS_DATA_DIR"], "bootstrap_results.json")
    with open(out, "w") as f:
        json.dump(RESULTS, f, indent=2)
    print("\n=== BOOTSTRAP COMPLETE ===")
    print(json.dumps(RESULTS, indent=2))
    print(f"saved -> {out}")

if __name__ == "__main__":
    main()
