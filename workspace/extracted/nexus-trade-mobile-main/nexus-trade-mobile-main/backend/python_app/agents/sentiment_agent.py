"""SentimentAgent — lexicon-based NLP sentiment scoring for financial
news/social headlines, per the "integrate NLP to analyze financial news
or social media sentiment" request.

Deliberately dependency-free (no transformers/spaCy/torch download,
which would bloat the Cloudflare-adjacent Python backend and break the
"don't add heavy dependencies" constraint): a domain-tuned lexicon +
negation/intensifier handling gives a genuinely useful polarity score
for short financial headlines without any model download.

Headlines are supplied by the caller (e.g. a news-provider adapter, or
manually via the API for testing) and persisted to `sentiment_samples`;
this agent reads the rolling average for the symbol and votes.
"""
from __future__ import annotations

import re
from typing import List

import pandas as pd

from agents.base import AgentOpinion, Signal

_BULLISH_WORDS = {
    "surge": 1.0, "soar": 1.0, "rally": 0.9, "jump": 0.7, "gain": 0.6, "gains": 0.6,
    "rise": 0.5, "rises": 0.5, "rising": 0.5, "strong": 0.5, "strength": 0.5,
    "beat": 0.6, "beats": 0.6, "upgrade": 0.7, "upgraded": 0.7, "bullish": 1.0,
    "optimism": 0.6, "optimistic": 0.6, "recovery": 0.5, "recovers": 0.5,
    "boost": 0.6, "boosted": 0.6, "hawkish": 0.5, "outperform": 0.7,
    "breakout": 0.6, "record high": 0.9, "all-time high": 1.0,
}
_BEARISH_WORDS = {
    "plunge": -1.0, "crash": -1.0, "slump": -0.8, "tumble": -0.8, "fall": -0.6,
    "falls": -0.6, "falling": -0.6, "drop": -0.6, "drops": -0.6, "decline": -0.6,
    "weak": -0.5, "weakness": -0.5, "miss": -0.6, "misses": -0.6,
    "downgrade": -0.7, "downgraded": -0.7, "bearish": -1.0, "recession": -0.9,
    "fear": -0.6, "fears": -0.6, "panic": -0.9, "sell-off": -0.8, "selloff": -0.8,
    "dovish": -0.4, "underperform": -0.7, "default": -0.9, "crisis": -0.9,
    "record low": -0.9, "collapse": -1.0,
}
_NEGATORS = {"not", "no", "never", "without", "isn't", "wasn't", "won't", "doesn't"}
_INTENSIFIERS = {"very": 1.4, "extremely": 1.6, "sharply": 1.5, "massively": 1.6,
                  "slightly": 0.6, "modestly": 0.7, "unexpectedly": 1.3}


def score_headline(text: str) -> tuple[float, float]:
    """Returns (polarity -1..+1, magnitude 0..1) for one headline."""
    tokens = re.findall(r"[a-zA-Z'-]+", text.lower())
    joined = " ".join(tokens)
    total = 0.0
    hits = 0
    # Multi-word phrases first
    for phrase, weight in {**_BULLISH_WORDS, **_BEARISH_WORDS}.items():
        if " " in phrase and phrase in joined:
            total += weight
            hits += 1
    for i, tok in enumerate(tokens):
        weight = _BULLISH_WORDS.get(tok) or _BEARISH_WORDS.get(tok)
        if weight is None:
            continue
        # Negation flips sign if a negator appears in the preceding 3 tokens
        window = tokens[max(0, i - 3):i]
        if any(w in _NEGATORS for w in window):
            weight = -weight
        # Intensifier scales magnitude
        for w in window:
            if w in _INTENSIFIERS:
                weight *= _INTENSIFIERS[w]
                break
        total += weight
        hits += 1
    if hits == 0:
        return 0.0, 0.0
    polarity = max(-1.0, min(1.0, total / max(hits, 1)))
    magnitude = min(1.0, hits / 4.0)
    return round(polarity, 3), round(magnitude, 3)


class SentimentAgent:
    """Votes from the rolling average sentiment of recent headlines for
    the symbol. Neutral/low-confidence until real headlines have been
    ingested via record_headline() / the /api/sentiment endpoint."""

    name = "SentimentAgent"

    def record_headline(self, symbol: str, headline: str, source: str = "manual") -> dict:
        from backend.database import db
        polarity, magnitude = score_headline(headline)
        db.insert_sentiment_sample({
            "symbol": symbol, "source": source, "headline": headline,
            "polarity": polarity, "magnitude": magnitude,
        })
        return {"symbol": symbol, "headline": headline, "polarity": polarity, "magnitude": magnitude}

    def analyze(self, df: pd.DataFrame, symbol: str = "") -> AgentOpinion:
        """Note: unlike the price-action agents, this needs the symbol
        explicitly (df alone carries no news) — MasterAgent passes it in."""
        from backend.database import db
        if not symbol:
            return AgentOpinion(self.name, Signal.NEUTRAL, 0.0, ["No symbol context for sentiment lookup"])

        agg = db.sentiment_average(symbol, window=20)
        if agg["n"] == 0:
            return AgentOpinion(self.name, Signal.NEUTRAL, 0.0,
                                ["No recent news/social sentiment samples ingested for this symbol"])

        polarity = agg["avg_polarity"]
        magnitude = agg["avg_magnitude"]
        reasons: List[str] = [
            f"Rolling sentiment over last {agg['n']} headlines: polarity {polarity:+.2f}, magnitude {magnitude:.2f}",
        ]
        score = polarity * (0.5 + 0.5 * magnitude)  # magnitude dampens/boosts confidence, not direction
        if score >= 0.5:
            signal = Signal.STRONG_BUY
            reasons.append("Strongly positive news/social flow")
        elif score >= 0.15:
            signal = Signal.BUY
            reasons.append("Mildly positive news/social flow")
        elif score <= -0.5:
            signal = Signal.STRONG_SELL
            reasons.append("Strongly negative news/social flow")
        elif score <= -0.15:
            signal = Signal.SELL
            reasons.append("Mildly negative news/social flow")
        else:
            signal = Signal.NEUTRAL
            reasons.append("Sentiment roughly balanced")
        confidence = min(abs(score) + 0.1 * min(agg["n"] / 20, 1.0), 1.0)
        return AgentOpinion(self.name, signal, round(confidence, 3), reasons)


sentiment_agent = SentimentAgent()
