from app.services.mistake_analyzer import MistakeAnalysis, analyze_trade_mistake, summarize_mistakes


def test_counter_trend_entry_classified():
    result = analyze_trade_mistake({"direction": "BUY", "regime": "TRENDING_DOWN"})
    assert result.category == "counter_trend_entry"
    assert 0 < result.confidence <= 1


def test_against_higher_timeframe_bias_classified():
    result = analyze_trade_mistake({"direction": "SELL", "htf_bias": "BULLISH"})
    assert result.category == "against_higher_timeframe_bias"


def test_low_confluence_entry_classified():
    result = analyze_trade_mistake({"direction": "BUY", "confluence_score": 0.2})
    assert result.category == "low_confluence_entry"


def test_chop_regime_entry_classified():
    result = analyze_trade_mistake({"direction": "BUY", "regime": "RANGING", "adx": 10})
    assert result.category == "chop_regime_entry"


def test_high_volatility_stop_hunt_classified():
    result = analyze_trade_mistake({"direction": "BUY", "atr_pct": 5.0, "atr_pct_baseline": 2.0})
    assert result.category == "high_volatility_stop_hunt"


def test_premature_divergence_entry_classified():
    result = analyze_trade_mistake({"direction": "BUY", "divergence_confirmed": False})
    assert result.category == "premature_divergence_entry"


def test_resistance_support_rejection_classified():
    result = analyze_trade_mistake({"direction": "BUY", "near_opposing_level": True})
    assert result.category == "resistance_support_rejection"


def test_stop_too_tight_classified():
    result = analyze_trade_mistake({"direction": "BUY", "bars_held": 1, "outcome": "LOSS"})
    assert result.category == "stop_too_tight"


def test_held_too_long_no_progress_classified():
    result = analyze_trade_mistake({"direction": "BUY", "bars_held": 50, "max_bars_baseline": 20, "outcome": "LOSS"})
    assert result.category == "held_too_long_no_progress"


def test_unclassified_fallback_for_empty_context():
    result = analyze_trade_mistake({})
    assert result.category == "unclassified"
    assert result.confidence < 0.5


def test_predicate_errors_fall_through_safely():
    # A context missing keys some earlier predicates need should not raise;
    # it should fall through to later rules or the default category.
    result = analyze_trade_mistake({"outcome": "LOSS"})
    assert isinstance(result, MistakeAnalysis)


def test_summarize_mistakes_ranks_categories_and_collects_adjustments():
    analyses = [
        MistakeAnalysis(category="stop_too_tight", confidence=0.75, suggested_adjustment="widen stop"),
        MistakeAnalysis(category="stop_too_tight", confidence=0.75, suggested_adjustment="widen stop"),
        MistakeAnalysis(category="chop_regime_entry", confidence=0.75, suggested_adjustment="add ADX filter"),
    ]
    summary = summarize_mistakes(analyses)
    assert summary["total"] == 3
    assert summary["top_category"] == "stop_too_tight"
    assert summary["top_category_count"] == 2
    assert summary["category_counts"]["chop_regime_entry"] == 1
    assert "widen stop" in summary["suggested_adjustments"]["stop_too_tight"]


def test_summarize_mistakes_handles_empty_list():
    summary = summarize_mistakes([])
    assert summary["total"] == 0
    assert summary["top_category"] is None
    assert summary["top_category_count"] == 0
