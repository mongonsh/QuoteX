import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  interpolateColors,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { asset, filmFont, monoFont, palette, WIDTH } from "./constants.js";
import {
  cameraFloat,
  deterministicNoise,
  ease,
  map,
  sceneOpacity,
  springIn,
  typeText,
} from "./motion.js";

export const baseText = {
  fontFamily: filmFont,
  letterSpacing: 0,
};

export const FilmBackdrop = () => {
  const frame = useCurrentFrame();
  const driftX = (frame * 0.55) % 96;
  const driftY = (frame * 0.23) % 96;
  const sweepX = map(frame % 210, [0, 210], [-420, 2260]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: palette.ink,
        color: palette.white,
        overflow: "hidden",
        ...baseText,
      }}
    >
      <AbsoluteFill
        style={{
          opacity: 0.58,
          backgroundImage: `
            linear-gradient(rgba(132,151,161,.2) 1px, transparent 1px),
            linear-gradient(90deg, rgba(132,151,161,.2) 1px, transparent 1px)
          `,
          backgroundPosition: `${driftX}px ${driftY}px`,
          backgroundSize: "96px 96px",
          transform: `perspective(1200px) rotateX(4deg) scale(1.04)`,
        }}
      />

      <AbsoluteFill
        style={{
          opacity: 0.42,
          background:
            "linear-gradient(115deg, transparent 0%, rgba(79,240,211,.09) 42%, transparent 70%)",
          transform: `translateX(${sweepX}px) skewX(-14deg)`,
          width: 420,
        }}
      />

      {Array.from({ length: 72 }, (_, index) => {
        const speed = 0.12 + deterministicNoise(index * 71) * 0.34;
        const x =
          (deterministicNoise(index * 47 + 3) * WIDTH + frame * speed * 2.2) %
          (WIDTH + 80);
        const y =
          110 + deterministicNoise(index * 101 + 19) * 850 + Math.sin(frame * 0.02 + index) * 5;
        const tint = [palette.teal, palette.blue, palette.amber][index % 3];
        const size = 1 + deterministicNoise(index * 29) * 2.2;
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: x - 40,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              background: tint,
              opacity: 0.16 + deterministicNoise(index * 17) * 0.24,
              boxShadow: `0 0 ${size * 5}px ${tint}`,
            }}
          />
        );
      })}

      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 48%, rgba(2,5,7,.58) 100%)",
        }}
      />

      <AbsoluteFill
        style={{
          opacity: 0.025,
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,.22) 0px, rgba(255,255,255,.22) 1px, transparent 1px, transparent 5px)",
          transform: `translateY(${frame % 5}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

export const Logo = ({ compact = false, dark = false }) => (
  <div style={{ display: "flex", alignItems: "center", gap: compact ? 14 : 22 }}>
    <div
      style={{
        width: compact ? 48 : 70,
        height: compact ? 48 : 70,
        borderRadius: compact ? 11 : 15,
        background: dark ? palette.ink : palette.white,
        border: `2px solid ${dark ? palette.lineBright : "rgba(255,255,255,.86)"}`,
        position: "relative",
        boxShadow: dark ? "none" : "0 16px 40px rgba(0,0,0,.32)",
      }}
    >
      {[0, 1, 2].map((line) => (
        <div
          key={line}
          style={{
            position: "absolute",
            left: compact ? 12 : 17,
            top: (compact ? 13 : 19) + line * (compact ? 10 : 14),
            width: (compact ? 22 : 33) - line * (compact ? 4 : 7),
            height: compact ? 3 : 4,
            borderRadius: 3,
            background: dark ? palette.white : palette.ink,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          right: compact ? 7 : 10,
          top: compact ? 12 : 17,
          width: compact ? 12 : 18,
          height: compact ? 24 : 36,
          borderTop: `${compact ? 3 : 4}px solid ${palette.teal}`,
          borderRight: `${compact ? 3 : 4}px solid ${palette.teal}`,
          borderBottom: `${compact ? 3 : 4}px solid ${palette.teal}`,
          transform: "skewX(23deg)",
        }}
      />
    </div>
    <div>
      <div style={{ fontSize: compact ? 28 : 50, lineHeight: 1, fontWeight: 750 }}>QuoteX</div>
      {!compact && (
        <div
          style={{
            color: palette.muted,
            fontSize: 16,
            fontWeight: 700,
            textTransform: "uppercase",
            marginTop: 10,
          }}
        >
          Governed commerce autopilot
        </div>
      )}
    </div>
  </div>
);

export const FilmHud = () => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const seconds = Math.min(Math.floor(frame / fps), 102);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <>
      <div style={{ position: "absolute", left: 58, top: 46 }}>
        <Logo compact />
      </div>
      <div
        style={{
          ...baseText,
          position: "absolute",
          top: 58,
          left: 300,
          fontSize: 16,
          fontWeight: 700,
          color: palette.muted,
          textTransform: "uppercase",
        }}
      >
        Qwen Cloud / Track 4 / Autopilot Agent
      </div>
      <div
        style={{
          ...baseText,
          position: "absolute",
          top: 58,
          right: 58,
          color: palette.muted,
          fontFamily: monoFont,
          fontSize: 16,
          fontWeight: 700,
        }}
      >
        {time} / 1:42
      </div>
      <div
        style={{
          position: "absolute",
          left: 58,
          right: 58,
          bottom: 54,
          height: 3,
          background: "rgba(255,255,255,.22)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${(frame / durationInFrames) * 100}%`,
            background: palette.teal,
            boxShadow: `0 0 15px ${palette.teal}`,
          }}
        />
      </div>
    </>
  );
};

