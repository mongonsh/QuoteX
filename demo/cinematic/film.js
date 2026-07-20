const WIDTH = 1920;
const HEIGHT = 1080;
const DEFAULT_DURATION_MS = 102_400;

const canvas = document.querySelector("#film");
const ctx = canvas.getContext("2d", { alpha: false });

const colors = {
  ink: "#07090a",
  panel: "#101416",
  panelSoft: "#151b1e",
  line: "#2b3539",
  muted: "#869298",
  white: "#f5f7f5",
  teal: "#57e2ce",
  lime: "#b8ff58",
  coral: "#ff745f",
  blue: "#79a7ff",
  amber: "#ffc861",
};

const scenes = [
  { id: "signal", start: 0, end: 13 },
  { id: "planner", start: 12.4, end: 28.5 },
  { id: "evidence", start: 27.9, end: 43.2 },
  { id: "gate", start: 42.6, end: 55.2 },
  { id: "media", start: 54.6, end: 67.1 },
  { id: "markets", start: 66.5, end: 76.7 },
  { id: "voice", start: 76.1, end: 86.8 },
  { id: "resilience", start: 86.2, end: 94.7 },
  { id: "final", start: 94.1, end: 104 },
];

const assets = {
  workbench: "../../docs/screenshots/quotex-workbench.png",
  evidence: "../../docs/screenshots/quotex-live-agent-evidence.png",
  voice: "../../docs/screenshots/quotex-voice-agent.png",
  campaign: "../../docs/screenshots/quotex-campaign-proof.jpg",
  marketplace: "../../docs/screenshots/quotex-marketplace-proof.jpg",
  architecture: "../../diagrams/quotex-agent-architecture.png",
};

const images = {};
let filmStart = 0;
let recorder;
let chunks = [];
let activeDuration = DEFAULT_DURATION_MS;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (from, to, amount) => from + (to - from) * amount;
const smoothstep = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const easeOut = (value) => 1 - Math.pow(1 - clamp(value), 3);
const easeInOut = (value) => {
  const t = clamp(value);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
const progress = (time, start, duration) => clamp((time - start) / duration);
const sceneAlpha = (time, start, end, fade = 0.7) =>
  smoothstep(progress(time, start, fade)) * (1 - smoothstep(progress(time, end - fade, fade)));

function seededNoise(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

function roundRect(x, y, width, height, radius, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function line(x1, y1, x2, y2, stroke = colors.line, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function setFont(size, weight = 500, family = "Arial") {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textBaseline = "alphabetic";
}

function text(value, x, y, size, color = colors.white, weight = 500, align = "left", family = "Arial") {
  setFont(size, weight, family);
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function trackedText(value, x, y, size, color, spacing = 3, weight = 700, align = "left") {
  setFont(size, weight, "Arial");
  ctx.textAlign = "left";
  ctx.fillStyle = color;
  const glyphs = [...value];
  const widths = glyphs.map((glyph) => ctx.measureText(glyph).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, glyphs.length - 1) * spacing;
  let cursor = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  for (let index = 0; index < glyphs.length; index += 1) {
    ctx.fillText(glyphs[index], cursor, y);
    cursor += widths[index] + spacing;
  }
}

function wrapText(value, x, y, maxWidth, lineHeight, size, color, weight = 500, maxLines = 4) {
  setFont(size, weight, "Arial");
  ctx.textAlign = "left";
  ctx.fillStyle = color;
  const words = value.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  lines.slice(0, maxLines).forEach((entry, index) => ctx.fillText(entry, x, y + index * lineHeight));
}

function label(value, x, y, color = colors.teal) {
  trackedText(value.toUpperCase(), x, y, 18, color, 3.2, 700);
}

function sectionTitle(kicker, titleLines, x, y, maxWidth = 820) {
  label(kicker, x, y, colors.teal);
  titleLines.forEach((entry, index) => {
    text(entry, x, y + 82 + index * 82, 72, colors.white, 700);
  });
  line(x, y + 104 + titleLines.length * 82, x + Math.min(maxWidth, 560), y + 104 + titleLines.length * 82, colors.line, 2);
}

function logo(x, y, scale = 1, withWordmark = true) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  roundRect(0, 0, 54, 54, 12, colors.white);
  line(14, 17, 37, 17, colors.ink, 4);
  line(14, 27, 32, 27, colors.ink, 4);
  line(14, 37, 25, 37, colors.ink, 4);
  line(38, 17, 46, 27, colors.teal, 4);
  line(46, 27, 38, 37, colors.teal, 4);
  if (withWordmark) {
    text("QuoteX", 72, 39, 34, colors.white, 700);
  }
  ctx.restore();
}

function drawImageCover(image, x, y, width, height, radius = 16, shade = 0) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.clip();
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  if (shade > 0) {
    ctx.fillStyle = `rgba(7, 9, 10, ${shade})`;
    ctx.fillRect(x, y, width, height);
  }
  ctx.restore();
}

function drawImageContain(image, x, y, width, height, radius = 16, shade = 0) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.clip();
  ctx.fillStyle = colors.panel;
  ctx.fillRect(x, y, width, height);
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  if (shade > 0) {
    ctx.fillStyle = `rgba(7, 9, 10, ${shade})`;
    ctx.fillRect(x, y, width, height);
  }
  ctx.restore();
}

function drawCroppedImage(image, source, target, radius = 16, shade = 0) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(target.x, target.y, target.width, target.height, radius);
  ctx.clip();
  ctx.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    target.x,
    target.y,
    target.width,
    target.height,
  );
  if (shade > 0) {
    ctx.fillStyle = `rgba(7, 9, 10, ${shade})`;
    ctx.fillRect(target.x, target.y, target.width, target.height);
  }
  ctx.restore();
}

