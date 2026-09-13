from app import midi, amapiano

def test_midi_bytes():
    data = midi.compose("cinematic", 16)
    assert data[:4] == b"MThd" and len(data) > 500

def test_amapiano_zip():
    z, mix = amapiano.compose(bars=16)
    assert z[:2] == b"PK" and mix[:4] == b"MThd"
