#!/usr/bin/env node
/*
 * Generates the app icons in docs/ — the paper tile with the masthead "Sz"
 * over a two-ink rule (paprika = Hungarian, prussian = English).
 *
 *   node tools/make-icons.js
 *
 * Needs Node 18+ and a Chromium/Chrome binary; set CHROME=/path/to/chrome if
 * it isn't found automatically. Newsreader is downloaded from Google Fonts on
 * first run and cached in tools/.cache/.
 *
 * Everything is drawn in a 512x512 CSS canvas and rasterised by Chromium at
 * each output size. Three things are worth knowing before editing:
 *
 *   - Newsreader is a variable font and browsers auto-apply its `opsz` axis at
 *     large font sizes, which thins the serifs into hairlines that disappear
 *     at home-screen sizes. Every text rule below pins `opsz` low on purpose.
 *   - Glyph positions come from measuring rendered ink, not font metrics, so
 *     the art is centred on what you actually see.
 *   - Headless Chromium's screenshot is the window size while its layout
 *     viewport can be shorter, so shots are taken with spare height and
 *     cropped back to a square here.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs');
const CACHE = path.join(__dirname, '.cache');

/* ---------- brand ---------- */

const S = 512; // design canvas
const PAPER = 'linear-gradient(157deg,#fbfbf7 0%,#f1f2ea 54%,#e2e3d9 100%)';
const INK = '#191f1c';
const HU = '#9a2617';  // paprika / oxblood
const EN = '#254a6e';  // prussian slate

const WORD_SIZE = 268;
const WORD_CSS = `line-height:1;font-size:${WORD_SIZE}px;letter-spacing:-.008em;` +
  'font-variation-settings:"opsz" 12,"wght" 600';

// Two acutes ride above the word as a matched pair — same size, same height —
// rather than as per-letter diacritics, which would stagger them and read as
// a different language's spelling.
const ACC_SIZE = 320;
const ACC_CSS = `line-height:0;font-size:${ACC_SIZE}px;` +
  'font-variation-settings:"opsz" 12,"wght" 600';
const ACC_GAP = 73;    // between the two accents' ink
const ACC_ABOVE = 44;  // from the top of the word's ink to the accents
const GROUP_CY = 264;  // centre of accents + word together

/* ---------- font ---------- */

// Newsreader SemiBold, latin subset, from Google Fonts (SIL Open Font License).
const FONT_URL = 'https://fonts.gstatic.com/s/newsreader/v26/cY9AfjOCX1hbuyalUrK4397yjA.woff2';

async function fontData() {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, 'newsreader-600-latin.woff2');
  if (!fs.existsSync(file)) {
    const res = await fetch(FONT_URL);
    if (!res.ok) throw new Error(`font download failed: ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return fs.readFileSync(file).toString('base64');
}

/* ---------- chromium ---------- */

function chromeBinary() {
  const candidates = [
    process.env.CHROME,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) throw new Error('no Chromium found; set CHROME=/path/to/chrome');
  return found;
}

const CHROME = chromeBinary();

function shoot(html, out, width, height) {
  const file = path.join(CACHE, `_shot_${process.pid}.html`);
  fs.writeFileSync(file, html);
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--virtual-time-budget=3000', '--default-background-color=00000000',
    `--screenshot=${out}`, `--window-size=${width},${height}`,
    `file://${file}`,
  ], { stdio: 'pipe' });
  fs.unlinkSync(file);
}

/* ---------- just enough PNG (8-bit, non-interlaced) ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) crc = CRC_TABLE[(crc ^ buf[n]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function readPng(buf) {
  let off = 8, head = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      head = {
        w: data.readUInt32BE(0), h: data.readUInt32BE(4),
        depth: data[8], color: data[9], interlace: data[12],
      };
    } else if (type === 'IDAT') idat.push(data);
    off += len + 12;
  }
  if (!head || head.depth !== 8 || head.interlace !== 0) throw new Error('unsupported PNG');
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[head.color];
  const stride = head.w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(head.h * stride);
  for (let y = 0; y < head.h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      px[y * stride + x] = v & 0xff;
    }
  }
  return { ...head, bpp, stride, px };
}

function writePng(img, w, h) {
  const stride = w * img.bpp;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    img.px.copy(raw, y * (stride + 1) + 1, y * img.stride, y * img.stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = img.color;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function cropSquare(file, size) {
  const img = readPng(fs.readFileSync(file));
  if (img.w < size || img.h < size) throw new Error(`render too small: ${img.w}x${img.h}`);
  fs.writeFileSync(file, writePng(img, size, size));
}

// ICO is happy to carry PNGs verbatim, which keeps this to a header + entries.
function writeIco(pngFiles, out) {
  const images = pngFiles.map((f) => ({ size: readPng(fs.readFileSync(f)).w, data: fs.readFileSync(f) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = [];
  for (const img of images) {
    const e = Buffer.alloc(16);
    e[0] = img.size >= 256 ? 0 : img.size;
    e[1] = img.size >= 256 ? 0 : img.size;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4);   // colour planes
    e.writeUInt16LE(32, 6);  // bits per pixel
    e.writeUInt32LE(img.data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += img.data.length;
  }
  fs.writeFileSync(out, Buffer.concat([header, ...entries, ...images.map((i) => i.data)]));
}

/* ---------- layout ---------- */

