# QuoteX motion film

This is the frame-accurate judging cut. Remotion drives camera moves, spring timing, kinetic
typography, live UI clips, counters, signal paths, and the closing architecture pullback.

The audio layer combines scene-timed CosyVoice narration, the provided
`MA_Awesomemusic_ModernInterior.wav` music asset, and deterministic interface sound design.
Typewriter clicks, switches, shutters, success tones, whooshes, and impacts remain synchronized
in source code. Music automation smoothly ducks under each narration window.

## Voice preparation

Install the official DashScope SDK inside the ignored project runtime:

```bash
python3 -m pip install --target .runtime/python dashscope
```

Place the provided music file at:

```text
.runtime/demo/MA_Awesomemusic_ModernInterior.wav
```

Generate the nine scene-timed CosyVoice segments and the 102.4-second narration timeline:

```bash
npm run generate:motion-narration
```

The generator uses `cosyvoice-v3-flash` with the English-capable `longwan_v3` soft-spoken voice.
It normalizes Qwen streaming WAV headers, rejects narration that overruns a scene, and mixes the
accepted segments without time-stretching.

## Commands

Prepare local assets and open Remotion Studio:

```bash
npm run motion:studio
```

Render a 12-second quality check:

```bash
npm run render:motion-preview
```

Render nine representative PNG frames:

```bash
npm run render:motion-stills
```

Render the final 1920 x 1080 film:

```bash
npm run render:motion-demo
```

Render a difficult time range without exporting the whole film:

```bash
node demo/motion/render.mjs --segment 60 8
```

Outputs:

- `.runtime/demo/QuoteX-motion-preview.mp4`
- `.runtime/demo/QuoteX-motion-demo.mp4`
- `.runtime/demo/motion-stills/`

Generated public assets are ignored by Git. The renderer rebuilds them from the checked-in proof
screenshots, architecture diagram, evidence demo, narration artifact, provided music, and
deterministic sound-design source. The final encode uses H.264 High, standard-range BT.709
`yuv420p`, 48 kHz stereo audio, and a fast-start MP4 container. Fine UI edges receive a restrained
sharpening pass after range conversion.
