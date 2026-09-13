// MIDI Tools — Parse, export, and transform MIDI data.
// Pure TypeScript, no external dependencies. Works in browser, Electron, and Capacitor.

export interface MidiNote {
  note: number;
  velocity: number;
  startTick: number;
  duration: number;
  channel: number;
}

export interface MidiTrack {
  name: string;
  notes: MidiNote[];
  instrument: number;
  channel: number;
}

export interface MidiFile {
  tracks: MidiTrack[];
  ticksPerQuarter: number;
  tempo: number;
  duration: number;
}

// 1. Parse MIDI file from ArrayBuffer
export function parseMidi(buffer: ArrayBuffer): MidiFile {
  const data = new Uint8Array(buffer);
  let offset = 0;

  const readUint32 = () => {
    const val =
      (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
    offset += 4;
    return val >>> 0;
  };

  const readUint16 = () => {
    const val = (data[offset] << 8) | data[offset + 1];
    offset += 2;
    return val >>> 0;
  };

  const readVarLen = () => {
    let value = 0;
    while (true) {
      const byte = data[offset++];
      value = (value << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) break;
    }
    return value;
  };

  // Header chunk
  const headerType = readUint32();
  const headerLen = readUint32();
  const format = readUint16();
  const numTracks = readUint16();
  const ticksPerQuarter = readUint16();

  const tracks: MidiTrack[] = [];
  const trackTempos: number[] = [];

  for (let t = 0; t < numTracks && offset < data.length; t++) {
    const trackType = readUint32();
    const trackLen = readUint32();
    const trackEnd = offset + trackLen;

    const notes: MidiNote[] = [];
    let tick = 0;
    let tempo = 500000;
    const activeNotes = new Map<number, { startTick: number; velocity: number; channel: number }>();
    let trackName = `Track ${t + 1}`;
    let instrument = 0;
    let channel = 0;
    // Running status: last non-sysex, non-meta command byte is reused for
    // subsequent data bytes that arrive without their own status byte
    let runningStatus = -1;

    while (offset < trackEnd) {
      const deltaTime = readVarLen();
      tick += deltaTime;

      let status = data[offset];
      if (status < 0x80) {
        // Data byte without a status byte → reuse running status
        if (runningStatus < 0) break; // malformed stream
        status = runningStatus;
      } else {
        offset++;
        if (status < 0xf0) {
          runningStatus = status; // system messages cancel running status
        } else {
          runningStatus = -1;
        }
      }

      const eventType = status & 0xf0;
      channel = status & 0x0f;

      if (eventType === 0x80 || eventType === 0x90) {
        const note = data[offset++];
        const velocity = data[offset++];
        if (eventType === 0x90 && velocity > 0) {
          activeNotes.set(note, { startTick: tick, velocity, channel });
        } else {
          const active = activeNotes.get(note);
          if (active) {
            notes.push({
              note,
              velocity: active.velocity,
              startTick: active.startTick,
              duration: tick - active.startTick,
              channel: active.channel,
            });
            activeNotes.delete(note);
          }
        }
      } else if (eventType === 0xa0) {
        offset += 2; // Poly key pressure: note + pressure
      } else if (eventType === 0xd0) {
        offset += 1; // Channel pressure: pressure only
      } else if (eventType === 0xb0) {
        offset += 2; // Control change
      } else if (eventType === 0xc0) {
        instrument = data[offset++];
      } else if (eventType === 0xe0) {
        offset += 2; // Pitch bend
      } else if (status === 0xff) {
        const metaType = data[offset++];
        const len = readVarLen();
        if (metaType === 0x03) {
          trackName = new TextDecoder().decode(data.slice(offset, offset + len));
        } else if (metaType === 0x51 && len >= 3) {
          tempo = (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
        }
        offset += len;
      } else if (status === 0xf0 || status === 0xf7) {
        // System exclusive: skip the variable-length payload
        const len = readVarLen();
        offset += len;
      } else if (status >= 0xf1 && status <= 0xfe) {
        // Other system real-time/common messages carry no data here
        offset += 0;
      } else {
        offset += 1;
      }
    }

    tracks.push({ name: trackName, notes, instrument, channel });
    // Remember the last tempo seen across tracks (later tracks win)
    trackTempos.push(tempo);
  }

  const tempo = trackTempos.length > 0 ? trackTempos[trackTempos.length - 1] : 500000;
  const duration =
    Math.max(
      ...tracks.map((t) => Math.max(...t.notes.map((n) => n.startTick + n.duration), 0)),
      0,
    ) || 0;

  return { tracks, ticksPerQuarter, tempo, duration };
}

// 2. Export MIDI file
export function exportMidi(midi: MidiFile): ArrayBuffer {
  const chunks: number[] = [];

  // Header chunk
  chunks.push(0x4d, 0x54, 0x68, 0x64); // "MThd"
  chunks.push(0, 0, 0, 6); // length
  chunks.push(0, 0); // format 0
  chunks.push(0, midi.tracks.length); // num tracks
  chunks.push((midi.ticksPerQuarter >> 8) & 0xff, midi.ticksPerQuarter & 0xff);

  for (const track of midi.tracks) {
    const trackData: number[] = [];

    const writeVarLen = (value: number) => {
      const bytes: number[] = [];
      let v = value;
      bytes.unshift(v & 0x7f);
      v >>= 7;
      while (v > 0) {
        bytes.unshift((v & 0x7f) | 0x80);
        v >>= 7;
      }
      trackData.push(...bytes);
    };

    // Track name
    trackData.push(0, 0xff, 0x03, track.name.length);
    for (const c of track.name) trackData.push(c.charCodeAt(0));

    // Tempo
    trackData.push(0, 0xff, 0x51, 0x03);
    trackData.push((midi.tempo >> 16) & 0xff, (midi.tempo >> 8) & 0xff, midi.tempo & 0xff);

    // Program change
    trackData.push(0, 0xc0 | (track.channel & 0x0f), track.instrument & 0x7f);

    let prevTick = 0;
    const events: { tick: number; type: "on" | "off"; note: number; velocity: number }[] = [];
    for (const n of track.notes) {
      events.push({ tick: n.startTick, type: "on", note: n.note, velocity: n.velocity });
      events.push({ tick: n.startTick + n.duration, type: "off", note: n.note, velocity: 0 });
    }
    events.sort((a, b) => a.tick - b.tick);

    for (const ev of events) {
      writeVarLen(ev.tick - prevTick);
      prevTick = ev.tick;
      if (ev.type === "on") {
        trackData.push(0x90 | (track.channel & 0x0f), ev.note & 0x7f, ev.velocity & 0x7f);
      } else {
        trackData.push(0x80 | (track.channel & 0x0f), ev.note & 0x7f, 0);
      }
    }

    // End of track
    trackData.push(0, 0xff, 0x2f, 0);

    chunks.push(0x4d, 0x54, 0x72, 0x6b); // "MTrk"
    const len = trackData.length;
    chunks.push((len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff);
    chunks.push(...trackData);
  }

  return new Uint8Array(chunks).buffer;
}

// 3. Transform MIDI — Transpose, quantize, time-stretch
export function transformMidi(
  midi: MidiFile,
  options: { transpose?: number; quantize?: number; timeStretch?: number; velocityScale?: number },
): MidiFile {
  const { transpose = 0, quantize = 0, timeStretch = 1, velocityScale = 1 } = options;

  const transformedTracks = midi.tracks.map((track) => ({
    ...track,
    notes: track.notes.map((n) => ({
      ...n,
      note: Math.max(0, Math.min(127, n.note + transpose)),
      startTick: quantize > 0 ? Math.round(n.startTick / quantize) * quantize : n.startTick,
      duration: Math.round(n.duration * timeStretch),
      velocity: Math.max(0, Math.min(127, Math.round(n.velocity * velocityScale))),
    })),
  }));

  return { ...midi, tracks: transformedTracks };
}

// 4. MIDI to Notes — Extract note names from MIDI numbers
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToNoteName(midi: number): string {
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

export function midiToNoteNames(midi: MidiFile): string[][] {
  return midi.tracks.map((track) => track.notes.map((n) => midiToNoteName(n.note)));
}

// 5. Generate MIDI from note arrays
export function generateMidi(
  tracks: { name: string; notes: number[][]; instrument: number; channel: number }[],
  ticksPerQuarter: number = 480,
  tempo: number = 500000,
): MidiFile {
  const midiTracks: MidiTrack[] = tracks.map((track, ti) => ({
    name: track.name || `Track ${ti + 1}`,
    instrument: track.instrument || 0,
    channel: track.channel || ti,
    notes: track.notes.map((noteArr, i) => ({
      note: noteArr[0],
      velocity: noteArr[1] || 100,
      startTick: i * ticksPerQuarter,
      duration: ticksPerQuarter,
      channel: track.channel || ti,
    })),
  }));

  const duration = Math.max(...midiTracks.map((t) => t.notes.length * ticksPerQuarter));
  return { tracks: midiTracks, ticksPerQuarter, tempo, duration };
}