function chromeFrame(x, y, width, height, title, accent = colors.teal) {
  roundRect(x, y, width, height, 18, colors.panel, colors.line, 2);
  line(x, y + 54, x + width, y + 54, colors.line);
  ctx.fillStyle = colors.coral;
  ctx.beginPath();
  ctx.arc(x + 26, y + 27, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.amber;
  ctx.beginPath();
  ctx.arc(x + 46, y + 27, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.teal;
  ctx.beginPath();
  ctx.arc(x + 66, y + 27, 5, 0, Math.PI * 2);
  ctx.fill();
  text(title, x + 94, y + 35, 17, colors.muted, 600);
  ctx.fillStyle = accent;
  ctx.fillRect(x + width - 84, y + 25, 54, 4);
}

function drawGlobal(time) {
  ctx.fillStyle = colors.ink;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const offset = (time * 8) % 80;
  ctx.strokeStyle = "rgba(125, 161, 170, 0.065)";
  ctx.lineWidth = 1;
  for (let x = -80 + offset; x < WIDTH + 80; x += 80) line(x, 0, x, HEIGHT, ctx.strokeStyle);
  for (let y = -80 + offset * 0.35; y < HEIGHT + 80; y += 80) line(0, y, WIDTH, y, ctx.strokeStyle);

  ctx.fillStyle = "rgba(255,255,255,0.018)";
  for (let y = 0; y < HEIGHT; y += 5) ctx.fillRect(0, y, WIDTH, 1);

  const frame = Math.floor(time * 30);
  for (let index = 0; index < 110; index += 1) {
    const x = seededNoise(frame * 173 + index * 19) * WIDTH;
    const y = seededNoise(frame * 97 + index * 47) * HEIGHT;
    const opacity = 0.018 + seededNoise(index * 23 + frame) * 0.035;
    ctx.fillStyle = `rgba(255,255,255,${opacity})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  logo(58, 48, 0.58);
  label("QWEN CLOUD • TRACK 4 AUTOPILOT AGENT", 224, 72, colors.muted);
  const elapsed = Math.min(102, Math.max(0, Math.floor(time)));
  const minute = Math.floor(elapsed / 60);
  const second = String(elapsed % 60).padStart(2, "0");
  trackedText(`${minute}:${second} / 1:42`, 1860, 72, 17, colors.muted, 2.2, 700, "right");

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(58, 1022, 1804, 2);
  ctx.fillStyle = colors.teal;
  ctx.fillRect(58, 1022, 1804 * clamp(time / 102.4), 2);
}

function drawSignalScene(time, alpha) {
  const local = time;
  ctx.save();
  ctx.globalAlpha = alpha;

  const headingIn = easeOut(progress(local, 0.4, 1.1));
  const headingX = lerp(30, 112, headingIn);
  label("THE INPUT", headingX, 250, colors.coral);
  text("COMMERCE", headingX, 360, 92, colors.white, 700);
  text("DOESN'T ARRIVE", headingX, 456, 92, colors.white, 700);
  text("AS A FORM.", headingX, 552, 92, colors.teal, 700);
  wrapText(
    "It arrives as a voice note, a product photo, and an ambiguous buyer message.",
    headingX,
    640,
    670,
    40,
    27,
    colors.muted,
    500,
    3,
  );

  const cards = [
    { label: "VOICE NOTE", y: 224, color: colors.teal, delay: 0.7 },
    { label: "PRODUCT PHOTO", y: 430, color: colors.blue, delay: 1.3 },
    { label: "BUYER MESSAGE", y: 636, color: colors.coral, delay: 1.9 },
  ];

  cards.forEach((card, index) => {
    const enter = easeOut(progress(local, card.delay, 1.2));
    const x = lerp(1980, 1080 + index * 56, enter);
    const width = 680;
    roundRect(x, card.y, width, 164, 14, "rgba(16,20,22,0.96)", card.color, 2);
    label(card.label, x + 28, card.y + 38, card.color);
    if (index === 0) {
      for (let bar = 0; bar < 23; bar += 1) {
        const amplitude = 12 + 24 * Math.abs(Math.sin(bar * 0.81 + time * 5));
        ctx.fillStyle = bar < 15 ? card.color : colors.line;
        ctx.fillRect(x + 30 + bar * 24, card.y + 96 - amplitude / 2, 8, amplitude);
      }
      text("00:18", x + width - 32, card.y + 104, 18, colors.muted, 600, "right", "monospace");
    } else if (index === 1) {
      drawCroppedImage(
        images.campaign,
        { x: 344, y: 312, width: 550, height: 395 },
        { x: x + 28, y: card.y + 58, width: 166, height: 82 },
        8,
      );
      text("Hermès Birkin 25", x + 220, card.y + 94, 24, colors.white, 700);
      text("Condition: good • Photo attached", x + 220, card.y + 126, 19, colors.muted, 500);
    } else {
      wrapText(
        "“I want to sell this for $100,000. Can it reach a cross-border buyer?”",
        x + 28,
        card.y + 82,
        width - 56,
        32,
        22,
        colors.white,
        600,
        3,
      );
    }
    const targetX = 1010;
    const pulse = progress(local, card.delay + 1.5, 1.8);
    line(x - 10, card.y + 82, targetX, 540, "rgba(87,226,206,0.25)", 2);
    if (pulse > 0 && pulse < 1) {
      const px = lerp(x - 10, targetX, easeInOut(pulse));
      const py = lerp(card.y + 82, 540, easeInOut(pulse));
      ctx.fillStyle = card.color;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const titleAlpha = smoothstep(progress(local, 7.2, 1.3));
  if (titleAlpha > 0) {
    ctx.fillStyle = `rgba(7,9,10,${titleAlpha * 0.94})`;
    ctx.fillRect(0, 112, WIDTH, 900);
    ctx.save();
    ctx.globalAlpha *= titleAlpha;
    const titleScale = lerp(0.96, 1, easeOut(progress(local, 7.2, 1.6)));
    ctx.translate(WIDTH / 2, 470);
    ctx.scale(titleScale, titleScale);
    ctx.translate(-WIDTH / 2, -470);
    logo(760, 314, 1.35, false);
    trackedText("QUOTEX", WIDTH / 2, 530, 128, colors.white, 8, 700, "center");
    line(724, 577, 1196, 577, colors.teal, 4);
    trackedText("GOVERNED COMMERCE AUTOPILOT", WIDTH / 2, 636, 23, colors.muted, 5, 700, "center");
    roundRect(726, 690, 468, 52, 26, "rgba(87,226,206,0.10)", colors.teal, 1);
    trackedText("QWEN CLOUD • HUMAN CONTROL", WIDTH / 2, 725, 17, colors.teal, 2.6, 700, "center");
    ctx.restore();
  }
  ctx.restore();
}

const skills = [
  { name: "STRUCTURE", detail: "Request", color: colors.blue },
  { name: "MEMORY", detail: "Scoped recall", color: colors.teal },
  { name: "CATALOG", detail: "Trusted SKU", color: colors.lime },
  { name: "ROUTE", detail: "Freight", color: colors.amber },
  { name: "PRICE", detail: "Margin floor", color: colors.coral },
  { name: "POLICY", detail: "Human gate", color: colors.teal },
];

function drawPlannerScene(time, alpha) {
  const local = time - 12.4;
  ctx.save();
  ctx.globalAlpha = alpha;
  sectionTitle("BOUNDED AUTONOMY", ["QWEN PLANS.", "TOOLS PROVE."], 112, 240);
  wrapText(
    "The model chooses what to do next. Typed code owns every commercial fact.",
    112,
    520,
    600,
    39,
    27,
    colors.muted,
    500,
    3,
  );

  roundRect(110, 676, 600, 176, 16, colors.panel, colors.line, 2);
  label("UNTRUSTED REQUEST", 142, 718, colors.coral);
  wrapText(
    "“Sell my Birkin 25 for $100,000 and prepare a cross-border offer.”",
    142,
    770,
    530,
    32,
    23,
    colors.white,
    600,
    3,
  );

  const plannerX = 930;
  const plannerY = 534;
  const plannerPulse = 0.5 + 0.5 * Math.sin(time * 3.4);
  ctx.strokeStyle = `rgba(121,167,255,${0.2 + plannerPulse * 0.25})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(plannerX, plannerY, 114 + plannerPulse * 10, 0, Math.PI * 2);
  ctx.stroke();
  roundRect(plannerX - 92, plannerY - 92, 184, 184, 28, colors.panelSoft, colors.blue, 3);
  label("QWEN 3.7", plannerX - 60, plannerY - 30, colors.blue);
  text("PLANNER", plannerX, plannerY + 30, 30, colors.white, 700, "center");
  text("4-turn ceiling", plannerX, plannerY + 68, 17, colors.muted, 600, "center");
  line(710, 764, plannerX - 116, plannerY, "rgba(121,167,255,0.45)", 3);

  const positions = [
    [1190, 266],
    [1480, 266],
    [1190, 492],
    [1480, 492],
    [1190, 718],
    [1480, 718],
  ];

  skills.forEach((skill, index) => {
    const [x, y] = positions[index];
    const activate = easeOut(progress(local, 2.0 + index * 1.35, 0.9));
    const centerX = x + 244 / 2;
    const centerY = y + 154 / 2;
    line(plannerX + 116, plannerY, x, centerY, activate > 0.25 ? `${skill.color}66` : colors.line, 2);
    if (activate > 0 && activate < 1) {
      const pulseX = lerp(plannerX + 116, x, activate);
      const pulseY = lerp(plannerY, centerY, activate);
      ctx.fillStyle = skill.color;
      ctx.beginPath();
      ctx.arc(pulseX, pulseY, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = alpha * lerp(0.35, 1, activate);
    roundRect(x, y, 244, 154, 14, colors.panel, activate > 0.85 ? skill.color : colors.line, activate > 0.85 ? 2 : 1);
    roundRect(x + 18, y + 18, 42, 42, 10, activate > 0.85 ? skill.color : colors.line);
    text(activate > 0.85 ? "✓" : String(index + 1).padStart(2, "0"), x + 39, y + 48, 18, colors.ink, 800, "center");
    label(skill.name, x + 76, y + 44, activate > 0.85 ? skill.color : colors.muted);
    text(skill.detail, x + 22, y + 104, 22, colors.white, 700);
    text(activate > 0.85 ? "verified result" : "awaiting call", x + 22, y + 132, 16, colors.muted, 500);
    ctx.globalAlpha = alpha;
  });

  const footerIn = smoothstep(progress(local, 10.2, 1));
  ctx.globalAlpha = alpha * footerIn;
  roundRect(1070, 910, 652, 62, 31, "rgba(184,255,88,0.08)", colors.lime, 1);
  trackedText("6 / 6 SKILLS • SEND GATE LOCKED", 1396, 950, 19, colors.lime, 2.3, 700, "center");
  ctx.restore();
}

function drawEvidenceScene(time, alpha) {
  const local = time - 27.9;
  ctx.save();
  ctx.globalAlpha = alpha;
  sectionTitle("EXECUTABLE EVIDENCE", ["DON'T CLAIM TRUST.", "MEASURE IT."], 112, 226);
  wrapText(
    "Same Qwen model. Same six adversarial cases. Different architecture.",
    112,
    512,
    650,
    38,
    27,
    colors.muted,
    500,
    3,
  );

  const scoreIn = easeOut(progress(local, 1.3, 1.3));
  const governed = Math.round(42 * scoreIn);
  const baseline = Math.round(33 * scoreIn);
  text(`${governed}/42`, 112, 700, 112, colors.lime, 700);
  label("GOVERNED TOOL AGENT", 120, 748, colors.lime);
  ctx.fillStyle = "rgba(184,255,88,0.18)";
  ctx.fillRect(112, 782, 560, 18);
  ctx.fillStyle = colors.lime;
  ctx.fillRect(112, 782, 560 * scoreIn, 18);

  text(`${baseline}/42`, 112, 912, 62, colors.muted, 700);
  label("DIRECT ONE-PROMPT BASELINE", 120, 956, colors.muted);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(112, 978, 560, 12);
  ctx.fillStyle = colors.muted;
  ctx.fillRect(112, 978, 440 * scoreIn, 12);

  const frameX = lerp(1990, 870, easeOut(progress(local, 0.5, 1.4)));
  chromeFrame(frameX, 170, 920, 780, "Agent evidence • live Qwen run", colors.lime);
  drawImageContain(images.evidence, frameX + 28, 248, 864, 666, 10);

  const callouts = [
    { y: 290, value: "6 typed skills", color: colors.teal, delay: 3.2 },
    { y: 475, value: "trusted outputs", color: colors.blue, delay: 4.4 },
    { y: 660, value: "SHA-256 digest", color: colors.coral, delay: 5.6 },
  ];
  callouts.forEach((callout) => {
    const show = easeOut(progress(local, callout.delay, 0.7));
    ctx.globalAlpha = alpha * show;
    const x = 1590;
    line(x - 90, callout.y, x, callout.y, callout.color, 2);
    roundRect(x, callout.y - 25, 190, 50, 25, colors.panelSoft, callout.color, 1);
    text(callout.value, x + 95, callout.y + 7, 17, callout.color, 700, "center");
  });
  ctx.globalAlpha = alpha;

  const liftIn = smoothstep(progress(local, 8.6, 1));
  ctx.globalAlpha = alpha * liftIn;
  roundRect(750, 872, 284, 76, 12, colors.panel, colors.coral, 2);
  text("+21.4 pts", 892, 916, 34, colors.coral, 700, "center");
  label("ARCHITECTURE LIFT", 775, 942, colors.muted);
  ctx.restore();
}

function drawLock(x, y, scale, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(0, -28, 36, Math.PI, 0);
  ctx.stroke();
  roundRect(-52, -26, 104, 86, 16, colors.panel, color, 5);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 10, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-4, 17, 8, 22);
  ctx.restore();
}

function drawGateScene(time, alpha) {
  const local = time - 42.6;
  ctx.save();
  ctx.globalAlpha = alpha;
  label("COMMERCIAL TRUTH", 112, 218, colors.amber);
  text("THE MODEL NEVER", 112, 324, 78, colors.white, 700);
  text("SETS THE PRICE.", 112, 410, 78, colors.amber, 700);
  wrapText(
    "Catalog, freight, margin, and policy are recomputed from trusted data.",
    112,
    490,
    650,
    38,
    26,
    colors.muted,
    500,
    3,
  );

  const rows = [
    ["SELLER ASKING PRICE", "$100,000", colors.white],
    ["VERIFIED FREIGHT", "$110", colors.blue],
    ["LANDED TOTAL", "$100,110", colors.lime],
  ];
  rows.forEach((row, index) => {
    const show = easeOut(progress(local, 1.0 + index * 0.8, 0.8));
    ctx.globalAlpha = alpha * show;
    const y = 620 + index * 104;
    line(112, y + 70, 760, y + 70, colors.line);
    label(row[0], 112, y + 18, colors.muted);
    text(row[1], 760, y + 51, index === 2 ? 48 : 37, row[2], 700, "right");
  });
  ctx.globalAlpha = alpha;

  const pathIn = easeOut(progress(local, 3.5, 1.3));
  line(820, 540, lerp(820, 1315, pathIn), 540, colors.teal, 3);
  const gateX = 1394;
  const gateY = 540;
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(gateX, gateY, 226, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,200,97,0.25)";
  ctx.beginPath();
  ctx.arc(gateX, gateY, 178, 0, Math.PI * 2);
  ctx.stroke();
  drawLock(gateX, gateY - 12, 1.3, colors.amber);

  const gateIn = smoothstep(progress(local, 4.5, 0.9));
  ctx.globalAlpha = alpha * gateIn;
  trackedText("HUMAN REVIEW", gateX, 770, 23, colors.white, 3.5, 700, "center");
  trackedText("REQUIRED", gateX, 810, 23, colors.amber, 3.5, 700, "center");

  const checks = ["MARGIN", "STOCK", "PROVENANCE", "PAYMENT", "DELIVERY", "SEND"];
  checks.forEach((check, index) => {
    const angle = -Math.PI * 0.82 + (index / (checks.length - 1)) * Math.PI * 1.64;
    const x = gateX + Math.cos(angle) * 320;
    const y = gateY + Math.sin(angle) * 320;
    const show = easeOut(progress(local, 5.2 + index * 0.35, 0.6));
    ctx.globalAlpha = alpha * show;
    roundRect(x - 68, y - 22, 136, 44, 22, colors.panelSoft, colors.teal, 1);
    trackedText(check, x, y + 6, 13, colors.teal, 1.5, 700, "center");
  });
  ctx.restore();
}

function drawMediaScene(time, alpha) {
  const local = time - 54.6;
  ctx.save();
  ctx.globalAlpha = alpha;
  label("MULTIMODAL OUTPUT", 112, 206, colors.blue);
  text("ONE VERIFIED RECORD.", 112, 296, 66, colors.white, 700);
  text("A COMPLETE CAMPAIGN.", 112, 374, 66, colors.blue, 700);

  const leftX = lerp(-700, 112, easeOut(progress(local, 0.6, 1.1)));
  const rightX = lerp(1980, 1030, easeOut(progress(local, 1.2, 1.1)));
  chromeFrame(leftX, 454, 760, 458, "Source product • saved listing", colors.teal);
  drawCroppedImage(
    images.campaign,
    { x: 450, y: 350, width: 440, height: 220 },
    { x: leftX + 24, y: 526, width: 712, height: 356 },
    10,
  );
  chromeFrame(rightX, 454, 760, 458, "Qwen vision + Wan image edit", colors.blue);
  drawCroppedImage(
    images.campaign,
    { x: 958, y: 390, width: 280, height: 155 },
    { x: rightX + 24, y: 526, width: 712, height: 356 },
    10,
  );

  const scan = progress(local, 2.8, 3.6);
  if (scan > 0 && scan < 1) {
    const scanX = lerp(leftX + 740, rightX + 20, easeInOut(scan));
    ctx.fillStyle = colors.blue;
    ctx.fillRect(scanX, 526, 3, 356);
    ctx.fillStyle = "rgba(121,167,255,0.09)";
    ctx.fillRect(scanX - 120, 526, 120, 356);
  }

  const chips = [
    ["PHOTO GROUNDED", colors.teal],
    ["CAMPAIGN READY", colors.blue],
    ["HAPPYHORSE 5 SEC", colors.coral],
  ];
  chips.forEach((chip, index) => {
    const show = easeOut(progress(local, 6.2 + index * 0.6, 0.7));
    ctx.globalAlpha = alpha * show;
    roundRect(510 + index * 320, 934, 286, 52, 26, `${chip[1]}18`, chip[1], 1);
    trackedText(chip[0], 653 + index * 320, 968, 15, chip[1], 2, 700, "center");
  });
  ctx.restore();
}

function marketplaceCard(x, y, width, name, role, color, delay, local, fields) {
  const show = easeOut(progress(local, delay, 0.9));
  const drawY = lerp(y + 90, y, show);
  ctx.globalAlpha *= show;
  roundRect(x, drawY, width, 480, 18, colors.panel, color, 2);
  label(role, x + 30, drawY + 44, colors.muted);
  text(name, x + 30, drawY + 92, 42, colors.white, 700);
  roundRect(x + width - 142, drawY + 29, 112, 36, 18, `${color}18`, color, 1);
  trackedText("DRAFT", x + width - 86, drawY + 54, 13, color, 1.7, 700, "center");
  fields.forEach((field, index) => {
    const rowY = drawY + 160 + index * 82;
    label(field[0], x + 30, rowY, colors.muted);
    text(field[1], x + 30, rowY + 35, 22, colors.white, 700);
    line(x + 30, rowY + 52, x + width - 30, rowY + 52, colors.line);
  });
  roundRect(x + 30, drawY + 410, width - 60, 44, 8, "rgba(255,116,95,0.08)", colors.coral, 1);
  text("OAuth + approval required", x + width / 2, drawY + 439, 16, colors.coral, 700, "center");
}

function drawMarketsScene(time, alpha) {
  const local = time - 66.5;
  ctx.save();
  ctx.globalAlpha = alpha;
  drawImageCover(images.marketplace, 0, 108, WIDTH, 904, 0, 0.82);
  ctx.fillStyle = "rgba(7,9,10,0.64)";
  ctx.fillRect(0, 108, WIDTH, 904);
  label("VALIDATION-FIRST ADAPTERS", 112, 206, colors.teal);
  text("ONE RECORD.", 112, 292, 66, colors.white, 700);
  text("THREE SAFE DRAFTS.", 112, 370, 66, colors.teal, 700);

  const originalAlpha = ctx.globalAlpha;
  marketplaceCard(112, 452, 516, "eBay", "CONSUMER RESALE", colors.teal, 1.0, local, [
    ["PRICE", "$100,000"],
    ["CONDITION", "Good"],
    ["MISSING", "Category ID"],
  ]);
  ctx.globalAlpha = originalAlpha;
  marketplaceCard(702, 452, 516, "Amazon", "RETAIL CATALOG", colors.amber, 1.7, local, [
    ["PRICE", "$100,000"],
    ["CONDITION", "used_good"],
    ["MISSING", "Product type"],
  ]);
  ctx.globalAlpha = originalAlpha;
  marketplaceCard(1292, 452, 516, "Alibaba.com", "WHOLESALE", colors.coral, 2.4, local, [
    ["MOQ", "1 piece"],
    ["SUPPLY", "1 piece"],
    ["MISSING", "Incoterm"],
  ]);
  ctx.globalAlpha = originalAlpha;
  ctx.restore();
}

function waveform(x, y, width, height, time, color) {
  const bars = 46;
  const gap = width / bars;
  for (let index = 0; index < bars; index += 1) {
    const value =
      0.18 +
      0.82 *
        Math.abs(
          Math.sin(index * 0.62 + time * 4.4) *
            Math.cos(index * 0.17 - time * 2.1),
        );
    const barHeight = height * value;
    ctx.fillStyle = index < ((time * 9) % bars) ? color : colors.line;
    ctx.fillRect(x + index * gap, y - barHeight / 2, Math.max(3, gap - 5), barHeight);
  }
}

function drawVoiceScene(time, alpha) {
  const local = time - 76.1;
  ctx.save();
  ctx.globalAlpha = alpha;
  drawImageCover(images.voice, 0, 108, WIDTH, 904, 0, 0.78);
  ctx.fillStyle = "rgba(7,9,10,0.52)";
  ctx.fillRect(0, 108, WIDTH, 904);

  label("CUSTOMER VOICE WORKSPACE", 112, 210, colors.teal);
  text("ASK NATURALLY.", 112, 304, 72, colors.white, 700);
  text("ANSWER FROM FACTS.", 112, 388, 72, colors.teal, 700);

  roundRect(112, 486, 790, 164, 18, colors.panel, colors.line, 2);
  label("CUSTOMER • VOICE", 144, 530, colors.blue);
  waveform(144, 586, 710, 66, time, colors.blue);
  text("“When would this arrive?”", 144, 628, 21, colors.white, 600);

  const route = [
    ["QWEN3 ASR", colors.blue],
    ["QWEN 3.7", colors.teal],
    ["VOICE DESIGN", colors.lime],
  ];
  route.forEach((entry, index) => {
    const x = 112 + index * 264;
    const show = easeOut(progress(local, 1.7 + index * 0.7, 0.7));
    ctx.globalAlpha = alpha * show;
    roundRect(x, 692, 232, 52, 26, `${entry[1]}18`, entry[1], 1);
    trackedText(entry[0], x + 116, 726, 15, entry[1], 2, 700, "center");
    if (index < route.length - 1) {
      line(x + 232, 718, x + 264, 718, colors.line, 2);
    }
  });

  const answerIn = easeOut(progress(local, 4.0, 1));
  ctx.globalAlpha = alpha * answerIn;
  const answerX = 1040;
  roundRect(answerX, 344, 730, 416, 20, colors.panel, colors.teal, 2);
  label("QUOTEX • GROUNDED ANSWER", answerX + 38, 400, colors.teal);
  wrapText(
    "“The offer is ready for review. Delivery timing remains subject to the selected route and human approval.”",
    answerX + 38,
    474,
    650,
    52,
    34,
    colors.white,
    600,
    5,
  );
  line(answerX + 38, 676, answerX + 692, 676, colors.line);
  drawLock(answerX + 64, 712, 0.32, colors.amber);
  text("Commercial checkpoint remains locked", answerX + 112, 720, 19, colors.amber, 700);

  ctx.globalAlpha = alpha;
  roundRect(1110, 820, 590, 64, 32, "rgba(87,226,206,0.08)", colors.teal, 1);
  waveform(1150, 852, 510, 34, time + 0.8, colors.teal);
  ctx.restore();
}

function statBox(x, y, width, labelValue, numberValue, color, delay, local) {
  const show = easeOut(progress(local, delay, 0.7));
  ctx.globalAlpha *= show;
  roundRect(x, y, width, 156, 16, colors.panel, color, 2);
  label(labelValue, x + 28, y + 40, colors.muted);
  text(numberValue, x + 28, y + 112, 48, color, 700);
}

function drawResilienceScene(time, alpha) {
  const local = time - 86.2;
  ctx.save();
  ctx.globalAlpha = alpha;
  label("PRODUCTION FAILURE MODE", 112, 218, colors.coral);
  text("WHEN QWEN IS UNAVAILABLE,", 112, 312, 64, colors.white, 700);
  text("TRUTH DOESN'T DEGRADE.", 112, 388, 64, colors.coral, 700);

  roundRect(112, 466, 720, 86, 14, "rgba(255,116,95,0.08)", colors.coral, 2);
  ctx.fillStyle = colors.coral;
  ctx.beginPath();
  ctx.arc(154, 509, 9, 0, Math.PI * 2);
  ctx.fill();
  label("MODEL TIMEOUT • GUARDED RECOVERY", 184, 516, colors.coral);

  const laneY = 650;
  line(160, laneY, 1760, laneY, colors.line, 3);
  const labels = ["INPUT", "MEMORY", "CATALOG", "ROUTE", "PRICE", "POLICY", "GATE"];
  labels.forEach((entry, index) => {
    const x = 160 + index * (1600 / (labels.length - 1));
    const activate = easeOut(progress(local, 1.1 + index * 0.55, 0.55));
    ctx.globalAlpha = alpha * lerp(0.35, 1, activate);
    ctx.fillStyle = activate > 0.9 ? colors.lime : colors.line;
    ctx.beginPath();
    ctx.arc(x, laneY, 20, 0, Math.PI * 2);
    ctx.fill();
    if (activate > 0.9) {
      text("✓", x, laneY + 8, 22, colors.ink, 800, "center");
    }
    trackedText(entry, x, laneY + 62, 14, activate > 0.9 ? colors.lime : colors.muted, 1.5, 700, "center");
  });
  ctx.globalAlpha = alpha;
  drawLock(1760, laneY - 8, 0.48, colors.amber);

  const originalAlpha = ctx.globalAlpha;
  statBox(112, 796, 470, "MODEL TURNS", "0", colors.coral, 3.2, local);
  ctx.globalAlpha = originalAlpha;
  statBox(626, 796, 470, "TRUSTED SKILLS", "6 / 6", colors.lime, 3.7, local);
  ctx.globalAlpha = originalAlpha;
  statBox(1140, 796, 668, "OUTBOUND ACTION", "LOCKED", colors.amber, 4.2, local);
  ctx.restore();
}

function architectureNode(x, y, width, title, detail, color, delay, local) {
  const show = easeOut(progress(local, delay, 0.7));
  ctx.globalAlpha *= show;
  roundRect(x, y, width, 112, 16, colors.panel, color, 2);
  label(title, x + 24, y + 38, color);
  text(detail, x + 24, y + 78, 21, colors.white, 700);
}

function drawFinalScene(time, alpha) {
  const local = time - 94.1;
  ctx.save();
  ctx.globalAlpha = alpha;
  const architectureAlpha = 1 - smoothstep(progress(local, 5.2, 1.1));
  ctx.globalAlpha = alpha * architectureAlpha;
  label("ARCHITECTURE AT A GLANCE", 112, 210, colors.teal);
  text("AUTONOMY WITH A HARD BOUNDARY.", 112, 306, 66, colors.white, 700);

  const nodeY = 502;
  const nodes = [
    [112, 240, "VOICE • TEXT • PHOTO", "Validated input", colors.blue],
    [426, 230, "QWEN 3.7", "Bounded planner", colors.teal],
    [730, 300, "6 SKILLS", "Verified decisions", colors.lime],
    [1104, 250, "HUMAN GATE", "Approve or hold", colors.amber],
    [1428, 380, "SAFE OUTPUTS", "Offer • media • drafts", colors.coral],
  ];
  nodes.forEach((node, index) => {
    if (index < nodes.length - 1) {
      const next = nodes[index + 1];
      const lineIn = easeOut(progress(local, 0.7 + index * 0.55, 0.7));
      line(
        node[0] + node[1],
        nodeY + 56,
        lerp(node[0] + node[1], next[0], lineIn),
        nodeY + 56,
        node[4],
        3,
      );
    }
    const originalAlpha = ctx.globalAlpha;
    architectureNode(node[0], nodeY, node[1], node[2], node[3], node[4], 0.4 + index * 0.55, local);
    ctx.globalAlpha = originalAlpha;
  });

  const outcomes = [
    ["SQLITE EVIDENCE", "Audit digest"],
    ["PERSISTENT MEMORY", "Scoped + expiring"],
    ["RESILIENT MODE", "No fake success"],
  ];
  outcomes.forEach((outcome, index) => {
    const x = 260 + index * 520;
    const show = easeOut(progress(local, 2.8 + index * 0.45, 0.65));
    ctx.globalAlpha = alpha * architectureAlpha * show;
    roundRect(x, 720, 420, 116, 14, colors.panelSoft, colors.line, 1);
    label(outcome[0], x + 24, 760, colors.muted);
    text(outcome[1], x + 24, 806, 24, colors.white, 700);
  });

  const endAlpha = smoothstep(progress(local, 5.2, 1.1));
  if (endAlpha > 0) {
    ctx.globalAlpha = alpha * endAlpha;
    ctx.fillStyle = `rgba(7,9,10,${0.92 * endAlpha})`;
    ctx.fillRect(0, 110, WIDTH, 900);
    logo(782, 240, 1.2, false);
    trackedText("QUOTEX", WIDTH / 2, 458, 120, colors.white, 8, 700, "center");
    line(654, 510, 1266, 510, colors.teal, 4);
    trackedText("QWEN PLANS.", WIDTH / 2, 600, 34, colors.blue, 4, 700, "center");
    trackedText("VERIFIED TOOLS DECIDE.", WIDTH / 2, 664, 34, colors.lime, 4, 700, "center");
    trackedText("YOU APPROVE.", WIDTH / 2, 728, 34, colors.amber, 4, 700, "center");
    roundRect(732, 806, 456, 58, 29, "rgba(87,226,206,0.08)", colors.teal, 1);
    trackedText("TRACK 4 • AUTOPILOT AGENT", WIDTH / 2, 844, 17, colors.teal, 2.6, 700, "center");
  }
  ctx.restore();
}

const sceneDrawers = {
  signal: drawSignalScene,
  planner: drawPlannerScene,
  evidence: drawEvidenceScene,
  gate: drawGateScene,
  media: drawMediaScene,
  markets: drawMarketsScene,
  voice: drawVoiceScene,
  resilience: drawResilienceScene,
  final: drawFinalScene,
};

function render(milliseconds) {
  const time = milliseconds / 1000;
  drawGlobal(time);
  for (const scene of scenes) {
    const alpha = sceneAlpha(time, scene.start, scene.end);
    if (alpha > 0) sceneDrawers[scene.id](time, alpha);
  }
}

function animationLoop(timestamp) {
  const elapsed = timestamp - filmStart;
  render(Math.min(elapsed, activeDuration));
  if (elapsed < activeDuration) {
    requestAnimationFrame(animationLoop);
    return;
  }
  setTimeout(() => recorder.stop(), 120);
}

async function loadAssets() {
  await Promise.all(
    Object.entries(assets).map(
      ([key, source]) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            images[key] = image;
            resolve();
          };
          image.onerror = () => reject(new Error(`Could not load cinematic asset: ${source}`));
          image.src = source;
        }),
    ),
  );
}

window.startFilm = ({ durationMs = DEFAULT_DURATION_MS } = {}) => {
  if (recorder?.state === "recording") throw new Error("Film render already in progress.");
  activeDuration = Math.min(DEFAULT_DURATION_MS, Math.max(1_000, durationMs));
  render(0);
  const stream = canvas.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm;codecs=vp8";
  recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 14_000_000,
  });
  chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "QuoteX-cinematic-visual.webm";
    anchor.click();
    window.__filmFinished = true;
  };
  recorder.start(1_000);
  filmStart = performance.now();
  requestAnimationFrame(animationLoop);
};

window.renderAt = (milliseconds) => render(clamp(milliseconds, 0, DEFAULT_DURATION_MS));

loadAssets()
  .then(() => {
    render(0);
    window.__filmReady = true;
  })
  .catch((error) => {
    window.__filmError = error.message;
    console.error(error);
  });
