#!/usr/bin/env python3
"""Gate-compliant signal engine v2 — trend continuation + RSI-extreme MR fade.
Consumes knowledge/hq_gates.json + hq_elite_oos.json + hq_knowledge_pack.json.
Writes knowledge/signals/<UTC>_signals_v2.json, updates latest.json + tracker.jsonl.
Data source: 1200 x 1-min candles per symbol via Deriv public WS.
"""
# (production copy — engine matches inline run of 2026-08-29T19:51:10Z)
