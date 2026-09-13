"""Agentic auto-trader — the autonomous decision loop.

Each cycle:
  1. Pull real OHLCV for the entry timeframe AND higher timeframes (MTF)
  2. Refresh the cross-pair correlation matrix (CorrelationAgent)
  3. Label finished RL experiences from closed positions + retrain policy
  4. Run the MasterAgent multi-agent vote per symbol (9 agents + ensemble)
  5. Enforce risk guardrails (max trades, daily loss, volatility spike,
     confidence threshold, session filter, live-trading switch)
  6. Size & route qualifying trades with the dynamic risk manager
  7. Record every decision for RL experience replay and neural learning

Safety: NO order is ever sent unless `allow_live_trading` is enabled in
settings AND a valid MT5 connection exists. Everything is logged.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional

from agents.master_agent import MasterAgent
from agents.correlation_agent import CorrelationAgent
from agents.base import Signal as AgentSignal
from analytics.risk_manager import DynamicRiskManager
from analytics.rl_agent import rl_agent
from analytics.neural_agent import neural_agent

from .config import BotState, SystemSettings, RiskMode
from .state import state, Signal
from .mt5_bridge import bridge
from .mt5_data import feed
from .mt5_executor import executor
from .intelligence import remember, neural_adjustment, gemini_review

log = logging.getLogger("auto_trader")

# Per-risk-mode tuning
RISK_PROFILES = {
    RiskMode.CONSERVATIVE: {"min_confidence": 0.55, "min_strength": 68, "lot_cap": 0.5},
    RiskMode.BALANCED: {"min_confidence": 0.40, "min_strength": 58, "lot_cap": 1.0},
    RiskMode.AGGRESSIVE: {"min_confidence": 0.28, "min_strength": 50, "lot_cap": 2.0},
}

# Higher timeframes fetched per entry timeframe for MTF analysis
_MTF_CONTEXT = {"M5": ["M15", "H1"], "M15": ["H1", "H4"], "M30": ["H1", "H4"],
                "H1": ["H4", "D1"], "H4": ["D1", "W1"], "D1": ["W1"]}


class AutoTrader:
    """Autonomous agentic trading loop driven by the MasterAgent."""

    def __init__(self):
        self.correlation_agent = CorrelationAgent()
        self._masters: Dict[str, MasterAgent] = {}
        self._daily_start_equity: Optional[float] = None
        self._daily_date: Optional[str] = None
        self._cycle = 0
        self._last_positions: Dict[int, dict] = {}   # for closed-trade detection
        self._rl_train_counter = 0

    # ------------------------------------------------------------------
    def _master_for(self, symbol: str, settings: SystemSettings) -> MasterAgent:
        if symbol not in self._masters:
            balance = state.account.balance or 10_000.0
            self._masters[symbol] = MasterAgent(
                symbol=symbol,
                correlation_agent=self.correlation_agent,
                account_balance=balance,
                risk_per_trade=settings.max_risk_per_trade_pct / 100.0,
                primary_timeframe=settings.primary_timeframe,
                weights={
                    "TrendAgent": settings.agent_weight_trend,
                    "MomentumAgent": settings.agent_weight_momentum,
                    "VolatilityAgent": settings.agent_weight_volatility,
                    "StructureAgent": settings.agent_weight_structure,
                    "RegimeAgent": settings.agent_weight_regime,
                    "SMCAgent": settings.agent_weight_smc,
                    "MultiTimeframeAgent": settings.agent_weight_mtf,
                    "PPOAgent": 1.2,
                    "VolumeFlowAgent": settings.agent_weight_volume_flow,
                    "SessionLiquidityAgent": settings.agent_weight_session_liquidity,
                    "FibonacciAgent": settings.agent_weight_fibonacci,
                    "SentimentAgent": settings.agent_weight_sentiment,
                    "OrderFlowAgent": settings.agent_weight_orderflow,
                },
                enable_deep_neural=settings.enable_deep_neural,
                enable_anomaly_guard=settings.enable_anomaly_guard,
                enable_shadow_deployment=settings.enable_shadow_deployment,
                sentiment_enabled=settings.sentiment_enabled,
            )
        return self._masters[symbol]

    def _risk_manager_for(self, settings: SystemSettings) -> DynamicRiskManager:
        return DynamicRiskManager(
            base_sl_mult=settings.atr_multiplier_sl,
            base_tp_mult=settings.atr_multiplier_tp,
            max_risk_pct=settings.max_risk_per_trade_pct,
            default_lot=settings.default_lot_size,
        )

    # ------------------------------------------------------------------
    def _daily_loss_exceeded(self, settings: SystemSettings) -> bool:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if self._daily_date != today:
            self._daily_date = today
            self._daily_start_equity = state.account.equity or None
            return False
        if not self._daily_start_equity or not state.account.equity:
            return False
        drop_pct = (self._daily_start_equity - state.account.equity) / self._daily_start_equity * 100
        return drop_pct >= settings.max_daily_loss_pct

    # ------------------------------------------------------------------
    # RL: label closed trades with ATR-normalised rewards, then retrain
    # ------------------------------------------------------------------
    async def _update_rl_from_closed_trades(self, settings: SystemSettings):
        current = {p.ticket: {"symbol": p.symbol, "type": p.type,
                              "profit": p.profit, "volume": p.volume,
                              "current_price": p.current_price}
                   for p in state.positions}
        closed = [t for t, info in self._last_positions.items() if t not in current]
        if closed and self._last_positions:
            for ticket in closed:
                info = self._last_positions[ticket]
                sym = info["symbol"]
                # Reward in ATR units so outcomes are comparable across symbols
                df, src = await asyncio.to_thread(
                    feed.get_ohlcv, sym, settings.primary_timeframe)
                atr_val = 1.0
                try:
                    from analytics import ind_trend as trend
                    atr_val = float(trend.atr(df).iloc[-1])
                except Exception:
                    pass
                # ATR-normalised reward; volume scaling applied inside label()
                reward = float(info["profit"]) / max(abs(atr_val) * 100_000, 1e-9)
                reward = max(-3.0, min(3.0, reward))
                labelled = rl_agent.label(sym, reward, volume=info.get("volume", 1.0))
                if labelled:
                    state.add_log(
                        f"🧠 RL labelled {sym} trade #{ticket}: reward {reward:+.2f} ATR")
                # Resolve any shadow-deployment candidate predictions against
                # this same real outcome, so the scoreboard has evidence
                # before a candidate model is ever promoted to production.
                try:
                    from .shadow_deployment import shadow_deployment
                    shadow_deployment.resolve(sym, reward)
                except Exception:
                    pass
                # Persist the closed trade to the `trades` table so the
                # dashboard's P&L/win-rate/profit-factor/drawdown summary
                # (db.trade_stats / db.pnl_since / db.equity_drawdown) has
                # real history instead of always reading an empty table.
                # Only closes a row previously opened via db.insert_trade();
                # a no-op UPDATE if this ticket was never recorded as open
                # (e.g. a trade opened before this feature existed).
                try:
                    from .database import db
                    await asyncio.to_thread(
                        db.close_trade, ticket,
                        exit_price=float(info.get("current_price", 0.0)),
                        profit=float(info["profit"]), profit_atr=reward)
                except Exception as exc:
                    log.debug("close_trade persist skipped for #%s: %s", ticket, exc)
        self._last_positions = current

        # Retrain periodically once enough outcomes exist
        self._rl_train_counter += 1
        if self._rl_train_counter % 5 == 0:
            result = await asyncio.to_thread(rl_agent.train)
            if result.get("trained"):
                state.add_log(
                    f"🧠 RL policy retrained on {result['samples']} outcomes "
                    f"(accuracy {result.get('accuracy', 0):.0%})")
                try:
                    from .model_registry import registry
                    registry.record("RLAgent", samples=result["samples"],
                                     train_accuracy=result.get("accuracy"), notes="scheduled retrain")
                except Exception:
                    pass

            # Neural net trains on the same replay buffer, less frequently
            # (deeper model, more expensive per-epoch, benefits from more
            # accumulated experience between retrains).
            if self._rl_train_counter % 15 == 0:
                nn_result = await asyncio.to_thread(neural_agent.train)
                if nn_result.get("trained"):
                    state.add_log(
                        f"🧬 Neural net retrained on {nn_result['samples']} outcomes "
                        f"(val accuracy {nn_result.get('val_accuracy', 0):.0%}, "
                        f"loss {nn_result.get('loss', 0):.3f})")
                    try:
                        from .model_registry import registry
                        registry.record("NeuralAgent", samples=nn_result["samples"],
                                         train_accuracy=nn_result.get("train_accuracy"),
                                         val_accuracy=nn_result.get("val_accuracy"),
                                         loss=nn_result.get("loss"), notes="scheduled retrain")
                    except Exception:
                        pass

            # Deep neural net (3rd, deeper learner) trains least frequently —
            # deepest model, benefits most from accumulated experience, and
            # stays shadow-only in practice until its scoreboard earns trust.
            if self._rl_train_counter % 25 == 0:
                from analytics.deep_neural_agent import deep_neural_agent
                deep_result = await asyncio.to_thread(deep_neural_agent.train)
                if deep_result.get("trained"):
                    state.add_log(
                        f"🧠🧬 Deep neural net retrained on {deep_result['samples']} outcomes "
                        f"(val accuracy {deep_result.get('val_accuracy', 0):.0%})")

    # ------------------------------------------------------------------
    async def _gather_frames(self, symbols, settings: SystemSettings):
        """Fetch entry + higher-timeframe frames for every symbol."""
        timeframe = settings.primary_timeframe
        htfs = _MTF_CONTEXT.get(timeframe, ["H4", "D1"])

        if state.mt5_connected and not feed.mt5_available:
            for sym in symbols:
                await bridge.request_candles(sym, timeframe, settings.candle_stream_bars)
                for htf in htfs:
                    await bridge.request_candles(sym, htf, settings.candle_stream_bars)
            await asyncio.sleep(1.5)

        frames: Dict[str, object] = {}
        mtf_frames: Dict[str, Dict[str, object]] = {}
        sources: Dict[str, str] = {}
        for sym in symbols:
            df, src = await asyncio.to_thread(feed.get_ohlcv, sym, timeframe)
            frames[sym] = df
            sources[sym] = src
            ctx = {timeframe: df}
            for htf in htfs:
                htf_df, _ = await asyncio.to_thread(feed.get_ohlcv, sym, htf)
                ctx[htf] = htf_df
            mtf_frames[sym] = ctx
        return frames, mtf_frames, sources

    # ------------------------------------------------------------------
    async def run_cycle(self, settings: SystemSettings) -> dict:
        """One full agentic cycle. Returns a per-symbol decision report."""
        self._cycle += 1
        symbols = settings.active_symbols
        timeframe = settings.primary_timeframe

        # 1. Gather market frames (entry TF + HTF context)
        frames, mtf_frames, sources = await self._gather_frames(symbols, settings)
        # "deriv" counts as real market data for analysis/learning purposes
        # (Deriv's public WS feed gives genuine live prices, no API key
        # needed) but NOT for trade execution eligibility — that stays
        # gated on an actual MT5 connection below (no_mt5_connection),
        # since Deriv is a read-only quote source, not a broker we can
        # route orders through.
        live = any(s in ("mt5", "mt5_bridge", "deriv") for s in sources.values())

        # 2. Refresh correlation matrix
        await asyncio.to_thread(self.correlation_agent.update_market_data, frames)

        # 3. RL: label finished trades + periodic retrain
        if live:
            try:
                await self._update_rl_from_closed_trades(settings)
            except Exception as exc:
                log.debug("RL update skipped: %s", exc)

        # 4. Guardrails
        report = {"cycle": self._cycle, "live_data": live, "sources": dict(sources),
                  "decisions": [], "trades_placed": 0, "blocked": []}

        if self._daily_loss_exceeded(settings):
            state.add_log("⛔ Daily loss limit reached — auto-trading halted for today")
            report["blocked"].append({"reason": "daily_loss_limit"})
            # Kill switch: flatten everything immediately via the direct API
            if executor.available and settings.allow_live_trading:
                closed_n = await asyncio.to_thread(executor.close_all, "daily_loss_limit")
                if closed_n:
                    state.add_log(f"🚨 KILL SWITCH closed {closed_n} positions")
            elif state.mt5_connected and settings.allow_live_trading:
                await bridge.send_command("close_all", {})
            return report

        # Session filter gates only NEW TRADE ENTRIES — analysis still runs
        off_session = not DynamicRiskManager.session_ok()
        if off_session:
            state.add_log("🕘 Off-session window — analysis continues, entries paused")

        # Manage open winners: chandelier trailing stops via the direct API
        if executor.available and settings.allow_live_trading and state.positions:
            await self._trail_open_positions(settings)

        open_count = len(state.positions)

        # 5. Per-symbol multi-agent decision
        for sym in symbols:
            df = frames[sym]
            src = sources[sym]
            if df is None or len(df) < 60:
                continue
            master = self._master_for(sym, settings)
            try:
                decision = await asyncio.to_thread(
                    master.decide, df, mtf_frames.get(sym))
            except Exception as exc:
                state.add_log(f"Agent error on {sym}: {exc}")
                continue

            entry = decision.to_dict()
            entry["data_source"] = src
            report["decisions"].append(entry)

            sig = decision.final_signal
            if sig in (AgentSignal.NEUTRAL,) or decision.confidence <= 0:
                continue

            direction = "buy" if sig in (AgentSignal.BUY, AgentSignal.STRONG_BUY) else "sell"
            strength = round(40 + decision.confidence * 58, 1)

            # Learning adjustments only on real market data
            if src in ("mt5", "mt5_bridge", "deriv"):
                try:
                    from strategies.ensemble import review
                    features, votes, adj = review(df.tail(250), direction)
                    strength += adj + neural_adjustment(features)
                    ai_delta, ai_status = gemini_review(sym, direction, votes)
                    strength += ai_delta
                    entry["learning"] = {"ensemble_votes": votes, "gemini": ai_status}
                    remember(Signal(
                        id=str(uuid.uuid4()), symbol=sym,
                        asset_class="forex", direction=direction,
                        strength=max(0, min(98, strength)), timeframe=timeframe,
                        entry=float(df["close"].iloc[-1]), sl=0.0, tp=0.0,
                        reason="auto-cycle", timestamp=datetime.now(timezone.utc).isoformat(),
                    ), features, "market")
                except Exception as exc:
                    log.debug("learning adjustment skipped: %s", exc)

            # 6. Dynamic volatility-adaptive risk plan
            rm = self._risk_manager_for(settings)
            balance = state.account.balance or 0.0
            plan = rm.plan(df, direction, balance, decision.confidence)
            price = float(df["close"].iloc[-1])
            sl, tp = plan.sl_price, plan.tp_price
            digits = 5 if price < 50 else 2

            # Record RL experience for this decision (real data only)
            if src in ("mt5", "mt5_bridge", "deriv"):
                try:
                    rl_features = MasterAgent._rl_features(
                        df, decision.opinions,
                        decision.correlation.get("adjustment", 0.0),
                        decision.weighted_score)
                    rl_agent.record(sym, direction, rl_features)
                except Exception as exc:
                    log.debug("RL record skipped: %s", exc)

            # 7. Emit a signal record into the UI
            reasons = []
            for op in decision.opinions:
                reasons.extend(op.reasons[:2])
            reasons.append(plan.note)
            signal = Signal(
                id=str(uuid.uuid4()), symbol=sym,
                asset_class="forex" if len(sym) == 6 else "indices",
                direction=direction, strength=max(0.0, min(98.0, strength)),
                timeframe=timeframe, entry=round(price, digits),
                sl=sl, tp=tp,
                reason=" | ".join(reasons)[:400] or "Multi-agent consensus",
                timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
                status="active",
            )
            existing = {s.id for s in state.signals if s.status == "active"}
            if signal.id not in existing:
                state.signals.insert(0, signal)
                state.signals = state.signals[:80]
                # Persist to the `signals` table so the signal history
                # survives an app restart (state.signals is in-memory only).
                # insert_signal()/update_signal_status() previously had zero
                # call sites — same dead-write-path bug class as trades/
                # decision_audit. INSERT OR IGNORE on the UNIQUE signal_uid
                # column makes this safe to call even if this exact signal
                # somehow gets emitted twice in one process lifetime.
                try:
                    from .database import db
                    await asyncio.to_thread(db.insert_signal, {
                        "signal_uid": signal.id, "symbol": signal.symbol,
                        "direction": signal.direction, "strength": signal.strength,
                        "timeframe": signal.timeframe, "entry": signal.entry,
                        "sl": signal.sl, "tp": signal.tp, "reason": signal.reason,
                        "asset_class": signal.asset_class, "status": signal.status,
                    })
                except Exception as exc:
                    log.debug("insert_signal persist skipped: %s", exc)

            # 8. Trade execution gate
            profile = RISK_PROFILES.get(settings.risk_mode, RISK_PROFILES[RiskMode.BALANCED])
            block_reason = None
            if src == "demo":
                block_reason = "demo_data"
            elif src == "deriv":
                # Deriv is a real-data READ-only quote feed, not a broker —
                # there is no order-routing path through it. Trading stays
                # blocked on Deriv-sourced symbols; the no_mt5_connection
                # check below would catch this anyway, but this gives a
                # precise, honest reason instead of a generic one.
                block_reason = "deriv_data_no_broker_connection"
            elif src == "deriv_synthetic":
                # Deriv's own synthetic indices (Volatility/Boom-Crash/Step/
                # Jump) are NOT real-world assets — there is no underlying
                # market to actually trade against through a real broker,
                # and no MT5 symbol maps to them. Analysis/learning may
                # still run on them (useful as an always-on practice/data
                # feed), but live order execution is never eligible.
                block_reason = "synthetic_index_no_real_market"
            elif not settings.allow_live_trading:
                block_reason = "live_trading_disabled"
            elif not settings.auto_trade:
                block_reason = "auto_trade_disabled"
            elif decision.confidence < profile["min_confidence"]:
                block_reason = f"low_confidence({decision.confidence:.2f}<{profile['min_confidence']})"
            elif strength < profile["min_strength"]:
                block_reason = f"low_strength({strength:.0f}<{profile['min_strength']})"
            elif off_session:
                block_reason = "off_session"
            elif plan.volatility_regime == "extreme":
                block_reason = "extreme_volatility"
            elif open_count >= settings.max_open_trades:
                block_reason = "max_open_trades"
            elif any(p.symbol == sym for p in state.positions):
                block_reason = "already_in_position"
            elif not state.mt5_connected and not feed.mt5_available:
                block_reason = "no_mt5_connection"

            if block_reason:
                report["blocked"].append({"symbol": sym, "reason": block_reason})
                continue

            volume = min(plan.volume,
                         settings.default_lot_size * 10 * profile["lot_cap"])
            volume = round(max(settings.default_lot_size, volume), 2)

            # Route via the direct MT5 API when available (preferred: measures
            # slippage + latency), else fall back to the socket bridge EA.
            if executor.available:
                res = await asyncio.to_thread(
                    executor.market_order, sym, direction, volume, sl, tp, price,
                    f"nexus-c{self._cycle}")
                ok = res.get("ok", False)
                if ok:
                    state.add_log(
                        f"⚡ Direct fill {sym} @ {res['filled_price']:.{digits}f} "
                        f"slip {res['slippage_points']:+.1f}pts {res['latency_ms']:.0f}ms")
                    # Persist the newly-opened trade so the dashboard's
                    # P&L/win-rate/profit-factor/drawdown summary
                    # (db.trade_stats/db.pnl_since/db.equity_drawdown) has
                    # real data to read — previously insert_trade() was
                    # never called anywhere, so `trades` stayed empty and
                    # these dashboard metrics were silently always zero.
                    try:
                        from .database import db
                        await asyncio.to_thread(db.insert_trade, {
                            "ticket": res.get("order", 0), "symbol": sym,
                            "direction": direction, "volume": volume,
                            "entry_price": res.get("filled_price", price),
                            "sl": sl, "tp": tp, "magic": None,
                            "comment": f"nexus-c{self._cycle}",
                            "agent_decision": decision.final_signal.value,
                            "confidence": decision.confidence,
                            "open_time": datetime.now(timezone.utc).isoformat(),
                        })
                    except Exception as exc:
                        log.debug("insert_trade persist skipped: %s", exc)
                else:
                    state.add_log(f"Direct order failed: {res.get('error')}")
            else:
                ok = await bridge.send_command("open_trade", {
                    "symbol": sym, "direction": direction, "volume": volume,
                    "sl": sl, "tp": tp, "signal_id": signal.id,
                })
                # Bridge path: the EA doesn't return a ticket synchronously,
                # so we can't insert_trade() here with a real ticket. The
                # trade still gets recorded once it appears in state.positions
                # and is later closed (see _update_rl_from_closed_trades) —
                # NOTE: this means bridge-only (EA) deployments still miss
                # the OPEN-side row (entry_price/open_time) for trades opened
                # while the app wasn't the one tracking them; only the
                # direct-API path records the open row today. Flagged as a
                # remaining gap, not silently fixed, since a proper fix needs
                # the EA's order_result ticket wired back through the bridge
                # protocol (out of scope for this pass).
                pass
            if ok:
                open_count += 1
                signal.status = "taken"
                try:
                    from .database import db
                    await asyncio.to_thread(db.update_signal_status, signal.id, "taken")
                except Exception as exc:
                    log.debug("update_signal_status persist skipped: %s", exc)
                report["trades_placed"] += 1
                state.add_log(
                    f"🤖 AUTO-TRADE {direction.upper()} {volume} {sym} @ {price:.{digits}f} "
                    f"SL {sl} TP {tp} ({plan.volatility_regime} vol, "
                    f"conf {decision.confidence:.0%}, strength {strength:.0f})")
            else:
                report["blocked"].append({"symbol": sym, "reason": "order_send_failed"})

        state.last_update = datetime.now(timezone.utc).isoformat()
        return report

    # ------------------------------------------------------------------
    async def _trail_open_positions(self, settings: SystemSettings):
        """Chandelier-trail the stops of open winning positions."""
        rm = self._risk_manager_for(settings)
        for pos in state.positions:
            if pos.profit <= 0:
                continue                      # only trail winners
            df, src = await asyncio.to_thread(
                feed.get_ohlcv, pos.symbol, settings.primary_timeframe)
            if df is None or len(df) < 30:
                continue
            new_sl = rm.chandelier_trailing_stop(df, pos.type)
            if new_sl is None:
                continue
            # Only move the stop in the trade's favour
            improves = (pos.type == "buy" and new_sl > pos.sl) or \
                       (pos.type == "sell" and (pos.sl == 0 or new_sl < pos.sl))
            if improves:
                ok = await asyncio.to_thread(
                    executor.modify_trailing_stop, pos.ticket, new_sl)
                if ok:
                    state.add_log(
                        f"📈 Trailed stop #{pos.ticket} {pos.symbol} → {new_sl:.5f}")


# Singleton driven by the app's background loop
auto_trader = AutoTrader()
