import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import {
  DataBeam,
  Kicker,
  KineticHeadline,
  MovingFrame,
  Pill,
  SceneLayer,
  Screenshot,
  SignalFlash,
  Typewriter,
  baseText,
} from "../components.jsx";
import { filmFont, palette, skillNodes } from "../constants.js";
import { ease, easeInOut, map, springIn } from "../motion.js";

const SignalCard = ({ index, title, color, start, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = springIn(frame, fps, start, {
    damping: 17,
    stiffness: 115,
    mass: 0.78,
  });
  const float = Math.sin(frame * 0.035 + index * 1.4) * 6;

  return (
    <div
      style={{
        ...baseText,
        position: "absolute",
        right: 112 + index * 52,
        top: 200 + index * 214 + float,
        width: 650,
        height: 172,
        padding: "24px 28px",
        boxSizing: "border-box",
        border: `2px solid ${color}bb`,
        borderRadius: 12,
        background: "rgba(17,26,32,.97)",
        boxShadow: `0 22px 80px rgba(0,0,0,.42), inset 4px 0 0 ${color}`,
        opacity: enter,
        transform: `perspective(900px) translate3d(${(1 - enter) * 410}px, 0, ${
          (1 - enter) * -260
        }px) rotateY(${(1 - enter) * -18}deg)`,
      }}
    >
      <Kicker color={color}>{title}</Kicker>
      {children}
    </div>
  );
};

const Waveform = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", height: 72, gap: 11, alignItems: "center", marginTop: 18 }}>
      {Array.from({ length: 30 }, (_, index) => {
        const movement =
          16 +
          Math.abs(Math.sin(frame * 0.17 + index * 0.69)) * 40 +
          Math.abs(Math.cos(frame * 0.07 + index)) * 8;
        return (
          <div
            key={index}
            style={{
              width: 7,
              height: movement,
              borderRadius: 6,
              background: index < 21 ? palette.teal : palette.lineBright,
              opacity: 0.55 + (index % 4) * 0.12,
              boxShadow: index < 21 ? `0 0 10px ${palette.teal}55` : "none",
            }}
          />
        );
      })}
      <span
        style={{
          fontFamily: '"SFMono-Regular", Menlo, monospace',
          color: palette.muted,
          fontSize: 17,
          marginLeft: "auto",
        }}
      >
        00:18
      </span>
    </div>
  );
};

