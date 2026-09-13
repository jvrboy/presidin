@echo off
rem ── Nexus Trade launcher (Windows) ───────────────────────────────────────
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Creating virtual environment...
  where py >nul 2>nul && (py -3.12 -m venv .venv) || (python -m venv .venv)
)

call .venv\Scripts\activate.bat
python -m pip install -q --upgrade pip
python -m pip install -q -r requirements.txt

echo.
echo   ============================================================
echo     NEXUS TRADE  ^|  Analysis ^& Trading Control Center
echo     Open  http://localhost:8000
echo   ============================================================
echo.
python main.py
