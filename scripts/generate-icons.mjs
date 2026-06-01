// Generates Homunculus PWA icons as raw PNGs (no image-library dependency).
// Run with: node scripts/generate-icons.mjs
// Renders a wax-seal "H" on parchment, per the medieval-classical design language.
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');
mkdirSync(PUBLIC, { recursive: true });

// Palette (from globals.css)
const PARCHMENT = [0xf5, 0xed, 0xd8];
const SEAL = [0x8b, 0x2a, 0x2a];
const SEAL_DEEP = [0x6b, 0x1f, 0x1f];
const GOLD = [0xb8, 0x86, 0x0b];

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function render(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  // Maskable icons need a safe zone — shrink the seal so it survives circular crops.
  const sealR = size * (maskable ? 0.34 : 0.42);
  const ringInner = sealR * 0.9;

  // H geometry, relative to the seal radius
  const barW = sealR * 0.16;
  const hHalfW = sealR * 0.42;
  const hHalfH = sealR * 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);

      let c = PARCHMENT;

      if (dist <= sealR) {
        // Seal disc with a subtle radial shade for a waxy feel.
        c = lerp(SEAL, SEAL_DEEP, Math.min(dist / sealR, 1));
        // Gold rim
        if (dist >= ringInner) {
          c = GOLD;
        }
        // Carve the "H" in parchment/gold
        const inLeftBar = Math.abs(dx + hHalfW) <= barW / 2 && Math.abs(dy) <= hHalfH;
        const inRightBar = Math.abs(dx - hHalfW) <= barW / 2 && Math.abs(dy) <= hHalfH;
        const inCrossBar = Math.abs(dy) <= barW / 2 && Math.abs(dx) <= hHalfW;
        if (dist < ringInner && (inLeftBar || inRightBar || inCrossBar)) {
          c = lerp(GOLD, PARCHMENT, 0.25);
        }
      }

      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      buf[i + 3] = 0xff;
    }
  }
  return buf;
}

// ── Minimal PNG encoder (8-bit RGBA) ──────────────────────
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // Add a filter byte (0) at the start of each row.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-32.png', size: 32 },
];

for (const t of targets) {
  const png = encodePNG(t.size, render(t.size, { maskable: t.maskable }));
  writeFileSync(join(PUBLIC, t.name), png);
  console.log(`wrote public/${t.name} (${png.length} bytes)`);
}