export const SignalScene = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const convergence = easeInOut(frame, 302, 70);
  const titleShift = map(convergence, [0, 1], [0, -70]);

  return (
    <SceneLayer durationInFrames={durationInFrames}>
      <SignalFlash color={palette.coral} />
      <div
        style={{
          position: "absolute",
          left: 112 + titleShift,
          top: 218,
          width: 760,
          transform: `scale(${1 - convergence * 0.05})`,
        }}
      >
        <Kicker color={palette.coral}>The real input</Kicker>
        <KineticHeadline
          lines={["COMMERCE", "DOES NOT ARRIVE", "AS A FORM."]}
          start={10}
          accentLine={2}
          fontSize={82}
          style={{ marginTop: 30 }}
        />
        <div
          style={{
            ...baseText,
            color: palette.muted,
            fontSize: 25,
            lineHeight: 1.5,
            width: 640,
            marginTop: 38,
            opacity: ease(frame, 40, 30),
          }}
        >
          Voice, photos, and incomplete messages arrive together. QuoteX turns the signal into
          reviewable work.
        </div>
      </div>

      <SignalCard index={0} title="Voice note" color={palette.teal} start={25}>
        <Waveform />
      </SignalCard>

      <SignalCard index={1} title="Product photo" color={palette.blue} start={49}>
        <div style={{ display: "flex", gap: 22, alignItems: "center", marginTop: 17 }}>
          <div style={{ width: 150, height: 85, overflow: "hidden", borderRadius: 7 }}>
            <Screenshot
              name="product"
              fit="cover"
              position="50% 54%"
              style={{ transform: "scale(1.04)" }}
            />
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 720 }}>Grade-A cashmere scarves</div>
            <div style={{ color: palette.muted, fontSize: 18, marginTop: 9 }}>
              Three colors / product photo attached
            </div>
          </div>
        </div>
      </SignalCard>

      <SignalCard index={2} title="Buyer message" color={palette.coral} start={73}>
        <div
          style={{
            color: palette.white,
            fontSize: 21,
            lineHeight: 1.42,
            marginTop: 18,
            minHeight: 58,
          }}
        >
          <Typewriter start={94} charactersPerSecond={34}>
            Please quote 500 scarves for Berlin. Keep freight under $1,000.
          </Typewriter>
        </div>
      </SignalCard>

      {[0, 1, 2].map((index) => (
        <DataBeam
          key={index}
          x1={1260 + index * 30}
          y1={372 + index * 214}
          x2={1030}
          y2={520}
          color={[palette.teal, palette.blue, palette.coral][index]}
          progress={convergence}
          opacity={convergence}
        />
      ))}

      <div
        style={{
          ...baseText,
          position: "absolute",
          left: 946,
          top: 438,
          width: 168,
          height: 168,
          border: `2px solid ${palette.teal}`,
          background: palette.inkSoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: convergence,
          transform: `scale(${0.65 + convergence * 0.35}) rotate(${(1 - convergence) * -18}deg)`,
          boxShadow: `0 0 ${convergence * 90}px ${palette.teal}44`,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ color: palette.teal, fontSize: 18, fontWeight: 750 }}>QUOTEX</div>
          <div style={{ fontSize: 44, fontWeight: 760, marginTop: 7 }}>INTAKE</div>
        </div>
      </div>
    </SceneLayer>
  );
};

const Core = () => {
  const frame = useCurrentFrame();
  const ring = frame * 0.42;
  const pulseScale = 1 + Math.sin(frame * 0.08) * 0.035;

  return (
    <div
      style={{
        position: "absolute",
        left: 818,
        top: 346,
        width: 284,
        height: 284,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${pulseScale})`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          border: `2px solid ${palette.teal}aa`,
          borderRadius: "50%",
          transform: `rotate(${ring}deg)`,
          boxShadow: `0 0 90px ${palette.teal}22`,
        }}
      >
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              left: "50%",
              top: -6,
              width: 12,
              height: 12,
              marginLeft: -6,
              borderRadius: "50%",
              background: [palette.teal, palette.blue, palette.lime][index],
              transformOrigin: `6px ${148}px`,
              transform: `rotate(${index * 120}deg)`,
              boxShadow: `0 0 16px ${palette.teal}`,
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 28,
          borderRadius: "50%",
          border: `2px dashed ${palette.lineBright}`,
          transform: `rotate(${-ring * 0.7}deg)`,
        }}
      />
      <div
        style={{
          ...baseText,
          width: 174,
          height: 174,
          borderRadius: "50%",
          background: palette.panelStrong,
          border: `2px solid ${palette.teal}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `inset 0 0 45px ${palette.teal}12`,
        }}
      >
        <div style={{ color: palette.teal, fontSize: 17, fontWeight: 760 }}>QWEN 3.7</div>
        <div style={{ fontSize: 33, fontWeight: 760, marginTop: 7 }}>PLANNER</div>
        <div style={{ color: palette.muted, fontSize: 13, marginTop: 7 }}>bounded loop</div>
      </div>
    </div>
  );
};

