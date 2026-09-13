import asyncio, json, time, os

import websockets

TOKEN = os.environ.get("DERIV_TOKEN") or ""
APP_IDS = [(os.environ.get("DERIV_APP_ID") or "1089")]
SYMBOL = "R_50"
AMOUNT = 1.0
DURATION = 3
DUR_UNIT = "t"
MAX_TRADES = 50
OUT = os.environ.get("TRADE_OUT", "/tmp/trades")
os.makedirs(OUT, exist_ok=True)
LOG = os.path.join(OUT, "trades_real.jsonl")


def ema(vals, n):
    k = 2 / (n + 1)
    e = vals[0]
    out = [e]
    for v in vals[1:]:
        e = v * k + e * (1 - k)
        out.append(e)
    return out


async def main():
    ws = None
    currency = None
    loginid = None
    for app_id in APP_IDS:
        try:
            ws = await websockets.connect(
                f"wss://ws.derivws.com/websockets/v3?app_id={app_id}",
                open_timeout=15, ping_interval=20, ping_timeout=20)
            await ws.send(json.dumps({"authorize": TOKEN}))
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=15))
            if msg.get("authorize") and msg["authorize"].get("is_virtual") is True:
                a = msg["authorize"]
                currency = a.get("currency", "USD")
                loginid = a.get("loginid")
                print("CONNECTED app_id=%s loginid=%s currency=%s balance=%s" % (app_id, loginid, currency, a.get("balance")))
                break
            else:
                print("auth msg", app_id, json.dumps(msg)[:200])
                await ws.close(); ws = None
        except Exception as e:
            print("conn fail", app_id, str(e)[:150]); ws = None
    if ws is None:
        print("FATAL_NO_CONNECT")
        return

    trades = []
    attempts = 0
    while len(trades) < MAX_TRADES and attempts < 80:
        attempts += 1
        tid = len(trades) + 1
        try:
            # fresh signal context
            await ws.send(json.dumps({"ticks_history": SYMBOL, "adjust_start_time": 1, "count": 30,
                                      "end": "latest", "granularity": 60, "style": "candles", "req_id": 1000 + attempts}))
            r = json.loads(await asyncio.wait_for(ws.recv(), timeout=15))
            candles = r.get("candles")
            if not candles:
                print("try", attempts, "no candles:", r.get("error", {}).get("message", "?"))
                await asyncio.sleep(1)
                continue
            closes = [c["close"] for c in candles]
            e9 = ema(closes, 9)[-1]
            e21 = ema(closes, 21)[-1]
            direction = "CALL" if e9 >= e21 else "PUT"

            # proposal (retry once)
            pid, price = None, None
            for _ in range(2):
                await ws.send(json.dumps({"proposal": 1, "amount": AMOUNT, "basis": "stake",
                                          "contract_type": direction, "currency": currency,
                                          "duration": DURATION, "duration_unit": DUR_UNIT,
                                          "symbol": SYMBOL, "req_id": 2000 + attempts}))
                p = json.loads(await asyncio.wait_for(ws.recv(), timeout=15))
                if p.get("proposal"):
                    pid = p["proposal"]["id"]; price = p["proposal"]["ask_price"]; break
                await asyncio.sleep(0.4)
            if not pid:
                print("try", attempts, "proposal fail:", p.get("error", {}).get("message", "?"))
                continue

            # buy (retry once)
            buy = None
            for _ in range(2):
                await ws.send(json.dumps({"buy": pid, "price": price, "req_id": 3000 + attempts}))
                b = json.loads(await asyncio.wait_for(ws.recv(), timeout=15))
                if b.get("buy"):
                    buy = b["buy"]; break
                await asyncio.sleep(0.4)
            if not buy:
                print("try", attempts, "buy fail:", b.get("error", {}).get("code"), b.get("error", {}).get("message", "?"))
                continue

            cid = buy["contract_id"]
            buy_price = buy.get("buy_price")
            entry_epoch = buy.get("purchase_time") or int(time.time())
            purchase_time = buy.get("purchase_time")

            # subscribe until sold
            await ws.send(json.dumps({"proposal_open_contract": 1, "contract_id": cid,
                                      "subscribe": 1, "req_id": 4000 + attempts}))
            profit, sell_price, exit_epoch, status = None, None, None, "open"
            t0 = time.time()
            while time.time() - t0 < 30:
                try:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=32))
                except Exception:
                    break
                poc = m.get("proposal_open_contract")
                if not poc:
                    continue
                if poc.get("status") == "sold":
                    profit = poc.get("profit")
                    sell_price = poc.get("sell_price")
                    exit_epoch = poc.get("exit_tick_time") or int(time.time())
                    status = "sold"
                    break
            if status != "sold":
                try:
                    await ws.send(json.dumps({"sell": cid, "price": 0, "req_id": 5000 + attempts}))
                    s = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                    if s.get("sell"):
                        profit = s["sell"].get("profit"); sell_price = s["sell"].get("sell_price")
                        status = "sold_via_sell"
                except Exception:
                    pass
                if status != "sold_via_sell":
                    status = "timeout"
                exit_epoch = int(time.time())

            rec = {"trade_id": tid, "direction": direction, "contract_id": str(cid),
                   "amount": AMOUNT, "buy_price": buy_price, "sell_price": sell_price,
                   "profit": profit, "entry_epoch": entry_epoch, "exit_epoch": exit_epoch,
                   "purchase_time": purchase_time, "status": status,
                   "ema9": round(e9, 6), "ema21": round(e21, 6)}
            trades.append(rec)
            print("TRADE_REC " + json.dumps(rec))
            with open(LOG, "a") as f:
                f.write(json.dumps(rec) + "\n")
            await asyncio.sleep(0.25)
        except Exception as e:
            print("loop err", attempts, str(e)[:150])
            await asyncio.sleep(1)

    sold = [t for t in trades if t["status"] in ("sold", "sold_via_sell")]
    wins = [t for t in sold if (t.get("profit") or 0) > 0]
    print("FINAL_SUMMARY trades=%d sold=%d wins=%d total_profit=%s" % (
        len(trades), len(sold), len(wins),
        round(sum((t.get("profit") or 0) for t in sold), 4)))
    meta = {"symbol": SYMBOL, "duration": DURATION, "duration_unit": DUR_UNIT,
            "amount": AMOUNT, "currency": currency, "loginid": loginid,
            "endpoint": "wss://ws.derivws.com/websockets/v3", "app_id_used": "see per-connect log",
            "is_virtual": True, "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    with open(os.path.join(OUT, "trades_real.json"), "w") as f:
        json.dump({"meta": meta, "trades": trades}, f, indent=1)


asyncio.get_event_loop().run_until_complete(main())
