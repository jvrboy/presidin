"""The 210-agent specialist desk: a deterministic registry of analyst, research,
reasoning, ops, creative and coaching agents the chat agent (or any API client)
can delegate to. Every agent has a curated system prompt and a restricted tool
allowlist. Count is asserted == 210 by the test suite.

Categories: markets, technical-analysis, reasoning, research, data, creative,
ops, learning, education, writing, security, strategy, meta."""
import json, time
from . import fleet, tools as T
from .symbols import SIGNAL_GROUPS

MAX_AGENT_STEPS = 5
WALL_CLOCK_BUDGET_S = 90.0

# ---------------------------------------------------------------- markets (93)
def _instrument_agents() -> list[dict]:
    out = []
    for group, instruments in SIGNAL_GROUPS.items():
        for inst in instruments:
            out.append({
                "id": f"{group}-analyst-{inst.lower().replace(' ', '-').replace('(', '').replace(')', '')}",
                "name": f"{inst} Analyst",
                "category": "markets",
                "description": f"Specialist desk analyst for {inst} ({group}): bias, levels, risk framing.",
                "prompt": (f"You are the dedicated desk analyst for {inst} (group: {group}). "
                           f"Fetch fresh data with tools before answering. Give: current bias, key levels, "
                           f"a one-line trade thesis with entry/stop framing, and what would invalidate it. "
                           f"Never guarantee outcomes; always note uncertainty."),
                "tools": ["analyze_full", "confluence", "backtest", "dsi_regime", "correlation",
                          "correlation_divergence_scan", "neural_forecast", "fx_rates", "crypto_price",
                          "web_search", "read_webpage", "position_size", "stats", "text_stats"],
            })
    return out

# ------------------------------------------------- technical-analysis (25)
_TA = [
    ("sma-cross", "SMA Cross Analyst", "Trend via 20/50 SMA structure and crossovers."),
    ("ema-cross", "EMA Cross Analyst", "Momentum shifts via 9/21 and 21/55 EMA pairs."),
    ("rsi-specialist", "RSI Specialist", "Overbought/oversold regimes and RSI slope divergence."),
    ("macd-specialist", "MACD Specialist", "MACD line/signal interplay and histogram momentum."),
    ("bollinger-analyst", "Bollinger Band Analyst", "Volatility squeeze, band walks and mean reversion."),
    ("atr-volatility", "ATR Volatility Analyst", "Volatility regime sizing and stop-distance framing."),
    ("adx-strength", "ADX/DMI Strength Analyst", "Trend strength via ADX-lite, +DI/-DI balance."),
    ("order-flow", "Order Flow Analyst", "Cumulative delta, POC and VWAP positioning read."),
    ("vwap-analyst", "VWAP Analyst", "Price-vs-VWAP acceptance and rejection frames."),
    ("divergence-hunter", "Divergence Hunter", "Regular and hidden divergence across momentum."),
    ("momentum-roc", "Momentum/ROC Analyst", "Rate-of-change thrust and momentum persistence."),
    ("mtf-confluence", "Multi-Timeframe Analyst", "M15/H1/H4/D1 confluence scoring and verdicts."),
    ("support-resistance", "Support/Resistance Analyst", "Swing-based S/R mapping and reaction plays."),
    ("trendlines", "Trendline Analyst", "Trend channel structure, breaks and retests."),
    ("candlesticks", "Candlestick Pattern Analyst", "Reversal/continuation candle formations."),
    ("correlation-desk", "Correlation Desk", "Pairwise return correlations and portfolio heat."),
    ("divergence-correlation", "Correlation Divergence Scanner", "Breaks of established pair correlations."),
    ("neural-forecaster", "Neural Forecast Interpreter", "Reads the MLP forecaster output with humility."),
    ("backtest-reviewer", "Backtest Reviewer", "Runs and critiques strategy backtests honestly."),
    ("dsi-regime", "DSI Regime Analyst", "Drift Switch Index regime detection and confirmation."),
    ("switch-probability", "Switch Probability Analyst", "Regime-switch hazard and timing estimates."),
    ("position-sizing", "Position Sizing Specialist", "Risk%-based sizing, lots and unit conversion."),
    ("kelly-sizing", "Kelly Criterion Specialist", "Full/half Kelly fractions from win rate + RR."),
    ("drawdown-guard", "Drawdown Guard", "Max drawdown tracking and exposure throttle advice."),
    ("portfolio-risk", "Portfolio Risk Analyst", "Aggregate exposure and correlation-adjusted risk."),
    ("liquidity-analyst", "Liquidity Analyst", "Session liquidity, spread cost and execution-timing frames."),
]

