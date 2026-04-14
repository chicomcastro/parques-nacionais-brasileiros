/**
 * Generate PWA icons as valid PNG files.
 * Uses pure Node.js to create minimal valid PNG images
 * with a green background (no native dependencies required).
 */

import { writeFileSync } from 'fs';
import { createDeflateRaw } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const combined = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, combined, crc]);
}

function deflateSync(data) {
  return new Promise((resolve, reject) => {
    const deflater = createDeflateRaw();
    const chunks = [];
    deflater.on('data', (chunk) => chunks.push(chunk));
    deflater.on('end', () => resolve(Buffer.concat(chunks)));
    deflater.on('error', reject);
    deflater.write(data);
    deflater.end();
  });
}

function createZlibBlock(deflated) {
  // Wrap raw deflate in zlib format (CMF + FLG header, then data, then Adler-32)
  const cmf = 0x78;
  const flg = 0x01; // 0x78 0x01 is a common zlib header
  const header = Buffer.from([cmf, flg]);
  return Buffer.concat([header, deflated, adler32(arguments[1])]);
}

function adler32Buf(data) {
  let a = 1, b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE((b << 16) | a, 0);
  return buf;
}

async function generatePNG(size) {
  // Create raw pixel data: each row has a filter byte (0) followed by RGB pixels
  // Green background #14532d with a lighter green circle in the center
  const bgR = 0x14, bgG = 0x53, bgB = 0x2d;
  const fgR = 0x4a, fgG = 0xde, fgB = 0x80; // lighter green for tree shape
  const trunkR = 0x8B, trunkG = 0x45, trunkB = 0x13; // brown for trunk

  const rawData = Buffer.alloc(size * (1 + size * 3));
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 3);
    rawData[rowOffset] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const pixOffset = rowOffset + 1 + x * 3;
      const dx = x - cx;
      const dy = y - cy;

      // Draw a simple tree shape
      const treeTop = size * 0.15;
      const treeBottom = size * 0.7;
      const trunkTop = size * 0.7;
      const trunkBottom = size * 0.9;
      const trunkHalfWidth = size * 0.06;

      // Triangle tree canopy
      let isTree = false;
      if (y >= treeTop && y <= treeBottom) {
        const progress = (y - treeTop) / (treeBottom - treeTop);
        const halfWidth = progress * size * 0.35;
        if (Math.abs(dx) <= halfWidth) {
          isTree = true;
        }
      }

      // Trunk
      let isTrunk = false;
      if (y >= trunkTop && y <= trunkBottom && Math.abs(dx) <= trunkHalfWidth) {
        isTrunk = true;
      }

      if (isTree) {
        rawData[pixOffset] = fgR;
        rawData[pixOffset + 1] = fgG;
        rawData[pixOffset + 2] = fgB;
      } else if (isTrunk) {
        rawData[pixOffset] = trunkR;
        rawData[pixOffset + 1] = trunkG;
        rawData[pixOffset + 2] = trunkB;
      } else {
        rawData[pixOffset] = bgR;
        rawData[pixOffset + 1] = bgG;
        rawData[pixOffset + 2] = bgB;
      }
    }
  }

  // Compress with zlib (using Node's built-in zlib with raw deflate, then wrap)
  const deflated = await deflateSync(rawData);

  // Build zlib stream: header(2 bytes) + deflated + adler32(4 bytes)
  const zlibHeader = Buffer.from([0x78, 0x01]);
  const adler = adler32Buf(rawData);
  const compressedData = Buffer.concat([zlibHeader, deflated, adler]);

  // Build PNG
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr[8] = 8;                  // bit depth
  ihdr[9] = 2;                  // color type: RGB
  ihdr[10] = 0;                 // compression
  ihdr[11] = 0;                 // filter
  ihdr[12] = 0;                 // interlace

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

async function main() {
  for (const size of [192, 512]) {
    const png = await generatePNG(size);
    const path = join(publicDir, `icon-${size}.png`);
    writeFileSync(path, png);
    console.log(`Created ${path} (${png.length} bytes)`);
  }
}

main().catch(console.error);
