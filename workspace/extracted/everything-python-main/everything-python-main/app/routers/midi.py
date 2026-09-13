import base64, time
from fastapi import APIRouter
from pydantic import BaseModel
from .. import midi, db
router = APIRouter()

class MidiIn(BaseModel):
    mood: str = "cinematic"
    bars: int = 32

@router.post("/midi")
async def build_midi(body: MidiIn):
    data = midi.compose(body.mood, max(8, min(128, body.bars)))
    db.log_event("midi.built", {"mood": body.mood, "bars": body.bars, "bytes": len(data)})
    return {"ok": True, "name": f"{body.mood}-{int(time.time())}.mid",
            "mimeType": "audio/midi", "base64": base64.b64encode(data).decode()}


class AmapianoIn(BaseModel):
    bars: int = 32
    bpm: int = 113

@router.post("/midi/amapiano")
async def amapiano(body: AmapianoIn):
    from .. import amapiano as am
    zip_bytes, _mix = am.compose(bars=max(16, min(64, body.bars)), bpm=max(108, min(120, body.bpm)))
    db.log_event("midi.amapiano", {"bars": body.bars, "bytes": len(zip_bytes)})
    return {"ok": True, "name": "amapiano_stems.zip", "mimeType": "application/zip",
            "base64": base64.b64encode(zip_bytes).decode()}
