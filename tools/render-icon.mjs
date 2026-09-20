// Renders the TokenTray "Gauge" mark (design 3a) into icons/tray.png and icons/icon.ico.
// The mark is the same open dial the flyout rings are built from: a 270-degree track
// with the opening at the bottom, and a value arc filling it from the lower-left.
// Run with `node tools/render-icon.mjs` after changing the geometry below.
import {deflateSync} from 'node:zlib';
import {writeFileSync} from 'node:fs';

// Geometry in the 32-unit viewBox shared with the flyout's SVG rings.
const CENTER = 16, RADIUS = 11;
const START = 135;                 // lower-left, matching the design's rotate(135).
const TRACK_SWEEP = 270;           // dasharray 51.8 of a 69.1 circumference.
const VALUE_SWEEP = 167.2;         // dasharray 32.1 of the same circumference.
const TEAL = [0x6e, 0xdb, 0xd5];   // The shipped tray hue; legible on light and dark taskbars.
const TRACK_ALPHA = 0.3;

const rad = deg => deg * Math.PI / 180;

// Distance from a point to a round-capped arc stroke's centre line.
function arcDistance(x, y, from, to) {
  const dx = x - CENTER, dy = y - CENTER;
  let angle = Math.atan2(dy, dx) * 180 / Math.PI;
  while (angle < from) angle += 360;
  if (angle <= to) return Math.abs(Math.hypot(dx, dy) - RADIUS);
  const end = a => Math.hypot(x - (CENTER + RADIUS * Math.cos(rad(a))), y - (CENTER + RADIUS * Math.sin(rad(a))));
  return Math.min(end(from), end(to));
}

// 4x4 supersampling per pixel keeps the caps and the 16px raster smooth.
function coverage(px, py, scale, width, from, to) {
  const samples = 4;
  let hits = 0;
  for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
    const x = (px + (sx + 0.5) / samples) / scale, y = (py + (sy + 0.5) / samples) / scale;
    if (arcDistance(x, y, from, to) <= width / 2) hits++;
  }
  return hits / (samples * samples);
}

function render(size, strokeWidth) {
  const scale = size / 32, rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const track = coverage(x, y, scale, strokeWidth, START, START + TRACK_SWEEP) * TRACK_ALPHA;
    const value = coverage(x, y, scale, strokeWidth, START, START + VALUE_SWEEP);
    const alpha = value + track * (1 - value);
    const at = (y * size + x) * 4;
    rgba[at] = TEAL[0]; rgba[at + 1] = TEAL[1]; rgba[at + 2] = TEAL[2];
    rgba[at + 3] = Math.round(alpha * 255);
  }
  return rgba;
}

const CRC = Array.from({length: 256}, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const length = Buffer.alloc(4); length.writeUInt32BE(body.length);
  const tagged = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tagged));
  return Buffer.concat([length, tagged, crc]);
}
function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // no per-row filter; the arcs compress well enough.
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw, {level: 9})), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Windows shrinks the dial hard at 16px, so that raster gets the design's heavier stroke.
const SIZES = [[16, 4.5], [32, 4], [48, 4], [256, 4]];
const images = SIZES.map(([size, stroke]) => ({size, data: png(size, render(size, stroke))}));

writeFileSync(new URL('../icons/tray.png', import.meta.url), images.find(i => i.size === 32).data);

// ICO directory with PNG-compressed entries, matching the format already shipped.
const directory = Buffer.alloc(6 + 16 * images.length);
directory.writeUInt16LE(1, 2); directory.writeUInt16LE(images.length, 4);
let offset = directory.length;
images.forEach((image, index) => {
  const at = 6 + index * 16;
  directory[at] = image.size % 256; directory[at + 1] = image.size % 256;
  directory.writeUInt16LE(1, at + 4); directory.writeUInt16LE(32, at + 6);
  directory.writeUInt32LE(image.data.length, at + 8); directory.writeUInt32LE(offset, at + 12);
  offset += image.data.length;
});
writeFileSync(new URL('../icons/icon.ico', import.meta.url), Buffer.concat([directory, ...images.map(i => i.data)]));
console.log('icons/tray.png and icons/icon.ico rendered from design 3a (Gauge).');
