import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import {
  BrowserFrame,
  Kicker,
  Metric,
  MovingFrame,
  Pill,
  ScanOverlay,
  SceneLayer,
  Screenshot,
  SignalFlash,
  baseText,
} from "../components.jsx";
import { palette } from "../constants.js";
import { ease, easeInOut, map, springIn } from "../motion.js";

const EvaluationBars = () => {
  const frame = useCurrentFrame();
  const governed = ease(frame, 88, 48);
  const baseline = ease(frame, 104, 48);
  const delta = ease(frame, 144, 28);

  return (
    <div
      style={{
        ...baseText,
        display: "grid",
        gap: 24,
        marginTop: 29,
        width: 500,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{ color: palette.muted, fontSize: 17, fontWeight: 680 }}>
            Governed agent
          </span>
          <span
            style={{
              marginLeft: "auto",
              color: palette.teal,
              fontSize: 27,
              fontWeight: 780,
            }}
          >
            {Math.round(42 * governed)} / 42
          </span>
        </div>
        <div style={{ height: 9, background: palette.line, marginTop: 10 }}>
          <div
            style={{
              width: `${governed * 100}%`,
              height: "100%",
              background: palette.teal,
              boxShadow: `0 0 18px ${palette.teal}99`,
            }}
          />
        </div>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{ color: palette.muted, fontSize: 17, fontWeight: 680 }}>
            One-prompt baseline
          </span>
          <span
            style={{
              marginLeft: "auto",
              color: palette.blue,
              fontSize: 27,
              fontWeight: 780,
            }}
          >
            {Math.round(28 * baseline)} / 42
          </span>
        </div>
        <div style={{ height: 9, background: palette.line, marginTop: 10 }}>
          <div
            style={{
              width: `${baseline * (28 / 42) * 100}%`,
              height: "100%",
              background: palette.blue,
              boxShadow: `0 0 18px ${palette.blue}66`,
            }}
          />
        </div>
      </div>
      <div
        style={{
          color: palette.lime,
          fontSize: 18,
          fontWeight: 750,
          opacity: delta,
          transform: `translateY(${(1 - delta) * 14}px)`,
        }}
      >
        +33.3 percentage points across six adversarial fixtures
      </div>
    </div>
  );
};

