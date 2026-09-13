// WAV writer with embedded smpl (sample) chunk containing loop points.
// Produces 16-bit PCM WAV that DAWs recognize as a looped sample.

export function writeWavWithLoop(
  buffer: AudioBuffer,
  loopStart: number,
  loopEnd: number,
  loopType: 0 | 1 | 2 = 0, // 0=forward, 1=ping-pong, 2=reverse
): ArrayBuffer {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const dataBytes = buffer.length * numCh * 2;
  const smplBytes = 36 + 24; // smpl header (36) + 1 loop (24)
  const total = 12 /*RIFF*/ + 24 /*fmt*/ + 8 + smplBytes + 8 + dataBytes;
  const ab = new ArrayBuffer(total);
  const v = new DataView(ab);
  let p = 0;
  const str = (s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(p++, s.charCodeAt(i));
  };
  const u32 = (n: number) => {
    v.setUint32(p, n, true);
    p += 4;
  };
  const u16 = (n: number) => {
    v.setUint16(p, n, true);
    p += 2;
  };

  // RIFF
  str("RIFF");
  u32(total - 8);
  str("WAVE");
  // fmt
  str("fmt ");
  u32(16);
  u16(1);
  u16(numCh);
  u32(sr);
  u32(sr * numCh * 2);
  u16(numCh * 2);
  u16(16);
  // smpl
  str("smpl");
  u32(smplBytes);
  u32(0); // manufacturer
  u32(0); // product
  u32(Math.round(1e9 / sr)); // sample period (ns)
  u32(60); // MIDI unity note (C4)
  u32(0); // MIDI pitch fraction
  u32(0); // SMPTE format
  u32(0); // SMPTE offset
  u32(1); // num sample loops
  u32(0); // sampler data
  // loop record
  u32(0); // cue point id
  u32(loopType); // type
  u32(loopStart); // start (samples)
  u32(loopEnd); // end (samples)
  u32(0); // fraction
  u32(0); // play count (0=infinite)
  // data
  str("data");
  u32(dataBytes);
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      p += 2;
    }
  }
  return ab;
}

export function downloadWav(buffer: ArrayBuffer, name: string) {
  const blob = new Blob([buffer], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
