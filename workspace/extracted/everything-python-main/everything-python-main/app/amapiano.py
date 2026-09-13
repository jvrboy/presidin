"""Amapiano stems composer + ZIP packaging (Python port, trained on the stem pack)."""
import io, zipfile
from .midi import encode_midi

LOG_PATTERN = [(0.0,0.5,0.9),(0.75,0.25,0.7),(1.5,0.5,1.0),(2.0,0.25,0.85),(2.75,0.25,0.65),(3.0,0.5,0.9),(3.5,0.25,0.7)]
CHORDS = [[0,3,7,10],[-4,0,4,7],[-9,-5,-2,2],[-2,2,5,8]]  # i m7 / VI / III / VII

def compose(key_root=57, bars=32, bpm=113):
    log, keys, shaker, perc, pads, mel = [], [], [], [], [], []
    for bar in range(bars):
        b0 = bar*4; chord = [key_root+iv for iv in CHORDS[(bar//2) % len(CHORDS)]]
        low = (key_root % 12) + 33; colour = (key_root % 12) + 34
        for off, dur, v in LOG_PATTERN:
            log.append((b0+off, dur, colour if abs(off-1.5)<0.01 or abs(off-3)<0.01 else low, int(88*v)))
        if bar % 2 == 0:
            for n in chord: keys.append((b0, 8, n+12, 64))
        for st in range(16):
            shaker.append((b0 + st*0.25, 0.12, 70, 70 if st % 4 == 2 else 45))
        if bar % 2 == 1: perc.append((b0+0.75, 0.05, 60, 72))
        if bar % 4 == 0:
            pads.append((b0, 12, chord[0]+24, 48)); pads.append((b0, 12, chord[2]+24, 44))
        if bar % 2 == 0:
            pent = [0,3,5,7,10]
            mel.append((b0, 0.5, key_root+24+pent[bar % 5], 66))
            mel.append((b0+2, 0.5, key_root+24+pent[(bar+2) % 5], 62))
    stems = {
      "01_log_drum": log, "02_rhodes_keys": keys, "03_shaker": shaker,
      "04_percussion": perc, "05_pads": pads, "06_melody": mel,
    }
    programs = {"01_log_drum":0,"02_rhodes_keys":4,"03_shaker":0,"04_percussion":0,"05_pads":89,"06_melody":80}
    channels = {"03_shaker":9,"04_percussion":9}
    files = {}
    combined = []
    for name, notes in stems.items():
        ch = channels.get(name, list(stems.keys()).index(name))
        tr = {"channel": ch, "program": programs[name], "name": name, "notes": notes}
        files[f"{name}.mid"] = encode_midi(bpm, [tr])
        combined.append(tr)
    files["00_full_mix.mid"] = encode_midi(bpm, combined)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for fn, data in files.items(): z.writestr(f"amapiano/{fn}", data)
    return buf.getvalue(), files["00_full_mix.mid"]
