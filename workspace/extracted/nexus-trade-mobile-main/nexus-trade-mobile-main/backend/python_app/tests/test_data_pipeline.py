"""Automated data-pipeline integrity tests.

These are NOT model-quality tests -- they exist to catch a specific,
previously-unguarded class of bug: silent data corruption/loss as a
feature vector flows from computation -> DB persistence -> model input.

Concretely, this guards the exact failure mode discovered and fixed
earlier this session with `decision_audit` (a persistence call site
that silently existed on paper but was never wired up) by making that
whole class of "the pipeline LOOKS complete but silently drops data"
bug a regression test instead of something that has to be re-discovered
by manual code review each time.

Every RL/Neural/Deep-neural model shares ONE feature contract:
`analytics.rl_agent.FEATURES` (21 named floats). Three independent
places have to agree with it or a model trains on garbage silently
(numpy `.get(f, 0.0)` never raises -- a typo'd or dropped key just
becomes a hardcoded 0.0 forever, with no exception anywhere):

  1. `MasterAgent._rl_features()` -- computes the actual feature dict
     from live indicators/agent opinions.
  2. `RLTradeAgent.record()` -- serializes that dict to a fixed-order
     JSON array (`vec = [float(features.get(f, 0.0)) for f in FEATURES]`)
     and writes it into the `rl_experience` SQLite table.
  3. `NeuralTradeAgent`/`DeepNeuralTradeAgent`/`HyperparameterTuner` --
     all read that same JSON array back out and feed it straight into
     an MLP, assuming position `i` in the array is FEATURES[i].

None of numpy/pandas/sqlite3 will ever raise if these three drift out
of sync -- they will just silently produce wrong numbers. That's what
these tests are for.
"""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from strategies.indicators import generate_ohlcv_demo


class FeatureContractTests(unittest.TestCase):
    """Guards against the single most dangerous silent-failure mode in
    the whole learning pipeline: MasterAgent computing a feature dict
    whose keys don't match analytics.rl_agent.FEATURES."""

    def test_master_agent_feature_keys_match_shared_contract(self):
        from agents.master_agent import MasterAgent
        from analytics.rl_agent import FEATURES

        df = generate_ohlcv_demo("EURUSD", bars=200, seed=42)
        feats = MasterAgent._rl_features(df, [], corr_adj=0.0, score=0.35)

        self.assertEqual(
            set(feats.keys()), set(FEATURES),
            "MasterAgent._rl_features() keys have drifted from "
            "analytics.rl_agent.FEATURES -- every RL/Neural/Deep model "
            "reads by POSITION in this list, so ANY mismatch here means "
            "a feature silently trains as a hardcoded 0.0 with no error.",
        )
        # Exactly the expected count -- catches an accidental duplicate
        # key that would otherwise mask a genuinely-missing one.
        self.assertEqual(len(FEATURES), 21)
        self.assertEqual(len(feats), 21)

    def test_all_feature_values_are_finite_floats(self):
        """A NaN or inf silently poisons every downstream weight update
        (numpy propagates NaN through matrix multiplies without ever
        raising) -- this is the single most common real-world way a
        feature pipeline goes bad without anyone noticing for weeks."""
        import math
        from agents.master_agent import MasterAgent

        df = generate_ohlcv_demo("GBPUSD", bars=200, seed=7)
        feats = MasterAgent._rl_features(df, [], corr_adj=0.1, score=-0.2)
        for name, value in feats.items():
            self.assertIsInstance(value, float, f"{name} is not a float: {type(value)}")
            self.assertTrue(math.isfinite(value), f"{name}={value} is NaN/inf")

    def test_short_dataframe_does_not_crash_feature_computation(self):
        """Real MT5 feeds occasionally deliver a short warm-up window.
        The pipeline must degrade to safe defaults, never raise/hang."""
        from agents.master_agent import MasterAgent
        from analytics.rl_agent import FEATURES

        df = generate_ohlcv_demo("USDJPY", bars=5, seed=1)
        feats = MasterAgent._rl_features(df, [], corr_adj=0.0, score=0.0)
        self.assertEqual(set(feats.keys()), set(FEATURES))


