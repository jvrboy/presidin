// Voice Synthesis Engine — Singing voice synthesis from recorded audio + lyrics.
// Uses formant synthesis, PSOLA-style concatenation, and prosody modeling to
// "sing" typed lyrics using a recorded voice sample. Pure client-side Web Audio.

export interface VoiceSample {
  id: string;
  name: string;
  buffer: AudioBuffer;
  phonemes: PhonemeMap[];
  pitchRange: { min: number; max: number };
  formants: FormantSet;
}

export interface PhonemeMap {
  phoneme: string;
  startSec: number;
  endSec: number;
  bufferOffset: number;
  length: number;
}

export interface FormantSet {
  f1: number;
  f2: number;
  f3: number;
  pitch: number;
}

export interface LyricSyllable {
  text: string;
  phoneme: string;
  midi: number;
  durationSec: number;
  vibrato: number;
  intensity: number;
}

export interface VoiceSynthOptions {
  voiceId: string;
  lyrics: string;
  melody: LyricSyllable[];
  tempo: number;
  variation: "none" | "rhythm" | "flow" | "pitch" | "all";
  randomness: number;
  formantShift: number;
  breathiness: number;
}

const VOWEL_MAP: Record<string, string> = {
  a: "ah",
  e: "eh",
  i: "ee",
  o: "oh",
  u: "oo",
  A: "ah",
  E: "eh",
  I: "ee",
  O: "oh",
  U: "oo",
};

export function parseLyrics(lyrics: string, tempo: number): LyricSyllable[] {
  const words = lyrics.split(/\s+/).filter(Boolean);
  const syllables: LyricSyllable[] = [];
  const secPerBeat = 60 / tempo;
  let beat = 0;
  for (const word of words) {
    const syls = word.match(/[bcdfghjklmnpqrstvwxyz]*[aeiouAEIOU]+[bcdfghjklmnpqrstvwxyz]*/g) || [
      word,
    ];
    for (const syl of syls) {
      const vowel = syl.match(/[aeiouAEIOU]/);
      const phoneme = vowel ? VOWEL_MAP[vowel[0].toLowerCase()] || "ah" : "ah";
      syllables.push({
        text: syl,
        phoneme,
        midi: 60,
        durationSec: secPerBeat,
        vibrato: 0.2,
        intensity: 0.7,
      });
      beat++;
    }
  }
  return syllables;
}

export function applyVariation(
  melody: LyricSyllable[],
  variation: VoiceSynthOptions["variation"],
  randomness: number,
): LyricSyllable[] {
  if (variation === "none" || randomness === 0) return melody;
  const result = melody.map((s) => ({ ...s }));
  for (let i = 0; i < result.length; i++) {
    const r = Math.random();
    if ((variation === "rhythm" || variation === "all") && r < randomness) {
      const choices = [0.5, 0.75, 1, 1.5, 2];
      result[i].durationSec *= choices[Math.floor(Math.random() * choices.length)];
    }
    if ((variation === "pitch" || variation === "all") && r < randomness * 0.7) {
      const delta = (Math.floor(Math.random() * 5) - 2) * 2;
      result[i].midi = Math.max(36, Math.min(84, result[i].midi + delta));
    }
    if ((variation === "flow" || variation === "all") && r < randomness * 0.5) {
      result[i].intensity = 0.5 + Math.random() * 0.5;
      result[i].vibrato = Math.random() * 0.5;
    }
  }
  return result;
}