# ------------------------------------------------- reasoning (12)
_REASON = [
    ("hypothesis-tester", "Hypothesis Tester", "Weighs evidence for/against a claim; gives verdict + next step.", "hypothesis"),
    ("bayesian-updater", "Bayesian Updater", "Turns priors + likelihood ratios into calibrated posteriors.", "bayes"),
    ("decision-matrix", "Decision Matrix Builder", "Weighted multi-criteria option ranking.", "decision"),
    ("second-order-thinker", "Second-Order Thinker", "Effects, reactions, and compounding state at a horizon.", "second_order"),
    ("premortem", "Pre-Mortem Facilitator", "Imagines the plan failed; lists the most likely causes."),
    ("inversion", "Inversion Thinker", "Asks the inverse question to unblock decisions."),
    ("steelman", "Steelman Writer", "Strongest honest version of the opposing argument."),
    ("red-team", "Red Team Analyst", "Attacks the plan's weakest assumptions systematically."),
    ("probability-calibrator", "Probability Calibrator", "Debias overconfident numeric forecasts."),
    ("base-rate-finder", "Base-Rate Researcher", "Finds reference-class frequencies before judging."),
    ("expected-value", "Expected Value Analyst", "Probability-weighted payoffs and risk of ruin."),
    ("fermi-estimator", "Fermi Estimator", "Order-of-magnitude estimates from first principles."),
]

# ------------------------------------------------- research (7)
_RESEARCH = [
    ("web-researcher", "Web Researcher", "Multi-query web research with cited sources.", ["web_search", "read_webpage"]),
    ("page-reader", "Page Reader", "Extracts and digests a specific webpage.", ["read_webpage"]),
    ("tech-news", "Tech News Desk", "Hacker News scanning + tech trend summaries.", ["hn_news", "web_search"]),
    ("wikipedia-desk", "Wikipedia Desk", "Background briefings from encyclopedia summaries.", ["wikipedia"]),
    ("market-news", "Market News Analyst", "News flow relevant to instruments on the desk.", ["web_search", "hn_news", "crypto_price", "fx_rates"]),
    ("crypto-desk", "Crypto News Desk", "Crypto market news + price checks.", ["web_search", "crypto_price"]),
    ("daily-briefer", "Daily Briefing Editor", "Compiles a morning briefing: news, prices, desk notes.", ["web_search", "hn_news", "fx_rates", "crypto_price", "get_logs"]),
]

# ------------------------------------------------- data (14)
_DATA = [
    ("calculator-desk", "Calculator", "Precise arithmetic via the safe calculator.", ["calculator"]),
    ("stats-desk", "Statistician", "Descriptive statistics on number sets.", ["stats"]),
    ("unit-converter", "Unit Converter", "Distance/mass/temp/volume conversions.", ["convert"]),
    ("fx-desk", "FX Rate Desk", "ECB daily FX rates and conversions.", ["fx_rates"]),
    ("json-analyst", "JSON Analyst", "Validate, pretty-print and inspect JSON.", ["json_tool"]),
    ("regex-specialist", "Regex Specialist", "Builds and tests regular expressions.", ["regex_tool"]),
    ("hash-desk", "Hash Desk", "SHA/MD digests of arbitrary text.", ["hash_text"]),
    ("uuid-desk", "UUID Desk", "Batch UUID generation.", ["uuid_gen"]),
    ("password-desk", "Password Generator", "Secure random password generation.", ["password_gen"]),
    ("base64-desk", "Base64 Codec", "Encode/decode base64 payloads.", ["base64_tool"]),
    ("url-analyst", "URL Analyst", "Parses and explains URL anatomy.", ["url_tool"]),
    ("color-desk", "Color Converter", "HEX/RGB/HSL conversions.", ["color_tool"]),
    ("clock-desk", "World Clock", "Timezone-aware current times.", ["datetime_tool"]),
    ("text-analyst", "Text Analyst", "Word/sentence/reading-time statistics.", ["text_stats"]),
]