export const EvidenceScene = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inValue = springIn(frame, fps, 12, { damping: 19, stiffness: 105 });
  const push = easeInOut(frame, 38, 300);
  const liveScan = map(frame % 120, [0, 120], [0, 1]);

  return (
    <SceneLayer durationInFrames={durationInFrames}>
      <SignalFlash color={palette.blue} />

      <div style={{ position: "absolute", left: 104, top: 168, width: 540, zIndex: 4 }}>
        <Kicker color={palette.blue}>Execution evidence</Kicker>
        <div
          style={{
            ...baseText,
            fontSize: 65,
            fontWeight: 770,
            lineHeight: 0.98,
            marginTop: 23,
          }}
        >
          NOT A
          <br />
          BLACK BOX.
        </div>
        <div
          style={{
            ...baseText,
            color: palette.muted,
            fontSize: 21,
            lineHeight: 1.5,
            width: 490,
            marginTop: 28,
          }}
        >
          Planner turns, tokens, typed skill results, latency, and a tamper-evident digest stay
          visible.
        </div>
        <EvaluationBars />
      </div>

      <MovingFrame
        amplitude={0.32}
        zoom={0.92 + push * 0.085}
        style={{
          position: "absolute",
          left: 690 - push * 35,
          top: 156 - push * 18,
          width: 1118,
          height: 736,
          opacity: inValue,
          transformOrigin: "58% 48%",
        }}
      >
        <BrowserFrame
          title="QuoteX / Agent evidence / Live Qwen"
          accent={palette.blue}
          style={{ width: "100%", height: "100%" }}
        >
          <Screenshot
            name="evidence"
            fit="cover"
            position="50% 32%"
            style={{
              transform: "scale(1.34)",
              transformOrigin: "100% 45%",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${liveScan * 100}%`,
              top: 0,
              bottom: 0,
              width: 2,
              background: palette.blue,
              boxShadow: `0 0 30px ${palette.blue}`,
              opacity: 0.58,
            }}
          />
        </BrowserFrame>
      </MovingFrame>

      <Pill
        color={palette.teal}
        style={{
          position: "absolute",
          right: 152,
          top: 184,
          zIndex: 8,
          boxShadow: "0 10px 35px rgba(0,0,0,.45)",
        }}
      >
        Live trace / SHA-256 sealed
      </Pill>

      <div
        style={{
          ...baseText,
          position: "absolute",
          right: 144,
          bottom: 123,
          width: 520,
          padding: "17px 20px",
          background: "rgba(5,7,7,.86)",
          border: `2px solid ${palette.lineBright}`,
          color: palette.muted,
          fontFamily: '"SFMono-Regular", Menlo, monospace',
          fontSize: 14,
          opacity: ease(frame, 176, 25),
          zIndex: 8,
        }}
      >
        run_01K5... / digest 5e8c4a2f... / immutable evidence
      </div>
    </SceneLayer>
  );
};

const Lock = ({ engaged }) => (
  <div
    style={{
      position: "relative",
      width: 76,
      height: 86,
      transform: `scale(${0.82 + engaged * 0.18})`,
    }}
  >
    <div
      style={{
        position: "absolute",
        left: 15,
        top: 0,
        width: 46,
        height: 50,
        border: `7px solid ${palette.lime}`,
        borderBottom: 0,
        borderRadius: "26px 26px 0 0",
        boxSizing: "border-box",
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        width: 76,
        height: 58,
        borderRadius: 8,
        background: palette.lime,
        boxShadow: `0 0 ${engaged * 55}px ${palette.lime}88`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 34,
          top: 17,
          width: 8,
          height: 22,
          borderRadius: 5,
          background: palette.ink,
        }}
      />
    </div>
  </div>
);

export const GateScene = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const quoteIn = ease(frame, 22, 60);
  const gate = springIn(frame, 30, 110, {
    damping: 13,
    stiffness: 175,
    mass: 0.72,
  });
  const total = Math.round(33630 * quoteIn);
  const gateLine = ease(frame, 94, 34);

  return (
    <SceneLayer durationInFrames={durationInFrames}>
      <SignalFlash color={palette.lime} />
      <MovingFrame
        amplitude={0.22}
        style={{ position: "absolute", left: 102, top: 158, width: 1060, height: 744 }}
      >
        <BrowserFrame
          title="QuoteX / Commercial offer"
          accent={palette.lime}
          style={{ width: "100%", height: "100%" }}
        >
          <Screenshot
            name="workbench"
            fit="cover"
            position="50% 35%"
            style={{
              filter: "brightness(.9) saturate(.96) contrast(1.02)",
              transform: `scale(${1.31 + quoteIn * 0.025})`,
              transformOrigin: "100% 43%",
            }}
          />
        </BrowserFrame>
      </MovingFrame>

      <div
        style={{
          ...baseText,
          position: "absolute",
          right: 112,
          top: 158,
          width: 590,
          height: 744,
          padding: "45px 48px",
          boxSizing: "border-box",
          background: "rgba(15,23,28,.98)",
          border: `2px solid ${palette.lineBright}`,
          boxShadow: "0 34px 100px rgba(0,0,0,.54)",
        }}
      >
        <Kicker color={palette.lime}>Commercial truth</Kicker>
        <div style={{ fontSize: 37, fontWeight: 760, marginTop: 19 }}>Verified quote</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 30 }}>
          <Metric label="Product" value="500" detail="Grade-A scarves" color={palette.white} />
          <Metric label="Freight" value="$820" detail="DHL Economy" color={palette.teal} />
          <Metric label="Margin" value="45%" detail="Verified floor" color={palette.blue} />
          <Metric label="Payment" value="Net 30" detail="Buyer memory" color={palette.amber} />
        </div>

        <div style={{ borderTop: `2px solid ${palette.line}`, marginTop: 23, paddingTop: 24 }}>
          <div style={{ color: palette.muted, fontSize: 15, fontWeight: 720 }}>QUOTE TOTAL</div>
          <div style={{ fontSize: 55, fontWeight: 780, marginTop: 7 }}>
            ${total.toLocaleString("en-US")}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: -128 * (1 - gateLine),
            right: 0,
            bottom: 0,
            height: 116,
            display: "flex",
            alignItems: "center",
            padding: "0 45px",
            background: `${palette.lime}12`,
            borderTop: `2px solid ${palette.lime}aa`,
            opacity: gateLine,
          }}
        >
          <Lock engaged={gate} />
          <div style={{ marginLeft: 24 }}>
            <div style={{ color: palette.lime, fontSize: 17, fontWeight: 780 }}>
              HUMAN APPROVAL REQUIRED
            </div>
            <div style={{ color: palette.muted, fontSize: 15, marginTop: 8 }}>
              Nothing sent. Nothing published.
            </div>
          </div>
        </div>
      </div>
    </SceneLayer>
  );
};

export const MediaScene = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const imageEnter = springIn(frame, fps, 8, { damping: 19, stiffness: 110 });
  const generatedReveal = easeInOut(frame, 78, 95);
  const videoEnter = springIn(frame, fps, 188, { damping: 18, stiffness: 135 });
  const videoProgress = map(frame, [206, 325], [0, 1]);

  return (
    <SceneLayer durationInFrames={durationInFrames}>
      <SignalFlash color={palette.violet} />
      <div style={{ position: "absolute", left: 110, top: 152 }}>
        <Kicker color={palette.violet}>Grounded media studio</Kicker>
        <div style={{ ...baseText, fontSize: 52, fontWeight: 770, marginTop: 18 }}>
          One product record. Multiple assets.
        </div>
      </div>
      <Pill
        color={palette.teal}
        style={{ position: "absolute", right: 112, top: 158 }}
      >
        Qwen image edit / live result
      </Pill>

      <MovingFrame
        amplitude={0.25}
        style={{
          position: "absolute",
          left: 110,
          top: 272,
          width: 1170,
          height: 650,
          opacity: imageEnter,
          transform: `translateY(${(1 - imageEnter) * 45}px)`,
        }}
      >
        <BrowserFrame
          title="QuoteX / Campaign studio"
          accent={palette.violet}
          style={{ width: "100%", height: "100%" }}
        >
          <Screenshot
            name="campaign"
            fit="cover"
            style={{
              transform: `scale(${1.29 + generatedReveal * 0.035})`,
              transformOrigin: "100% 48%",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: `${generatedReveal * 52}%`,
              background: "rgba(85,229,207,.035)",
              borderLeft: `2px solid ${palette.teal}`,
              boxShadow: `-28px 0 70px ${palette.teal}22`,
              pointerEvents: "none",
            }}
          />
          <ScanOverlay start={76} duration={96} color={palette.teal} />
          <Pill
            active={false}
            style={{ position: "absolute", left: 24, bottom: 24, background: palette.ink }}
          >
            Uploaded source
          </Pill>
          <Pill
            color={palette.teal}
            style={{ position: "absolute", right: 24, bottom: 24, background: palette.ink }}
          >
            AI campaign asset
          </Pill>
        </BrowserFrame>
      </MovingFrame>

      <div
        style={{
          ...baseText,
          position: "absolute",
          right: 110,
          top: 272,
          width: 476,
          height: 650,
          border: `2px solid ${palette.lineBright}`,
          background: "rgba(15,23,28,.98)",
          padding: "32px",
          boxSizing: "border-box",
          opacity: videoEnter,
          transform: `translateX(${(1 - videoEnter) * 80}px)`,
        }}
      >
        <Kicker color={palette.amber}>HappyHorse motion</Kicker>
        <div style={{ fontSize: 31, fontWeight: 760, marginTop: 17 }}>
          Turn the approved still into a product clip.
        </div>

        <div
          style={{
            position: "relative",
            height: 242,
            marginTop: 31,
            overflow: "hidden",
            background: palette.ink,
            border: `2px solid ${palette.lineBright}`,
          }}
        >
          <Screenshot
            name="campaign"
            fit="cover"
            position={`${45 + videoProgress * 10}% 50%`}
            style={{
              transform: `scale(${1.15 + videoProgress * 0.12})`,
              filter: "saturate(1.1) contrast(1.04)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 20,
              right: 20,
              bottom: 18,
              height: 3,
              background: "rgba(255,255,255,.22)",
            }}
          >
            <div
              style={{
                width: `${videoProgress * 100}%`,
                height: "100%",
                background: palette.amber,
              }}
            />
          </div>
        </div>

        {["Photo grounding retained", "Campaign text verified", "Video remains a draft"].map(
          (label, index) => {
            const reveal = ease(frame, 210 + index * 21, 18);
            return (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 13,
                  marginTop: 18,
                  color: reveal > 0.7 ? palette.white : palette.muted,
                  fontSize: 17,
                  fontWeight: 620,
                  opacity: reveal,
                  transform: `translateX(${(1 - reveal) * 20}px)`,
                }}
              >
                <span style={{ color: palette.teal }}>✓</span>
                {label}
              </div>
            );
          },
        )}
      </div>
    </SceneLayer>
  );
};
