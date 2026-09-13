"""
Colab bootstrap for EVERYTHING-Python.

Usage in a notebook cell:
    %run colab_setup.py            # install deps + load secrets + start server
or:
    import colab_setup; colab_setup.setup()
"""
import os, sys, subprocess, threading, time

def install():
    """Colab already has most wheels; only the app's own pins + Colab extras are needed."""
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q",
                           "-r", "requirements.txt", "-r", "requirements-colab.txt"])

def load_secrets():
    """Pull config from Colab userdata (Secrets panel) with env-var fallback."""
    try:
        from google.colab import userdata  # type: ignore
        for key in ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "SESSION_SECRET",
                    "ENCRYPTION_KEY", "APP_PASSWORD", "PROVIDER_FLEET_JSON",
                    "INFRA_FLEET_JSON", "NGROK_AUTHTOKEN"]:
            try:
                v = userdata.get(key)
                if v: os.environ.setdefault(key, v)
            except Exception: pass
    except Exception:
        pass  # not on Colab -> rely on real env vars

def _wait_ready(port, timeout=45):
    """Block until the server actually answers (or report failure honestly).
    Prevents the old false-positive '✅ running' banner when uvicorn crashed."""
    import httpx
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            r = httpx.get(f"http://127.0.0.1:{port}/api/health", timeout=3)
            if r.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(1)
    return False

def start(port=8000, public=True):
    import nest_asyncio; nest_asyncio.apply()
    import uvicorn
    from app.main import app
    def run():
        # loop="asyncio" is REQUIRED on Colab: uvicorn[standard] installs uvloop,
        # and nest_asyncio cannot patch uvloop loops ("Can't patch loop of type
        # uvloop.Loop") which silently killed the server and left ngrok pointing
        # at a dead port (ConnectError: Connection refused).
        uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning", loop="asyncio")
    threading.Thread(target=run, daemon=True).start()
    if not _wait_ready(port):
        print("\n❌ Server did NOT come up on port", port,
              "— scroll up for the real traceback before trusting any URL below.")
    url = f"http://127.0.0.1:{port}"
    if public:
        try:
            from pyngrok import ngrok
            tok = os.environ.get("NGROK_AUTHTOKEN")
            if tok: ngrok.set_auth_token(tok)
            url = ngrok.connect(port).public_url
        except Exception as e:
            print("ngrok unavailable:", e)
    print("\n✅ EVERYTHING (Python) running")
    print("   Local :", f"http://127.0.0.1:{port}")
    print("   Public:", url)
    print("   Docs  :", url + "/docs")
    print("   App UI:", url + "/")
    print("   CLI   : run `%run cli.py` in a cell for the terminal interface (no GUI needed)")
    return url

def setup():
    install(); load_secrets(); return start()