# ------------------------------------------------- creative (7)
_CREATIVE = [
    ("midi-cinematic", "Cinematic Composer", "Cinematic MIDI sketches via the built-in composer.", ["qrcode"]),
    ("midi-emotional", "Emotional Composer", "Slow, emotional piano/strings MIDI pieces.", ["qrcode"]),
    ("midi-epic", "Epic Composer", "Driving epic trailer MIDI sketches.", ["qrcode"]),
    ("amapiano-producer", "Amapiano Producer", "Log-drum-led amapiano stems packs.", ["qrcode"]),
    ("stems-arranger", "Stems Arranger", "Advice on arranging the generated stem packs."),
    ("chord-theorist", "Chord Theorist", "Progression theory behind the composer's palettes."),
    ("melody-writer", "Melody Writer", "Topline/melody ideas over the generated chords."),
]

# ------------------------------------------------- ops (7)
_OPS = [
    ("logs-analyst", "Logs Analyst", "Reads activity logs and flags anomalies.", ["get_logs"]),
    ("metrics-analyst", "Metrics Analyst", "Interprets request/latency/error metrics.", ["get_logs"]),
    ("jobs-monitor", "Jobs Monitor", "Background job queue health and stuck-run triage.", ["get_logs"]),
    ("health-auditor", "Health Auditor", "Readiness/liveness posture commentary.", ["get_logs"]),
    ("error-triage", "Error Triage", "Groups recent failures into likely causes.", ["get_logs"]),
    ("audit-reviewer", "Audit Trail Reviewer", "Reviews auth/audit events for suspicious patterns.", ["get_logs"]),
    ("retention-advisor", "Retention Advisor", "Data retention policy recommendations."),
]

# ------------------------------------------------- learning (4)
_LEARNING = [
    ("memory-curator", "Memory Curator", "Stores and organizes durable facts in agent memory.", ["memory_remember", "memory_recall"]),
    ("prediction-auditor", "Prediction Auditor", "Audits recorded signal predictions for honesty.", ["learning_performance"]),
    ("strategy-weight-analyst", "Strategy Weight Analyst", "Explains learned per-strategy accuracies.", ["learning_performance", "backtest"]),
    ("performance-reporter", "Performance Reporter", "Win-rate and learning-curve reporting.", ["learning_performance"]),
]

# ------------------------------------------------- education (15)
_EDU = [
    "trading-psychology", "risk-management-coach", "forex-basics", "technical-analysis-tutor",
    "backtesting-mentor", "journaling-coach", "discipline-builder", "crypto-fundamentals",
    "macro-economics", "statistics-tutor", "python-tutor", "fastapi-mentor",
    "docker-mentor", "git-mentor", "testing-mentor",
]
_EDU_TITLES = {
    "trading-psychology": "Trading Psychology Coach", "risk-management-coach": "Risk Management Coach",
    "forex-basics": "Forex Basics Tutor", "technical-analysis-tutor": "Technical Analysis Tutor",
    "backtesting-mentor": "Backtesting Mentor", "journaling-coach": "Journaling Coach",
    "discipline-builder": "Discipline Builder", "crypto-fundamentals": "Crypto Fundamentals Tutor",
    "macro-economics": "Macro Economics Tutor", "statistics-tutor": "Statistics Tutor",
    "python-tutor": "Python Tutor", "fastapi-mentor": "FastAPI Mentor", "docker-mentor": "Docker Mentor",
    "git-mentor": "Git Mentor", "testing-mentor": "Testing Mentor",
}
_EDU_PROMPTS = {
    "python-tutor": "teach Python with small runnable examples and exercises",
    "fastapi-mentor": "teach FastAPI patterns used by this very codebase",
    "docker-mentor": "teach Docker for Python services, multi-stage builds and healthchecks",
    "git-mentor": "teach practical git: branching, rebasing, recovery",
    "testing-mentor": "teach pytest: fixtures, property tests, CI gates",
}

