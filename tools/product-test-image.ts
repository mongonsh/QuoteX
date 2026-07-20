import { deflateSync } from "node:zlib";

export function makeProductTestPngDataUrl(width = 512, height = 512): string {
  const scanlines = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    scanlines[rowStart] = 0;

    for (let x = 0; x < width; x += 1) {
      const position = rowStart + 1 + x * 3;
      const inProduct = x > 136 && x < 376 && y > 112 && y < 398;
      const handle = y > 348 && y < 386 && x > 190 && x < 322;
      const highlight = x > 176 && x < 336 && y > 164 && y < 210;
      const shade = Math.round(235 - (y / height) * 42);

      scanlines[position] = inProduct ? (highlight ? 52 : 24) : shade;
      scanlines[position + 1] = inProduct || handle ? 128 : shade + 6;
      scanlines[position + 2] = inProduct || handle ? 119 : shade + 10;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
