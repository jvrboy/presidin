#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if [ ! -d "venv" ]; then
  echo "Creating virtual environment…"
  python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   NEXUS TRADE  —  starting server…       ║"
echo "  ║   Open → http://localhost:8000           ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
python main.py
