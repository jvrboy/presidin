"""
Lightweight TCP socket bridge between Python and the MT5 Expert Advisor.
Protocol: newline-delimited JSON messages.
"""

import asyncio
import json
import logging
from typing import Optional, Callable, Dict, Any
from datetime import datetime

from .state import state, Position, AccountInfo
from .config import BotState
from .mt5_data import feed

logger = logging.getLogger("mt5_bridge")


class MT5Bridge:
    def __init__(self, host: str = "127.0.0.1", port: int = 5555):
        self.host = host
        self.port = port
        self.server: Optional[asyncio.AbstractServer] = None
        self.clients: set = set()
        self._running = False
        self.on_message: Optional[Callable] = None

    async def start(self):
        self._running = True
        self.server = await asyncio.start_server(
            self._handle_client, self.host, self.port
        )
        addr = self.server.sockets[0].getsockname()
        state.add_log(f"MT5 Bridge listening on {addr[0]}:{addr[1]}")
        logger.info(f"MT5 Bridge listening on {addr}")
        asyncio.create_task(self._serve())

    async def _serve(self):
        async with self.server:
            await self.server.serve_forever()

    async def stop(self):
        self._running = False
        for writer in list(self.clients):
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass
        self.clients.clear()
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        state.mt5_connected = False
        state.add_log("MT5 Bridge stopped")

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        addr = writer.get_extra_info("peername")
        state.add_log(f"MT5 EA connected from {addr}")
        state.mt5_connected = True
        self.clients.add(writer)

        try:
            while self._running:
                data = await reader.readline()
                if not data:
                    break
                try:
                    msg = json.loads(data.decode().strip())
                    await self._process_message(msg)
                except json.JSONDecodeError:
                    state.add_log("Received invalid JSON from EA")
                except Exception as e:
                    state.add_log(f"Bridge error: {e}")
        finally:
            self.clients.discard(writer)
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
            if not self.clients:
                state.mt5_connected = False
            state.add_log(f"MT5 EA disconnected ({addr})")

    async def _process_message(self, msg: Dict[str, Any]):
        mtype = msg.get("type")
        if mtype == "heartbeat":
            state.last_update = datetime.utcnow().isoformat()
        elif mtype == "account":
            acc = msg.get("data", {})
            state.account = AccountInfo(
                balance=float(acc.get("balance", 0)),
                equity=float(acc.get("equity", 0)),
                margin=float(acc.get("margin", 0)),
                free_margin=float(acc.get("free_margin", 0)),
                margin_level=float(acc.get("margin_level", 0)),
                profit=float(acc.get("profit", 0)),
                currency=acc.get("currency", "USD"),
                leverage=int(acc.get("leverage", 100)),
                connected=True,
            )
            # equity history
            state.equity_history.append({
                "t": datetime.utcnow().strftime("%H:%M:%S"),
                "equity": state.account.equity,
                "balance": state.account.balance,
            })
            if len(state.equity_history) > 200:
                state.equity_history = state.equity_history[-150:]
        elif mtype == "positions":
            positions = []
            for p in msg.get("data", []):
                positions.append(Position(
                    ticket=int(p.get("ticket", 0)),
                    symbol=p.get("symbol", ""),
                    type=p.get("type", "buy"),
                    volume=float(p.get("volume", 0)),
                    open_price=float(p.get("open_price", 0)),
                    current_price=float(p.get("current_price", 0)),
                    sl=float(p.get("sl", 0)),
                    tp=float(p.get("tp", 0)),
                    profit=float(p.get("profit", 0)),
                    open_time=p.get("open_time", ""),
                ))
            state.positions = positions
        elif mtype == "order_result":
            state.add_log(f"Order result: {msg.get('data')}")
        elif mtype == "candles":
            # EA streamed OHLCV history — feed the real-time data cache
            data = msg.get("data", {})
            feed.receive_bridge_candles(
                data.get("symbol", ""), data.get("timeframe", "H1"),
                data.get("candles", []))
        elif mtype == "log":
            state.add_log(f"EA: {msg.get('message', '')}")

    async def request_candles(self, symbol: str, timeframe: str = "H1", bars: int = 300):
        """Ask the EA to stream candle history for a symbol."""
        return await self.send_command("get_candles", {
            "symbol": symbol, "timeframe": timeframe, "bars": bars})

    async def send(self, payload: dict):
        if not self.clients:
            return False
        data = (json.dumps(payload) + "\n").encode()
        dead = []
        for writer in self.clients:
            try:
                writer.write(data)
                await writer.drain()
            except Exception:
                dead.append(writer)
        for w in dead:
            self.clients.discard(w)
        return True

    async def send_command(self, command: str, params: dict = None):
        payload = {"type": "command", "command": command, "params": params or {}}
        ok = await self.send(payload)
        if ok:
            state.add_log(f"Sent command → {command}")
        else:
            state.add_log(f"Failed to send command (no EA connected): {command}")
        return ok


# Global bridge instance (started by app lifespan)
bridge = MT5Bridge()
