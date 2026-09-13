"""
Nexus Trade — Main entry point
Glass-morphism Forex / Multi-asset Analysis & Trading Control Center
"""

import uvicorn
from backend.app import create_app

app = create_app()

if __name__ == "__main__":
    print("=" * 60)
    print("  NEXUS TRADE  |  Analysis & Trading Control Center")
    print("  Open http://localhost:8000")
    print("=" * 60)
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )
