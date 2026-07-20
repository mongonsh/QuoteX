export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 30;
export const DURATION_SECONDS = 102.4;
export const DURATION_IN_FRAMES = Math.round(DURATION_SECONDS * FPS);

export const frameAt = (seconds) => Math.round(seconds * FPS);

export const palette = {
  ink: "#060a0d",
  inkSoft: "#0b1217",
  panel: "#111a20",
  panelStrong: "#17242b",
  line: "#52636c",
  lineBright: "#8497a1",
  muted: "#b4c1c7",
  white: "#f8fbfc",
  teal: "#4ff0d3",
  lime: "#c6ff68",
  coral: "#ff7f70",
  blue: "#8bb7ff",
  amber: "#ffd074",
  violet: "#df91ff",
};

export const asset = {
  product: "generated/cashmere-product.png",
  workbench: "generated/workbench.png",
  evidence: "generated/live-agent-evidence.png",
  voice: "generated/voice-agent.png",
  campaign: "generated/campaign-proof.jpg",
  marketplace: "generated/marketplace-proof.jpg",
  architecture: "generated/architecture.png",
  evidenceVideo: "generated/evidence-demo.mp4",
  narration: "generated/narration.wav",
  soundtrack: "generated/motion-soundtrack.wav",
  music: "generated/music.wav",
};

export const narrationWindows = [
  [0.65, 12.73],
  [12.95, 27.55],
  [28.35, 42.61],
  [43.05, 53.28],
  [55.05, 64.94],
  [67.0, 76.39],
  [76.65, 86.88],
  [87.0, 92.77],
  [95.0, 101.78],
];

export const scenes = [
  { id: "signal", start: 0, end: 13.2 },
  { id: "planner", start: 12.55, end: 28.65 },
  { id: "evidence", start: 28.0, end: 43.35 },
  { id: "gate", start: 42.7, end: 55.25 },
  { id: "media", start: 54.6, end: 67.2 },
  { id: "markets", start: 66.55, end: 76.85 },
  { id: "voice", start: 76.2, end: 87.05 },
  { id: "resilience", start: 86.4, end: 95.0 },
  { id: "final", start: 94.35, end: DURATION_SECONDS },
].map((scene) => ({
  ...scene,
  from: frameAt(scene.start),
  durationInFrames: frameAt(scene.end - scene.start),
}));

export const skillNodes = [
  { name: "Catalog", detail: "MNG-CASH-SCF", color: palette.blue },
  { name: "Memory", detail: "4 buyer facts", color: palette.violet },
  { name: "Shipping", detail: "DHL Economy", color: palette.teal },
  { name: "Pricing", detail: "$33,630", color: palette.amber },
  { name: "Risk", detail: "6 checks", color: palette.coral },
  { name: "Approval", detail: "human gate", color: palette.lime },
];

export const filmFont =
  '"Avenir Next", "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
export const monoFont = '"SFMono-Regular", Menlo, Monaco, Consolas, monospace';
