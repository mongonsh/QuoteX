import { writeFile } from "node:fs/promises";

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BITS_PER_SAMPLE = 16;

const sceneTransitions = [0.05, 12.55, 28, 42.7, 54.6, 66.55, 76.2, 86.4, 94.35];
const skillActivations = [14.9, 15.75, 16.58, 17.42, 18.25, 19.08];
const interfaceClicks = [
  3.05, 5.48, 8.12, 14.75, 15.58, 16.42, 17.25, 18.08, 18.92, 30.4, 32.2, 44.9,
  46.15, 55.2, 57.35, 67.35, 69.05, 70.72, 78.02, 81.7, 88.6, 90.1,
];
const successEvents = [20.0, 37.2, 50.25, 61.4, 72.1, 84.8, 92.1, 99.4];

const typingPassages = [
  {
    start: 94 / 30,
    text: "Please quote 500 scarves for Berlin. Keep freight under $1,000.",
    charactersPerSecond: 34,
  },
  {
    start: 12.55 + 58 / 30,
    text: "read_catalog recall_memory calculate_freight price_quote evaluate_risk request_approval",
    charactersPerSecond: 32,
  },
  {
    start: 76.2 + 54 / 30,
    text: "When would 500 scarves arrive in Berlin?",
    charactersPerSecond: 25,
  },
  {
    start: 76.2 + 166 / 30,
    text: "DHL Economy Select is estimated at 12 days after approval. The offer remains locked until you confirm it.",
    charactersPerSecond: 31,
  },
];

const clamp = (value, min = -1, max = 1) => Math.min(max, Math.max(min, value));

const createHeader = (dataLength) => {
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
};

const seededRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0xffff_ffff;
  };
};

const addEvent = (left, right, at, duration, generator, pan = 0) => {
  const firstSample = Math.max(0, Math.floor(at * SAMPLE_RATE));
  const sampleCount = Math.floor(duration * SAMPLE_RATE);
  for (let offset = 0; offset < sampleCount; offset += 1) {
    const target = firstSample + offset;
    if (target >= left.length) break;
    const localTime = offset / SAMPLE_RATE;
    const signal = generator(localTime, duration);
    left[target] += signal * (1 - pan * 0.45);
    right[target] += signal * (1 + pan * 0.45);
  }
};

const addWhoosh = (left, right, at, intensity = 1) => {
  const random = seededRandom(Math.floor(at * 10_000) + 0x51f15e);
  let filtered = 0;
  addEvent(
    left,
    right,
    at - 0.52,
    1.1,
    (time, duration) => {
      filtered += ((random() * 2 - 1) - filtered) * (0.03 + time * 0.025);
      const normalized = time / duration;
      const envelope =
        normalized < 0.55
          ? Math.pow(normalized / 0.55, 1.8)
          : Math.pow(1 - (normalized - 0.55) / 0.45, 2.2);
      const air = filtered * envelope * 0.19 * intensity;
      const tone =
        Math.sin(2 * Math.PI * (92 + time * 44) * time) *
        Math.exp(-time * 3.2) *
        0.045 *
        intensity;
      return air + tone;
    },
    at % 2 ? -0.22 : 0.22,
  );
};

const addImpact = (left, right, at, intensity = 1) => {
  const random = seededRandom(Math.floor(at * 13_000) + 9127);
  addEvent(
    left,
    right,
    at,
    1.4,
    (time) => {
      const low =
        Math.sin(2 * Math.PI * (66 - time * 21) * time) * Math.exp(-time * 4.4) * 0.15;
      const click =
        (random() * 2 - 1) * Math.exp(-time * 42) * 0.11 +
        Math.sin(2 * Math.PI * 840 * time) * Math.exp(-time * 30) * 0.04;
      return (low + click) * intensity;
    },
    0,
  );
};

