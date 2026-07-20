# QuoteX cinematic demo

This renderer creates the motion-led judging film without a proprietary editing timeline.

## Inputs

- Real QuoteX screenshots in `docs/screenshots/`
- The checked-in architecture diagram in `diagrams/`
- Qwen-designed narration at `.runtime/demo/QuoteX-demo-narration.wav`

The narration is a local submission artifact and remains ignored by Git. It can be extracted from the evidence demo:

```bash
node_modules/ffmpeg-static/ffmpeg \
  -i .runtime/demo/QuoteX-demo-final.mp4 \
  -vn -ac 1 -ar 48000 -c:a pcm_s16le \
  .runtime/demo/QuoteX-demo-narration.wav
```

## Render

Create an eight-second visual and audio check:

```bash
npm run render:cinematic-demo -- --preview 8
```

Create the final 102.4-second H.264 film:

```bash
npm run render:cinematic-demo
```

Outputs:

- `.runtime/demo/QuoteX-cinematic-preview.mp4`
- `.runtime/demo/QuoteX-cinematic-demo.mp4`

The browser records a deterministic 1920 x 1080 canvas at 30 fps. FFmpeg combines it with the Qwen-designed narration and an original procedural score, then emits a fast-start H.264/AAC MP4 suitable for Devpost or YouTube.

## Direction

The film uses a restrained science-fiction product language: sparse typography, functional data paths, macro UI evidence, scan lines, and hard scene punctuation. It is an original QuoteX composition. No frames, music, branding, or copy from the visual reference are included.
