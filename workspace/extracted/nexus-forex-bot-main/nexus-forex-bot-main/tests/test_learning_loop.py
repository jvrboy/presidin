import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.entities import Base, Signal
from app.services.learning_loop import open_outcome, pending_outcomes, resolve_outcome, run_retraining_cycle


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    session = session_factory()
    yield session
    session.close()


def _make_signal(db, pair="EURUSD", direction="BUY", entry=1.1000, strategy="test_strategy"):
    signal = Signal(pair=pair, strategy=strategy, direction=direction, confidence=0.7, entry_level=entry)
    db.add(signal)
    db.commit()
    db.refresh(signal)
    return signal


def test_open_outcome_creates_pending_row(db_session):
    signal = _make_signal(db_session)
    outcome = open_outcome(db_session, signal, context={"direction": "BUY"})
    assert outcome.outcome == "PENDING"
    assert outcome.symbol == "EURUSD"
    assert outcome.signal_id == signal.id


def test_resolve_outcome_marks_win_for_favorable_exit(db_session):
    signal = _make_signal(db_session, direction="BUY", entry=1.1000)
    outcome = open_outcome(db_session, signal, context={"direction": "BUY"})
    resolved = resolve_outcome(db_session, outcome.id, exit_price=1.1050, bars_held=4)
    assert resolved.outcome == "WIN"
    assert resolved.pnl_pips > 0
    assert resolved.mistake_category is None


def test_resolve_outcome_marks_loss_and_classifies_mistake(db_session):
    signal = _make_signal(db_session, direction="BUY", entry=1.1000)
    outcome = open_outcome(db_session, signal, context={"direction": "BUY", "regime": "TRENDING_DOWN"})
    resolved = resolve_outcome(db_session, outcome.id, exit_price=1.0950, bars_held=4)
    assert resolved.outcome == "LOSS"
    assert resolved.pnl_pips < 0
    assert resolved.mistake_category == "counter_trend_entry"


def test_resolve_outcome_marks_breakeven_within_tolerance(db_session):
    signal = _make_signal(db_session, direction="BUY", entry=1.1000)
    outcome = open_outcome(db_session, signal, context={"direction": "BUY"})
    resolved = resolve_outcome(db_session, outcome.id, exit_price=1.10001, bars_held=1)
    assert resolved.outcome == "BREAKEVEN"


def test_resolve_outcome_rejects_missing_outcome(db_session):
    with pytest.raises(ValueError):
        resolve_outcome(db_session, 999, exit_price=1.1)


def test_resolve_outcome_rejects_already_resolved(db_session):
    signal = _make_signal(db_session)
    outcome = open_outcome(db_session, signal, context={"direction": "BUY"})
    resolve_outcome(db_session, outcome.id, exit_price=1.11, bars_held=1)
    with pytest.raises(ValueError):
        resolve_outcome(db_session, outcome.id, exit_price=1.12, bars_held=2)


def test_pending_outcomes_filters_by_symbol_and_excludes_resolved(db_session):
    s1 = _make_signal(db_session, pair="EURUSD")
    s2 = _make_signal(db_session, pair="XAUUSD")
    o1 = open_outcome(db_session, s1, context={"direction": "BUY"})
    open_outcome(db_session, s2, context={"direction": "BUY"})
    resolve_outcome(db_session, o1.id, exit_price=1.11, bars_held=1)
    remaining = pending_outcomes(db_session)
    assert len(remaining) == 1
    assert remaining[0].symbol == "XAUUSD"
    filtered = pending_outcomes(db_session, symbol="xauusd")
    assert len(filtered) == 1


def test_run_retraining_cycle_reports_insufficient_samples(db_session):
    run = run_retraining_cycle(db_session, trigger="MANUAL", min_samples=10)
    assert run.samples_used == 0
    import json
    assert json.loads(run.lessons_json)["status"] == "insufficient_samples"


def test_run_retraining_cycle_computes_win_rate_and_lessons(db_session):
    for index in range(12):
        signal = _make_signal(db_session, direction="BUY", entry=1.1000)
        outcome = open_outcome(db_session, signal, context={"direction": "BUY", "regime": "TRENDING_DOWN" if index % 2 == 0 else "TRENDING_UP"})
        exit_price = 1.0950 if index % 2 == 0 else 1.1050
        resolve_outcome(db_session, outcome.id, exit_price=exit_price, bars_held=3)
    run = run_retraining_cycle(db_session, trigger="MANUAL", min_samples=5)
    assert run.samples_used == 12
    assert run.win_rate_before is not None
    assert run.win_rate_after is not None
    import json
    lessons = json.loads(run.lessons_json)
    assert lessons["total"] == 6
    assert lessons["top_category"] == "counter_trend_entry"
