import "server-only";
import { deflateSync } from "node:zlib";

/**
 * A black and white grid written out as a PNG file.
 *
 * The QR library draws a code as a grid of squares, and as SVG or GIF, but not
 * as PNG. A PNG of two colours is small enough to write here with Node's own
 * compression: one-bit greyscale, every row unfiltered, one image data chunk.
 * No dependency, and nothing in it reads anything but the grid it is given.
 *
 * `true` in the grid is a dark square. Each square becomes `scale` by `scale`
 * pixels, so the file is exactly as sharp as the code needs at any print size.
 */
export function pngFromGrid(grid: readonly (readonly boolean[])[], scale: number): Uint8Array {
  const rows = grid.length;
  const cols = rows === 0 ? 0 : grid[0].length;
  if (rows === 0 || cols === 0) throw new Error("An empty grid has no picture.");
  if (!Number.isInteger(scale) || scale < 1) throw new Error("The scale is a whole number of pixels.");
  const width = cols * scale;
  const height = rows * scale;

  // One filter byte (0, none) then the row's pixels, eight to a byte, the
  // first pixel in the highest bit. In one-bit greyscale 0 is black and 1 is
  // white, so a dark square clears its bits.
  const rowBytes = Math.ceil(width / 8);
  const raw = new Uint8Array(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    const line = grid[Math.floor(y / scale)];
    const start = y * (rowBytes + 1);
    raw[start] = 0;
    for (let byte = 0; byte < rowBytes; byte++) {
      let bits = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byte * 8 + bit;
        // Past the right edge the padding bits are white, which no reader shows.
        const dark = x < width && line[Math.floor(x / scale)] === true;
        if (!dark) bits |= 0x80 >> bit;
      }
      raw[start + 1 + byte] = bits;
    }
  }

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 1; // bit depth
  header[9] = 0; // colour type: greyscale
  header[10] = 0; // compression: deflate
  header[11] = 0; // filter method
  header[12] = 0; // no interlace

  return concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Length, type, data, then the CRC of type and data, as the PNG format lays out every chunk. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// The CRC the PNG format names (ISO 3309), from a table built once.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