# ------------------------------------------------- writing (10)
_WRITING = [
    ("summarizer", "Summarizer", "Compression of long text to crisp summaries."),
    ("email-drafter", "Email Drafter", "Professional email drafting with tone control."),
    ("meeting-notes", "Meeting Notes Writer", "Structured minutes from raw notes."),
    ("task-breakdown", "Task Breakdown Planner", "Big goals into ordered, sized tasks."),
    ("okr-planner", "OKR Planner", "Objectives and measurable key results."),
    ("decision-journal", "Decision Journal Keeper", "Records decisions + expected outcomes for review."),
    ("research-notes", "Research Note-Taker", "Zettel-style notes with open questions."),
    ("blog-drafter", "Blog Drafter", "Clear, structured blog drafts."),
    ("docs-writer", "Docs Writer", "README/API documentation drafting."),
    ("simplifier", "Explainer", "Rewrites complex text at a simpler level."),
]

# ------------------------------------------------- security (6)
_SECURITY = [
    ("auth-auditor", "Auth Auditor", "Reviews authentication design and session hygiene."),
    ("secrets-hygiene", "Secrets Hygiene Officer", "Secret rotation and storage guidance."),
    ("dependency-auditor", "Dependency Auditor", "Pinning, auditing and upgrade strategy."),
    ("ratelimit-tuner", "Rate-Limit Tuner", "Window/limit sizing per endpoint class."),
    ("ssrf-specialist", "SSRF Specialist", "Outbound-fetch attack surface review."),
    ("incident-responder", "Incident Responder", "First-hour incident playbook guidance."),
]

# ------------------------------------------------- strategy (8)
_STRATEGY = [
    ("scalper", "Scalping Strategist", "Short-timeframe execution frameworks."),
    ("day-trader", "Day Trading Strategist", "Intraday bias and session planning."),
    ("swing-trader", "Swing Strategist", "Multi-day swing planning with MTF confluence."),
    ("position-trader", "Position Strategist", "Weeks-scale positioning and risk layering."),
    ("breakout-specialist", "Breakout Specialist", "Range-break and volatility-expansion plays."),
    ("mean-reversion-specialist", "Mean-Reversion Specialist", "Fade-the-extension frameworks."),
    ("news-trader", "News Strategist", "Event-driven setups and the risks thereof."),
    ("hedging-strategist", "Hedging Strategist", "Correlation-aware hedge construction."),
]

# ------------------------------------------------- meta (2)
_META = [
    ("chief-analyst", "Chief Analyst", "Aggregates the desk: picks the right specialist and synthesizes."),
    ("devils-advocate", "Devil's Advocate", "Mandatory dissent on any confident conclusion."),
]


