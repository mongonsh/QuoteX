import React from "react";
import { Composition } from "remotion";

import { DURATION_IN_FRAMES, FPS, HEIGHT, WIDTH } from "./constants.js";
import { QuoteXMotionFilm } from "./QuoteXMotionFilm.jsx";

export const RemotionRoot = () => (
  <Composition
    id="QuoteXMotionFilm"
    component={QuoteXMotionFilm}
    durationInFrames={DURATION_IN_FRAMES}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
