from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from app.models.entities import AnalysisSnapshot, Base, MistakeLog, Signal, SignalOutcome, TrainingRun


def test_new_tables_are_created():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    tables = set(inspect(engine).get_table_names())
    for expected in ("analysis_snapshots", "signal_outcomes", "training_runs", "mistake_logs"):
        assert expected in tables


def test_analysis_snapshot_round_trip():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    snapshot = AnalysisSnapshot(symbol="EURUSD", timeframe="1h", bias="BULLISH", confidence=0.6, commentary="test commentary", result_json="{}")
    session.add(snapshot)
    session.commit()
    session.refresh(snapshot)
    assert snapshot.id is not None
    assert snapshot.symbol == "EURUSD"
    assert snapshot.created_at is not None


def test_signal_outcome_and_mistake_log_round_trip():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    signal = Signal(pair="EURUSD", strategy="test", direction="BUY", confidence=0.7, entry_level=1.1)
    session.add(signal)
    session.commit()
    session.refresh(signal)

    outcome = SignalOutcome(signal_id=signal.id, symbol="EURUSD", strategy="test", direction="BUY", entry_price=1.1, outcome="LOSS", pnl_pips=-20.0, bars_held=3, mistake_category="counter_trend_entry")
    session.add(outcome)
    session.commit()
    session.refresh(outcome)

    mistake = MistakeLog(signal_outcome_id=outcome.id, category="counter_trend_entry", confidence=0.75, suggested_adjustment="require entry direction to agree with regime")
    session.add(mistake)
    session.commit()
    session.refresh(mistake)

    assert outcome.signal_id == signal.id
    assert mistake.signal_outcome_id == outcome.id


def test_training_run_round_trip():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    run = TrainingRun(trigger="MANUAL", symbol="EURUSD", samples_used=12, win_rate_before=0.4, win_rate_after=0.55, lessons_json="{}", metrics_json="{}")
    session.add(run)
    session.commit()
    session.refresh(run)
    assert run.id is not None
    assert run.trigger == "MANUAL"
    assert run.win_rate_after == 0.55
