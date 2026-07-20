import { writeFile } from "node:fs/promises";

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BITS_PER_SAMPLE = 16;

const transitions = [6.8, 12.8, 28.2, 42.9, 54.9, 66.8, 76.4, 86.5, 94.4];
const skillPulses = [15.3, 16.65, 18, 19.35, 20.7, 22.05];

function clampSample(value) {
  return Math.max(-1, Math.min(1, value));
}

function envelope(time, start, attack, hold, release) {
  if (time < start || time >= start + attack + hold + release) return 0;
  const local = time - start;
  if (local < attack) return local / attack;
  if (local < attack + hold) return 1;
  return 1 - (local - attack - hold) / release;
}

function impact(time, at) {
  const local = time - at;
  if (local < 0 || local > 1.4) return 0;
  const decay = Math.exp(-local * 4.1);
  const frequency = 76 - local * 26;
  return Math.sin(2 * Math.PI * frequency * local) * decay;
}

function pulse(time, at) {
  const local = time - at;
  if (local < 0 || local > 0.32) return 0;
  const env = Math.sin(Math.PI * (local / 0.32));
  return Math.sin(2 * Math.PI * (620 + local * 180) * local) * env;
}

function createHeader(dataLength) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE((SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE) / 8, 28);
  header.writeUInt16LE((CHANNELS * BITS_PER_SAMPLE) / 8, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}

export async function writeSoundtrack(filePath, durationSeconds) {
  const frameCount = Math.ceil(durationSeconds * SAMPLE_RATE);
  const dataLength = frameCount * CHANNELS * 2;
  const output = Buffer.allocUnsafe(44 + dataLength);
  createHeader(dataLength).copy(output, 0);

  let randomState = 0x51f15e;
  let filteredNoise = 0;
  const nextNoise = () => {
    randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return (randomState / 0xffff_ffff) * 2 - 1;
  };

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / SAMPLE_RATE;
    const baseEnvelope = Math.min(1, time / 2.2) * Math.min(1, (durationSeconds - time) / 1.4);
    const movement = 0.72 + 0.28 * Math.sin(2 * Math.PI * 0.047 * time);
    const sub =
      Math.sin(2 * Math.PI * 46.25 * time) * 0.036 +
      Math.sin(2 * Math.PI * 69.3 * time + 0.6) * 0.018;
    const glass =
      Math.sin(2 * Math.PI * 277.18 * time + Math.sin(time * 0.19)) * 0.005 +
      Math.sin(2 * Math.PI * 415.3 * time + 1.2) * 0.0035;

    filteredNoise += (nextNoise() - filteredNoise) * 0.018;
    let transitionLayer = 0;
    for (const at of transitions) {
      transitionLayer += impact(time, at) * 0.11;
      const whooshEnvelope = envelope(time, at - 0.55, 0.42, 0, 0.22);
      transitionLayer += filteredNoise * whooshEnvelope * 0.12;
    }

    let pulseLayer = 0;
    for (const at of skillPulses) pulseLayer += pulse(time, at) * 0.038;

    const sectionAir =
      envelope(time, 54.6, 1.2, 20.5, 1.4) * Math.sin(2 * Math.PI * 138.59 * time) * 0.008;
    const signal = (sub * movement + glass + sectionAir) * baseEnvelope + transitionLayer + pulseLayer;
    const pan = Math.sin(time * 0.23) * 0.12;
    const left = clampSample(signal * (1 - pan));
    const right = clampSample(signal * (1 + pan));
    const offset = 44 + frame * 4;
    output.writeInt16LE(Math.round(left * 32_767), offset);
    output.writeInt16LE(Math.round(right * 32_767), offset + 2);
  }

  await writeFile(filePath, output);
}