function shell(font, body, css) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@font-face{font-family:NR;font-weight:600;font-style:normal;
  src:url(data:font/woff2;base64,${font}) format('woff2')}
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:transparent}
.canvas{position:absolute;top:0;left:0;width:${S}px;height:${S}px;
  font-family:NR,Georgia,serif;font-weight:600;font-optical-sizing:none}
${css}
</style></head><body>${body}</body></html>`;
}

// Bounding box of everything drawn, measured from a rendered shot. Marks that
// sit above the baseline need the offset origin to stay inside the frame.
const ORIGIN = { x: 120, y: 220 };

function inkBox(font, text, css) {
  const out = path.join(CACHE, `_measure_${process.pid}.png`);
  shoot(shell(font, '<div class="canvas"><div class="m">' + text + '</div></div>',
    `.m{position:absolute;top:${ORIGIN.y}px;left:${ORIGIN.x}px;white-space:pre;${css}}`),
  out, S, S + 140);
  const img = readPng(fs.readFileSync(out));
  fs.unlinkSync(out);
  let x1 = Infinity, y1 = Infinity, x2 = -1, y2 = -1;
  for (let y = 0; y < Math.min(img.h, S); y++) {
    for (let x = 0; x < Math.min(img.w, S); x++) {
      if (img.px[y * img.stride + x * img.bpp + 3] > 8) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  if (x2 < 0) throw new Error('nothing rendered while measuring');
  return {
    x1: x1 - ORIGIN.x, x2: x2 - ORIGIN.x, y1: y1 - ORIGIN.y, y2: y2 - ORIGIN.y,
    w: x2 - x1 + 1, h: y2 - y1 + 1,
    cx: (x1 + x2) / 2 - ORIGIN.x, cy: (y1 + y2) / 2 - ORIGIN.y,
  };
}

// `pad` shrinks the art toward the centre: Android maskable icons are cropped
// to an inner circle, so their art has to stay inside the middle 80%.
// Below ~48px the accents are barely a pixel of colour and only muddy the
// letters, so favicon sizes drop them and centre the word on its own.
function iconPage(font, word, acc, size, pad = 1) {
  const accents = size >= 48;
  const groupH = accents ? acc.h + ACC_ABOVE + word.h : word.h;
  const top = (accents ? GROUP_CY : S / 2) - groupH / 2;

  const wx = S / 2 - word.cx;
  const wy = top + (accents ? acc.h + ACC_ABOVE : 0) - word.y1;

  // Ink centres of the two accents, mirrored either side of the word's centre.
  const half = (ACC_GAP + acc.w) / 2;
  const accY = top - acc.y1;
  const accent = (dx, color) =>
    `<div class="acc" style="color:${color};transform:translate(${S / 2 + dx - acc.cx}px,${accY}px)">&#180;</div>`;

  const body = `<div class="scaler"><div class="canvas tile"><div class="art">
  ${accents ? accent(-half, HU) + '\n  ' + accent(half, EN) : ''}
  <div class="word" style="transform:translate(${wx}px,${wy}px)">Sz</div>
</div></div></div>`;
  return shell(font, body, `
.scaler{position:absolute;top:0;left:0;width:${S}px;height:${S}px;
  transform:scale(${size / S});transform-origin:0 0}
.tile{overflow:hidden;background:${PAPER}}
.art{position:absolute;inset:0;transform:scale(${pad});transform-origin:50% 50%}
.word,.acc{position:absolute;top:0;left:0;white-space:pre}
.word{color:${INK};${WORD_CSS}}
.acc{${ACC_CSS}}`);
}

/* ---------- build ---------- */

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const font = await fontData();
  const word = inkBox(font, 'Sz', WORD_CSS);
  const acc = inkBox(font, '&#180;', ACC_CSS);

  const targets = [
    ['apple-touch-icon.png', 180, 1],
    ['icon-192.png', 192, 1],
    ['icon-512.png', 512, 1],
    ['icon-maskable-512.png', 512, 0.8],
    ['favicon-32.png', 32, 1],
    ['favicon-16.png', 16, 1],
  ];

  for (const [name, size, pad] of targets) {
    const out = path.join(OUT, name);
    shoot(iconPage(font, word, acc, size, pad), out, size, size + 140);
    cropSquare(out, size);
    console.log(`${name}  ${size}x${size}`);
  }

  writeIco([path.join(OUT, 'favicon-32.png'), path.join(OUT, 'favicon-16.png')],
    path.join(OUT, 'favicon.ico'));
  console.log('favicon.ico  32 + 16');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
