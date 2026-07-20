import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";

import { FilmBackdrop, FilmHud } from "./components.jsx";
import {
  DURATION_IN_FRAMES,
  FPS,
  asset,
  filmFont,
  frameAt,
  narrationWindows,
  palette,
  scenes,
} from "./constants.js";
import { EvidenceScene, GateScene, MediaScene } from "./scenes/EvidenceCommerce.jsx";
import { PlannerScene, SignalScene } from "./scenes/SignalPlanner.jsx";
import {
  FinalScene,
  MarketsScene,
  ResilienceScene,
  VoiceScene,
} from "./scenes/VoiceFinal.jsx";

const sceneComponents = {
  signal: SignalScene,
  planner: PlannerScene,
  evidence: EvidenceScene,
  gate: GateScene,
  media: MediaScene,
  markets: MarketsScene,
  voice: VoiceScene,
  resilience: ResilienceScene,
  final: FinalScene,
};

const MUSIC_OFFSET_SECONDS = 1.15;

const musicVolume = (frame) => {
  const seconds = frame / FPS + MUSIC_OFFSET_SECONDS;
  const fadeIn = Math.min(1, Math.max(0, (seconds - MUSIC_OFFSET_SECONDS) / 1.8));
  const fadeOut = Math.min(1, Math.max(0, (101.2 - seconds) / 1.4));
  const narrationInfluence = narrationWindows.reduce((strongest, [start, end]) => {
    if (seconds >= start && seconds <= end) return 1;
    const distance = seconds < start ? start - seconds : seconds - end;
    const ramp = seconds < start ? 0.5 : 0.65;
    return Math.max(strongest, Math.max(0, 1 - distance / ramp));
  }, 0);
  const level = 0.24 + (0.105 - 0.24) * narrationInfluence;
  return level * fadeIn * fadeOut;
};

export const QuoteXMotionFilm = () => (
  <AbsoluteFill
    style={{
      background: palette.ink,
      color: palette.white,
      fontFamily: filmFont,
      letterSpacing: 0,
    }}
  >
    <FilmBackdrop />

    {scenes.map((scene) => {
      const Scene = sceneComponents[scene.id];
      return (
        <Sequence
          key={scene.id}
          from={scene.from}
          durationInFrames={scene.durationInFrames}
          premountFor={Math.min(FPS, scene.from)}
          name={scene.id}
        >
          <Scene durationInFrames={scene.durationInFrames} />
        </Sequence>
      );
    })}

    <FilmHud />

    <Audio src={staticFile(asset.soundtrack)} volume={0.58} />
    <Sequence from={frameAt(MUSIC_OFFSET_SECONDS)} durationInFrames={frameAt(100)}>
      <Audio src={staticFile(asset.music)} volume={musicVolume} />
    </Sequence>
    <Sequence from={0} durationInFrames={DURATION_IN_FRAMES}>
      <Audio src={staticFile(asset.narration)} volume={1} />
    </Sequence>
  </AbsoluteFill>
);
