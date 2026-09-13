import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from backend import intelligence as ai
from backend.config import SystemSettings
from strategies.engine import scan_all
from strategies.ensemble import review
from strategies.indicators import generate_ohlcv_demo


class IntelligenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patch = patch.object(ai, 'DATA', Path(self.tmp.name))
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()

    def test_demo_excluded_and_bounded(self):
        signals = scan_all(SystemSettings())
        self.assertTrue(signals)
        self.assertTrue(all(0 <= s.strength <= 98 for s in signals))
        with self.assertRaises(ValueError):
            ai.label(signals[0].id, 1, 'demo result')
        self.assertFalse(ai.train()['trained'])
        self.assertEqual(ai.neural_adjustment([0] * 9), 0)

    def test_indicators(self):
        f, votes, delta = review(generate_ohlcv_demo('EURUSD', seed=42), 'buy')
        self.assertEqual(len(f), 9)
        self.assertEqual(len(votes), 4)
        with self.assertRaises(ValueError):
            review(generate_ohlcv_demo('EURUSD', bars=20), 'buy')

    def test_gemini_disabled(self):
        with patch.dict('os.environ', {'NEXUS_GEMINI_ENABLED': 'false'}), patch.object(ai.httpx, 'post') as post:
            self.assertEqual(ai.gemini_review('EURUSD', 'buy', {})[0], 0)
            post.assert_not_called()

    def test_market_label_once(self):
        from types import SimpleNamespace
        signal = SimpleNamespace(id='verified', symbol='EURUSD', timeframe='H1', strength=60)
        ai.remember(signal, [0] * 9, 'market')
        ai.label(signal.id, 0, 'broker closed trade reference')
        with self.assertRaises(ValueError):
            ai.label(signal.id, 1, 'duplicate')

    def test_gemini_invalid_response(self):
        from unittest.mock import Mock
        response = Mock()
        response.json.return_value = {'candidates': [{'content': {'parts': [{'text': '{"adjustment":999}'}]}}]}
        env = {'NEXUS_GEMINI_ENABLED': 'true', 'GEMINI_API_KEY': 'test', 'GEMINI_MODEL': 'test'}
        with patch.dict('os.environ', env), patch.object(ai, '_last_gemini', -1000), patch.object(ai.httpx, 'post', return_value=response):
            self.assertEqual(ai.gemini_review('EURUSD', 'buy', {})[0], 0)

    def test_neural_numeric_artifact(self):
        model = {'trained_at': ai.time.time(), 'mean': [0]*9, 'scale': [1]*9,
                 'weights': [[[0] for _ in range(9)], [[0]]], 'biases': [[0], [0]]}
        (ai.DATA / 'model.json').write_text(json.dumps(model))
        self.assertEqual(ai.neural_adjustment([1]*9), 0)