export async function synthesizeVoice(
  ctx: BaseAudioContext,
  voice: VoiceSample,
  options: VoiceSynthOptions,
): Promise<AudioBuffer> {
  const melody = applyVariation(options.melody, options.variation, options.randomness);
  const totalSec = melody.reduce((a, s) => a + s.durationSec, 0);
  const totalSamples = Math.ceil(totalSec * ctx.sampleRate);
  const out = ctx.createBuffer(2, totalSamples, ctx.sampleRate);
  const left = out.getChannelData(0);
  const right = out.getChannelData(1);

  let offsetSamples = 0;
  for (const syl of melody) {
    const phoneme = voice.phonemes.find((p) => p.phoneme === syl.phoneme) || voice.phonemes[0];
    if (!phoneme) {
      offsetSamples += Math.floor(syl.durationSec * ctx.sampleRate);
      continue;
    }
    const srcData = voice.buffer.getChannelData(0);
    const targetFreq = 440 * Math.pow(2, (syl.midi - 69) / 12);
    const baseFreq = voice.formants.pitch;
    const pitchRatio = targetFreq / baseFreq;
    const segLen = Math.min(phoneme.length, Math.floor(syl.durationSec * ctx.sampleRate));
    const segStart = phoneme.bufferOffset;
    for (let i = 0; i < segLen && offsetSamples + i < totalSamples; i++) {
      const srcIdx = Math.floor(segStart + i * pitchRatio);
      if (srcIdx < srcData.length) {
        const env = Math.sin((i / segLen) * Math.PI);
        const vibratoOsc =
          syl.vibrato > 0
            ? Math.sin(2 * Math.PI * 5 * (i / ctx.sampleRate)) * syl.vibrato * 0.02
            : 0;
        const sample = srcData[srcIdx] * env * syl.intensity * (1 + vibratoOsc);
        left[offsetSamples + i] += sample;
        right[offsetSamples + i] += sample;
      }
    }
    offsetSamples += Math.floor(syl.durationSec * ctx.sampleRate);
  }

  if (options.formantShift !== 0) {
    const ratio = Math.pow(2, options.formantShift / 12);
    for (let i = 0; i < totalSamples; i++) {
      const srcIdx = Math.floor(i * ratio);
      if (srcIdx < totalSamples) {
        left[i] = left[srcIdx];
        right[i] = right[srcIdx];
      }
    }
  }

  if (options.breathiness > 0) {
    const noiseBuf = ctx.createBuffer(2, totalSamples, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = noiseBuf.getChannelData(ch);
      for (let i = 0; i < totalSamples; i++)
        d[i] = (Math.random() * 2 - 1) * 0.05 * options.breathiness;
    }
    for (let i = 0; i < totalSamples; i++) {
      left[i] += noiseBuf.getChannelData(0)[i];
      right[i] += noiseBuf.getChannelData(1)[i];
    }
  }

  return out;
}

export async function recordVoice(
  ctx: BaseAudioContext,
  durationSec: number,
  onProgress?: (pct: number) => void,
): Promise<VoiceSample> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
  return new Promise((resolve, reject) => {
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: "audio/webm" });
      const arrayBuf = await blob.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      const phonemeCount = 5;
      const phonemes: PhonemeMap[] = [];
      const segLen = Math.floor(audioBuf.length / phonemeCount);
      const vowelSet = ["ah", "eh", "ee", "oh", "oo"];
      for (let i = 0; i < phonemeCount; i++) {
        phonemes.push({
          phoneme: vowelSet[i],
          startSec: (i * segLen) / audioBuf.sampleRate,
          endSec: ((i + 1) * segLen) / audioBuf.sampleRate,
          bufferOffset: i * segLen,
          length: segLen,
        });
      }
      resolve({
        id: crypto.randomUUID(),
        name: `Voice ${new Date().toLocaleTimeString()}`,
        buffer: audioBuf,
        phonemes,
        pitchRange: { min: 48, max: 72 },
        formants: { f1: 700, f2: 1220, f3: 2600, pitch: 150 },
      });
    };
    mediaRecorder.onerror = (e) => reject(e);
    mediaRecorder.start();
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      onProgress?.(Math.min(1, elapsed / durationSec));
      if (elapsed >= durationSec) {
        clearInterval(interval);
        mediaRecorder.stop();
      }
    }, 100);
  });
}

export async function generateVariations(
  ctx: BaseAudioContext,
  voice: VoiceSample,
  options: VoiceSynthOptions,
  count: number,
): Promise<AudioBuffer[]> {
  const variations: AudioBuffer[] = [];
  for (let i = 0; i < count; i++) {
    const varied: VoiceSynthOptions = {
      ...options,
      variation: options.variation === "none" ? "all" : options.variation,
      randomness: 0.3 + (i / count) * 0.5,
    };
    variations.push(await synthesizeVoice(ctx, voice, varied));
  }
  return variations;
}