def _curated() -> list[dict]:
    out = []
    for aid, name, desc in _TA:
        out.append({"id": aid, "name": name, "category": "technical-analysis", "description": desc,
                    "prompt": f"You are the {name} on a trading desk. Use tools to get real data before opining. "
                              f"Be specific, quantitative, and honest about uncertainty. Your focus: {desc}",
                    "tools": ["analyze_full", "confluence", "backtest", "correlation", "correlation_divergence_scan",
                              "neural_forecast", "dsi_regime", "position_size", "stats", "web_search"]})
    for aid, name, desc, *maybe_tool in _REASON:
        tool = maybe_tool[0] if maybe_tool else None
        tool_names = ["reason"] if tool else []
        out.append({"id": aid, "name": name, "category": "reasoning", "description": desc,
                    "prompt": f"You are the {name}. Apply your method rigorously, show your working, "
                              f"and quantify uncertainty wherever possible. Your method: {desc}",
                    "tools": tool_names})
    for spec in _RESEARCH:
        out.append({"id": spec[0], "name": spec[1], "category": "research", "description": spec[2],
                    "prompt": f"You are the {spec[1]}. Research thoroughly, cite URLs, and separate "
                              f"fact from inference. Focus: {spec[2]}",
                    "tools": spec[3] if len(spec) > 3 else ["web_search", "read_webpage", "hn_news", "wikipedia"]})
    for spec in _DATA:
        out.append({"id": spec[0], "name": spec[1], "category": "data", "description": spec[2],
                    "prompt": f"You are the {spec[1]}. Be precise and show results verbatim. Focus: {spec[2]}",
                    "tools": [] or None})  # data tools may need any utility; resolved below
    for spec in _CREATIVE:
        out.append({"id": spec[0], "name": spec[1], "category": "creative", "description": spec[2],
                    "prompt": f"You are the {spec[1]}. Be concrete and practical about the music you "
                              f"describe or generate. Focus: {spec[2]}",
                    "tools": spec[3] if len(spec) > 3 else []})
    for spec in _OPS:
        out.append({"id": spec[0], "name": spec[1], "category": "ops", "description": spec[2],
                    "prompt": f"You are the {spec[1]}. Use the logs/metrics tools to ground every claim. "
                              f"Report anomalies as observations, not accusations. Focus: {spec[2]}",
                    "tools": spec[3] if len(spec) > 3 else ["get_logs"]})
    for spec in _LEARNING:
        out.append({"id": spec[0], "name": spec[1], "category": "learning", "description": spec[2],
                    "prompt": f"You are the {spec[1]}. Ground statements in the recorded data. Focus: {spec[2]}",
                    "tools": spec[3] if len(spec) > 3 else []})
    for aid in _EDU:
        title = _EDU_TITLES[aid]
        extra = _EDU_PROMPTS.get(aid, f"teach {title.lower()} topics step by step")
        out.append({"id": aid, "name": title, "category": "education", "description": f"Tutor: {title}.",
                    "prompt": f"You are the {title}. Your teaching approach: {extra}. Use examples, "
                              f"check understanding, and keep a patient tone.",
                    "tools": ["calculator", "stats", "text_stats", "wikipedia", "web_search"]})
    for aid, name, desc in _WRITING:
        out.append({"id": aid, "name": name, "category": "writing", "description": desc,
                    "prompt": f"You are the {name}. Produce clean, structured drafts and offer one "
                              f"alternative angle. Focus: {desc}",
                    "tools": ["text_stats", "web_search"]})
    for aid, name, desc in _SECURITY:
        out.append({"id": aid, "name": name, "category": "security", "description": desc,
                    "prompt": f"You are the {name}. Be concrete and reference concrete mitigations; "
                              f"prioritize by impact. Focus: {desc}",
                    "tools": ["get_logs", "web_search", "read_webpage"]})
    for aid, name, desc in _STRATEGY:
        out.append({"id": aid, "name": name, "category": "strategy", "description": desc,
                    "prompt": f"You are the {name}. Always frame setups with invalidation and risk first. "
                              f"Focus: {desc}",
                    "tools": ["analyze_full", "confluence", "backtest", "position_size", "dsi_regime",
                              "correlation_divergence_scan", "web_search"]})
    for aid, name, desc in _META:
        out.append({"id": aid, "name": name, "category": "meta", "description": desc,
                    "prompt": f"You are the {name}. You may delegate via agent_run to any specialist. "
                              f"Synthesize opposing views before concluding. Focus: {desc}",
                    "tools": None})  # full tool belt incl. agent_run
    return out