class FeatureSerializationRoundTripTests(unittest.TestCase):
    """Guards the record() -> SQLite -> read-back leg of the pipeline:
    the exact leg where the `decision_audit` bug lived earlier this
    session (data computed correctly but never actually persisted, or
    persisted then read back from the WRONG place)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_recorded_features_survive_db_round_trip_in_order(self):
        from analytics.rl_agent import RLTradeAgent, FEATURES

        agent = RLTradeAgent()
        with patch.object(agent, "_db") as mock_db_ctx:
            import sqlite3
            conn = sqlite3.connect(":memory:")
            conn.execute("""CREATE TABLE rl_experience
                (id TEXT PRIMARY KEY, created REAL, symbol TEXT, action TEXT,
                 features TEXT, reward REAL, labeled REAL)""")
            mock_db_ctx.return_value.__enter__.return_value = conn
            mock_db_ctx.return_value.__exit__.return_value = False

            # A distinguishable, non-zero value per feature so a
            # positional shuffle/truncation is unmistakable on read-back.
            features_in = {name: round((i + 1) * 0.01, 4) for i, name in enumerate(FEATURES)}
            agent.record("EURUSD", "buy", features_in)

            row = conn.execute("SELECT features FROM rl_experience").fetchone()
            self.assertIsNotNone(row, "record() did not persist a row at all")
            vec_out = json.loads(row[0])

        self.assertEqual(len(vec_out), len(FEATURES))
        for i, name in enumerate(FEATURES):
            self.assertAlmostEqual(vec_out[i], features_in[name], places=6,
                                    msg=f"Position {i} ({name}) corrupted in round-trip: "
                                        f"expected {features_in[name]}, got {vec_out[i]}")

    def test_missing_feature_key_defaults_safely_not_silently_shifted(self):
        """If a caller's dict is missing a key, record() must default
        that ONE position to 0.0 -- not shift every subsequent feature
        left by one position (which would silently corrupt every other
        feature's meaning without any exception)."""
        from analytics.rl_agent import RLTradeAgent, FEATURES

        agent = RLTradeAgent()
        with patch.object(agent, "_db") as mock_db_ctx:
            import sqlite3
            conn = sqlite3.connect(":memory:")
            conn.execute("""CREATE TABLE rl_experience
                (id TEXT PRIMARY KEY, created REAL, symbol TEXT, action TEXT,
                 features TEXT, reward REAL, labeled REAL)""")
            mock_db_ctx.return_value.__enter__.return_value = conn
            mock_db_ctx.return_value.__exit__.return_value = False

            missing_key = FEATURES[3]
            partial = {name: 9.0 for name in FEATURES if name != missing_key}
            agent.record("EURUSD", "buy", partial)
            vec_out = json.loads(conn.execute("SELECT features FROM rl_experience").fetchone()[0])

        self.assertEqual(len(vec_out), len(FEATURES))
        self.assertEqual(vec_out[3], 0.0, "Missing key should default that position to 0.0")
        for i, name in enumerate(FEATURES):
            if name != missing_key:
                self.assertEqual(vec_out[i], 9.0, f"Position {i} ({name}) shifted instead of defaulting in place")


class ModelInputShapeTests(unittest.TestCase):
    """Guards the read-back -> MLP-input leg: every model that consumes
    the replay buffer must agree on vector length with FEATURES, or a
    trained model silently becomes unusable (shape mismatch) or -- worse
    -- silently reads the WRONG feature at a given index after FEATURES
    is extended (this exact scenario is called out in inline comments in
    neural_agent.py/deep_neural_agent.py as an intentional graceful
    reinit-on-mismatch, so this test locks in that contract explicitly)."""

    def test_neural_agent_input_width_matches_features(self):
        from analytics.neural_agent import NeuralTradeAgent
        from analytics.rl_agent import FEATURES

        agent = NeuralTradeAgent()
        self.assertEqual(agent.n_in, len(FEATURES))

    def test_deep_neural_agent_input_width_matches_features(self):
        from analytics.deep_neural_agent import DeepNeuralTradeAgent
        from analytics.rl_agent import FEATURES

        agent = DeepNeuralTradeAgent()
        self.assertEqual(agent.n_in, len(FEATURES))

    def test_hyperparameter_tuner_reads_same_feature_contract(self):
        """The tuner (backend/hyperparameter_tuner.py) loads its replay
        buffer through analytics.rl_agent -- it must report the same
        feature count as everything else, or a 'best' hyperparameter
        set is being validated against a shape nobody else uses."""
        from backend.hyperparameter_tuner import _load_replay
        from analytics.rl_agent import FEATURES

        _X, _y, tuner_features = _load_replay(limit=1)
        self.assertEqual(list(tuner_features), list(FEATURES))


class DecisionAuditPipelineTests(unittest.TestCase):
    """End-to-end guard for the specific bug fixed earlier this session:
    MasterAgent.decide() must ACTUALLY write to decision_audit (not just
    have the table/DB methods exist unused), and the row must contain
    the real decision data, not placeholders."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def test_decide_writes_a_real_decision_audit_row(self):
        from backend.database import Database
        from agents.master_agent import MasterAgent

        db_path = Path(self.tmp.name) / "audit_pipeline_test.sqlite3"
        test_db = Database(db_path)

        with patch("backend.database.db", test_db):
            agent = MasterAgent(symbol="EURUSD")
            df = generate_ohlcv_demo("EURUSD", bars=200, seed=99)
            decision = agent.decide(df)

            rows = test_db.get_decision_audit("EURUSD", limit=5)

        self.assertEqual(len(rows), 1, "decide() did not write exactly one decision_audit row")
        row = rows[0]
        self.assertEqual(row["symbol"], "EURUSD")
        self.assertIn(row["final_signal"], {"STRONG_BUY", "BUY", "NEUTRAL", "SELL", "STRONG_SELL"})
        self.assertEqual(row["final_signal"], decision.final_signal.value)

        opinions = json.loads(row["opinions_json"])
        self.assertTrue(len(opinions) > 0, "opinions_json is empty -- audit row has no real opinion data")

        features = json.loads(row["feature_vector"])
        self.assertTrue(len(features) > 0, "feature_vector is empty -- audit row has no real feature data")

        model_versions = json.loads(row["model_versions"])
        self.assertIn("rl_samples", model_versions)


if __name__ == "__main__":
    unittest.main()
