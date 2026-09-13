"""SMF (Standard MIDI File) writer + cinematic/amapiano composers (Python port)."""
import struct

def _vlq(v):
    b = [v & 0x7F]; v >>= 7
    while v: b.insert(0, (v & 0x7F) | 0x80); v >>= 7
    return bytes(b)

def encode_midi(bpm, tracks):
    """tracks: list of {channel, program, name, notes:[(start_beat, dur_beats, note, vel)]}"""
    tpq = 480
    def track_chunk(t):
        evs = []
        for (sb, d, note, vel) in t["notes"]:
            st, en = int(sb * tpq), int((sb + d) * tpq)
            evs.append((st, 0x90 | t["channel"], note, vel)); evs.append((en, 0x80 | t["channel"], note, 0))
        evs.append((0, 0xC0 | t["channel"], t.get("program", 0), None))
        evs.sort(key=lambda e: (e[0], 0 if e[1] & 0xF0 == 0x80 else 1))
        data, last = b"", 0
        for tick, status, a, b2 in evs:
            data += _vlq(tick - last) + bytes([status, a]) + (bytes([b2]) if b2 is not None else b"")
            last = tick
        data += b"\x00\xff\x2f\x00"
        return b"MTrk" + struct.pack(">I", len(data)) + data
    tempo = int(60_000_000 / bpm)
    t0 = b"\x00\xff\x51\x03" + tempo.to_bytes(3, "big") + b"\x00\xff\x2f\x00"
    chunks = [b"MTrk" + struct.pack(">I", len(t0)) + t0] + [track_chunk(t) for t in tracks]
    return b"MThd" + struct.pack(">IHHH", 6, 1, len(chunks), tpq) + b"".join(chunks)

MOODS = {
  "cinematic": {"bpm": 96, "prog": [[0,3,7],[ -4,0,4],[-2,2,5],[-7,-3,0]], "key": 50},
  "emotional": {"bpm": 72, "prog": [[0,4,7],[5,9,12],[7,11,14],[2,5,9]], "key": 48},
  "epic": {"bpm": 110, "prog": [[0,3,7],[0,3,7],[-4,0,4],[-2,2,5]], "key": 50},
}
def compose(mood="cinematic", bars=32):
    m = MOODS.get(mood, MOODS["cinematic"]); bpm, root = m["bpm"], m["key"]
    pad, bass, arp, mel = [], [], [], []
    for bar in range(bars):
        b0 = bar * 4; chord = [root + 12 + iv for iv in m["prog"][(bar // 2) % len(m["prog"])]]
        for n in chord: pad.append((b0, 4, n, 56))
        bass.append((b0, 4, (chord[0] % 12) + 36, 64))
        for step in range(8): arp.append((b0 + step * 0.5, 0.45, chord[step % len(chord)] + 12, 66))
        mel.append((b0, 2, chord[-1] + 12, 70)); mel.append((b0 + 2.5, 1.5, chord[1] + 12, 66))
    tracks = [
      {"channel":0,"program":0,"name":"Piano","notes":arp},
      {"channel":1,"program":48,"name":"Strings","notes":pad},
      {"channel":2,"program":33,"name":"Bass","notes":bass},
      {"channel":3,"program":73,"name":"Melody","notes":mel},
    ]
    return encode_midi(bpm, tracks)
