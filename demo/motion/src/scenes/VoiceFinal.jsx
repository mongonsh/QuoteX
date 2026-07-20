import React from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import {
  BrowserFrame,
  DataBeam,
  EvidenceVideo,
  Kicker,
  MovingFrame,
  Pill,
  SceneLayer,
  Screenshot,
  SignalFlash,
  Typewriter,
  baseText,
} from "../components.jsx";
import { asset, frameAt, palette, skillNodes } from "../constants.js";
import { ease, easeInOut, map, springIn } from "../motion.js";

const platformData = [
  { name: "eBay", detail: "inventory + condition", color: palette.blue },
  { name: "Amazon", detail: "catalog attributes + GTIN", color: palette.amber },
  { name: "Alibaba.com", detail: "MOQ + supply + Incoterm", color: palette.teal },
];

export const MarketsScene = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const camera = easeInOut(frame, 12, 245);

  return (
    <SceneLayer durationInFrames={durationInFrames}>
      <SignalFlash color={palette.amber} />
      <div style={{ position: "absolute", left: 110, top: 156, zIndex: 10 }}>
        <Kicker color={palette.amber}>Marketplace adapters</Kicker>
        <div style={{ ...baseText, fontSize: 52, fontWeight: 770, marginTop: 18 }}>
          Structured for each market.
        </div>
      </div>
      <Pill
        color={palette.coral}
        style={{ position: "absolute", right: 112, top: 158, zIndex: 10 }}
      >
        Draft only / never auto-published
      </Pill>

      <MovingFrame
        amplitude={0.22}
        style={{
          position: "absolute",
          left: 390 - camera * 70,
          top: 276 - camera * 18,
          width: 1420,
          height: 646,
          transform: `perspective(1500px) rotateY(${-4 + camera * 3}deg) scale(${
            0.91 + camera * 0.06
          })`,
          transformOrigin: "65% 50%",
        }}
      >
        <BrowserFrame
          title="QuoteX / Validated channel drafts"
          accent={palette.amber}
          style={{ width: "100%", height: "100%" }}
        >
          <Screenshot
            name="marketplace"
            fit="cover"
            style={{ transform: "scale(1.02)", filter: "brightness(.94) contrast(1.03)" }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(90deg, rgba(5,7,7,.72), transparent 45%)",
            }}
          />
        </BrowserFrame>
      </MovingFrame>

      <div
        style={{
          position: "absolute",
          left: 110,
          top: 314,
          width: 440,
          display: "grid",
          gap: 16,
          zIndex: 6,
        }}
      >
        {platformData.map((platform, index) => {
          const enter = springIn(frame, fps, 38 + index * 26, {
            damping: 17,
            stiffness: 125,
          });
          const validated = ease(frame, 115 + index * 35, 20);
          return (
            <div
              key={platform.name}
              style={{
                ...baseText,
                height: 142,
                padding: "24px 26px",
                boxSizing: "border-box",
                border: `2px solid ${
                  validated > 0.7 ? platform.color : palette.lineBright
                }`,
                background: "rgba(15,23,28,.98)",
                boxShadow:
                  validated > 0.7
                    ? `0 18px 55px rgba(0,0,0,.45), inset 3px 0 ${platform.color}`
                    : "0 18px 55px rgba(0,0,0,.35)",
                opacity: enter,
                transform: `translate3d(${(1 - enter) * -100}px, 0, 0)`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ color: platform.color, fontSize: 29, fontWeight: 780 }}>
                  {platform.name}
                </div>
                <div
                  style={{
                    marginLeft: "auto",
                    color: validated > 0.7 ? palette.lime : palette.muted,
                    fontSize: 13,
                    fontWeight: 760,
                  }}
                >
                  {validated > 0.7 ? "VALIDATED" : "CHECKING"}
                </div>
              </div>
              <div style={{ color: palette.muted, fontSize: 17, marginTop: 12 }}>
                {platform.detail}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          ...baseText,
          position: "absolute",
          right: 124,
          bottom: 108,
          color: palette.muted,
          fontSize: 17,
          opacity: ease(frame, 205, 24),
        }}
      >
        Adapter validation stops incomplete or unsupported payloads before publication.
      </div>
    </SceneLayer>
  );
};

