"""Tests for the new backend tool suite (pure/offline tools only)."""
import asyncio
from app import tools


def _run(name, **args):
    return asyncio.run(tools.execute(name, args))


def test_calculator_safe_eval():
    r = _run("calculator", expression="2+2*3")
    assert r["ok"] and r["result"] == 8
    r = _run("calculator", expression="(10%3)")
    assert r["ok"] and r["result"] == 1
    # no eval escapes: letters, dunder, imports all rejected
    for bad in ("__import__('os')", "().__class__", "1 if 2 else 3", "x", ""):
        r = _run("calculator", expression=bad)
        assert not r["ok"]


def test_stats_tool():
    r = _run("stats", numbers=[1, 2, 3, 4, 10])
    assert r["ok"] and r["mean"] == 4 and r["median"] == 3 and r["stdev"] > 0


def test_hash_uuid_password():
    r = _run("hash_text", text="abc", algorithm="sha256")
    assert r["ok"] and r["digest"].startswith("ba7816bf")
    r = _run("uuid_gen", count=3)
    assert r["ok"] and len(r["uuids"]) == 3
    r = _run("password_gen", length=32, symbols=True)
    assert r["ok"] and len(r["password"]) == 32


def test_base64_url_color_datetime():
    assert _run("base64_tool", mode="encode", text="hi")["encoded"] == "aGk="
    assert _run("base64_tool", mode="decode", text="aGk=")["decoded"] == "hi"
    r = _run("url_tool", url="https://example.com:8443/a/b?x=1#frag")
    assert r["ok"] and r["host"] == "example.com" and r["port"] == 8443 and r["query"] == "x=1"
    r = _run("color_tool", color="#ff8800")
    assert r["ok"] and r["rgb"] == [255, 136, 0]
    r = _run("datetime_tool", timezone="UTC")
    assert r["ok"] and "T" in r["iso"]
    assert not _run("datetime_tool", timezone="Mars/Olympus")["ok"]


def test_json_regex_text_tools():
    r = _run("json_tool", raw='{"a": 1}')
    assert r["ok"] and r["info"]["keys"] == ["a"]
    assert not _run("json_tool", raw="{nope")["ok"]
    r = _run("regex_tool", pattern=r"\d+", text="a1b22c")
    assert r["ok"] and r["match_count"] == 2
    r = _run("text_stats", text="Hello world. This is fine.")
    assert r["ok"] and r["sentences"] == 2 and r["words"] == 5


def test_get_logs_shape():
    r = asyncio.run(tools.get_logs(hours=24))
    assert r["ok"] and isinstance(r["activity"], list)


def test_tool_count_and_specs():
    assert len(tools.TOOLS) >= 34
    specs = tools.tool_specs(["calculator", "stats"])
    assert len(specs) == 2 and all(s["type"] == "function" for s in specs)
