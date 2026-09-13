// Audio Recording & Export — captures AudioEngine output and exports as WAV.
// Uses a MediaStreamDestination for real-time recording.

import { AudioEngine } from "./engine";

export class AudioRecorder {
  private dest: MediaStreamAudioDestinationNode | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  recording = false;
  mimeType = "audio/webm";

  init() {
    AudioEngine.init();
    if (!AudioEngine.ctx) return;
    this.dest = AudioEngine.ctx.createMediaStreamDestination();
    AudioEngine.master?.connect(this.dest);
  }

  start() {
    if (!this.dest) this.init();
    if (!this.dest) return;
    this.chunks = [];
    const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
    for (const m of mimeTypes) {
      if (MediaRecorder.isTypeSupported(m)) {
        this.mimeType = m;
        break;
      }
    }
    this.recorder = new MediaRecorder(this.dest!.stream, { mimeType: this.mimeType });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(100);
    this.recording = true;
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      // Guard against double-stop: MediaRecorder throws InvalidStateError
      if (!this.recorder || !this.recording || this.recorder.state === "inactive") {
        resolve(new Blob(this.chunks, { type: this.mimeType }));
        return;
      }
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType });
        this.recording = false;
        resolve(blob);
      };
      this.recorder.stop();
    });
  }

  // ---------- WAV Export ----------
  // Convert an AudioBuffer to a downloadable WAV file
  static audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = buffer.length * blockAlign;
    const bufferSize = 44 + dataSize;
    const ab = new ArrayBuffer(bufferSize);
    const view = new DataView(ab);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    const channels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numChannels; c++) {
        const sample = Math.max(-1, Math.min(1, channels[c][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([ab], { type: "audio/wav" });
  }

  // Download a blob as a file
  static downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Record for a fixed duration and return a WAV blob
  async recordDuration(seconds: number): Promise<Blob> {
    this.start();
    await new Promise((r) => setTimeout(r, seconds * 1000));
    const blob = await this.stop();
    return blob;
  }
}

export const recorder = new AudioRecorder();
