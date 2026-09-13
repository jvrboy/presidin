# Backend AI and local learning

UI files and signal schema remain unchanged. The existing reason field includes
ensemble evidence. Scores are heuristics, not win probabilities.

## Ensemble
Existing RSI/EMA/MACD candidates are reviewed by four rule-based agents:
ADX-filtered trend, Bollinger/Stochastic mean reversion, 20-bar breakout, and
CCI momentum. Williams %R and normalized ATR also enter the neural features.
A volatility reviewer penalizes unusually volatile signals. These reviewers do
not execute orders. They confirm or disagree with candidates, not generate
independent orders. Confidence can decrease.

## Storage
`python_app/data/` contains memory.sqlite3, promoted model.json numeric weights,
and training_report.json. Override with NEXUS_DATA_DIR in the environment or
python_app/.env. These files and .env are Git-ignored. Back up while stopped.
Demo history is capped at 1,000 entries; market history is retained. Storage is
not encrypted; protect it with Windows account permissions.

## Learning boundary
Current scans STILL generate synthetic candles. Demo signals never train the
market model, use its predictions, or call Gemini. The existing MT5 EA does not
supply candle history or automatically reconcile closed trades. Those integrations
remain necessary. Feed authentic chronological completed candles through:

    analyze_symbol(symbol, settings, completed_ohlcv, source="market")

Do not repeat the same candle as independent training examples. Label signal IDs
using verified net closed-trade outcomes (0 loss, 1 win; omit breakevens):

```cmd
python -m backend.intelligence label --id SIGNAL_ID --outcome 0 --evidence "broker history reference"
python -m backend.intelligence train
```

Run from python_app with its virtual environment activated. Evidence is an audit
reference, not automatic broker verification. Demo/duplicate labels are rejected.
Training is operator-triggered, not self-modifying or automatically scheduled.
At least 150 verified labels are required, with both classes in each partition.
A chronological 20% holdout evaluates a standardized 12-unit MLP. Training labels
not known before the holdout begins are purged; at least 100 must remain.
Only models beating a constant training win-rate baseline on holdout log loss
are promoted. Numeric JSON avoids executable pickle files. Predictions adjust
scores by at most +/-5 and expire after 30 days.

This is a research foundation, not proof of profitability. Correlated examples,
pooled symbols/timeframes, regime changes and repeated holdout reuse can mislead.
There is no champion/challenger comparison or automatic rollback yet. Use separate
walk-forward and demo validation before relying on scores. No guaranteed growth.

## Optional Gemini
Create python_app/.env locally; never share your key:

```dotenv
NEXUS_GEMINI_ENABLED=true
GEMINI_API_KEY=YOUR_LOCAL_KEY
GEMINI_MODEL=YOUR_SUPPORTED_GEMINI_MODEL_ID
```

Choose a generateContent-capable model supported by your Google project. Restart
after changes. Only market candidates trigger calls. Symbol, direction and votes
are sent to Google, not account data or local memory. Billing and Google terms
apply. Gemini is advisory, not a market feed, and cannot execute trades.
One call/minute/process, eight-second timeout, and +/-3 maximum adjustment.
Disabled, malformed, failed and rate-limited responses contribute zero.
Keys are not exposed through UI settings.

## Windows validation after obtaining the updated source
Stop with Ctrl+C, activate the existing environment, then from python_app:

```cmd
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --no-use-colors
```

Keep live trading disabled. Existing saved bridge settings are preserved.
Tests require no key. Live Gemini and MT5 execution have not been validated here.