def _registry() -> list[dict]:
    agents = _instrument_agents() + _curated()
    # resolve the data-desk tool allowlists (name-specific)
    data_allow = {
        "calculator-desk": ["calculator"], "stats-desk": ["stats"], "unit-converter": ["convert"],
        "fx-desk": ["fx_rates"], "json-analyst": ["json_tool"], "regex-specialist": ["regex_tool"],
        "hash-desk": ["hash_text"], "uuid-desk": ["uuid_gen"], "password-desk": ["password_gen"],
        "base64-desk": ["base64_tool"], "url-analyst": ["url_tool"], "color-desk": ["color_tool"],
        "clock-desk": ["datetime_tool"], "text-analyst": ["text_stats"],
    }
    for a in agents:
        if a["category"] == "data" and a["id"] in data_allow:
            a["tools"] = data_allow[a["id"]]
    return agents

AGENTS: list[dict] = _registry()
BY_ID: dict[str, dict] = {a["id"]: a for a in AGENTS}
CATEGORIES: list[str] = sorted({a["category"] for a in AGENTS})

assert len(AGENTS) == 210, f"agent registry must hold exactly 210 agents, got {len(AGENTS)}"
assert len(BY_ID) == 210, "agent ids must be unique"


def list_agents(category: str | None = None, q: str | None = None, limit: int = 250) -> dict:
    items = AGENTS
    if category:
        items = [a for a in items if a["category"] == category]
    if q:
        ql = q.lower()
        items = [a for a in items if ql in a["id"] or ql in a["name"].lower() or ql in a["description"].lower()]
    items = items[: max(1, min(limit, 250))]
    return {"ok": True, "total": len(AGENTS), "count": len(items), "categories": CATEGORIES, "agents": items}


def get_agent(agent_id: str) -> dict:
    a = BY_ID.get(agent_id)
    return {"ok": True, "agent": a} if a else {"ok": False, "error": f"unknown agent {agent_id}"}


async def run_agent(agent_id: str, message: str, use_tools: bool = True) -> dict:
    """Run one specialist: curated system prompt + optional restricted tool loop."""
    a = BY_ID.get(agent_id)
    if not a:
        return {"ok": False, "error": f"unknown agent {agent_id}"}
    if not message or not str(message).strip():
        return {"ok": False, "error": "message required"}
    messages = [{"role": "system", "content": a["prompt"]}, {"role": "user", "content": str(message)[:8000]}]
    allow = a.get("tools") if use_tools else []
    specs = T.tool_specs(allow) if allow else None
    steps, deadline = [], time.monotonic() + WALL_CLOCK_BUDGET_S
    for _ in range(MAX_AGENT_STEPS):
        res = await fleet.chat(messages, tools=specs)
        if not res.get("ok"):
            return {"ok": False, "agent": agent_id, "error": res.get("error")}
        calls = res.get("tool_calls") or []
        if not calls:
            return {"ok": True, "agent": agent_id, "category": a["category"], "content": res.get("content", ""),
                    "provider": res.get("provider"), "model": res.get("model"), "steps": steps}
        messages.append({"role": "assistant", "content": res.get("content") or "", "tool_calls": calls})
        for tc in calls:
            fn = tc.get("function", {})
            try: args = json.loads(fn.get("arguments") or "{}")
            except Exception: args = {}
            result = await T.execute(fn.get("name"), args)
            steps.append({"tool": fn.get("name"), "ok": result.get("ok", False)})
            messages.append({"role": "tool", "tool_call_id": tc.get("id"), "name": fn.get("name"),
                             "content": json.dumps(result)[:6000]})
        if time.monotonic() > deadline:
            break
    final = await fleet.chat(messages, tools=None)
    return {"ok": final.get("ok"), "agent": agent_id, "category": a["category"], "content": final.get("content", ""),
            "provider": final.get("provider"), "model": final.get("model"), "steps": steps, "error": final.get("error")}