const addTypeClick = (left, right, at, seed) => {
  const random = seededRandom(seed);
  const pan = random() * 0.72 - 0.36;
  const pitch = 1600 + random() * 1100;
  const level = 0.024 + random() * 0.018;
  addEvent(
    left,
    right,
    at,
    0.045,
    (time) => {
      const bright = Math.sin(2 * Math.PI * pitch * time) * Math.exp(-time * 105);
      const body = Math.sin(2 * Math.PI * 230 * time) * Math.exp(-time * 72);
      return (bright * 0.72 + body * 0.28 + (random() * 2 - 1) * 0.35) * level;
    },
    pan,
  );
};

const addInterfaceClick = (left, right, at, seed) => {
  const random = seededRandom(seed);
  const pan = random() * 0.5 - 0.25;
  addEvent(
    left,
    right,
    at,
    0.16,
    (time) => {
      const first = Math.sin(2 * Math.PI * (1150 - time * 1800) * time) * Math.exp(-time * 72);
      const second =
        time > 0.055
          ? Math.sin(2 * Math.PI * 580 * (time - 0.055)) * Math.exp(-(time - 0.055) * 64)
          : 0;
      return first * 0.065 + second * 0.032;
    },
    pan,
  );
};

const addSuccess = (left, right, at, seed) => {
  const notes = [659.25, 783.99, 987.77];
  notes.forEach((frequency, index) => {
    addEvent(
      left,
      right,
      at + index * 0.075,
      0.48,
      (time) =>
        Math.sin(2 * Math.PI * frequency * time) *
        Math.exp(-time * 7.8) *
        (0.025 - index * 0.003),
      ((seed + index) % 3 - 1) * 0.16,
    );
  });
};

const addShutter = (left, right, at) => {
  const random = seededRandom(0xa117 + Math.floor(at * 100));
  [0, 0.083].forEach((offset, index) => {
    addEvent(
      left,
      right,
      at + offset,
      0.13,
      (time) =>
        ((random() * 2 - 1) * Math.exp(-time * (index ? 44 : 70)) * 0.13 +
          Math.sin(2 * Math.PI * (480 - time * 900) * time) *
            Math.exp(-time * 38) *
            0.055) *
        (index ? 0.75 : 1),
      index ? 0.12 : -0.12,
    );
  });
};

export const writeMotionSoundtrack = async (filePath, durationSeconds) => {
  const sampleCount = Math.ceil(durationSeconds * SAMPLE_RATE);
  const left = new Float32Array(sampleCount);
  const right = new Float32Array(sampleCount);

  sceneTransitions.slice(1).forEach((at, index) => {
    addWhoosh(left, right, at, index === sceneTransitions.length - 2 ? 1.12 : 0.88);
    addImpact(left, right, at, index === 3 || index === 7 ? 0.95 : 0.66);
  });

  typingPassages.forEach((passage, passageIndex) => {
    [...passage.text].forEach((character, characterIndex) => {
      if (character === " ") return;
      addTypeClick(
        left,
        right,
        passage.start + characterIndex / passage.charactersPerSecond,
        passageIndex * 10_000 + characterIndex * 31 + 17,
      );
    });
  });

  skillActivations.forEach((at, index) => addInterfaceClick(left, right, at, 500 + index));
  interfaceClicks.forEach((at, index) => addInterfaceClick(left, right, at, 900 + index));
  successEvents.forEach((at, index) => addSuccess(left, right, at, index));
  addShutter(left, right, 57.25);
  addShutter(left, right, 61.05);
  addImpact(left, right, 46.35, 1.2);
  addImpact(left, right, 89.0, 1.05);

  const dataLength = sampleCount * CHANNELS * 2;
  const output = Buffer.allocUnsafe(44 + dataLength);
  createHeader(dataLength).copy(output, 0);

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const offset = 44 + sample * 4;
    output.writeInt16LE(Math.round(clamp(left[sample] * 0.92) * 32_767), offset);
    output.writeInt16LE(Math.round(clamp(right[sample] * 0.92) * 32_767), offset + 2);
  }

  await writeFile(filePath, output);
};
