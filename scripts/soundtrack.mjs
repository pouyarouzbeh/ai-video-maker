import { writeFileSync } from "node:fs";
import { timeline } from "./project.mjs";

const rate = 48000;
const tau = 2 * Math.PI;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
let seed = 389051;

function noise() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
}

export function soundtrack(path) {
  seed = 389051;
  const duration = timeline.duration / timeline.fps;
  const samples = Math.round(duration * rate);
  const left = new Float32Array(samples);
  const right = new Float32Array(samples);
  const beat = 60 / timeline.bpm;

  function place(start, length, pan, sample) {
    const offset = Math.round(start * rate);
    const count = Math.min(Math.ceil(length * rate), samples - offset);
    const l = Math.sqrt(0.5 - pan / 2);
    const r = Math.sqrt(0.5 + pan / 2);
    for (let i = 0; i < count; i++) {
      const value = sample(i / rate);
      left[offset + i] += l * value;
      right[offset + i] += r * value;
    }
  }

  const chords = [[45, 57, 60, 64, 71], [41, 57, 60, 65, 69], [48, 55, 60, 64, 69], [43, 55, 59, 62, 69]];
  for (let bar = 0; bar * 4 * beat < duration; bar++) {
    const start = bar * 4 * beat;
    const [bass, ...chord] = chords[bar % chords.length];
    const closing = start >= duration - 3.1;
    chord.forEach((midi, index) => {
      const fundamental = hz(midi);
      place(start, 4.6 * beat, (index - 1.5) / 2.6, (t) => {
        const envelope = Math.min(t * 5, 1) * Math.min((4.6 * beat - t) * 1.8, 1);
        const voice = Math.sin(tau * fundamental * t) + 0.14 * Math.sin(tau * fundamental * t * 2.004);
        return 0.035 * envelope * voice;
      });
    });
    for (let i = 0; i < 4; i++) {
      const pulse = start + i * beat;
      if (!closing || i === 0) {
        place(pulse, 0.25, 0, (t) => {
          const phase = 48 * t + 6.5 * (1 - Math.exp(-36 * t));
          return 0.22 * Math.sin(tau * phase) * Math.exp(-t * 17) * Math.min(t * 350, 1);
        });
      }
      if (!closing && i % 2 === 1) {
        let filtered = 0;
        place(pulse, 0.15, 0.13, (t) => {
          const random = noise();
          filtered += 0.12 * (random - filtered);
          return (random - filtered) * 0.075 * Math.exp(-t * 35) * Math.min(t * 600, 1);
        });
      }
      if (!closing) {
        place(pulse + beat / 2, 0.085, i % 2 ? -0.35 : 0.37, (t) =>
          0.031 * noise() * Math.exp(-t * 68) * Math.min(t * 800, 1));
      }
      const bassHz = hz(i === 3 ? bass + 7 : bass);
      place(pulse + 0.035, beat * 0.86, 0, (t) => {
        const env = Math.min(t * 30, 1) * Math.max(0, 1 - t / (beat * 0.86));
        return (Math.sin(tau * bassHz * t) + 0.13 * Math.sin(tau * 2 * bassHz * t)) * 0.135 * env;
      });
    }
    if (bar % 2 === 0 || closing) {
      const notes = [chord[2] + 12, chord[1] + 12, chord[3]];
      notes.forEach((note, i) => {
        const fundamental = hz(note);
        const begin = start + i * beat * 0.75;
        place(begin, 0.94, [-0.32, 0.32, 0.08][i], (t) =>
          0.059 * Math.min(t * 140, 1) * Math.exp(-t * 6.5) *
          (Math.sin(tau * fundamental * t) + 0.26 * Math.sin(tau * fundamental * 2.005 * t)));
      });
    }
  }

  for (const { frame, sound } of timeline.cues) {
    const when = frame / timeline.fps;
    if (sound === "whoosh") {
      let low = 0;
      place(when, 0.44, -0.25, (t) => {
        const n = noise();
        low += 0.22 * (n - low);
        return (low - n * 0.07) * 0.27 * Math.sin(Math.PI * t / 0.44) ** 1.8;
      });
    } else if (sound === "tap") {
      place(when, 0.095, 0.16, (t) =>
        Math.min(t * 850, 1) * Math.exp(-t * 52) *
        (0.12 * Math.sin(tau * 716 * t) + 0.034 * noise()));
    } else if (sound === "impact") {
      place(when, 0.62, 0, (t) =>
        Math.min(t * 260, 1) * Math.exp(-t * 9) *
        (0.25 * Math.sin(tau * (44 * t + 1.7 * (1 - Math.exp(-14 * t)))) +
          0.021 * Math.sin(tau * 232 * t)));
    }
  }

  const buffer = Buffer.alloc(44 + samples * 4);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 4, 40);
  for (let i = 0; i < samples; i++) {
    const fade = Math.min(1, (samples - i - 1) / (rate * 0.36));
    buffer.writeInt16LE(Math.round(Math.tanh(left[i] * fade) * 32767), 44 + i * 4);
    buffer.writeInt16LE(Math.round(Math.tanh(right[i] * fade) * 32767), 46 + i * 4);
  }
  writeFileSync(path, buffer);
}
