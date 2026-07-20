import { Easing, interpolate, spring } from "remotion";

export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const lerp = (from, to, progress) => from + (to - from) * progress;

export const map = (
  frame,
  inputRange,
  outputRange,
  options = { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
) => interpolate(frame, inputRange, outputRange, options);

export const ease = (frame, start, duration) =>
  map(frame, [start, start + duration], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

export const easeInOut = (frame, start, duration) =>
  map(frame, [start, start + duration], [0, 1], {
    easing: Easing.bezier(0.65, 0, 0.35, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

export const springIn = (frame, fps, delay = 0, config = {}) =>
  spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: {
      damping: 18,
      mass: 0.8,
      stiffness: 125,
      ...config,
    },
    durationInFrames: config.durationInFrames ?? 34,
  });

export const sceneOpacity = (frame, durationInFrames, fadeIn = 14, fadeOut = 18) => {
  const entering = map(frame, [0, fadeIn], [0, 1]);
  const leaving = map(frame, [durationInFrames - fadeOut, durationInFrames], [1, 0]);
  return Math.min(entering, leaving);
};

export const typeText = (text, frame, startFrame, charactersPerSecond, fps) => {
  const characterCount = Math.floor(
    Math.max(0, frame - startFrame) * (charactersPerSecond / fps),
  );
  return text.slice(0, characterCount);
};

export const deterministicNoise = (seed) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export const pulse = (frame, center, width = 18) => {
  const distance = Math.abs(frame - center);
  return distance > width ? 0 : 1 - distance / width;
};

export const cameraFloat = (frame, amplitude = 1) => ({
  x: Math.sin(frame * 0.014) * 9 * amplitude + Math.sin(frame * 0.004) * 5 * amplitude,
  y: Math.cos(frame * 0.011) * 6 * amplitude,
  rotate: Math.sin(frame * 0.007) * 0.22 * amplitude,
});