const SkillNode = ({ node, index, x, y }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const activateAt = 70 + index * 25;
  const enter = springIn(frame, fps, 26 + index * 5, {
    damping: 18,
    stiffness: 125,
  });
  const active = ease(frame, activateAt, 15);
  const glow = 0.25 + Math.sin(frame * 0.08 + index) * 0.08;

  return (
    <div
      style={{
        ...baseText,
        position: "absolute",
        left: x,
        top: y,
        width: 300,
        height: 118,
        border: `2px solid ${interpolateNodeColor(node.color, active)}`,
        borderRadius: 10,
        background: "rgba(17,26,32,.97)",
        padding: "21px 23px",
        boxSizing: "border-box",
        opacity: enter,
        transform: `translate3d(${(1 - enter) * (x < 800 ? -80 : 80)}px, ${
          (1 - enter) * 24
        }px, 0)`,
        boxShadow: active > 0.7 ? `0 0 ${45 * glow}px ${node.color}44` : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: active > 0.6 ? node.color : palette.lineBright,
            boxShadow: active > 0.6 ? `0 0 14px ${node.color}` : "none",
          }}
        />
        <div style={{ fontSize: 22, fontWeight: 750 }}>{node.name}</div>
        <div
          style={{
            marginLeft: "auto",
            color: active > 0.6 ? node.color : palette.muted,
            fontSize: 12,
            fontWeight: 760,
          }}
        >
          {active > 0.6 ? "VERIFIED" : "QUEUED"}
        </div>
      </div>
      <div style={{ color: palette.muted, fontSize: 16, marginTop: 13 }}>{node.detail}</div>
    </div>
  );
};

const interpolateNodeColor = (color, active) =>
  active > 0.6 ? `${color}cc` : active > 0.1 ? `${color}66` : palette.line;

export const PlannerScene = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const nodePositions = [
    [168, 226],
    [168, 407],
    [168, 588],
    [1452, 226],
    [1452, 407],
    [1452, 588],
  ];

  return (
    <SceneLayer durationInFrames={durationInFrames}>
      <SignalFlash color={palette.teal} />
      <div style={{ position: "absolute", left: 112, top: 142 }}>
        <Kicker>Bounded agent architecture</Kicker>
        <div
          style={{
            ...baseText,
            color: palette.white,
            fontSize: 50,
            fontWeight: 760,
            marginTop: 16,
          }}
        >
          Qwen chooses the work.
        </div>
      </div>

      <Pill
        color={palette.lime}
        style={{ position: "absolute", right: 112, top: 149, fontSize: 16 }}
      >
        6 typed skills / 1 human gate
      </Pill>

      <Core />

      {nodePositions.map(([x, y], index) => {
        const centerX = x < 800 ? x + 300 : x;
        const centerY = y + 59;
        const targetX = x < 800 ? 818 : 1102;
        const activateAt = 70 + index * 25;
        const linkProgress = ease(frame, activateAt - 13, 24);
        return (
          <React.Fragment key={skillNodes[index].name}>
            <DataBeam
              x1={centerX}
              y1={centerY}
              x2={targetX}
              y2={488}
              color={skillNodes[index].color}
              progress={linkProgress}
              opacity={0.9}
            />
            <SkillNode node={skillNodes[index]} index={index} x={x} y={y} />
          </React.Fragment>
        );
      })}

      <MovingFrame
        amplitude={0.35}
        style={{
          position: "absolute",
          left: 552,
          top: 734,
          width: 816,
          height: 125,
          padding: "21px 26px",
          boxSizing: "border-box",
          border: `2px solid ${palette.lineBright}`,
          background: "rgba(15,23,28,.97)",
          boxShadow: "0 24px 70px rgba(0,0,0,.4)",
        }}
      >
        <Kicker color={palette.muted}>Planner trace</Kicker>
        <div
          style={{
            fontFamily: '"SFMono-Regular", Menlo, monospace',
            fontSize: 18,
            color: palette.white,
            marginTop: 16,
            whiteSpace: "nowrap",
          }}
        >
          <Typewriter start={58} charactersPerSecond={32}>
            read_catalog → recall_memory → calculate_freight → price_quote → evaluate_risk →
            request_approval
          </Typewriter>
        </div>
      </MovingFrame>

      <div
        style={{
          ...baseText,
          position: "absolute",
          left: 707,
          top: 892,
          width: 506,
          textAlign: "center",
          color: palette.muted,
          fontSize: 18,
          opacity: ease(frame, 205, 25),
        }}
      >
        The model proposes calls. Trusted TypeScript tools own commercial facts.
      </div>
    </SceneLayer>
  );
};
