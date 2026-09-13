"""Local outcome memory and optional advisory AI. Never places orders."""
import json
import os
import sqlite3
import threading
import time
from pathlib import Path
import numpy as np
import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env')
DATA = Path(os.getenv('NEXUS_DATA_DIR', str(ROOT / 'data'))).resolve()
LOCK = threading.RLock()
_last_gemini = 0.0


def connect():
    DATA.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATA / 'memory.sqlite3', timeout=10)
    db.execute('''CREATE TABLE IF NOT EXISTS observations
        (id TEXT PRIMARY KEY, created REAL, source TEXT, symbol TEXT,
         timeframe TEXT, features TEXT, score REAL, outcome INTEGER,
         evidence TEXT, labeled REAL)''')
    return db


def remember(signal, features, source):
    with connect() as db:
        db.execute('INSERT OR IGNORE INTO observations VALUES (?,?,?,?,?,?,?,NULL,NULL,NULL)',
                   (signal.id, time.time(), source, signal.symbol, signal.timeframe,
                    json.dumps(features), signal.strength))
        # Bound disposable demo history; verified observations are retained.
        db.execute("DELETE FROM observations WHERE source='demo' AND id NOT IN "
                   "(SELECT id FROM observations WHERE source='demo' ORDER BY created DESC LIMIT 1000)")


def label(signal_id, outcome, evidence):
    if outcome not in (0, 1) or not evidence.strip():
        raise ValueError('Outcome must be 0 or 1 with a broker/history evidence reference')
    with connect() as db:
        cur = db.execute("UPDATE observations SET outcome=?, evidence=?, labeled=? "
                         "WHERE id=? AND source='market' AND outcome IS NULL",
                         (outcome, evidence, time.time(), signal_id))
        if cur.rowcount != 1:
            raise ValueError('Unknown, demo, or already labeled signal')


def train():
    """Chronological holdout; persist numeric weights only, never pickle/code."""
    from sklearn.neural_network import MLPClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import log_loss
    with LOCK, connect() as db:
        rows = db.execute("SELECT features,outcome,created,labeled FROM observations "
                          "WHERE source='market' AND outcome IS NOT NULL ORDER BY created").fetchall()
        if len(rows) < 150:
            return {'trained': False, 'reason': 'Need at least 150 verified market outcomes'}
        split = int(len(rows) * .8)
        # Purge labels not yet known when the holdout period began.
        training = [r for r in rows[:split] if r[3] < rows[split][2]]
        if len(training) < 100:
            return {'trained': False, 'reason': 'Insufficient leakage-free training outcomes'}
        x = np.array([json.loads(r[0]) for r in training]); y = np.array([r[1] for r in training])
        xt = np.array([json.loads(r[0]) for r in rows[split:]]); yt = np.array([r[1] for r in rows[split:]])
        if len(set(y)) < 2 or len(set(yt)) < 2:
            return {'trained': False, 'reason': 'Both wins and losses required in both partitions'}
        scaler = StandardScaler().fit(x)
        model = MLPClassifier(hidden_layer_sizes=(12,), max_iter=500, random_state=42,
                              alpha=1.0).fit(scaler.transform(x), y)
        loss = log_loss(yt, model.predict_proba(scaler.transform(xt)))
        baseline = log_loss(yt, np.full(len(yt), y.mean()))
        result = {'trained': True, 'promoted': bool(loss < baseline), 'holdout_loss': loss,
                  'baseline_loss': baseline, 'samples': len(rows), 'trained_at': time.time()}
        if result['promoted']:
            payload = dict(result, mean=scaler.mean_.tolist(), scale=scaler.scale_.tolist(),
                           weights=[w.tolist() for w in model.coefs_],
                           biases=[b.tolist() for b in model.intercepts_])
            tmp = DATA / 'model.tmp'
            tmp.write_text(json.dumps(payload), encoding='utf-8')
            tmp.replace(DATA / 'model.json')
        (DATA / 'training_report.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        return result


def neural_adjustment(features):
    try:
        m = json.loads((DATA / 'model.json').read_text(encoding='utf-8'))
        if time.time() - m['trained_at'] > 30 * 86400:
            return 0.0
        x = (np.array(features) - m['mean']) / m['scale']
        h = np.maximum(0, x @ np.array(m['weights'][0]) + m['biases'][0])
        z = float((h @ np.array(m['weights'][1]) + m['biases'][1]).item())
        return float(np.clip((1 / (1 + np.exp(-np.clip(z, -30, 30))) - .5) * 10, -5, 5))
    except (OSError, ValueError, KeyError, TypeError):
        return 0.0


def gemini_review(symbol, direction, votes):
    """Opt-in, globally rate limited, bounded, fails closed to zero adjustment.

    Uses the AI key pool (settings-managed, unlimited keys) with automatic
    failover: if one key is rate-limited or its quota is exhausted, the next
    healthy key takes over transparently. Falls back to the GEMINI_API_KEY
    env var when the pool is empty.
    """
    global _last_gemini
    from .ai_pool import ai_pool

    model = os.getenv('GEMINI_MODEL', '')
    if os.getenv('NEXUS_GEMINI_ENABLED', '').lower() != 'true' or not model:
        return 0.0, 'Gemini disabled'

    # Populate the pool from env as a fallback when no UI keys are configured
    if ai_pool.count() == 0 and os.getenv('GEMINI_API_KEY'):
        ai_pool.set_keys([os.getenv('GEMINI_API_KEY')])

    with LOCK:
        if time.monotonic() - _last_gemini < 60:
            return 0.0, 'Gemini rate-limited'

    if not all(c.isalnum() or c in '-_.' for c in model):
        return 0.0, 'Gemini unavailable'

    prompt = ('Review technical evidence only. No tools, no trade execution. '
              'Return JSON with adjustment (number -3 to 3). Conflicting evidence should reduce it. '
              + json.dumps(dict(symbol=symbol, direction=direction, votes=votes)))
    payload = {'contents': [{'parts': [{'text': prompt}]}],
               'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0}}
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'

    # Try healthy keys in rotation; failover on rate-limit / quota exhaustion
    max_attempts = max(1, ai_pool.healthy_count())
    for _ in range(max_attempts):
        handle = ai_pool.acquire()
        if handle is None:
            return 0.0, 'Gemini keys exhausted (all cooling down)'
        t0 = time.perf_counter()
        try:
            response = httpx.post(url, headers={'x-goog-api-key': handle.key},
                                  timeout=8, json=payload)
            if response.status_code == 200:
                ai_pool.report_success(handle, (time.perf_counter() - t0) * 1000)
                with LOCK:
                    _last_gemini = time.monotonic()
                value = json.loads(response.json()['candidates'][0]['content']['parts'][0]['text'])['adjustment']
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not np.isfinite(value) or not -3 <= value <= 3:
                    raise ValueError('Invalid advisory score')
                return float(value), 'Gemini advisory'
            # Failover: report and rotate to the next key
            ai_pool.report_failure(handle, response.status_code, response.text[:200])
        except ValueError:
            return 0.0, 'Gemini unavailable'
        except Exception as exc:
            ai_pool.report_failure(handle, None, str(exc)[:200])
    return 0.0, 'Gemini unavailable (all keys failed)'


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Local verified-outcome learning')
    parser.add_argument('action', choices=['train', 'label'])
    parser.add_argument('--id'); parser.add_argument('--outcome', type=int, choices=[0, 1])
    parser.add_argument('--evidence', default='')
    args = parser.parse_args()
    if args.action == 'train':
        print(json.dumps(train(), indent=2))
    else:
        label(args.id, args.outcome, args.evidence)
        print('Outcome saved')