export const SceneLayer = ({ children, durationInFrames, style }) => {
  const frame = useCurrentFrame();
  const opacity = sceneOpacity(frame, durationInFrames);
  const curtain = map(frame, [0, 18], [36, 0]);
  const cameraX = map(frame, [0, durationInFrames], [-12, 18]);
  const cameraY = map(frame, [0, durationInFrames], [7, -9]);
  const cameraScale = map(frame, [0, durationInFrames], [1.006, 1.018]);

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `translate3d(${cameraX}px, ${curtain + cameraY}px, 0) scale(${cameraScale})`,
        transformOrigin: "50% 50%",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const Kicker = ({ children, color = palette.teal, style }) => (
  <div
    style={{
      ...baseText,
      color,
      fontSize: 18,
      lineHeight: 1.2,
      fontWeight: 750,
      textTransform: "uppercase",
      ...style,
    }}
  >
    {children}
  </div>
);

export const KineticHeadline = ({
  lines,
  start = 0,
  fontSize = 78,
  lineHeight = 0.98,
  accentLine = -1,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ ...baseText, ...style }}>
      {lines.map((line, index) => {
        const inValue = springIn(frame, fps, start + index * 7, {
          damping: 17,
          stiffness: 135,
          mass: 0.75,
        });
        return (
          <div
            key={line}
            style={{
              fontSize,
              lineHeight,
              fontWeight: 760,
              color: index === accentLine ? palette.teal : palette.white,
              opacity: inValue,
              transform: `translate3d(${(1 - inValue) * 82}px, ${
                (1 - inValue) * 30
              }px, 0)`,
              filter: `blur(${(1 - inValue) * 10}px)`,
            }}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
};

export const Typewriter = ({
  children,
  start = 0,
  charactersPerSecond = 24,
  showCursor = true,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = typeText(children, frame, start, charactersPerSecond, fps);
  const cursorVisible = Math.floor(frame / 8) % 2 === 0;

  return (
    <span style={{ ...baseText, ...style }}>
      {text}
      {showCursor && (
        <span style={{ color: palette.teal, opacity: cursorVisible ? 1 : 0 }}>▌</span>
      )}
    </span>
  );
};

export const BrowserFrame = ({ children, title, accent = palette.teal, style }) => (
  <div
    style={{
      position: "relative",
      overflow: "hidden",
      background: palette.panel,
      border: `2px solid ${palette.lineBright}`,
      borderRadius: 14,
      boxShadow:
        "0 34px 100px rgba(0,0,0,.48), inset 0 0 0 1px rgba(255,255,255,.035)",
      ...style,
    }}
  >
    <div
      style={{
        height: 56,
        borderBottom: `2px solid ${palette.line}`,
        display: "flex",
        alignItems: "center",
        padding: "0 22px",
        gap: 10,
      }}
    >
      {[palette.coral, palette.amber, palette.teal].map((color) => (
        <div
          key={color}
          style={{ width: 9, height: 9, borderRadius: "50%", background: color }}
        />
      ))}
      <div
        style={{
          ...baseText,
          color: palette.muted,
          fontSize: 15,
          fontWeight: 650,
          marginLeft: 10,
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginLeft: "auto",
          width: 54,
          height: 3,
          borderRadius: 3,
          background: accent,
          boxShadow: `0 0 12px ${accent}`,
        }}
      />
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, top: 56, bottom: 0 }}>
      {children}
    </div>
  </div>
);

export const Screenshot = ({ name, style, fit = "cover", position = "center" }) => (
  <Img
    src={staticFile(asset[name])}
    style={{
      width: "100%",
      height: "100%",
      objectFit: fit,
      objectPosition: position,
      imageRendering: "auto",
      ...style,
    }}
  />
);

export const EvidenceVideo = ({ trimBefore, style, playbackRate = 1 }) => (
  <OffthreadVideo
    muted
    src={staticFile(asset.evidenceVideo)}
    trimBefore={trimBefore}
    playbackRate={playbackRate}
    style={{ width: "100%", height: "100%", objectFit: "cover", ...style }}
  />
);

export const Pill = ({ children, color = palette.teal, active = true, style }) => (
  <div
    style={{
      ...baseText,
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "9px 14px",
      border: `2px solid ${active ? `${color}cc` : palette.lineBright}`,
      borderRadius: 6,
      background: active ? `${color}20` : "rgba(255,255,255,.055)",
      color: active ? color : palette.muted,
      fontSize: 15,
      fontWeight: 720,
      textTransform: "uppercase",
      ...style,
    }}
  >
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: active ? color : palette.lineBright,
        boxShadow: active ? `0 0 10px ${color}` : "none",
      }}
    />
    {children}
  </div>
);

export const Metric = ({ label, value, color = palette.white, detail, progress, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = springIn(frame, fps, 4, { damping: 20, stiffness: 120 });

  return (
    <div
      style={{
        ...baseText,
        position: "relative",
        padding: "22px 24px 20px",
        border: `2px solid ${palette.line}`,
        borderLeft: `4px solid ${color}`,
        background: palette.panelStrong,
        opacity: enter,
        transform: `translateX(${(1 - enter) * 30}px)`,
        ...style,
      }}
    >
      <div
        style={{
          color: palette.muted,
          fontSize: 14,
          fontWeight: 740,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ color, fontSize: 35, fontWeight: 760, lineHeight: 1 }}>{value}</div>
      {detail && (
        <div style={{ color: palette.muted, fontSize: 15, fontWeight: 550, marginTop: 9 }}>
          {detail}
        </div>
      )}
      {typeof progress === "number" && (
        <div
          style={{
            height: 4,
            marginTop: 17,
            background: palette.line,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress * 100}%`,
              height: "100%",
              background: color,
              boxShadow: `0 0 12px ${color}`,
            }}
          />
        </div>
      )}
    </div>
  );
};

export const DataBeam = ({
  x1,
  y1,
  x2,
  y2,
  color = palette.teal,
  progress = 1,
  opacity = 1,
  width = 3,
}) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const packetX = length * progress;
  const lineColor = interpolateColors(progress, [0, 1], [palette.line, color]);

  return (
    <div
      style={{
        position: "absolute",
        left: x1,
        top: y1,
        width: length,
        height: width,
        transformOrigin: "0 50%",
        transform: `rotate(${angle}deg)`,
        background: `linear-gradient(90deg, ${lineColor} 0 ${progress * 100}%, ${
          palette.line
        } ${progress * 100}% 100%)`,
        opacity,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: packetX - 7,
          top: -6,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 20px ${color}`,
        }}
      />
    </div>
  );
};

export const ScanOverlay = ({ start = 0, duration = 70, color = palette.teal }) => {
  const frame = useCurrentFrame();
  const progress = ease(frame, start, duration);
  return (
    <div
      style={{
        position: "absolute",
        left: `${progress * 100}%`,
        top: 0,
        bottom: 0,
        width: 3,
        background: color,
        boxShadow: `-28px 0 42px ${color}44, 0 0 26px ${color}`,
        opacity: frame >= start && frame <= start + duration + 8 ? 1 : 0,
      }}
    />
  );
};

export const MovingFrame = ({ children, amplitude = 1, zoom = 1, style }) => {
  const frame = useCurrentFrame();
  const movement = cameraFloat(frame, amplitude);
  return (
    <div
      style={{
        transform: `translate3d(${movement.x}px, ${movement.y}px, 0) rotate(${movement.rotate}deg) scale(${zoom})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const SignalFlash = ({ color = palette.teal }) => {
  const frame = useCurrentFrame();
  const width = map(frame, [0, 5, 14], [0, 100, 0]);
  const opacity = map(frame, [0, 4, 17], [0, 0.28, 0]);
  return (
    <AbsoluteFill
      style={{
        width: `${width}%`,
        opacity,
        background: color,
        mixBlendMode: "screen",
      }}
    />
  );
};