const WaveRing = ({ size, delay, color }) => {
  const frame = useCurrentFrame();
  const progress = ((frame - delay + 120) % 120) / 120;
  return (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        left: `calc(50% - ${size / 2}px)`,
        top: `calc(50% - ${size / 2}px)`,
        borderRadius: "50%",
        border: `2px solid ${color}`,
        opacity: (1 - progress) * 0.34,
        transform: `scale(${0.45 + progress * 0.95})`,
      }}
    />
  );
};

const VoiceOrb = () => {
  const frame = useCurrentFrame();
  const amplitude =
    1 + Math.abs(Math.sin(frame * 0.18)) * 0.07 + Math.abs(Math.cos(frame * 0.047)) * 0.03;
  return (
    <div
      style={{
        position: "relative",
        width: 330,
        height: 330,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <WaveRing size={290} delay={0} color={palette.teal} />
      <WaveRing size={290} delay={40} color={palette.blue} />
      <WaveRing size={290} delay={80} color={palette.violet} />
      <div
        style={{
          width: 144,
          height: 144,
          borderRadius: "50%",
          background: palette.panelStrong,
          border: `2px solid ${palette.teal}`,
          boxShadow: `0 0 90px ${palette.teal}42, inset 0 0 40px ${palette.blue}22`,
          transform: `scale(${amplitude})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
        }}
      >
        {Array.from({ length: 7 }, (_, index) => {
          const height = 19 + Math.abs(Math.sin(frame * 0.22 + index * 0.88)) * 52;
          return (
            <div
              key={index}
              style={{
                width: 6,
                height,
                borderRadius: 6,
                background: index % 2 ? palette.blue : palette.teal,
                boxShadow: `0 0 10px ${palette.teal}`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export const VoiceScene = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const transcriptIn = ease(frame, 48, 28);
  const answerIn = ease(frame, 158, 28);

  return (
    <SceneLayer durationInFrames={durationInFrames}>
      <SignalFlash color={palette.teal} />
      <MovingFrame
        amplitude={0.2}
        style={{ position: "absolute", left: 100, top: 164, width: 1010, height: 730 }}
      >
        <BrowserFrame
          title="QuoteX / Customer voice workspace"
          accent={palette.teal}
          style={{ width: "100%", height: "100%" }}
        >
          <Screenshot
            name="voice"
            fit="cover"
            style={{
              transform: "scale(1.32)",
              transformOrigin: "100% 50%",
              filter: "brightness(.92) contrast(1.03)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(90deg, transparent 45%, rgba(5,7,7,.72) 100%)",
            }}
          />
        </BrowserFrame>
      </MovingFrame>

      <div
        style={{
          ...baseText,
          position: "absolute",
          right: 112,
          top: 164,
          width: 650,
          height: 730,
          padding: "38px 42px",
          boxSizing: "border-box",
          border: `2px solid ${palette.lineBright}`,
          background: "rgba(15,23,28,.98)",
          boxShadow: "0 34px 100px rgba(0,0,0,.5)",
        }}
      >
        <Kicker>Grounded voice agent</Kicker>
        <div style={{ fontSize: 35, fontWeight: 770, marginTop: 16 }}>
          Listen. Reason. Answer naturally.
        </div>

        <div
          style={{
            position: "absolute",
            right: 24,
            top: 98,
            transform: "scale(.78)",
            transformOrigin: "top right",
          }}
        >
          <VoiceOrb />
        </div>

        <div
          style={{
            position: "absolute",
            left: 42,
            top: 208,
            width: 352,
            padding: "20px 22px",
            background: `${palette.blue}12`,
            border: `2px solid ${palette.line}`,
            borderLeft: `4px solid ${palette.blue}`,
            opacity: transcriptIn,
            transform: `translateY(${(1 - transcriptIn) * 20}px)`,
          }}
        >
          <div style={{ color: palette.blue, fontSize: 13, fontWeight: 760 }}>CUSTOMER</div>
          <div style={{ fontSize: 21, lineHeight: 1.42, marginTop: 10, minHeight: 62 }}>
            <Typewriter start={54} charactersPerSecond={25}>
              When would 500 scarves arrive in Berlin?
            </Typewriter>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 42,
            right: 42,
            top: 380,
            padding: "22px 24px",
            background: `${palette.teal}10`,
            border: `2px solid ${palette.line}`,
            borderLeft: `4px solid ${palette.teal}`,
            opacity: answerIn,
            transform: `translateY(${(1 - answerIn) * 20}px)`,
          }}
        >
          <div style={{ color: palette.teal, fontSize: 13, fontWeight: 760 }}>QUOTEX</div>
          <div style={{ fontSize: 21, lineHeight: 1.46, marginTop: 10, minHeight: 94 }}>
            <Typewriter start={166} charactersPerSecond={31}>
              DHL Economy Select is estimated at 12 days after approval. The offer remains locked
              until you confirm it.
            </Typewriter>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 42,
            right: 42,
            bottom: 38,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {[
            ["Qwen3-ASR", palette.blue],
            ["Qwen3.7", palette.teal],
            ["Voice Design", palette.violet],
          ].map(([label, color], index) => (
            <React.Fragment key={label}>
              <Pill color={color} style={{ fontSize: 12 }}>
                {label}
              </Pill>
              {index < 2 && <span style={{ color: palette.muted }}>→</span>}
            </React.Fragment>
          ))}
        </div>
      </div>
    </SceneLayer>
  );
};

const RecoveryNode = ({ node, index, x, y }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = 70 + index * 14;
  const enter = springIn(frame, fps, start, { damping: 16, stiffness: 145 });

  return (
    <div
      style={{
        ...baseText,
        position: "absolute",
        left: x,
        top: y,
        width: 226,
        height: 92,
        padding: "18px 20px",
        boxSizing: "border-box",
        border: `2px solid ${node.color}cc`,
        background: "rgba(15,23,28,.98)",
        opacity: enter,
        transform: `scale(${0.82 + enter * 0.18})`,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 750 }}>{node.name}</div>
      <div style={{ color: node.color, fontSize: 13, fontWeight: 720, marginTop: 8 }}>
        TRUSTED TOOL
      </div>
    </div>
  );
};

export const ResilienceScene = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const error = springIn(frame, 30, 20, {
    damping: 11,
    stiffness: 190,
    mass: 0.65,
  });
  const reroute = easeInOut(frame, 52, 74);
  const lockIn = springIn(frame, 30, 172, { damping: 14, stiffness: 170 });
  const positions = [
    [620, 230],
    [870, 230],
    [1120, 230],
    [620, 560],
    [870, 560],
    [1120, 560],
  ];

  return (
    <SceneLayer durationInFrames={durationInFrames}>
      <SignalFlash color={palette.coral} />
      <div style={{ position: "absolute", left: 110, top: 150, width: 430 }}>
        <Kicker color={palette.coral}>Graceful degradation</Kicker>
        <div style={{ ...baseText, fontSize: 58, lineHeight: 1.02, fontWeight: 770, marginTop: 20 }}>
          FAILURE IS
          <br />
          A VISIBLE
          <br />
          STATE.
        </div>
        <div
          style={{
            ...baseText,
            color: palette.muted,
            fontSize: 20,
            lineHeight: 1.5,
            marginTop: 28,
          }}
        >
          A model timeout reroutes through the same trusted skills. Recovery is labeled and the
          send gate stays closed.
        </div>
      </div>

      <div
        style={{
          ...baseText,
          position: "absolute",
          left: 840,
          top: 405,
          width: 300,
          height: 132,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          border: `2px solid ${palette.coral}`,
          background: `${palette.coral}12`,
          opacity: error * (1 - reroute * 0.62),
          transform: `scale(${0.75 + error * 0.25})`,
          boxShadow: `0 0 ${50 * error}px ${palette.coral}44`,
        }}
      >
        <div style={{ color: palette.coral, fontSize: 15, fontWeight: 780 }}>QWEN TIMEOUT</div>
        <div style={{ fontSize: 28, fontWeight: 760, marginTop: 10 }}>Model unavailable</div>
      </div>

      {positions.map(([x, y], index) => {
        const node = skillNodes[index];
        const x2 = x + 113;
        const y2 = y < 400 ? y + 92 : y;
        return (
          <React.Fragment key={node.name}>
            <DataBeam
              x1={990}
              y1={471}
              x2={x2}
              y2={y2}
              color={node.color}
              progress={reroute}
              opacity={reroute}
            />
            <RecoveryNode node={node} index={index} x={x} y={y} />
          </React.Fragment>
        );
      })}

      <div
        style={{
          ...baseText,
          position: "absolute",
          right: 112,
          bottom: 130,
          width: 520,
          height: 116,
          padding: "24px 28px",
          boxSizing: "border-box",
          border: `2px solid ${palette.lime}`,
          background: `${palette.lime}10`,
          opacity: lockIn,
          transform: `translateY(${(1 - lockIn) * 45}px)`,
          boxShadow: `0 0 ${lockIn * 50}px ${palette.lime}22`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: palette.lime,
              color: palette.ink,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 25,
              fontWeight: 900,
            }}
          >
            ✓
          </div>
          <div style={{ marginLeft: 18 }}>
            <div style={{ color: palette.lime, fontSize: 17, fontWeight: 780 }}>
              6 / 6 SKILLS COMPLETED
            </div>
            <div style={{ color: palette.muted, fontSize: 15, marginTop: 8 }}>
              0 model turns / approval still locked
            </div>
          </div>
        </div>
      </div>
    </SceneLayer>
  );
};

export const FinalScene = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const architectureIn = springIn(frame, fps, 2, {
    damping: 18,
    stiffness: 100,
    mass: 0.9,
  });
  const pullback = easeInOut(frame, 18, 155);
  const brandIn = springIn(frame, fps, 78, {
    damping: 16,
    stiffness: 130,
    mass: 0.78,
  });
  const lineOne = ease(frame, 103, 28);
  const lineTwo = ease(frame, 124, 28);
  const lineThree = ease(frame, 145, 28);
  const scan = map(frame, [8, 128], [-220, 1850]);

  return (
    <SceneLayer durationInFrames={durationInFrames} style={{ opacity: 1 }}>
      <SignalFlash color={palette.white} />

      <div
        style={{
          position: "absolute",
          left: 92,
          top: 168,
          width: 1736,
          height: 572,
          opacity: architectureIn * (1 - brandIn * 0.55),
          transform: `perspective(1400px) translateY(${(1 - architectureIn) * 90}px) scale(${
            1.16 - pullback * 0.2
          }) rotateX(${3 - pullback * 3}deg)`,
          transformOrigin: "50% 50%",
          filter: `brightness(${0.88 + pullback * 0.12}) contrast(1.04)`,
        }}
      >
        <Img
          src={staticFile(asset.architecture)}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
        <div
          style={{
            position: "absolute",
            left: scan,
            top: 70,
            bottom: 70,
            width: 3,
            background: palette.teal,
            boxShadow: `0 0 45px 10px ${palette.teal}55`,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          background: `rgba(6,10,13,${brandIn * 0.64})`,
        }}
      />

      <div
        style={{
          ...baseText,
          position: "absolute",
          left: 192,
          top: 276,
          width: 1536,
          opacity: brandIn,
          transform: `translateY(${(1 - brandIn) * 55}px)`,
        }}
      >
        <Kicker color={palette.teal}>Production-ready autonomy</Kicker>
        <div style={{ fontSize: 124, fontWeight: 780, lineHeight: 0.9, marginTop: 28 }}>QuoteX</div>
        <div style={{ width: 920, marginTop: 54 }}>
          {[
            ["Qwen plans.", lineOne, palette.white],
            ["Verified tools decide facts.", lineTwo, palette.teal],
            ["A human controls the action.", lineThree, palette.lime],
          ].map(([text, progress, color]) => (
            <div
              key={text}
              style={{
                color,
                fontSize: 45,
                fontWeight: 720,
                lineHeight: 1.38,
                opacity: progress,
                transform: `translateX(${(1 - progress) * 50}px)`,
              }}
            >
              {text}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          ...baseText,
          position: "absolute",
          right: 190,
          bottom: 168,
          display: "flex",
          alignItems: "center",
          gap: 16,
          opacity: ease(frame, 174, 24),
        }}
      >
        <Pill color={palette.teal}>Qwen Cloud</Pill>
        <Pill color={palette.lime}>Track 4 / Autopilot Agent</Pill>
      </div>
    </SceneLayer>
  );
};
